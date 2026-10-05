/**
 * Shared bits for the generated share images (next/og): the brand fonts,
 * fetched as TTF for satori, and text sizing.
 */

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=DM+Sans:wght@500;700';

export type Font = { name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: 'normal' };
let fontsCache: Promise<Font[]> | null = null;

/** Brand fonts as TTF (satori needs TTF/OTF). Falls back to the built-in font if offline. */
export function loadFonts(): Promise<Font[]> {
  fontsCache ??= (async () => {
    try {
      const css = await (await fetch(FONT_CSS)).text();
      const faces = [...css.matchAll(/font-family: '([^']+)';[\s\S]*?font-weight: (\d+);[\s\S]*?src: url\(([^)]+)\)/g)];
      return await Promise.all(
        faces.map(async ([, name, weight, url]) => ({
          name,
          weight: Number(weight) as Font['weight'],
          style: 'normal' as const,
          data: await (await fetch(url)).arrayBuffer(),
        })),
      );
    } catch {
      fontsCache = null;
      return [];
    }
  })();
  return fontsCache;
}

/** Shrink long names so they stay on one line. */
export function fit(text: string, base: number, max: number) {
  return text.length <= max ? base : Math.max(Math.round((base * max) / text.length), Math.round(base * 0.55));
}
