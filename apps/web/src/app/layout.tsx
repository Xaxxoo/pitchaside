import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';
import { ToastProvider } from '@/components/toast';
import { AuthProvider } from '@/lib/auth';
import { PwaRegister } from '@/components/pwa';
import './globals.css';

const heading = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-heading',
});

const body = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.pitchaside.com'),
  title: 'PitchAside',
  description: 'Payment tracking for 5-aside football groups',
  // The card shown when a link to the site is shared in WhatsApp, X, LinkedIn, iMessage, etc. (public/og.png, 1200 × 630).
  openGraph: {
    title: 'PitchAside — Less admin. More ball.',
    description: 'Payment tracking for 5-a-side groups. See who’s paid, who owes and who’s playing.',
    url: '/',
    siteName: 'PitchAside',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'PitchAside — Less admin. More ball.' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PitchAside — Less admin. More ball.',
    description: 'Payment tracking for 5-a-side groups.',
    images: ['/og.png'],
  },
  manifest: '/manifest.webmanifest',
  applicationName: 'PitchAside',
  appleWebApp: { capable: true, title: 'PitchAside', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f1a14',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="font-sans">
        <PwaRegister />
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
