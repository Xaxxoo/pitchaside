'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import {
  HeroScene,
  KitLine,
  KittyJar,
  TacticsBoard,
  Celebration,
  NightStadium,
  BallIcon,
  kitFor,
} from '@/components/illustrations';

const features = [
  {
    title: 'Group Management',
    description:
      'Create and manage multiple 5-aside groups with custom schedules, player caps, and fee structures. Everything in one place.',
    art: KitLine,
    tint: 'bg-volt-200',
  },
  {
    title: 'Payment Tracking',
    description:
      'See who has paid and who hasn\'t at a glance. Mark payments as paid, pending, or waived — no more awkward WhatsApp chases.',
    art: KittyJar,
    tint: 'bg-sky-300/50',
  },
  {
    title: 'Session Scheduling',
    description:
      'Create match-day sessions tied to your groups. Track attendance, fees collected, and outstanding balances in real time.',
    art: TacticsBoard,
    tint: 'bg-kit-400/25',
  },
];

const steps = [
  {
    minute: "1'",
    phase: 'Kick-off',
    title: 'Create your group',
    description: 'Name it, set the fee per player, pick a schedule. Done in 30 seconds.',
  },
  {
    minute: "45'",
    phase: 'Half-time',
    title: 'Add your players',
    description: 'Register players with their contact info — or share an invite link and let them sign themselves up.',
  },
  {
    minute: "90'",
    phase: 'Full-time',
    title: 'Track every session',
    description: 'Create a session, and payments are auto-generated. Mark paid with one tap.',
  },
];

const testimonials = [
  {
    quote: 'I used to spend 20 minutes after every game chasing people on WhatsApp. Now it takes me 30 seconds.',
    name: 'Tunde B.',
    role: 'Organises Tuesday & Thursday 5-a-side',
    rotate: '-rotate-1',
  },
  {
    quote: 'Finally, something built for us. No more spreadsheets, no more "I\'ll pay you next week" excuses.',
    name: 'Chidi O.',
    role: 'Runs 3 weekly groups across Lagos',
    rotate: 'rotate-1',
  },
  {
    quote: 'The payment tracking alone saved me from losing money every single week. Game changer.',
    name: 'Seyi A.',
    role: 'Sunday league organiser',
    rotate: '-rotate-[0.5deg]',
  },
];

const faqs = [
  {
    q: 'How much does PitchAside cost?',
    a: 'Creating groups and managing players is free. We charge a flat \u20A6350 service fee on each payout you make from your group account.',
  },
  {
    q: 'How do players pay?',
    a: 'Each group gets its own dedicated bank account (Payrep MFB). Players transfer directly to it and payments are matched to them automatically \u2014 no more chasing people on WhatsApp.',
  },
  {
    q: 'Can I manage more than one group?',
    a: 'Yes. Create as many groups as you need and manage them all from a single dashboard.',
  },
  {
    q: 'Do my players need to sign up?',
    a: 'Players get a link to join your group, set up their profile and see their own payment history. The organiser can also add players manually.',
  },
];

const ticker = [
  'No more WhatsApp chases',
  'Tuesday night 5s',
  'Who hasn\'t paid?',
  'Sunday morning kickabout',
  'One-tap mark paid',
  'Invite links for players',
  'Every naira accounted for',
];

const heroPlayers = ['Tunde Bakare', 'Chidi Okafor', 'Seyi Adeyemi', 'Musa Bello', 'Ifeanyi Eze'];

