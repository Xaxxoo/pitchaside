/**
 * Every email PitchAside sends. All of them are transactional — triggered by
 * something the recipient (or their organiser) just did — and share one layout.
 *
 * Email clients ignore stylesheets and flexbox, so the layout is tables with
 * inline styles. The one image is the banner under the wordmark: the app's own
 * illustrations, rendered to PNG (and one animated GIF) by
 * apps/web/scripts/email-art.tsx and served by the web app at /email/*.
 */

export interface EmailContent {
  subject: string;
  html: string;
  /** Plain-text alternative; also what gets logged in dev. */
  text: string;
}

const ink = '#0f1a14';
const volt = '#d4f53c';
const pitch = '#1f743a';
const chalk = '#f5f3ea';
const muted = '#767365';
const volt300 = '#e3fb6c';
const night = '#0d331c';

/**
 * Banner artwork. `background` is what shows while the image loads, or if the
 * reader's email app blocks images — it matches the image's own background.
 */
const banners = {
  stadium: { file: 'stadium.png', background: night },
  paid: { file: 'paid.gif', background: volt300 },
  kitty: { file: 'kitty.png', background: volt300 },
  squad: { file: 'squad.png', background: volt300 },
  tactics: { file: 'tactics.png', background: volt300 },
  trophy: { file: 'trophy.png', background: volt300 },
} as const;
type Banner = keyof typeof banners;

/** Every image the emails link to — each must exist in apps/web/public/email. */
export const bannerFiles = Object.values(banners).map((b) => b.file);

const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

/** Names, club names and messages come from users — never trust them as HTML. */
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Layout {
  /** Where the banner images are served from, e.g. https://pitchaside.app/email */
  assets: string;
  banner: Banner;
  subject: string;
  /** Inbox preview line. */
  preheader: string;
  greeting: string;
  heading: string;
  /** Plain-text paragraphs; escaped here. */
  paragraphs: string[];
  /** A value to make stand out, e.g. a temporary password. */
  highlight?: { label: string; value: string };
  cta?: { label: string; url: string };
  /** Small print under the button. */
  note?: string;
  /** Why this person is getting the email. */
  reason: string;
}

function layout(l: Layout): EmailContent {
  const p = (text: string) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${ink};">${escapeHtml(text)}</p>`;

  const highlight = l.highlight
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;">
        <tr><td style="background:${chalk};border-radius:12px;padding:12px 16px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${muted};">${escapeHtml(l.highlight.label)}</div>
          <div style="font-size:18px;font-weight:700;color:${ink};font-family:ui-monospace,Menlo,Consolas,monospace;margin-top:2px;">${escapeHtml(l.highlight.value)}</div>
        </td></tr>
      </table>`
    : '';

  const cta = l.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">
        <tr><td style="background:${ink};border-radius:12px;">
          <a href="${escapeHtml(l.cta.url)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:700;color:${volt};text-decoration:none;">${escapeHtml(l.cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:${muted};">Button not working? Copy this link: <a href="${escapeHtml(l.cta.url)}" style="color:${pitch};word-break:break-all;">${escapeHtml(l.cta.url)}</a></p>`
    : '';

  const note = l.note ? `<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:${muted};">${escapeHtml(l.note)}</p>` : '';

  const art = banners[l.banner];
  // Decorative, so alt is empty: nothing is lost (and no stray caption shows) when images are off.
  const banner = `<tr><td style="background:${art.background};font-size:0;line-height:0;">
        <img src="${escapeHtml(`${l.assets.replace(/\/+$/, '')}/${art.file}`)}" width="520" height="150" alt="" style="display:block;width:100%;height:auto;border:0;outline:none;">
      </td></tr>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(l.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${chalk};font-family:${font};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${chalk};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="background:${ink};border-radius:20px 20px 0 0;padding:18px 28px;">
        <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">Pitch<span style="color:${volt};">Aside</span></span>
      </td></tr>
      ${banner}
      <tr><td style="background:#ffffff;border-radius:0 0 20px 20px;padding:28px;">
        <p style="margin:0 0 6px;font-size:14px;color:${muted};">${escapeHtml(l.greeting)}</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:${ink};">${escapeHtml(l.heading)}</h1>
        ${l.paragraphs.map(p).join('\n        ')}
        ${highlight}
        ${cta}
        ${note}
      </td></tr>
      <tr><td style="padding:18px 28px 0;">
        <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${muted};">${escapeHtml(l.reason)}</p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:${muted};">PitchAside — payments and match days for 5-a-side football groups.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    l.greeting,
    '',
    l.heading,
    '',
    ...l.paragraphs,
    ...(l.highlight ? ['', `${l.highlight.label}: ${l.highlight.value}`] : []),
    ...(l.cta ? ['', `${l.cta.label}: ${l.cta.url}`] : []),
    ...(l.note ? ['', l.note] : []),
    '',
    '—',
    l.reason,
    'PitchAside — payments and match days for 5-a-side football groups.',
  ].join('\n');

  return { subject: l.subject, html, text };
}

// ── Organiser account emails ──

export function passwordResetEmail(input: { assets: string; name: string; resetUrl: string }): EmailContent {
  return layout({
    assets: input.assets,
    banner: 'stadium',
    subject: 'Reset your PitchAside password',
    preheader: 'Use this link to choose a new password. It expires in 1 hour.',
    greeting: `Hi ${input.name},`,
    heading: 'Reset your password',
    paragraphs: ['We got a request to reset the password for your PitchAside account. Choose a new one with the button below.'],
    cta: { label: 'Choose a new password', url: input.resetUrl },
    note: "This link expires in 1 hour. If you didn't ask for it, you can ignore this email — your password stays the same.",
    reason: 'You are getting this email because a password reset was requested for your PitchAside account.',
  });
}

export function verifyEmailEmail(input: { assets: string; name: string; verifyUrl: string }): EmailContent {
  return layout({
    assets: input.assets,
    banner: 'stadium',
    subject: 'Verify your PitchAside email',
    preheader: 'Confirm this is your email address to finish setting up your account.',
    greeting: `Hi ${input.name},`,
    heading: 'Confirm your email address',
    paragraphs: ['Thanks for signing up for PitchAside. Confirm this is your email address so we can reach you about your account.'],
    cta: { label: 'Verify my email', url: input.verifyUrl },
    note: "This link expires in 24 hours. If you didn't create a PitchAside account, you can ignore this email.",
    reason: 'You are getting this email because this address was used to create a PitchAside account.',
  });
}

export function memberInviteEmail(input: { assets: string; name: string; orgName: string; tempPassword: string; loginUrl: string }): EmailContent {
  return layout({
    assets: input.assets,
    banner: 'stadium',
    subject: `You've been added to ${input.orgName} on PitchAside`,
    preheader: `Sign in to help run ${input.orgName}.`,
    greeting: `Hi ${input.name},`,
    heading: `You're now helping run ${input.orgName}`,
    paragraphs: [
      `An admin at ${input.orgName} added you as a co-organiser on PitchAside, where the club tracks who's playing and who's paid.`,
      'Sign in with this email address and the temporary password below.',
    ],
    highlight: { label: 'Temporary password', value: input.tempPassword },
    cta: { label: 'Sign in', url: input.loginUrl },
    note: 'Please change your password in Settings once you are in.',
    reason: `You are getting this email because an admin at ${input.orgName} added you to their club on PitchAside.`,
  });
}

