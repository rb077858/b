// =====================================================================
//  שותפים לחדר - שכבת הנתונים (Firebase Auth + Firestore)
//  משותפת לאפליקציה ולממשק האדמין. אוספים: rm_users, rm_people, rm_claims,
//  rm_resolved, rm_public/config, rm_secret/invite
// =====================================================================
import { app, db, SDK, ADMIN_EMAIL } from "../firebase/config.js";
import { computeEff, claimId, resolvedId, norm, fullName, cleanName, splitName, MAXP } from "./core.js";

const AUTH = await import(`${SDK}/firebase-auth.js`);
const FS = await import(`${SDK}/firebase-firestore.js`);
const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } = AUTH;
const { doc, collection, getDoc, getDocs, setDoc, updateDoc, onSnapshot, query, where, writeBatch } = FS;

export { ADMIN_EMAIL };
export const auth = getAuth(app);

// ---------- התחברות ----------
export function authError(e) {
  const map = {
    "auth/unauthorized-domain": "הדומיין הזה לא מאושר ב-Firebase.",
    "auth/operation-not-allowed": "כניסה עם Google לא הופעלה ב-Firebase.",
    "auth/network-request-failed": "בעיית רשת. נסו שוב.",
    "permission-denied": "אין הרשאה לפעולה הזו."
  };
  return map[e && e.code] || `שגיאה: ${(e && (e.code || e.message)) || e}`;
}
export async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return signInWithRedirect(auth, provider);
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    throw e;
  }
}
export function watchAuth(cb, onRedirectError) {
  getRedirectResult(auth).catch(e => onRedirectError && onRedirectError(e));
  return onAuthStateChanged(auth, cb);
}
export const logout = () => signOut(auth);
export const isAdminUser = u => !!u && u.email === ADMIN_EMAIL && u.emailVerified === true;

// ---------- עזרים ----------
const col = n => collection(db, n);
const userRef = uid => doc(db, "rm_users", uid);
const personRef = pid => doc(db, "rm_people", pid);
const newId = c => doc(col(c)).id;
const mapDocs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

async function inBatches(ops, size = 400) {
  for (let i = 0; i < ops.length; i += size) {
    const b = writeBatch(db);
    ops.slice(i, i + size).forEach(fn => fn(b));
    await b.commit();
  }
}

// ---------- משתמש ----------
export async function getUser(uid) {
  const s = await getDoc(userRef(uid));
  return s.exists() ? s.data() : null;
}
export const touchUser = (uid) => updateDoc(userRef(uid), { lastSeen: Date.now() });
export const saveMine = (uid, fields) => updateDoc(userRef(uid), fields);

// הרשמה: קודם מסמך המשתמש (החוקים בודקים את קוד ההזמנה), ואז האדם עצמו
export async function register({ uid, email, first, last, code }) {
  const f = cleanName(first), l = cleanName(last), pid = newId("rm_people");
  const u = { email, first: f, last: l, pid, code: code || "admin", blocked: false, picks: [], w: {}, createdAt: Date.now(), lastSeen: Date.now() };
  await setDoc(userRef(uid), u);
  await setDoc(personRef(pid), { name: fullName(f, l), first: f, last: l, createdBy: uid, createdAt: Date.now(), merged: false, eff: {}, conf: {}, n: 0, effAt: Date.now() });
  return u;
}

// ---------- אנשים ----------
export function watchPeople(cb, onError) {
  return onSnapshot(col("rm_people"), snap => cb(mapDocs(snap)), e => onError && onError(e));
}
export async function addPerson({ first, last, uid }) {
  const f = cleanName(first), l = cleanName(last), id = newId("rm_people");
  await setDoc(personRef(id), { name: fullName(f, l), first: f, last: l, createdBy: uid, createdAt: Date.now(), merged: false, eff: {}, conf: {}, n: 0, effAt: Date.now() });
  return id;
}

