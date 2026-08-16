/* global firebase */
importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get("apiKey") || "",
  authDomain: params.get("authDomain") || "",
  projectId: params.get("projectId") || "",
  storageBucket: params.get("storageBucket") || "",
  messagingSenderId: params.get("messagingSenderId") || "",
  appId: params.get("appId") || ""
};

if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    self.registration.showNotification(data.title || "Nova notificação EBR", {
      body: data.message || "Você recebeu uma novidade.",
      icon: "/ebr-logo.jpg",
      badge: "/ebr-logo.jpg",
      tag: data.notificationId || data.type || "ebr-notification",
      data: { link: data.link || "/aluno" }
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.link || "/aluno", self.location.origin).href;
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
