'use client';

import { Avatar } from '@/components/ratings';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BackButton } from '@/components/back-button';
import { EmptyState } from '@/components/empty-state';
import { useToast } from '@/components/toast';
import {
  getSession,
  getGroup,
  getGroupOwed,
  getGroupTransfers,
  getGroupBilling,
  assignTransfer,
  markPaid,
  markUnpaid,
  markNoShow,
  markCame,
  waivePayment,
  movePayment,
  bulkMarkPaid,
  deleteSession,
  updateSessionStatus,
  exportSessionPaymentsCsv,
  sendReminders,
  setRsvpForPlayer,
  createPlayer,
  addMember,
  getLineup,
  getRsvpBoard,
  type BankTransfer,
  type Lineup,
  type RsvpBoard,
  type GroupBilling,
  type IGroupWithMembers,
  type OwedItem,
  type ISessionWithDetails,
} from '@/lib/api';
import { PaymentStatus, SessionStatus, type IPayment } from '@pitchaside/shared';
import { owedLabel } from '@/lib/give-outcome';
import { GameSteps, STEPS, type Step, type StepInfo } from '@/components/game/game-steps';
import { TeamsStep } from '@/components/game/teams-step';
import { ScoresStep } from '@/components/game/scores-step';
import { FullTimeStep } from '@/components/game/full-time-step';
import { HowPaidSheet } from '@/components/group/how-paid-sheet';
import { daysFromToday, gameDay } from '@/components/money-card';
import { GameHero } from '@/components/game/game-hero';
import { GameMenu } from '@/components/game/game-actions';
import { MatchQrSheet } from '@/components/game/match-qr-sheet';
import { EditGameSheet } from '@/components/game/edit-game-sheet';
import { PlayerList, type PlayerAction } from '@/components/game/player-list';
import { EndGameSheet } from '@/components/game/end-game-sheet';
import { GroupMessageSheet, SEND_KINDS, type SendKind } from '@/components/game/group-message-sheet';
import { coveredByDues as coversByDues, gamePhase, gameTally, leftToPay } from '@/lib/game-player';
import { AddToGameSheet } from '@/components/game/add-to-game-sheet';
import { MovePaymentSheet } from '@/components/game/move-payment-sheet';
import { gameInviteMessage, openWhatsApp, paymentDetailsMessage, pickWhy } from '@/lib/whatsapp';
import { prettyTime } from '@/components/player-ui';

