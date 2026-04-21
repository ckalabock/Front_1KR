const APP_SHELL_CACHE = "app-shell-v3";
const DYNAMIC_CACHE = "dynamic-content-v2";
const APP_SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/content/home.html",
  "/content/about.html",
  "/icons/icon-32.png",
  "/icons/icon-128.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/socket.io/socket.io.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![APP_SHELL_CACHE, DYNAMIC_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/subscribe" ||
    url.pathname === "/unsubscribe" ||
    url.pathname === "/snooze"
  ) {
    return;
  }

  if (url.pathname.startsWith("/content/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  const cache = await caches.open(APP_SHELL_CACHE);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(DYNAMIC_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || caches.match("/content/home.html");
  }
}

self.addEventListener("push", (event) => {
  let data = { title: "Новое уведомление", body: "", reminderId: null };

  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-128.png",
    data: {
      reminderId: data.reminderId,
    },
  };

  if (data.reminderId) {
    options.actions = [{ action: "snooze", title: "Отложить на 5 минут" }];
  }

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  const { action, notification } = event;
  const reminderId = notification.data?.reminderId;

  if (action === "snooze" && reminderId) {
    event.waitUntil(
      fetch(`/snooze?reminderId=${encodeURIComponent(reminderId)}`, { method: "POST" })
        .then(() => notification.close())
        .catch((error) => console.error("Snooze failed:", error))
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      notification.close();

      const existingClient = clients.find((client) => "focus" in client);
      if (existingClient) {
        return existingClient.focus();
      }

      return self.clients.openWindow("/");
    })
  );
});
