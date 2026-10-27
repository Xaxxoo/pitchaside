import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedPaths = ['/dashboard', '/groups', '/players', '/squad', '/money', '/sessions', '/admin', '/office', '/settings'];

/** Decode a JWT's payload (no signature check) and return whether it's past its `exp` claim. */
function isTokenExpired(token: string): boolean {
  try {
    const [, payload] = token.split('.');
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === 'number' && exp * 1000 < Date.now();
  } catch {
    return true; // malformed token counts as expired
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The admin login page must be reachable without auth.
  if (pathname === '/admin/login') return NextResponse.next();

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // Check for auth cookies (HttpOnly cookies are readable in Next.js middleware)
  const accessToken = request.cookies.get('pitchaside_access')?.value;
  const refreshToken = request.cookies.get('pitchaside_refresh')?.value;

  // No way to recover the session: no refresh token, and either no access token
  // or one that's already expired. Redirect to sign in rather than letting the
  // page load only for the first API call to fail with a 401.
  const needsAuth = !refreshToken && (!accessToken || isTokenExpired(accessToken));
  if (needsAuth) {
    // Admin routes redirect to the admin login page, everything else to /signin.
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith('/admin') ? '/admin/login' : '/signin';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/groups/:path*', '/players/:path*', '/squad/:path*', '/money/:path*', '/sessions/:path*', '/admin/:path*', '/office/:path*', '/settings/:path*'],
};