export default function LandingPage() {
  const [stats, setStats] = useState({ groups: '500+', players: '4,000+', sessions: '12,000+' });

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
    fetch(`${apiUrl}/stats/public`)
      .then((res) => res.json())
      .then((data) => {
        setStats({
          groups: `${data.groups.toLocaleString()}+`,
          players: `${data.players.toLocaleString()}+`,
          sessions: `${data.sessions.toLocaleString()}+`,
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-ink/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <Logo />

          <nav className="hidden md:flex items-center gap-1 text-sm font-semibold text-gray-600">
            {[
              ['Features', '#features'],
              ['How it works', '#how-it-works'],
              ['FAQ', '#faq'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="px-3.5 py-2 rounded-full hover:bg-white hover:text-ink transition-colors">
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/signin"
              className="px-3 py-2 text-sm font-semibold text-gray-700 hover:text-ink transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative pt-12 pb-16 sm:pt-20 lg:pt-24 lg:pb-24">
        <div className="absolute inset-0 -z-0 chalk-dots opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[1.02fr_1fr] gap-12 lg:gap-8 items-center">
          <div className="text-center lg:text-left">
            <div className="animate-fade-in-up inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full bg-white border border-gray-200 shadow-card text-xs font-semibold text-gray-700">
              <span className="px-2 py-0.5 rounded-full bg-volt-400 text-ink text-[10px] font-extrabold uppercase tracking-wider">New</span>
              Built for 5-aside organisers
            </div>

            <h1
              className="animate-fade-in-up mt-6 text-[44px] leading-[0.98] sm:text-6xl lg:text-[76px] font-extrabold text-ink tracking-tight"
              style={{ animationDelay: '0.08s' }}
            >
              Stop chasing payments.{' '}
              <span className="relative inline-block">
                <span className="relative z-10">Start playing.</span>
                <svg className="absolute -bottom-1 left-0 w-full h-5 z-0" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden>
                  <path d="M4 14 Q80 2 150 10 T296 8" stroke="#d4f53c" strokeWidth="12" fill="none" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            <p
              className="animate-fade-in-up mt-6 text-lg text-gray-600 max-w-xl mx-auto lg:mx-0 leading-relaxed"
              style={{ animationDelay: '0.16s' }}
            >
              The easiest way to manage your 5-aside football groups, schedule sessions, and know exactly who has paid — without the awkward WhatsApp messages.
            </p>

            <div
              className="animate-fade-in-up mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
              style={{ animationDelay: '0.24s' }}
            >
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-2 px-7 py-4 bg-ink text-volt-300 font-bold rounded-2xl hover:bg-pitch-900 transition-all shadow-lift hover:-translate-y-0.5"
              >
                Create your group — it&apos;s free
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-white text-ink font-bold rounded-2xl border border-gray-200 hover:border-gray-300 transition-all"
              >
                <BallIcon className="w-5 h-5" />
                See how it works
              </a>
            </div>

            <div
              className="animate-fade-in-up mt-8 flex items-center gap-3 justify-center lg:justify-start"
              style={{ animationDelay: '0.32s' }}
            >
              <div className="flex -space-x-2">
                {heroPlayers.map((n) => {
                  const k = kitFor(n);
                  return (
                    <div key={n} className={`w-9 h-9 rounded-full ring-[3px] ring-white ${k.bg} ${k.fg} flex items-center justify-center text-[11px] font-extrabold font-display`}>
                      {n.split(' ').map((p) => p[0]).join('')}
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-gray-600 text-left leading-tight">
                <span className="font-bold text-ink">{stats.players}</span> players tracked
                <br />
                <span className="text-gray-500">across {stats.groups} groups</span>
              </p>
            </div>
          </div>

          {/* Illustration + floating UI chips */}
          <div className="animate-slide-up relative" style={{ animationDelay: '0.2s' }}>
            <div className="relative rounded-[36px] bg-sky-300/60 border-[3px] border-ink shadow-[8px_8px_0_0_#0f1a14] overflow-hidden">
              <HeroScene className="w-full h-auto block" />
            </div>

            <div className="absolute -left-3 sm:-left-8 top-[18%] animate-float">
              <div className="bg-white rounded-2xl border-2 border-ink shadow-sticker px-3.5 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-volt-400 flex items-center justify-center">
                  <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 leading-none">Payment received</p>
                  <p className="text-sm font-extrabold text-ink mt-1 leading-none">₦3,000 · Tunde B.</p>
                </div>
              </div>
            </div>

            <div className="absolute -right-2 sm:-right-6 bottom-[14%] animate-float" style={{ animationDelay: '1.8s' }}>
              <div className="bg-ink text-white rounded-2xl border-2 border-ink shadow-[4px_4px_0_0_#d4f53c] px-4 py-3 w-48">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-white/60">Tuesday 5s</p>
                  <p className="text-[11px] font-extrabold text-volt-300">9/10 paid</p>
                </div>
                <p className="font-display text-2xl font-extrabold mt-1 tabular-nums">₦27,000</p>
                <div className="w-full bg-white/15 rounded-full h-2 mt-2">
                  <div className="bg-volt-400 h-2 rounded-full animate-progress" style={{ width: '90%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker ── */}
      <div className="bg-ink text-white py-4 -rotate-1 scale-[1.02] border-y-4 border-volt-400">
        <div className="flex w-max animate-marquee">
          {[...ticker, ...ticker].map((t, i) => (
            <span key={i} className="flex items-center gap-6 px-6 font-display text-lg sm:text-xl font-bold whitespace-nowrap">
              {t}
              <BallIcon className="w-5 h-5" />
            </span>
          ))}
        </div>
      </div>

      {/* ── Social Proof Stats ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {[
              { stat: stats.groups, label: 'Groups created', tone: 'bg-white' },
              { stat: stats.players, label: 'Players tracked', tone: 'bg-volt-300' },
              { stat: stats.sessions, label: 'Sessions logged', tone: 'bg-white' },
              { stat: '98%', label: 'Collection rate', tone: 'bg-kit-400 text-white' },
            ].map((item) => (
              <div key={item.label} className={`rounded-3xl p-5 sm:p-6 border-2 border-ink ${item.tone}`}>
                <p className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums">{item.stat}</p>
                <p className="text-sm font-semibold mt-1 opacity-70">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-16 sm:py-24 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-extrabold text-pitch-600 uppercase tracking-[0.16em] mb-3">Features</p>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-ink tracking-tight leading-[1.02]">
              Everything you need to run your pitch
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Built for 5-aside organisers who are tired of spreadsheets, group chats, and chasing people for ₦3,000.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {features.map((feature) => {
              const Art = feature.art;
              return (
                <div
                  key={feature.title}
                  className="group bg-white rounded-[28px] border border-gray-200 overflow-hidden hover:-translate-y-1 hover:shadow-lift transition-all duration-300"
                >
                  <div className={`${feature.tint} h-48 flex items-center justify-center p-6`}>
                    <Art className="h-full w-auto transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-ink mb-2">{feature.title}</h3>
                    <p className="text-gray-600 leading-relaxed text-[15px]">{feature.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Instant overview — wide dark card */}
          <div className="mt-4 rounded-[28px] bg-ink turf-stripes text-white p-6 sm:p-10 grid md:grid-cols-2 gap-8 items-center overflow-hidden relative">
            <div>
              <p className="text-xs font-extrabold text-volt-300 uppercase tracking-[0.16em] mb-3">Instant overview</p>
              <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                Your whole season, at a glance.
              </h3>
              <p className="mt-4 text-white/65 leading-relaxed">
                Your dashboard shows total collected, outstanding amounts, and player stats across all groups at a single glance.
              </p>
            </div>
            <div className="bg-white/[0.06] border border-white/10 rounded-3xl p-5 space-y-3">
              {[
                { name: 'Tunde Bakare', status: 'Paid' },
                { name: 'Chidi Okafor', status: 'Paid' },
                { name: 'Emeka Nwosu', status: 'Pending' },
              ].map((p) => {
                const k = kitFor(p.name);
                return (
                  <div key={p.name} className="flex items-center justify-between bg-white/[0.06] rounded-2xl px-3.5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${k.bg} ${k.fg} flex items-center justify-center text-xs font-extrabold font-display`}>
                        {p.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{p.name}</p>
                        <p className="text-xs text-white/50">₦3,000</p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        p.status === 'Paid' ? 'bg-volt-400 text-ink' : 'bg-sun-400/20 text-sun-400'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-16 sm:py-24 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs font-extrabold text-pitch-600 uppercase tracking-[0.16em] mb-3">How it works</p>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-ink tracking-tight">
              Up and running in 90 minutes. <span className="text-gray-500">Well, three.</span>
            </h2>
          </div>

          <div className="relative rounded-[32px] bg-pitch-600 p-4 sm:p-6 overflow-hidden">
            <div className="absolute inset-0 turf-stripes" />
            <div className="absolute inset-4 sm:inset-6 border-2 border-white/40 rounded-2xl pointer-events-none" />
            <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 border-2 border-white/40 rounded-full pointer-events-none" />
            <div className="relative grid md:grid-cols-3 gap-3 sm:gap-4">
              {steps.map((step) => (
                <div key={step.minute} className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-ink shadow-sticker">
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-display text-5xl font-extrabold text-ink tabular-nums">{step.minute}</span>
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full bg-volt-300 text-ink">
                      {step.phase}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-ink mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-[15px] leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
            <div>
              <p className="text-xs font-extrabold text-pitch-600 uppercase tracking-[0.16em] mb-3">From the touchline</p>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-ink tracking-tight">Loved by organisers</h2>
            </div>
            <Celebration className="w-40 h-auto self-center sm:self-auto" />
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t) => {
              const k = kitFor(t.name);
              return (
                <figure key={t.name} className={`bg-white rounded-3xl p-7 border-2 border-ink shadow-sticker flex flex-col ${t.rotate} hover:rotate-0 transition-transform`}>
                  <svg className="w-9 h-9 text-volt-400 mb-4" viewBox="0 0 32 32" fill="currentColor" aria-hidden>
                    <path d="M4 20c0-6 3-11 9-14l1.5 2.5C11 10.5 9.5 13 9.5 15.5H14V26H4v-6Zm14 0c0-6 3-11 9-14l1.5 2.5c-3.5 2-5 4.5-5 7H28V26H18v-6Z" stroke="#0f1a14" strokeWidth="1.5" />
                  </svg>
                  <blockquote className="text-ink text-[17px] leading-relaxed flex-1 font-medium">{t.quote}</blockquote>
                  <figcaption className="mt-6 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${k.bg} ${k.fg} flex items-center justify-center text-sm font-extrabold font-display`}>
                      {t.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.role}</p>
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-16 sm:py-24 scroll-mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-extrabold text-pitch-600 uppercase tracking-[0.16em] mb-3">FAQ</p>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-ink tracking-tight">Common questions</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <details
                key={faq.q}
                open={i === 0}
                className="group bg-white rounded-2xl border border-gray-200 open:border-ink open:shadow-sticker transition-all"
              >
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
                  <h3 className="text-base sm:text-lg font-bold text-ink">{faq.q}</h3>
                  <span className="w-8 h-8 shrink-0 rounded-full bg-chalk group-open:bg-volt-400 flex items-center justify-center transition-colors">
                    <svg className="w-4 h-4 transition-transform group-open:rotate-45" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </span>
                </summary>
                <p className="px-5 sm:px-6 pb-6 -mt-1 text-gray-600 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="relative rounded-[36px] overflow-hidden bg-pitch-950 min-h-[420px] flex items-center">
            <NightStadium className="absolute inset-0 w-full h-full opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-r from-pitch-950 via-pitch-950/85 to-transparent" />
            <div className="relative z-10 px-8 py-14 sm:px-14 max-w-xl">
              <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.02]">
                Ready to take the hassle out of match day?
              </h2>
              <p className="mt-4 text-white/70 text-lg">
                Join hundreds of organisers who use PitchAside to track payments and manage their 5-aside groups effortlessly.
              </p>
              <Link
                href="/signup"
                className="group mt-8 inline-flex items-center gap-2 px-7 py-4 bg-volt-400 text-ink font-bold rounded-2xl hover:bg-volt-300 transition-all hover:-translate-y-0.5"
              >
                Create your account
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 border-t border-ink/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-5">
          <Logo size="sm" />
          <p className="text-sm text-gray-500">Payment tracking for 5-aside football groups.</p>
          <div className="flex items-center gap-6 text-sm font-semibold text-gray-500">
            <a href="#features" className="hover:text-ink transition-colors">Features</a>
            <a href="#faq" className="hover:text-ink transition-colors">FAQ</a>
            <Link href="/signin" className="hover:text-ink transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
