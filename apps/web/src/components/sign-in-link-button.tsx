'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { BallSpinner } from '@/components/skeleton';
import { createSignInLink } from '@/lib/api';
import { openWhatsApp, pickWhy, signInLinkMessage } from '@/lib/whatsapp';

/**
 * "Send sign-in link": for a player who can't get in (forgot the password, never set one, or was
 * added without an email). Makes a one-time link and opens WhatsApp to them with it. `dark` for
 * the player card on their page, `row` for a list of actions in a sheet.
 */
export function SignInLinkButton({ player, variant }: { player: { id: string; firstName: string; phone?: string | null }; variant: 'dark' | 'row' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const res = await createSignInLink(player.id);
      const went = openWhatsApp(signInLinkMessage({ firstName: res.firstName, link: res.link }), res.phone ?? player.phone);
      toast.success(pickWhy(res.firstName, res.phone ?? player.phone, went) ?? `Link ready for ${res.firstName}: send it in WhatsApp`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const icon = busy ? (
    <BallSpinner />
  ) : (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
    </svg>
  );

  return variant === 'dark' ? (
    <button
      onClick={send}
      disabled={busy}
      className="press mt-3 inline-flex items-center gap-2 min-h-11 px-3.5 rounded-full bg-white/10 text-[13px] font-bold text-white hover:bg-white/20 disabled:opacity-60"
    >
      {icon}
      Send sign-in link
    </button>
  ) : (
    <button
      onClick={send}
      disabled={busy}
      className="press w-full flex items-center gap-2.5 min-h-12 px-2 rounded-xl text-left hover:bg-chalk disabled:opacity-60"
    >
      <span className="text-ink">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">Send sign-in link</span>
        <span className="block text-[12px] text-gray-500 truncate">Can’t get in? One tap gets {player.firstName} in.</span>
      </span>
    </button>
  );
}
