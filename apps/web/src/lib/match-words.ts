/**
 * The words that go out with a match day: the link preview of the vote and the match card (what
 * WhatsApp shows above the link), and the caption sent with the card picture. One place, so the
 * vote link, the card and the results all sound like the same moment.
 */

/** Just what the words need from the match card (the server's /public/votes/:token/card). */
export interface MatchWordsCard {
  groupName: string;
  date: string;
  open: boolean;
  notYet?: boolean;
  ballots: number;
  squadSize: number;
  awards: { key: string; name: string }[];
}

/** "Sat 17 Oct". */
export function matchDay(date: string) {
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
}

/** The Player of the Match line: "Ada Obi", "Ada Obi & Tobi Ojo" (the card already joins a tie). */
function potmOf(card: MatchWordsCard) {
  return card.open ? null : (card.awards.find((a) => a.key === 'potm')?.name ?? null);
}
const isShared = (names: string) => names.includes(' & ');

/** The link preview: a title that makes people tap, and one line under it. */
export function matchPreview(card: MatchWordsCard): { title: string; description: string } {
  const day = matchDay(card.date);
  if (card.notYet) return { title: `⚽ ${card.groupName} · ${day}`, description: 'Match day. The vote opens at full time.' };
  if (card.open) {
    return {
      title: `🏆 Who was Player of the Match? · ${card.groupName}`,
      description: card.ballots
        ? `Full time, ${day}. ${card.ballots} of ${card.squadSize} have voted. Takes a minute: have your say.`
        : `Full time, ${day}. Be the first to vote. Takes a minute.`,
    };
  }
  const potm = potmOf(card);
  if (potm) {
    return {
      title: `🏆 ${potm} ${isShared(potm) ? 'share' : 'is'} Player of the Match`,
      description: `${card.groupName} · ${day}. The Best VII, every award and the day’s table.`,
    };
  }
  return { title: `⚽ ${card.groupName} · ${day}: full time`, description: 'The day’s table and every score.' };
}

/** Sent with the match card picture: open, it asks for votes; closed, it leads with the winner. */
export function matchCaption(card: MatchWordsCard) {
  const day = matchDay(card.date);
  if (card.notYet) return `⚽ ${card.groupName} · match day ${day}`;
  if (card.open) return `🏁 Full time, ${card.groupName}! Who ran the show? Vote for Player of the Match 👇`;
  const potm = potmOf(card);
  if (potm) return `🏆 ${potm} ${isShared(potm) ? 'share' : 'is'} Player of the Match! ${card.groupName} · ${day}. The full card 👇`;
  return `⚽ ${card.groupName} · ${day}: how the day went 👇`;
}
