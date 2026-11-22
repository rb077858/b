// =====================================================================
//  צפייה משותפת: שעון מדויק + "חדר" במסד הנתונים
//
//  איך כולם רואים את אותו רגע בדיוק:
//   1. שעון משותף: כל מכשיר מודד את ההפרש בין השעון שלו לשעון של שרתי Cloudflare
//      (reembir.com/cdn-cgi/trace). השרת מחזיר שניות שלמות, ולכן שולחים בקשות בדיוק
//      סביב "תקתוק" השנייה ומצמצמים את טווח האפשרויות (חיפוש בינארי). התוצאה: דיוק של
//      אלפיות בודדות, ואותו שעון אצל כולם. אם אין חיבור - שעון המכשיר.
//   2. חדר: kr_sync/<מזהה> במסד הנתונים שומר את מצב הניגון של מי ששיתף (הבעלים):
//      איפה התוכן היה ברגע מסוים, באיזה קצב, ואם הוא עצור. כל צד מחשב מזה איפה צריך
//      להיות עכשיו ומתקן לבד. הבעלים משנה = משתנה אצל כולם. אורח לא יכול לשנות (רק לצאת).
//   3. נוכחות: כל צופה מעדכן kr_sync/<מזהה>/peers/<צופה> כל 15 שניות (עם הסטייה שלו),
//      וכך רואים כמה צופים מחוברים ועד כמה הם צמודים.
// =====================================================================

const CFG_V = "20261101h";   // חייב להיות זהה לייבוא בשאר הדף (אחרת Firebase מאותחל פעמיים)
const L = () => performance.timeOrigin + performance.now();   // שעון מקומי מונוטוני (לא קופץ)

// ---------- שעון משותף ----------
export const clock = {
  off: null,          // שעון משותף = L() + off
  lo: -Infinity, hi: Infinity,
  source: "device",
  fallbackOff: 0,     // תיקון גס (שעון אינטרנט) אם שעון המכשיר שגוי בבירור
  now() { return L() + (this.off ?? (Date.now() - L() + this.fallbackOff)); },
  err() { return this.off == null ? null : (this.hi - this.lo) / 2; },
  info() { return this.off == null ? "device clock" : `${this.source} ±${this.err().toFixed(1)}ms`; }
};

const TRACE = "/cdn-cgi/trace";
async function sample() {
  const t0 = L();
  const r = await fetch(TRACE + "?_=" + Math.random().toString(36).slice(2), { cache: "no-store" });
  const t1 = L();
  const txt = await r.text();
  const m = /(?:^|\n)ts=(\d+)(?:\.(\d+))?/.exec(txt);
  if (!r.ok || !m) throw new Error("no ts");
  const frac = m[2] ? +("0." + m[2]) * 1000 : 0;
  const s = +m[1] * 1000 + frac;
  // שרת שמחזיר רק שניות שלמות: הזמן האמיתי בשרת נמצא בטווח [s, s+1000)
  const res = frac > 0 ? 1 : 1000;
  return { lo: s - t1, hi: s + res - t0, rtt: t1 - t0 };
}

let measuring = null;
export function measureClock() {
  if (measuring) return measuring;
  if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)) return Promise.resolve(clock);
  measuring = (async () => {
    let lo = -Infinity, hi = Infinity, rtt = Infinity, ok = 0;
    const add = sm => {
      rtt = Math.min(rtt, sm.rtt);
      if (sm.lo > hi || sm.hi < lo) { lo = sm.lo; hi = sm.hi; }   // לא מתיישב (קפיצת שעון) - מתחילים מחדש
      else { lo = Math.max(lo, sm.lo); hi = Math.min(hi, sm.hi); }
      ok++;
      if (hi - lo < 1000) { clock.lo = lo; clock.hi = hi; clock.off = (lo + hi) / 2; clock.source = "cloudflare"; }
    };
    try {
      add(await sample());      // חימום חיבור
      add(await sample());
      for (let i = 0; i < 14 && hi - lo > Math.max(6, rtt * 0.6); i++) {
        // מכוונים שהבקשה תגיע לשרת בדיוק כשהשנייה מתחלפת, לפי ההערכה הנוכחית (אמצע הטווח)
        const mid = (lo + hi) / 2;
        const now = L();
        const srvAtArrival = now + rtt / 2 + mid;
        let boundary = Math.ceil(srvAtArrival / 1000) * 1000;
        if (boundary - srvAtArrival < 40) boundary += 1000;
        const sendAt = boundary - mid - rtt / 2;
        await new Promise(r => setTimeout(r, Math.max(0, sendAt - L())));
        add(await sample());
      }
    } catch (e) { /* נשארים עם מה שיש */ }
    measuring = null;
    return clock;
  })();
  return measuring;
}
// מדידה מחדש מדי פעם (וכשחוזרים לדף - במצב שינה השעון המקומי עלול לזוז)
let lastMeasure = 0;
export function keepClockFresh() {
  const go = () => { lastMeasure = Date.now(); measureClock(); };
  go();
  setInterval(() => { if (Date.now() - lastMeasure > 10 * 60e3) go(); }, 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - lastMeasure > 30e3) go(); });
}

