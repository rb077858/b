// Service Worker להתראות (Firebase Cloud Messaging) - תורנויות חדר
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAGqrChtKaMGBROJs2iLfzG_9aFklBe3cc",
  authDomain: "reembir-b-b65b76.firebaseapp.com",
  projectId: "reembir-b-b65b76",
  storageBucket: "reembir-b-b65b76.firebasestorage.app",
  messagingSenderId: "1096260635193",
  appId: "1:1096260635193:web:e6e9d4939d2f163222dbe8"
});
// הודעות עם notification מוצגות אוטומטית ע"י Firebase
firebase.messaging();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// לחיצה על התראה מקומית (שהאתר הציג בעצמו) - פותחת את האתר
self.addEventListener("notificationclick", e => {
  if (e.notification.data && e.notification.data.FCM_MSG) return; // Firebase מטפל בשלו
  e.notification.close();
  const url = new URL("./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(url) && "focus" in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
