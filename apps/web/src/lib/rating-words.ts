import type { RatingMode } from './api';

/**
 * How the card's number is worked out, in one place, so the table, squad, stats and breakdown
 * explain it the same way in both apps. `short` finishes "Ranked by rating: …".
 */
export function ratingWords(mode: RatingMode | undefined) {
  return mode === 'steady'
    ? {
        short: 'what each player did on every match day (goals, assists, clean sheets, results), with votes counting most while they’re new',
        long:
          'Each player’s rating, from 30 to 95. Every match day gives them a match rating out of 10, mostly from goals, assists, clean sheets, saves and results; votes count most while they’re new. The rating moves a few points at most each match day, less for someone who played fewer of the day’s games. Missing several of their group’s match days in a row takes a little off.',
      }
    : {
        short: '40% goals and assists, 40% the votes after each game, 20% team results',
        long:
          'Each player’s rating, from 40 to 99: 40% goals, assists and saves (cards take a little off), 40% votes (Player of the Match, Best VII, awards), 20% team results, compared with the rest of the club. It settles once they’ve played 3 games with scores.',
      };
}
