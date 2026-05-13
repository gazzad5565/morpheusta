/**
 * Service worker for the Morpheus mobile PWA.
 *
 * Today this only handles Web Push. Offline caching is intentionally
 * NOT done here — Next handles its own asset caching and adding a
 * cache layer to a fast-iterating PWA is the classic way to ship
 * stale code to users. If we want offline reads later, wire that
 * up deliberately.
 *
 * Payload shape we expect from the admin send endpoint:
 *   { title, body, icon?, badge?, data?: { url? } }
 *
 * If a push arrives with no payload (some browsers strip it on
 * resubscribe), we still show a generic fallback so the rep knows
 * something happened.
 */

self.addEventListener("install", (event) => {
  // Activate the new SW immediately so the rep doesn't have to
  // close + reopen the app to get push handling on first install.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload — fall back to plain text.
    try {
      payload = { body: event.data ? event.data.text() : "" };
    } catch {
      payload = {};
    }
  }

  const title = payload.title || "Morpheus";
  const body = payload.body || "You have a new update.";
  const icon = payload.icon || "/icon-192.png";
  const badge = payload.badge || "/icon-192.png";
  const data = payload.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data,
      // requireInteraction:false lets iOS auto-dismiss after a short
      // dwell so notifications don't pile up on the lock screen.
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // If the app is already open, focus the existing tab/window
      // and navigate it. Avoids opening a duplicate.
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // Cross-origin or otherwise blocked — focusing is
              // enough; the user lands on whatever was open.
            }
          }
          return;
        }
      }

      // No open window — open a fresh one.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// Browsers can revoke a subscription server-side (user disables
// notifications in OS settings, push service rotates keys, etc).
// When that happens the SW gets a pushsubscriptionchange event;
// we re-subscribe and let the page-side code re-register.
//
// For now we just log it. Re-subscription on the page happens
// naturally on next visit because subscribeToPush() is idempotent.
self.addEventListener("pushsubscriptionchange", (event) => {
  // Reserved for future use. Adding logic here would require the
  // SW to know the VAPID public key (would need to fetch it) and
  // the user's auth token (can't access it from the SW without a
  // postMessage round trip). Easier to let the page handle it.
});