// ── Player account emails ──

/** The 6-digit code a player types in to set their first password or reset a forgotten one. */
export function playerCodeEmail(input: { assets: string; name: string; code: string }): EmailContent {
  return layout({
    assets: input.assets,
    banner: 'stadium',
    subject: `${input.code} is your PitchAside code`,
    preheader: 'Enter this code to choose your password. It expires in 10 minutes.',
    greeting: `Hi ${input.name},`,
    heading: 'Your PitchAside code',
    paragraphs: ['Enter this code in PitchAside to choose your password.'],
    highlight: { label: 'Your code', value: input.code },
    note: "It expires in 10 minutes. Don't share it with anyone. If you didn't ask for it, you can ignore this email.",
    reason: 'You are getting this email because someone asked to set or reset the password for the PitchAside account with this address.',
  });
}

// ── Player notifications (the same notices we send as push) ──

/** The artwork for each kind of notice. Only the payment receipt celebrates (the animated one). */
const noticeBanners: Record<string, Banner> = {
  receipt: 'paid',
  payment_reminder: 'kitty',
  dues_open: 'kitty',
  dues_reminder: 'kitty',
  rsvp_open: 'squad',
  game_scheduled: 'tactics',
  rsvp_nudge: 'squad',
  rsvp_promoted: 'squad',
  reminder_eve: 'tactics',
  reminder_kickoff: 'tactics',
  vote_open: 'trophy',
  vote_nudge: 'trophy',
  vote_closing: 'trophy',
  reminder_matchday: 'tactics',
  share_invite: 'squad',
  share_vote: 'trophy',
};

/** What the button says for each kind of notice. */
const noticeActions: Record<string, string> = {
  receipt: 'View my payments',
  payment_reminder: 'See how to pay',
  dues_open: 'See how to pay',
  dues_reminder: 'See how to pay',
  rsvp_open: "Say if you're in",
  game_scheduled: 'See how to pay',
  rsvp_nudge: "Say if you're in",
  rsvp_promoted: 'View the game',
  reminder_eve: 'View the game',
  reminder_kickoff: 'View the game',
  vote_open: 'Vote now',
  vote_nudge: 'Vote now',
  vote_closing: 'Vote now',
  reminder_matchday: 'View the game',
  share_invite: 'Send it to the group',
  share_vote: 'Send it to the group',
  identity_required: 'Open Settings',
};

export function noticeEmail(input: {
  assets: string;
  name: string;
  clubName: string;
  kind: string;
  title: string;
  /** One paragraph per line. */
  body: string;
  /** Absolute link into the app. */
  url?: string;
}): EmailContent {
  const paragraphs = input.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return layout({
    assets: input.assets,
    banner: noticeBanners[input.kind] ?? 'stadium',
    subject: input.title,
    preheader: paragraphs[0] ?? input.title,
    greeting: `Hi ${input.name},`,
    heading: input.title,
    paragraphs,
    cta: input.url ? { label: noticeActions[input.kind] ?? 'Open PitchAside', url: input.url } : undefined,
    reason: `You are getting this email because you play with ${input.clubName} on PitchAside.`,
  });
}