// ---------- מסד נתונים ----------
// חדר: kr_sync/<מזהה> = { owner, wall, abs, rate, paused, ended, rev }
//   מצב הניגון של החדר: ברגע wall (בשעון המשותף) התוכן היה ב-abs (זמן אמיתי של השידור),
//   ומאז הוא מתקדם בקצב rate. paused = עצור על abs. wall בעתיד = כולם מחכים ומתחילים יחד.
//   רק הבעלים (משתמש אנונימי שיצר את החדר) יכול לשנות. rev עולה ב-1 בכל שינוי.
let fsP = null, authP = null;
function F() {
  return fsP ||= (async () => {
    const { app, db, SDK } = await import(`../firebase/config.js?v=${CFG_V}`);
    const m = await import(`${SDK}/firebase-firestore.js`);
    return { app, db, SDK, ...m };
  })();
}
function A() {
  return authP ||= (async () => {
    const f = await F();
    const a = await import(`${f.SDK}/firebase-auth.js`);
    const auth = a.getAuth(f.app);
    await new Promise(r => { const u = a.onAuthStateChanged(auth, () => { u(); r(); }); });
    return { auth, ...a };
  })();
}
// המזהה של הדפדפן הזה (אם כבר נוצר), בלי ליצור חדש
export async function myUid() { try { return (await A()).auth.currentUser?.uid || null; } catch (e) { return null; } }
async function ensureUid() {
  const a = await A();
  if (!a.auth.currentUser) await a.signInAnonymously(a.auth);
  return a.auth.currentUser.uid;
}

const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export function randomId(n = 12) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, x => ABC[x % ABC.length]).join("");
}

const clean = st => ({ wall: Math.round(st.wall), abs: Math.round(st.abs), rate: +st.rate || 1, paused: !!st.paused });

export async function createRoom(id, st) {
  const uid = await ensureUid();
  const f = await F();
  await f.setDoc(f.doc(f.db, "kr_sync", id), { v: 3, owner: uid, ...clean(st), ended: false, rev: 0, at: f.serverTimestamp() });
  return uid;
}

export async function updateRoom(id, st, rev, ended = false) {
  const f = await F();
  await f.setDoc(f.doc(f.db, "kr_sync", id), { v: 3, owner: await ensureUid(), ...clean(st), ended, rev, at: f.serverTimestamp() });
}

export async function readRoom(id) {
  const f = await F();
  const s = await f.getDoc(f.doc(f.db, "kr_sync", id));
  if (!s.exists()) return null;
  const d = s.data();
  return d.v === 3 && typeof d.abs === "number" ? d : null;
}

export async function watchRoom(id, cb) {
  const f = await F();
  return f.onSnapshot(f.doc(f.db, "kr_sync", id), s => { const d = s.data(); if (d && d.v === 3) cb(d); }, () => {});
}

// נוכחות בחדר
export class Presence {
  constructor(room, { host = false, getErr, onPeers }) {
    this.room = room; this.host = host; this.getErr = getErr; this.onPeers = onPeers;
    this.pid = randomId(10);
    this.peers = [];
    this.stopped = false;
    this.start();
  }
  async start() {
    try {
      const f = this.f = await F();
      if (this.stopped) return;
      this.ref = f.doc(f.db, "kr_sync", this.room, "peers", this.pid);
      const beat = () => {
        const e = this.getErr?.();
        f.setDoc(this.ref, { at: f.serverTimestamp(), err: Math.min(3600e3, Math.max(0, Math.round(e ?? 0))), host: this.host }).catch(() => {});
      };
      beat();
      this.timer = setInterval(beat, 15e3);
      this.unsub = f.onSnapshot(f.collection(f.db, "kr_sync", this.room, "peers"), snap => {
        const now = Date.now();
        this.peers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(p => p.id === this.pid || (p.at && now - p.at.toMillis() < 50e3));
        this.onPeers?.(this.peers, this.pid);
      }, () => {});
      this.onHide = () => { if (document.visibilityState === "hidden") f.deleteDoc(this.ref).catch(() => {}); else beat(); };
      document.addEventListener("visibilitychange", this.onHide);
    } catch (e) {}
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.unsub?.();
    if (this.onHide) document.removeEventListener("visibilitychange", this.onHide);
    if (this.ref && this.f) this.f.deleteDoc(this.ref).catch(() => {});
  }
}
