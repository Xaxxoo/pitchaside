import { dialNumber, readPhone } from '@pitchaside/shared';
import { formatCurrency, type GroupAccount } from './api';

/**
 * WhatsApp is where groups talk, and the one channel that reaches players who never turned on
 * notifications (or were added by hand and have never opened the app). Everything the app sends
 * there is worded here, so the messages read the same wherever they're sent from.
 */

/**
 * A number as WhatsApp wants it ("0803 123 4567" → "2348031234567"), or null when it isn't one
 * WhatsApp can open. The same rule as the server's (readPhone in @pitchaside/shared).
 */
export function whatsappNumber(phone?: string | null) {
  return dialNumber(phone);
}

/** "+234 803 123 4567": a number written the same way everywhere, or the number as typed if it isn't one we can read. */
export function prettyPhone(phone?: string | null) {
  const r = readPhone(phone);
  return r.ok ? r.pretty : phone?.trim() || '';
}

/**
 * Opens WhatsApp with the message ready: to that person when their number can be read, else to
 * pick a chat. Says which, so a screen can tell the organiser why it's asking them to pick.
 */
export function openWhatsApp(text: string, phone?: string | null): 'person' | 'pick' {
  const to = whatsappNumber(phone);
  window.open(`https://wa.me/${to ?? ''}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return to ? 'person' : 'pick';
}

/** Why a message to one player went to the chat picker instead: for a toast. Null when it went to them. */
export function pickWhy(firstName: string, phone: string | null | undefined, went: 'person' | 'pick') {
  if (went === 'person') return null;
  return phone?.trim()
    ? `${firstName}’s number won’t open WhatsApp, so pick their chat. You can fix the number on their page.`
    : `No number for ${firstName}, so pick their chat in WhatsApp.`;
}

/** Everything one player needs to pay: who to pay, how much, for what, and the code that matches it to them. */
export function paymentDetailsMessage(p: {
  firstName: string;
  groupName: string;
  account: GroupAccount;
  code?: string | null;
  amount?: number;
  /** "Sat 24 Oct": what it's for. */
  forWhat?: string;
  /**
   * The group's join link: someone added by hand has no way into the app without it. Members
   * who already have an account go straight in with it.
   */
  link?: string | null;
}) {
  return [
    `Hi ${p.firstName} 👋 ${p.groupName}${p.forWhat ? ` · ${p.forWhat}` : ''}`,
    p.amount ? `${formatCurrency(p.amount)} to pay, by transfer to:` : 'Pay by transfer to:',
    `${p.account.bankName}`,
    `${p.account.accountNumber}`,
    `${p.account.accountName}`,
    p.code ? `Put your payment code ${p.code} in the transfer description, so it's matched to you straight away.` : '',
    p.link ? `\nYour games, what you owe and your player card: ${p.link}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The group's join link pointing at one game: members open that game, new players sign up and
 * land on it (the same link as the game's QR code).
 */
export function gameLink(link: string, gameId: string) {
  return `${link}${link.includes('?') ? '&' : '?'}game=${gameId}`;
}

/** A game to share in the group chat: when, where, how full, and the link to say you're in. */
export function gameInviteMessage(g: {
  groupName: string;
  /** "Sat 24 Oct · 8am". */
  when: string;
  where?: string | null;
  inCount: number;
  places?: number;
  link: string;
}) {
  const left = g.places ? g.places - g.inCount : 0;
  return [
    `⚽ ${g.groupName} · ${g.when}${g.where ? ` at ${g.where}` : ''}`,
    g.places ? `${g.inCount} of ${g.places} in${left > 0 ? `, ${left} place${left === 1 ? '' : 's'} left` : ', full'}.` : `${g.inCount} in so far.`,
    `Say you're in here: ${g.link}`,
  ].join('\n');
}

/** A game's link for the group chat the day before: the first call, or the last one. */
export function groupInviteMessage(g: Parameters<typeof gameInviteMessage>[0] & { last?: boolean }) {
  const left = g.places ? g.places - g.inCount : null;
  if (!g.last) return gameInviteMessage(g);
  return [
    `⏰ Last call for ${g.when.split(' · ')[0]}`,
    `⚽ ${g.groupName} · ${g.when}${g.where ? ` at ${g.where}` : ''}`,
    left === null
      ? `${g.inCount} in so far.`
      : left > 0
        ? `${g.inCount} of ${g.places} in, ${left} place${left === 1 ? '' : 's'} left.`
        : `Full (${g.places} of ${g.places}). Say you're in to go on the waiting list.`,
    `Say you're in here: ${g.link}`,
  ].join('\n');
}

/** The vote link for the group chat: at full time, or as the last call before it closes. */
export function groupVoteMessage(v: { groupName: string; link: string; ballots: number; squadSize: number; closes?: string | null; closing?: boolean }) {
  // Last call: the turnout is the nudge (nobody wants someone else picking their Player of the Match).
  if (v.closing) {
    const left = Math.max(0, v.squadSize - v.ballots);
    return [
      `⏳ Last call, ${v.groupName}! Voting closes ${v.closes ?? 'soon'}.`,
      v.ballots
        ? `${v.ballots} of ${v.squadSize} have voted${left ? `, ${left} still to go` : ''}. Don’t let the others pick your Player of the Match 👀`
        : 'Nobody has voted yet. Be the one who decides 👀',
      `One minute 👇`,
      v.link,
    ].join('\n');
  }
  // Full time: the day just ended, so the message is about who stood out, not about a form.
  return [
    `🏁 FULL TIME, ${v.groupName}!`,
    `Who ran the show today? 🔥`,
    `Vote Player of the Match and your Best VII. One minute 👇`,
    v.link,
    v.closes ? `Winners revealed when voting closes, ${v.closes}.` : 'Winners revealed when voting closes.',
  ].join('\n');
}