/** Today as YYYY-MM-DD in the browser's time zone. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Sat 24 Oct", or "October 2026 dues". */
const gameLabel = (s: ISessionWithDetails) =>
  s.kind === 'dues' && s.label ? `${s.label} dues` : gameDay(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');

const nameOfPayment = (p?: IPayment) => (p?.player ? `${p.player.firstName} ${p.player.lastName}` : 'Player');

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [session, setSession] = useState<ISessionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [ending, setEnding] = useState(false);
  // The message for the group chat, ready to send: from a notice's link, or after End game.
  const [sending, setSending] = useState<{ kind: SendKind; justEnded?: { came: number } } | null>(null);
  // Match day in four steps, one on screen at a time: players, teams, scores, full time.
  const [step, setStep] = useState<Step | null>(null);
  const [lineup, setLineup] = useState<Lineup | null | undefined>(undefined);
  const [moving, setMoving] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [lineupError, setLineupError] = useState<string | null>(null);
  const [board, setBoard] = useState<RsvpBoard | null>(null);
  // Money in the group account no one could put a name to: one may be a player's payment.
  const [unnamed, setUnnamed] = useState<BankTransfer[]>([]);
  // What everyone owes and has kept, so the sheet can say where any extra goes.
  const [owed, setOwed] = useState<OwedItem[]>([]);
  const [kept, setKept] = useState<Record<string, number>>({});
  const [howPaid, setHowPaid] = useState<string | null>(null);
  // The group's members (payment codes, phones) and its link and account, for WhatsApp.
  const [members, setMembers] = useState<NonNullable<IGroupWithMembers['memberships']>>([]);
  const [billing, setBilling] = useState<GroupBilling | null>(null);
  const [adding, setAdding] = useState(false);
  // A payment by transfer being moved to another of the player's games.
  const [movingPay, setMovingPay] = useState<IPayment | null>(null);

  // Version counter: when multiple fetches are in flight (rapid mutations),
  // only the latest one updates state so earlier results don't overwrite newer ones.
  const fetchId = useRef(0);
  const fetchSession = useCallback(() => {
    const v = ++fetchId.current;
    return getSession(id)
      .then((s) => { if (fetchId.current === v) setSession(s); })
      .catch(() => { if (fetchId.current === v) router.push('/sessions'); });
  }, [id, router]);

  useEffect(() => {
    fetchSession().finally(() => setLoading(false));
  }, [fetchSession]);

  const groupId = session?.groupId;
  const loadUnnamed = useCallback(() => {
    if (!groupId) return;
    getGroupTransfers(groupId)
      .then((ts) => setUnnamed(ts.filter((t) => t.status === 'unmatched')))
      // Treasurers without access, or offline: Mark paid just marks paid.
      .catch(() => setUnnamed([]));
    getGroupOwed(groupId).then(setOwed).catch(() => setOwed([]));
    getGroupBilling(groupId).then(setBilling).catch(() => setBilling(null));
    getGroup(groupId)
      .then((g) => {
        setMembers(g.memberships ?? []);
        setKept(Object.fromEntries((g.memberships ?? []).map((m) => [m.player.id, Number(m.credit ?? 0)])));
      })
      .catch(() => setKept({}));
  }, [groupId]);
  useEffect(loadUnnamed, [loadUnnamed]);

  // Teams and scores follow who's in the game, so they reload with it.
  const isGameKind = session ? session.kind !== 'dues' : false;
  useEffect(() => {
    if (!session || !isGameKind) return;
    getLineup(id)
      .then((l) => {
        setLineup(l);
        setLineupError(null);
      })
      .catch((err) => {
        setLineup(null);
        setLineupError(err instanceof Error ? err.message : null);
      });
    if (session.group?.requireRsvp) getRsvpBoard(id).then(setBoard).catch(() => setBoard(null));
  }, [id, session, isGameKind]);

  // On match day captains save scores from their phones too: look again while the game is open
  // (every 20s, and on coming back to the app) so their games show here without a reload.
  const liveDay = !!session && isGameKind && session.status === 'upcoming' && String(session.date).slice(0, 10) <= localToday();
  useEffect(() => {
    if (!liveDay) return;
    let stale = false;
    const look = () => document.visibilityState === 'visible' && getLineup(id).then((l) => { if (!stale) setLineup(l); }).catch(() => undefined);
    const timer = window.setInterval(look, 20_000);
    document.addEventListener('visibilitychange', look);
    return () => {
      stale = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', look);
    };
  }, [id, liveDay]);

  // Opening step: ?tab= if given, else the one the game is at. Before match day it's who's in;
  // on match day, teams until they're picked, then scores; once played, who still has to pay
  // (or the vote, when everyone has). Old links (?tab=stars, ?tab=payments) still land right.
  useEffect(() => {
    if (!session || step) return;
    if (session.kind !== 'dues' && lineup === undefined) return;
    const asked = new URLSearchParams(window.location.search).get('tab');
    const wanted = asked === 'payments' ? 'players' : asked === 'stars' ? 'full' : asked;
    const ph = gamePhase(session, daysFromToday(session.date), session.group?.kickoffTime);
    const owing = gameTally(session.payments ?? [], coversByDues(session), ph === 'before' || ph === 'today').toPay > 0;
    const teamsPicked = !!lineup?.squad.length && lineup.squad.every((m) => m.team);
    setStep(
      STEPS.includes(wanted as Step)
        ? (wanted as Step)
        : ph === 'today'
          ? teamsPicked ? 'scores' : 'teams'
          : ph === 'after'
            ? lineup?.games.length || teamsPicked ? 'scores' : 'full'
            : ph === 'ended'
              ? owing ? 'players' : 'full'
              : 'players',
    );
    // From the home's "End game": straight into who came.
    if (new URLSearchParams(window.location.search).get('end') === '1' && session.status === SessionStatus.UPCOMING) setEnding(true);
    // From a "send it to the group" notice: the message, ready. Taken off the address so a
    // refresh or the back button doesn't open it again.
    const send = new URLSearchParams(window.location.search).get('send') as SendKind | null;
    if (send && SEND_KINDS.includes(send)) {
      setSending({ kind: send });
      const url = new URL(window.location.href);
      url.searchParams.delete('send');
      window.history.replaceState(null, '', url);
    }
  }, [session, step, lineup]);

  function chooseStep(t: Step) {
    setStep(t);
    // Scrolled down into a long step: start the next one at its top, just under the step bar.
    const anchor = document.getElementById('game-steps-anchor');
    if (anchor) {
      const top = anchor.getBoundingClientRect().top + window.scrollY - parseFloat(getComputedStyle(document.body).paddingTop || '0');
      if (window.scrollY > top) window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url);
  }

  /** Runs a change to one player, refreshes the game, and says what happened. */
  async function act(p: IPayment, run: () => Promise<unknown>, done: string) {
    setBusyId(p.id);
    try {
      await run();
      await fetchSession();
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    } finally {
      setBusyId(null);
    }
  }

  const phase = session ? gamePhase(session, daysFromToday(session.date), session.group?.kickoffTime) : 'before';
  const before = phase === 'before' || phase === 'today';

  async function remind() {
    setReminding(true);
    try {
      const result = await sendReminders(id);
      toast.success(
        result.missed
          ? `Reminder sent to ${result.sent}. ${result.missed} haven’t turned on notifications: tap their name to send their payment details on WhatsApp.`
          : `Reminder sent to ${result.sent} player${result.sent === 1 ? '' : 's'}`,
      );
    } catch {
      toast.error('The reminder didn’t send. Try again.');
    } finally {
      setReminding(false);
    }
  }

  function onPlayerAction(p: IPayment, action: PlayerAction) {
    const first = nameOfPayment(p).split(' ')[0];
    if (action === 'details') {
      if (!billing?.account || !session) return;
      const member = members.find((m) => m.player.id === p.playerId);
      const phone = p.player?.phone ?? member?.player.phone;
      const went = openWhatsApp(
        paymentDetailsMessage({
          firstName: first,
          groupName: session.group?.name ?? 'Your group',
          account: billing.account,
          code: member?.paymentRef,
          amount: leftToPay(p),
          forWhat: gameLabel(session),
        }),
        phone,
      );
      const why = pickWhy(first, phone, went);
      if (why) toast.success(why);
      return;
    }
    if (action === 'move') {
      setMovingPay(p);
      return;
    }
    if (action === 'cash') {
      act(p, () => markPaid(p.id, 'cash'), `${first} paid in cash`);
    } else if (action === 'paid') {
      // With money waiting for a name, ask whether it was one of those; otherwise just mark paid.
      if (unnamed.length) setHowPaid(p.id);
      else act(p, () => markPaid(p.id), `${first} marked paid`);
    } else if (action === 'no_show') {
      act(p, () => markNoShow(p.id), `${first} didn’t come: nothing to pay`);
    } else if (action === 'came') {
      act(p, () => markCame(p.id), `${first} came after all`);
    } else if (action === 'free') {
      act(p, () => waivePayment(p.id), before ? `${first} plays free` : `${first} played free`);
    } else if (action === 'out') {
      act(p, () => setRsvpForPlayer(id, p.playerId, 'out'), `${first} is off this game`);
    } else {
      act(p, () => markUnpaid(p.id), before ? `${first} hasn’t paid yet` : `${first} is back to to pay`);
    }
  }

  async function payWithTransfer(paymentId: string, t: BankTransfer, done: string) {
    setBusyId(paymentId);
    try {
      await assignTransfer(t.id, paymentId);
      setHowPaid(null);
      await fetchSession();
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    } finally {
      setBusyId(null);
      loadUnnamed();
    }
  }

  async function setStatus(status: 'upcoming' | 'completed' | 'cancelled', done: string) {
    try {
      await updateSessionStatus(id, status);
      await fetchSession();
      toast.success(done);
    } catch {
      toast.error('That didn’t save. Try again.');
    }
  }

  if (loading || !session) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-gray-200 rounded w-20" />
          <div className="h-52 bg-gray-100 rounded-[28px]" />
          <div className="h-12 bg-gray-100 rounded-2xl" />
          <div className="h-40 bg-gray-100 rounded-3xl" />
        </div>
      </div>
    );
  }

  const payments = session.payments || [];
  // Monthly-type groups: a game costs nothing extra; a player has paid for it when their dues
  // for that period are paid, and that's where they're collected.
  const coveredByDues = coversByDues(session);
  const isGame = session.kind !== 'dues';
  const cancelled = phase === 'cancelled';
  const played = !before && !cancelled;
  const tally = gameTally(payments, coveredByDues, before);
  // Players can be added until the game is ended (someone who turns up at 7:05 for a 7pm game
  // still plays), from the group or brand new.
  const canAdd = session.status === 'upcoming' && session.kind !== 'dues';
  // Members not on this game yet, for "Add players".
  const onGame = new Set(payments.map((p) => p.playerId));
  const notOnGame = members
    .filter((m) => !onGame.has(m.player.id))
    .map((m) => ({
      playerId: m.player.id,
      name: m.player.nickname || `${m.player.firstName} ${m.player.lastName}`,
      fullName: `${m.player.firstName} ${m.player.lastName}`,
      photoKey: m.player.photoKey ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // The player's other unpaid games in this group: where a payment by transfer could move to.
  const otherDues = (p: IPayment) => owed.filter((o) => o.playerId === p.playerId && o.sessionId !== session.id);
  const onSides = lineup?.squad.filter((m) => m.team).length ?? 0;
  const games = lineup?.games.length ?? 0;
  const stepInfo: Record<Step, StepInfo> = {
    players: cancelled
      ? { status: 'Called off' }
      : before
      ? { status: `${tally.playing} in` }
      : tally.toPay && !coveredByDues
        ? { status: `${tally.toPay} to pay`, attention: true }
        : { status: coveredByDues ? `${tally.playing} played` : 'All paid', done: !!payments.length },
    teams: !lineup?.squad.length
      ? { status: 'No one yet' }
      : lineup.locked
        ? { status: 'Locked', done: true }
        : onSides === 0
          ? { status: 'Not picked', attention: phase === 'today' }
          : onSides < lineup.squad.length
            ? { status: `${lineup.squad.length - onSides} to place`, attention: true }
            : { status: `${lineup.teamCount} teams`, done: true },
    scores: !lineup?.scoresOpen ? { status: 'Match day' } : games ? { status: `${games} game${games === 1 ? '' : 's'}`, done: phase === 'ended' } : { status: 'None yet' },
    full: phase === 'ended' ? { status: 'Ended', done: true } : cancelled ? { status: 'Called off' } : { status: phase === 'after' ? 'End game' : 'Not yet', attention: phase === 'after' },
  };
  const shareGame = () => {
    if (!billing) return;
    const kickoff = session.kickoffTime || session.group?.kickoffTime;
    openWhatsApp(
      gameInviteMessage({
        groupName: session.group?.name ?? 'Game',
        when: `${gameLabel(session)}${kickoff ? ` · ${prettyTime(kickoff)}` : ''}`,
        where: session.group?.location,
        inCount: tally.playing,
        places: Number(session.group?.targetPlayers ?? 0) || undefined,
        link: billing.link,
      }),
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <BackButton label="Back" />
        <GameMenu
          phase={phase}
          // A game moves until its first score is in; dues periods don't move.
          onEdit={session.kind !== 'dues' && !lineup?.games.length ? () => setMoving(true) : undefined}
          onQr={isGame && session.status === 'upcoming' ? () => setShowQr(true) : undefined}
          onEnd={() => setEnding(true)}
          onReopen={() => setStatus('upcoming', cancelled ? 'Game is back on' : 'Game reopened')}
          onDownload={() => exportSessionPaymentsCsv(id).catch(() => toast.error('The download didn’t start. Try again.'))}
          onCancel={() => setStatus('cancelled', 'Game cancelled')}
          onDelete={async () => {
            try {
              await deleteSession(id);
              toast.success('Game deleted');
              router.push('/sessions');
            } catch {
              toast.error('The game wasn’t deleted. Try again.');
            }
          }}
        />
      </div>

      {showQr && (
        <MatchQrSheet
          sessionId={id}
          groupId={session.groupId}
          groupName={session.group?.name ?? 'the group'}
          takesReplies={!!session.group?.requireRsvp}
          onClose={() => {
            setShowQr(false);
            // Anyone who joined while it was up shows on the list.
            fetchSession();
          }}
        />
      )}

      {moving && (
        <EditGameSheet
          session={session}
          onClose={() => setMoving(false)}
          onSaved={(s) => {
            setSession(s);
            setMoving(false);
            toast.success('Game moved');
          }}
        />
      )}

      {howPaid && (() => {
        const p = payments.find((x) => x.id === howPaid);
        if (!p) return null;
        return (
          <HowPaidSheet
            member={{ playerId: p.playerId, name: nameOfPayment(p), credit: kept[p.playerId] ?? 0 }}
            paymentId={p.id}
            owed={owed}
            due={Number(p.amount)}
            game={gameLabel(session)}
            transfers={unnamed}
            busy={busyId === p.id}
            onUseTransfer={(t, outcome) => payWithTransfer(p.id, t, outcome)}
            onOtherWay={() => {
              setHowPaid(null);
              act(p, () => markPaid(p.id, 'cash'), `${nameOfPayment(p).split(' ')[0]} paid in cash`);
            }}
            onClose={() => setHowPaid(null)}
          />
        );
      })()}

      {movingPay && (
        <MovePaymentSheet
          name={nameOfPayment(movingPay).split(' ')[0]}
          amount={Number(movingPay.amount)}
          fromLabel={gameLabel(session)}
          games={otherDues(movingPay)}
          onClose={() => setMovingPay(null)}
          onMove={async (to) => {
            try {
              await movePayment(movingPay.id, to.paymentId);
              setMovingPay(null);
              await fetchSession();
              loadUnnamed();
              toast.success(`Moved to ${owedLabel(to)}. ${gameLabel(session)} is unpaid again.`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'That didn’t move. Try again.');
            }
          }}
        />
      )}

      {adding && (
        <AddToGameSheet
          members={notOnGame}
          late={!before}
          onClose={() => setAdding(false)}
          onAddNew={async (p) => {
            try {
              const player = await createPlayer(p);
              await addMember(session.groupId, { playerId: player.id });
              await setRsvpForPlayer(id, player.id, 'in');
              await fetchSession();
              loadUnnamed();
              toast.success(`${player.firstName} is in the group and on this game`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'That didn’t save. Try again.');
              throw err;
            }
          }}
          onAdd={async (m) => {
            try {
              await setRsvpForPlayer(id, m.playerId, 'in');
              await fetchSession();
              toast.success(`${m.name.split(' ')[0]} is in`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'That didn’t save. Try again.');
              throw err;
            }
          }}
        />
      )}

      {ending && (
        <EndGameSheet
          session={session}
          coveredByDues={coveredByDues}
          onClose={() => setEnding(false)}
          onEnded={(s) => {
            setEnding(false);
            setSession(s);
            fetchSession();
          }}
          onSendToGroup={(s) => {
            // Full time: the players who came have the vote link; this is the group chat's copy.
            setEnding(false);
            setSession(s);
            fetchSession();
            const came = (s.payments ?? []).filter((p) => p.attendance !== 'no_show').length;
            window.setTimeout(() => setSending({ kind: 'vote', justEnded: { came } }), 320);
          }}
        />
      )}

      {sending && (
        <GroupMessageSheet
          kind={sending.kind}
          justEnded={sending.justEnded}
          session={session}
          link={billing?.link ?? null}
          inCount={tally.playing}
          places={Number(session.group?.targetPlayers ?? 0) || undefined}
          when={`${gameLabel(session)}${(session.kickoffTime || session.group?.kickoffTime) ? ` · ${prettyTime((session.kickoffTime || session.group?.kickoffTime)!)}` : ''}`}
          onClose={() => setSending(null)}
        />
      )}

      <GameHero session={session} coveredByDues={coveredByDues} phase={phase} reminding={reminding} onRemind={remind} onShare={isGame && billing ? shareGame : undefined} />

      {/* Match day in four steps; the bar stays at the top while scrolling */}
      {isGame && step && <GameSteps current={step} info={stepInfo} onPick={chooseStep} />}

      {isGame && step === 'teams' && (lineup ? (
        <TeamsStep sessionId={id} lineup={lineup} onLineup={setLineup} onError={(m) => toast.error(m)} onDone={() => chooseStep('scores')} />
      ) : (
        <LineupFailed reason={lineupError} onRetry={() => getLineup(id).then((l) => { setLineup(l); setLineupError(null); }).catch((err) => { setLineupError(err instanceof Error ? err.message : null); toast.error('Still not loading.'); })} />
      ))}

      {isGame && step === 'scores' && (lineup ? (
        <ScoresStep sessionId={id} lineup={lineup} dateLabel={gameLabel(session)} ended={phase === 'ended'} timerOn={session.status === 'upcoming'} onLineup={setLineup} onError={(m) => toast.error(m)} onPickTeams={() => chooseStep('teams')} />
      ) : (
        <LineupFailed reason={lineupError} onRetry={() => getLineup(id).then((l) => { setLineup(l); setLineupError(null); }).catch((err) => { setLineupError(err instanceof Error ? err.message : null); toast.error('Still not loading.'); })} />
      ))}

      {isGame && step === 'full' && (
        <FullTimeStep sessionId={id} groupName={session.group?.name ?? 'Game'} phase={phase} lineup={lineup ?? null} onEnd={() => setEnding(true)} />
      )}

      {(!isGame || step === 'players') &&
        (payments.length === 0 ? (
          <EmptyState
            icon="receipt"
            title={cancelled ? 'This game was called off' : played ? 'No one played' : 'No one’s in yet'}
            description={
              cancelled
                ? 'No one owes for it. To play it after all, choose Options › Bring the game back.'
                : session.group?.requireRsvp
                ? 'Share the game on WhatsApp so players can say they’re in, or add the ones who told you.'
                : 'Everyone in the group is added when the game is made. Add players to the group first.'
            }
            actionLabel={canAdd ? 'Add players' : undefined}
            onAction={canAdd ? () => setAdding(true) : undefined}
          />
        ) : (
          <>
            {coveredByDues && (
              <p className="mb-3 text-[13px] leading-snug text-gray-600">
                This group pays {session.group?.paymentType} dues, so the game costs nothing extra.{' '}
                <Link href={`/sessions?group=${session.groupId}`} className="font-bold text-pitch-700 hover:text-ink">
                  Collect dues on the group
                </Link>
              </p>
            )}
            <PlayerList
              payments={payments}
              coveredByDues={coveredByDues}
              before={before}
              canSendDetails={!!billing?.account}
              canMove={(p) => p.status === PaymentStatus.PAID && p.source === 'transfer' && otherDues(p).length > 0}
              busyId={busyId}
              onAdd={canAdd ? () => setAdding(true) : undefined}
              onQr={isGame && session.status === 'upcoming' ? () => setShowQr(true) : undefined}
              onAction={onPlayerAction}
              onBulkPaid={async (ids) => {
                try {
                  await bulkMarkPaid(ids);
                  await fetchSession();
                  toast.success(`${ids.length} player${ids.length === 1 ? '' : 's'} marked paid`);
                } catch {
                  toast.error('That didn’t save. Try again.');
                }
              }}
            />
            {before && board && board.waitlist.length > 0 && (
              <div className="mt-3 rounded-2xl bg-white border border-gray-100 px-4 py-3">
                <p className="text-[13px] font-bold text-ink">Waitlist · {board.waitlist.length}</p>
                <ol className="mt-2 flex flex-wrap gap-1.5">
                  {board.waitlist.map((p, i) => (
                    <li key={p.id} className="inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full bg-chalk text-[13px] font-semibold text-ink">
                      <Avatar name={`${p.firstName} ${p.lastName}`} photoKey={p.photoKey} className="w-6 h-6 text-[9px]" />
                      <span className="tabular-nums text-gray-500">{i + 1}.</span>
                      {p.nickname || `${p.firstName} ${p.lastName}`}
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-[13px] leading-snug text-gray-600">The first in line gets the next place that frees up.</p>
              </div>
            )}
          </>
        ))}
    </div>
  );
}

/** The teams didn't load: say so, with what the server said (it helps find the cause), and a retry. */
function LineupFailed({ onRetry, reason }: { onRetry: () => void; reason?: string | null }) {
  return (
    <div className="py-10 text-center" role="alert">
      <p className="text-sm text-gray-600">The teams didn’t load.</p>
      {reason && <p className="mt-1 text-[12px] text-gray-500">The server said: “{reason}”</p>}
      <button onClick={onRetry} className="mt-2 h-11 px-3 text-sm font-bold text-pitch-700">
        Try again
      </button>
    </div>
  );
}
