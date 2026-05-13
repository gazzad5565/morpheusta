/**
 * Web Push client lib — registers the service worker, prompts for
 * permission, and saves the resulting subscription to Supabase via
 * the /api/push/subscribe route.
 *
 * Browser support matrix:
 *   - Android Chrome / Firefox: works everywhere.
 *   - iOS Safari (16.4+): ONLY works when the PWA is installed to
 *     the home screen. Plain browser tabs cannot subscribe. We
 *     detect this in `pushSupportState()` and surface a specific
 *     "install to home screen" hint in the UI.
 *   - Desktop browsers: work, but we only care about mobile reps.
 */

import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export type PushSupportState =
  | { status: "unsupported"; reason: string }
  | { status: "ios-needs-install"; reason: string }
  | { status: "needs-vapid-key"; reason: string }
  | { status: "supported"; permission: NotificationPermission };

/** Snapshot of whether the current browser can subscribe to push. */
export function pushSupportState(): PushSupportState {
  if (typeof window === "undefined") {
    return { status: "unsupported", reason: "SSR" };
  }
  if (!("serviceWorker" in navigator)) {
    return { status: "unsupported", reason: "Service workers not supported" };
  }
  if (!("PushManager" in window)) {
    return { status: "unsupported", reason: "Push API not supported" };
  }
  if (!("Notification" in window)) {
    return { status: "unsupported", reason: "Notification API not supported" };
  }
  if (!VAPID_PUBLIC_KEY) {
    return {
      status: "needs-vapid-key",
      reason: "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured",
    };
  }

  // iOS Safari needs the app installed to home screen. The signal
  // is `display-mode: standalone` (or `navigator.standalone` on
  // older iOS). Without it, Safari refuses to expose the permission
  // API at all.
  if (isIOS() && !isStandalone()) {
    return {
      status: "ios-needs-install",
      reason: "On iOS, add Morpheus to your Home Screen first",
    };
  }

  return { status: "supported", permission: Notification.permission };
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPad on iOS 13+ reports as Macintosh, so also check for touch.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Macintosh") && "ontouchend" in document)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // PWA installed via Add to Home Screen on iOS exposes
  // navigator.standalone (legacy). All other platforms use the
  // display-mode media query.
  // @ts-expect-error legacy iOS Safari property
  if (window.navigator.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** Register the service worker once. Idempotent — repeated calls
 *  return the existing registration. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("[push] SW registration failed", err);
    return null;
  }
}

/** Convert a base64-URL VAPID public key string to a Uint8Array,
 *  which is what PushManager.subscribe expects for applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

/** Returns the current Notification permission (default | granted | denied). */
export function notificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "default";
  return Notification.permission;
}

/** Returns true if a push subscription already exists on this device. */
export async function hasActiveSubscription(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

/**
 * Subscribe this device to push notifications. End-to-end:
 *   1. Register the SW if not already
 *   2. Request Notification permission if not already granted
 *   3. Get (or create) a PushSubscription from PushManager
 *   4. POST the subscription to /api/push/subscribe so the server
 *      can address it later
 *
 * Returns true on success, false on any failure or denial. Surface
 * pushSupportState() first to give the user a specific reason.
 */
export async function subscribeToPush(): Promise<boolean> {
  const support = pushSupportState();
  if (support.status !== "supported") return false;

  // 1. Make sure the SW is registered (idempotent).
  const reg = await registerServiceWorker();
  if (!reg) return false;

  // Wait for it to be active. On a fresh install the registration
  // may still be in the "installing" or "waiting" phase; subscribe
  // throws if there's no active worker yet.
  if (!reg.active) {
    await navigator.serviceWorker.ready;
  }

  // 2. Permission. Notification.requestPermission resolves with the
  //    new state; on iOS it MUST be called from a user gesture.
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return false;

  // 3. Subscribe (or pick up an existing subscription).
  let sub: PushSubscription | null = null;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // applicationServerKey accepts BufferSource at runtime; TS's
      // narrower union type for Uint8Array<ArrayBufferLike> doesn't
      // line up with the lib.dom.d.ts signature, so we cast.
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }
  } catch (err) {
    console.warn("[push] subscribe failed", err);
    return false;
  }

  // 4. Persist server-side so the admin can send to it later.
  return await persistSubscription(sub);
}

/** Send the subscription to our API so it lands in
 *  push_subscriptions. Uses fetch with the rep's auth token. */
async function persistSubscription(sub: PushSubscription): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return false;

    const json = sub.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent || null,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[push] persist failed", err);
    return false;
  }
}

/** Unsubscribe this device from push and remove the row server-side. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return true;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;

  const endpoint = sub.endpoint;
  let ok = true;
  try {
    ok = await sub.unsubscribe();
  } catch {
    ok = false;
  }

  // Best-effort server cleanup. If this fails, the next push to a
  // stale endpoint returns 410 and the admin side prunes it.
  if (!supabase) return ok;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      });
    }
  } catch {
    /* ignore — 410 cleanup will catch it */
  }

  return ok;
}
