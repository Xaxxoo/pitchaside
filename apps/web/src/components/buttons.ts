/**
 * The three kinds of button, the same everywhere: the one main action (dark, volt text), the
 * other choice (outlined), and anything that deletes, resets or can't be taken back (kit orange,
 * always behind a confirm). Ink text on kit orange: white on it is too faint outdoors.
 */
const base =
  'press inline-flex items-center justify-center gap-2 min-h-12 px-4 rounded-2xl text-[15px] font-bold transition-colors disabled:opacity-60 disabled:pointer-events-none';

export const btnPrimary = `${base} bg-ink text-volt-300 hover:bg-pitch-900`;
export const btnSecondary = `${base} bg-white text-ink border border-gray-300 hover:border-ink`;
/**
 * The one thing a form page is for ("Add pitch", "See free times"): volt with the sticker shadow,
 * a size up, so it can't be missed. One per page; everything else is btnPrimary or quieter.
 */
export const btnMain =
  'press inline-flex items-center justify-center gap-2 min-h-14 px-5 rounded-2xl bg-volt-300 text-ink text-[16px] font-extrabold border-2 border-ink shadow-sticker transition-colors hover:bg-volt-400 disabled:opacity-60 disabled:pointer-events-none';
export const btnDanger = `${base} bg-kit-500 text-ink hover:bg-kit-400`;
