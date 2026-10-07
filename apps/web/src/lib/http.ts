// In production, requests go through the Next.js rewrite proxy at /api
// In development, NEXT_PUBLIC_API_URL can point directly at the backend
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * Pages only an organiser uses. Anywhere else (landing page, invite links, the
 * player app) being signed out as an organiser is normal, so a 401 there must
 * not throw the visitor onto the organiser sign-in page.
 */
const ORGANISER_PAGES = /^\/(dashboard|groups|players|sessions|competitions|admin|settings|hq)(\/|$)/;

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/pitchaside_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * In-memory refresh token fallback. Cookies are preferred (HttpOnly, XSS-safe)
 * but some proxy setups (e.g. Vercel rewrites) don't reliably forward
 * Set-Cookie from the upstream, so we also send the token in the request body.
 */
let storedRefreshToken: string | null =
  typeof window !== 'undefined' ? sessionStorage.getItem('_prt') : null;

export function storeRefreshToken(token: string | undefined | null) {
  storedRefreshToken = token ?? null;
  if (typeof window !== 'undefined') {
    if (token) sessionStorage.setItem('_prt', token);
    else sessionStorage.removeItem('_prt');
  }
}

export function getStoredRefreshToken(): string | null {
  return storedRefreshToken;
}

let refreshPromise: Promise<boolean> | null = null;

async function silentRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const body = storedRefreshToken ? JSON.stringify({ refreshToken: storedRefreshToken }) : undefined;
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers,
        body,
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.refreshToken) storeRefreshToken(data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Add CSRF token for state-changing requests
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (res.status === 401) {
    // Try silent refresh before giving up
    const refreshed = await silentRefresh();
    if (refreshed) {
      // Retry the original request with fresh cookies
      const retryHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (method !== 'GET' && method !== 'HEAD') {
        const csrf = getCsrfToken();
        if (csrf) retryHeaders['X-CSRF-Token'] = csrf;
      }
      const retry = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: retryHeaders,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });
      if (retry.ok) {
        if (retry.status === 204) return undefined as T;
        const text = await retry.text();
        return text ? JSON.parse(text) : (undefined as T);
      }
    }
    if (typeof window !== 'undefined' && ORGANISER_PAGES.test(window.location.pathname)) {
      window.location.href = '/signin';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// No-ops for backward compatibility — cookies handle token storage now
export function setToken(_token: string) {}
export function clearToken() {}