// ---------- טענות ----------
export const saveClaim = (pid, qid, v, uid, myPid) =>
  setDoc(doc(db, "rm_claims", claimId(pid, qid, uid)), { pid, qid, v, author: uid, self: pid === myPid, t: Date.now() });

export async function saveClaims(items, uid, myPid) {
  const t = Date.now();
  await inBatches(items.map(it => b => b.set(doc(db, "rm_claims", claimId(it.pid, it.qid, uid)),
    { pid: it.pid, qid: it.qid, v: it.v, author: uid, self: it.pid === myPid, t })));
}
export async function myClaims(pid, uid) {
  const snap = await getDocs(query(col("rm_claims"), where("pid", "==", pid)));
  const out = {};
  snap.docs.forEach(d => { const c = d.data(); if (c.author === uid) out[c.qid] = c.v; });
  return out;
}
export async function claimsFor(pid) {
  return mapDocs(await getDocs(query(col("rm_claims"), where("pid", "==", pid))));
}

// מחשב מחדש את התשובות המחושבות של אדם ושומר אותן על מסמך האדם.
// כמה משתמשים יכולים לענות על אותו אדם בו זמנית: כל אחד שומר טענה משלו (מסמך נפרד),
// אבל החישוב נכתב למסמך אחד. כדי שחישוב שקרא לפני שחבר שמר לא ידרוס את התשובה שלו,
// אחרי הכתיבה קוראים שוב, ואם בינתיים נוספה או השתנתה טענה או הכרעה - מחשבים שוב.
// מי ששמר אחרי הקריאה החוזרת מחשב בעצמו אחרי זה, כך שהכתיבה האחרונה תמיד כוללת הכל.
const fpOf = (cs, rs) => [...cs.docs, ...rs.docs]
  .map(d => { const x = d.data(); return `${d.ref.parent.id}/${d.id}:${x.v}:${x.t}:${x.ignored ? 1 : 0}:${x.pid}`; })
  .sort().join("|");
async function readPerson(pid) {
  const [cs, rs] = await Promise.all([
    getDocs(query(col("rm_claims"), where("pid", "==", pid))),
    getDocs(query(col("rm_resolved"), where("pid", "==", pid)))
  ]);
  return { cs, rs, fp: fpOf(cs, rs) };
}
export async function recomputePerson(pid) {
  let cur = await readPerson(pid), res;
  for (let i = 0; i < 5; i++) {
    res = computeEff(cur.cs.docs.map(d => d.data()), cur.rs.docs.map(d => d.data()));
    await updateDoc(personRef(pid), { eff: res.eff, conf: res.conf, n: res.n, effAt: Date.now() });
    const next = await readPerson(pid);
    if (next.fp === cur.fp) break;
    cur = next;
  }
  return res;
}

// ---------- ייבוא מהאתר הישן ----------
// data: תוצאת readImport().data. me: מסמך המשתמש שלי. people: רשימת האנשים הנוכחית
export async function importData(data, { uid, me, people, onProgress }) {
  const byName = new Map(people.filter(p => !p.merged).map(p => [norm(p.name), p]));
  const items = [], touched = new Set();
  let created = 0, skipped = 0;
  for (const f of data.friends) {
    const key = norm(f.name);
    let p = byName.get(key);
    if (!p) {
      if (key.length < 2) { skipped++; continue; }
      const { first, last } = splitName(f.name);
      const id = await addPerson({ first, last, uid });
      p = { id, name: fullName(first, last), eff: {} };
      byName.set(key, p); created++;
    }
    const keys = Object.keys(f.a);
    keys.forEach(qid => items.push({ pid: p.id, qid, v: f.a[qid] }));
    if (keys.length) touched.add(p.id);
  }
  const meKeys = Object.keys(data.me);
  meKeys.forEach(qid => items.push({ pid: me.pid, qid, v: data.me[qid] }));
  if (meKeys.length) touched.add(me.pid);

  onProgress && onProgress("שומר תשובות");
  await saveClaims(items, uid, me.pid);

  let i = 0;
  for (const pid of touched) {
    i++; onProgress && onProgress(`מעדכן ${i} מתוך ${touched.size}`);
    await recomputePerson(pid);
  }

  const w = { ...(me.w || {}), ...data.w };
  const picks = [...(me.picks || [])];
  let pickedNow = 0;
  for (const n of data.picks) {
    const p = byName.get(norm(n));
    if (p && !picks.includes(p.id) && picks.length < MAXP) { picks.push(p.id); pickedNow++; }
  }
  await updateDoc(userRef(uid), { w, picks });
  return { created, skipped, claims: items.length, me: meKeys.length, picks: pickedNow, touched: touched.size, w, picksList: picks };
}

