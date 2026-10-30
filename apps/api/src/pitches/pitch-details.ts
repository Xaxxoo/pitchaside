/** What a pitch can be, as the owner picks it. The same lists as PITCH_* in @pitchaside/shared. */
export const PITCH_A_SIDE = [5, 6, 7, 8, 11];
export const PITCH_SURFACES = ['astro', 'grass', 'indoor', 'concrete'];
export const PITCH_FACILITIES = ['floodlights', 'changing', 'toilets', 'showers', 'parking', 'drinks'];

/** Map links we open for players: Google or Apple Maps, over https. */
export const MAP_URL = /^https:\/\/((www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?\/maps|maps\.google\.[a-z]{2,3}(\.[a-z]{2})?|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com)(\/|\?|$)/i;
