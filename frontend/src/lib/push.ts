/**
 * Web push in this browser: register the service worker (/sw.js), subscribe with the server's VAPID key and
 * send the subscription to ChatDesk, or undo it. Notifications then arrive with ChatDesk closed.
 */

export type PushState = "unsupported" | "denied" | "off" | "on";

const SW_URL = "/sw.js";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext
  );
}

/** base64url -> the bytes PushManager wants as applicationServerKey */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration(SW_URL)) ?? navigator.serviceWorker.register(SW_URL);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "on" : "off";
}

/** Asks for permission and subscribes. Returns the subscription to send to the server, or null. */
export async function subscribePush(publicKey: string): Promise<PushSubscriptionJSON | null> {
  if (!pushSupported()) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  return sub.toJSON();
}

/** Unsubscribes this browser. Returns the endpoint it had, so the server can forget it too. */
export async function unsubscribePush(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