// ---------- אדמין ----------
const rndCode = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

export async function ensureConfig() {
  const pub = doc(db, "rm_public", "config"), sec = doc(db, "rm_secret", "invite");
  let p = await getDoc(pub);
  if (!p.exists()) { await setDoc(pub, { open: true }); p = await getDoc(pub); }
  let s = await getDoc(sec);
  if (!s.exists()) { await setDoc(sec, { code: rndCode() }); s = await getDoc(sec); }
  return { open: p.data().open === true, code: s.data().code };
}
export const setOpen = open => setDoc(doc(db, "rm_public", "config"), { open }, { merge: true });
export async function newInviteCode() {
  const code = rndCode();
  await setDoc(doc(db, "rm_secret", "invite"), { code });
  return code;
}
export async function listUsers() {
  return mapDocs(await getDocs(col("rm_users")));
}
// חסימה: מסמנים את כל הטענות של המשתמש כמתעלמות (בלי למחוק), ומחשבים מחדש את מי שהושפע
export async function setBlocked(uid, blocked) {
  await updateDoc(userRef(uid), { blocked });
  const snap = await getDocs(query(col("rm_claims"), where("author", "==", uid)));
  const pids = new Set();
  await inBatches(snap.docs.map(d => b => { b.update(d.ref, { ignored: blocked }); }));
  snap.docs.forEach(d => pids.add(d.data().pid));
  for (const pid of pids) await recomputePerson(pid);
  return pids.size;
}
export async function resolveAnswer(pid, qid, v) {
  await setDoc(doc(db, "rm_resolved", resolvedId(pid, qid)), { pid, qid, v, t: Date.now(), by: "admin" });
  return recomputePerson(pid);
}
export const renamePerson = (pid, first, last) =>
  updateDoc(personRef(pid), { first: cleanName(first), last: cleanName(last), name: fullName(first, last) });

// מיזוג בלי מחיקה: הטענות וההכרעות עוברות ליעד, המקור מסומן כממוזג
export async function mergePeople(sourceId, targetId) {
  const [cs, rs, us] = await Promise.all([
    getDocs(query(col("rm_claims"), where("pid", "==", sourceId))),
    getDocs(query(col("rm_resolved"), where("pid", "==", sourceId))),
    getDocs(query(col("rm_users"), where("pid", "==", sourceId)))
  ]);
  const ops = [];
  cs.docs.forEach(d => ops.push(b => b.update(d.ref, { pid: targetId })));
  rs.docs.forEach(d => ops.push(b => b.update(d.ref, { pid: targetId })));
  us.docs.forEach(d => ops.push(b => b.update(d.ref, { pid: targetId })));
  ops.push(b => b.update(personRef(sourceId), { merged: true, mergedInto: targetId, eff: {}, conf: {}, n: 0 }));
  await inBatches(ops);
  return recomputePerson(targetId);
}
export async function recomputeAll(people, onProgress) {
  const list = people.filter(p => !p.merged);
  let i = 0;
  for (const p of list) { await recomputePerson(p.id); onProgress && onProgress(++i, list.length); }
}
