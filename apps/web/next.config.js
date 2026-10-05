const path = require('path');

/**
 * Where the browser's /api/* calls are proxied to. It has to be an address
 * Vercel can reach from the public internet: the API's public URL, not
 * localhost and not Railway's private *.railway.internal name. Get it wrong
 * and every API call 404s with DNS_HOSTNAME_RESOLVED_PRIVATE.
 */
function apiOrigin() {
  const url = (process.env.API_URL || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (process.env.VERCEL_ENV !== 'production') return url || 'http://localhost:3001';

  const reachable = /^https?:\/\//.test(url) && !/localhost|127\.0\.0\.1|\.internal(:|$)/.test(url);
  if (!reachable) {
    throw new Error(
      `API_URL must be the API's public URL (e.g. https://your-api.up.railway.app) for production builds — got "${process.env.API_URL || ''}". ` +
        'Set it in the Vercel project settings and redeploy.',
    );
  }
  return url;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The repo root (npm workspaces), so builds trace files from packages/shared and don't
  // guess the root from whichever lockfile they find first.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@pitchaside/shared'],
  async headers() {
    return [
      {
        // No other site may put PitchAside in a frame, so a page can't be overlaid to trick
        // an organiser into clicking (clickjacking) — e.g. on payouts.
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin()}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
