const CACHE_NAME = "ebr-shell-v1";

/* global firebase */
const firebaseParams = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: firebaseParams.get("apiKey") || "",
  authDomain: firebaseParams.get("authDomain") || "",
  projectId: firebaseParams.get("projectId") || "",
  storageBucket: firebaseParams.get("storageBucket") || "",
  messagingSenderId: firebaseParams.get("messagingSenderId") || "",
  appId: firebaseParams.get("appId") || ""
};

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
    importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js");
    importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js");
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      if (payload.notification) return;
      const data = payload.data || {};
      self.registration.showNotification(data.title || "Nova notificação EBR", {
        body: data.message || "Você recebeu uma novidade.",
        icon: "/ebr-logo.jpg",
        badge: "/ebr-logo.jpg",
        tag: data.notificationId || data.type || "ebr-notification",
        data: { link: data.link || "/" }
      });
    });
  }
} catch (error) {
  console.error("[EBR push] Falha ao iniciar Firebase no service worker.", error);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.link || "/", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(destination);
        return existing.focus();
      }
      return clients.openWindow(destination);
    })
  );
});
