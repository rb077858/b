/* Service worker קטן שמוסיף לדף את הכותרות COOP/COEP.
   ככה הדף "מבודד" (crossOriginIsolated), והזיהוי מתמונה יכול להשתמש בכל הליבות של הטלפון.
   (GitHub Pages לא מאפשר להגדיר את הכותרות האלה בשרת.)
   פועל רק על התיקייה הזו, ולא משנה בקשות לאתרים אחרים. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;
  if (new URL(r.url).origin !== self.location.origin) return; // משאבים חיצוניים כבר שולחים CORS/CORP
  // תמיד בודקים מול השרת אם יש גרסה חדשה (בלי להציג קבצים ישנים מהמטמון)
  const fresh = r.mode === 'navigate' ? fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(r, { cache: 'no-cache' });
  e.respondWith(fresh.then((res) => {
    if (res.status === 0 || res.type === 'opaqueredirect') return res;
    const h = new Headers(res.headers);
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Embedder-Policy', 'require-corp');
    h.set('Cross-Origin-Resource-Policy', 'same-origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }));
});
