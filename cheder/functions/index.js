// =====================================================================
//  תורנויות חדר - פונקציות ענן (Firebase Cloud Functions, דורש תוכנית Blaze)
//  chederMorning - כל רבע שעה בבוקר: שולח לכל מכשיר בשעה שבחר את סידור הבוקר
//  chederDuty    - כשמוזנת תורנות חדשה: מודיע לחדרים שנכנסו לתורנות
//  פריסה מתיקיית המאגר:  npx firebase-tools deploy --only functions:cheder
// =====================================================================
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import * as C from "./core.js";

initializeApp();
const db = getFirestore();
const REGION = "europe-west1";

async function loadSettings() {
  const s = await db.doc("sites/cheder").get();
  return C.mergeSettings(s.exists ? s.data() : null);
}
async function loadDuties() {
  const s = await db.collection("ch_duties").orderBy("date", "desc").limit(10).get();
  return s.docs.map(d => d.data());
}
async function loadEvents(room, roomDoc) {
  const s = await db.collection("ch_events").orderBy("from", "desc").limit(100).get();
  return [...s.docs.map(d => ({ id: d.id, ...d.data(), room: null })), ...((roomDoc && roomDoc.events) || []).map(e => ({ ...e, room }))];
}

// אותה חלוקה כמו באתר. שומר את היום אם עוד לא נשמר / השתנה
async function ensurePlan(room, key, settings, duties) {
  const roomSnap = await db.doc(`ch_rooms/${room}`).get();
  if (!roomSnap.exists) return null;
  const r = roomSnap.data();
  const events = await loadEvents(room, r);
  const daysCol = db.collection(`ch_rooms/${room}/days`);
  const histSnap = await daysCol.where("date", "<", key).orderBy("date", "desc").limit(30).get();
  const history = histSnap.docs.map(d => d.data()).reverse();
  const ref = daysCol.doc(key);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    const { plan, changed } = C.buildPlan({ key, room, residents: r.residents, absences: r.absences, duty: C.dutyFor(duties, key), history, existing, settings, events });
    if (changed) {
      if (!existing) tx.set(ref, { ...plan, done: {}, manual: {}, at: FieldValue.serverTimestamp() });
      else tx.update(ref, { tasks: plan.tasks, present: plan.present, assign: plan.assign, dutyDate: plan.dutyDate, at: FieldValue.serverTimestamp() });
    }
    return { plan, residents: r.residents || [], info: C.dayInfo(key, room, settings, events) };
  });
}

async function send(tokens, title, body, settings, tag) {
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens: tokens.map(t => t.id),
    webpush: {
      notification: { title, body, icon: settings.appUrl + "icon-192.png", badge: settings.appUrl + "icon-192.png", dir: "rtl", lang: "he", tag },
      fcmOptions: { link: settings.appUrl }
    }
  });
  // מנקים מכשירים שכבר לא קיימים
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token" || code === "messaging/invalid-argument") dead.push(tokens[i].id);
  });
  await Promise.all(dead.map(id => db.doc(`ch_tokens/${id}`).delete().catch(() => {})));
}

export const chederMorning = onSchedule({ schedule: "*/15 5-9 * * *", timeZone: C.TZ, region: REGION }, async () => {
  const now = new Date();
  const key = C.dateKey(now), slot = C.slotOf(now);
  const snap = await db.collection("ch_tokens").where("notifyTime", "==", slot).get();
  const tokens = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.morning !== false);
  if (!tokens.length) return;
  const settings = await loadSettings();
  const duties = await loadDuties();
  const byRoom = {};
  for (const t of tokens) (byRoom[t.room] ||= []).push(t);
  for (const [room, list] of Object.entries(byRoom)) {
    try {
      const res = await ensurePlan(room, key, settings, duties);
      if (!res || !res.info.active || !res.plan.tasks.length) continue; // שבת / חופשה / טיול - לא מעירים
      const roles = C.roomRoles(C.dutyFor(duties, key), room);
      const extra = [res.info.duty && roles.floor && "🏢 תורנות קומה", res.info.duty && roles.kitchen && "🍳 מטבחון", res.info.mop && "🪣 יום שטיפה"].filter(Boolean).join(" · ");
      const title = `בוקר טוב חדר ${room} ☀️${extra ? " · " + extra : ""}`;
      const body = (C.planSummary(res.plan, res.residents) || "") + "\n🛏️ וכולם מסדרים מיטה";
      await send(list, title, body.trim(), settings, `morning-${key}`);
    } catch (e) { console.error("room", room, e); }
  }
});

export const chederDuty = onDocumentWritten({ document: "ch_duties/{id}", region: REGION }, async ev => {
  const after = ev.data.after.exists ? ev.data.after.data() : null;
  if (!after) return;
  const before = ev.data.before.exists ? ev.data.before.data() : null;
  const key = C.dateKey();
  if (after.date < C.addDays(key, -1)) return; // הודעה ישנה שהודבקה - לא מודיעים
  const settings = await loadSettings();
  const role = (d, r) => C.roomRoles(d, r);
  const rooms = [...new Set([...(after.floor || []), ...(after.kitchen || [])].map(String))];
  const fresh = rooms.filter(r => { const a = role(after, r), b = role(before, r); return (a.floor && !b.floor) || (a.kitchen && !b.kitchen); });
  if (!fresh.length) return;
  const snap = await db.collection("ch_tokens").where("room", "in", fresh.slice(0, 30)).get();
  const tokens = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.duty !== false);
  for (const room of fresh) {
    const r = role(after, room);
    const what = [r.floor && "תורנות קומה 🏢", r.kitchen && "מטבחון ומועדון 🍳"].filter(Boolean).join(" וגם ");
    await send(tokens.filter(t => t.room === room), `חדר ${room} - ${what}`, `החל מ${C.fmtDay(after.date, key)}. המשימות כבר חולקו באתר.`, settings, `duty-${after.date}`);
  }
});
