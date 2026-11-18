/* ChatDesk web push: shows notifications when no ChatDesk tab is in view, and opens the chat on click. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ChatDesk", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // a visible ChatDesk tab already shows its own pop-up and sound
      if (windows.some((w) => w.visibilityState === "visible")) return undefined;
      return self.registration.showNotification(data.title || "ChatDesk", {
        body: data.body || "",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        icon: "/icon.svg",
        badge: "/icon.svg",
        data: { url: data.url || "/dashboard" },
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/dashboard", self.location.origin);
  if (target.origin !== self.location.origin) return; // only ever open our own pages
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === target.origin && "focus" in w) {
          return w.navigate(target.href).then((c) => (c || w).focus());
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // the browser renewed the subscription: the page re-registers it the next time ChatDesk opens
  event.waitUntil(Promise.resolve());
});
