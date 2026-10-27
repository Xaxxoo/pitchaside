/** Browser push helpers shared by the organiser app and the player home. */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export type PushState = 'unsupported' | 'insecure' | 'denied' | 'off' | 'on' | 'ready' | 'unconfigured';

function hasPushManager() {
  return (
    'PushManager' in window ||
    (typeof ServiceWorkerRegistration !== 'undefined' && 'pushManager' in ServiceWorkerRegistration.prototype)
  );
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && hasPushManager() && 'Notification' in window;
}

export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) return 'on';
  // Nothing to offer while the server can't send them (no push keys set up).
  return (await getPublicKey()) ? 'off' : 'unconfigured';
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask for notification permission. iOS may require subscription in a second tap. */
export async function requestPushPermission(): Promise<PushState> {
  if (!window.isSecureContext) return 'insecure';
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  return 'ready';
}

let publicKeyOnce: Promise<string | null> | null = null;
function getPublicKey(): Promise<string | null> {
  publicKeyOnce ??= fetch(`${BASE_URL}/push/public-key`)
    .then(async (response) => (response.ok ? ((await response.json()).publicKey as string) || null : null))
    .catch(() => null)
    .then((key) => {
      // A failed look is tried again next time.
      if (!key) publicKeyOnce = null;
      return key;
    });
  return publicKeyOnce;
}

/** Subscribe this device and hand the subscription to `save`. */
export async function subscribePush(save: (sub: PushSubscriptionJSON) => Promise<unknown>): Promise<PushState> {
  if (!window.isSecureContext) return 'insecure';
  if (!pushSupported()) return 'unsupported';

  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  if (!reg) return 'unsupported';
  const publicKey = await getPublicKey();
  if (!publicKey) return 'unconfigured';

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  await save(sub.toJSON());
  return 'on';
}

/** Ask permission, subscribe this device, and hand the subscription to `save`. */
export async function enablePush(save: (sub: PushSubscriptionJSON) => Promise<unknown>): Promise<PushState> {
  const permission = await requestPushPermission();
  return permission === 'ready' ? subscribePush(save) : permission;
}

/** Set when someone switches notifications off on this phone: nothing switches them back on by itself. */
const OFF_KEY = 'pa_push_off';

export function pushTurnedOff() {
  try {
    return localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberOff(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch {
    /* only this visit, then */
  }
}

/**
 * On by default: once this phone has allowed notifications, they're switched on for whoever is
 * signed in, with no tap (a new phone they've allowed before, a second account, a subscription
 * the phone dropped). Not if they switched them off here. Quiet when it can't.
 */
export async function keepPushOn(save: (sub: PushSubscriptionJSON) => Promise<unknown>): Promise<PushState> {
  try {
    if (pushTurnedOff()) return getPushState();
    if (!pushSupported() || !window.isSecureContext || Notification.permission !== 'granted') return getPushState();
    return await subscribePush(save);
  } catch {
    return getPushState();
  }
}

/** The switch turned on: ask the phone (one tap on its "Allow"), then subscribe, straight away where it lets us. */
export async function turnPushOn(save: (sub: PushSubscriptionJSON) => Promise<unknown>): Promise<PushState> {
  rememberOff(false);
  if (Notification.permission === 'granted') return subscribePush(save);
  const asked = await requestPushPermission();
  if (asked !== 'ready') return asked;
  try {
    return await subscribePush(save);
  } catch {
    // Some iPhones want the subscribe in a second tap: the switch says "Finish".
    return 'ready';
  }
}

/** The switch turned off: this phone stops getting them, and stays off until switched back on. */
export async function turnPushOff(remove: (endpoint: string) => Promise<unknown>): Promise<PushState> {
  rememberOff(true);
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await remove(sub.endpoint).catch(() => undefined);
      await sub.unsubscribe();
    }
  } catch {
    /* off here regardless */
  }
  return 'off';
}
