// =====================================================================
//  שיפוט ממים - reembir.com/b/memes/judge/#<טוקן>
//  מי שיש לו את הקישור רואה את הממים החדשים אחד-אחד:
//  😂 מצחיק = עובר ל"הורדו" אצל האדמין,  😐 לא מצחיק = נמחק.
//  הגישה נאכפת בחוקי Firestore: התחברות אנונימית + הטוקן הנוכחי + קישור פעיל.
// =====================================================================
import { app, db, SDK } from "../../firebase/config.js?v=20261101h";
import { loadFonts, loadImage, drawMeme } from "../meme.js?v=20261118a";

const { getAuth, signInAnonymously, onAuthStateChanged } = await import(`${SDK}/firebase-auth.js`);
const { collection, query, where, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } =
  await import(`${SDK}/firebase-firestore.js`);

const $ = id => document.getElementById(id);
const auth = getAuth(app);
const token = decodeURIComponent(location.hash.slice(1) || new URLSearchParams(location.search).get("k") || "").trim();
const UNDO_MS = 4000;

let pool = new Map();          // הממים החדשים כרגע (מ-Firestore)
let order = [];                // סדר הצגה (מעורבב, כל שופט בסדר אחר)
const handled = new Set();     // מה שהשופט הזה כבר שפט (גם אם עוד לא נשמר)
let cur = null, curImg = null, loadToken = 0;
let pending = null;            // פעולה שמחכה לחלון הביטול
let judgedCount = 0, unsub = null, dead = false, busy = false;
const broken = new Set();      // תמונות שלא נטענו - מדלגים עליהן

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

// ---------------------------------------------------------------------
//  מצבי מסך
// ---------------------------------------------------------------------
function showState(html) {
  $("state").innerHTML = html;
  $("state").hidden = false;
  $("card").hidden = true;
  $("btns").hidden = true;
}
function showDead(reason) {
  dead = true;
  unsub?.(); unsub = null;
  clearTimeout(pending?.timer); pending = null; $("undo").hidden = true;
  $("left").textContent = "";
  showState(`<div><span class="big">🔒</span><h2>הקישור לא פעיל</h2><p>${reason || "הקישור הושבת או הוחלף.<br>בקשו קישור חדש ממי ששלח לכם אותו."}</p></div>`);
}

if (!token || token.length < 10) {
  showDead("חסר חלק מהקישור. העתיקו אותו שוב במלואו.");
} else {
  start();
}

async function start() {
  if (!store.get("judge-intro")) $("intro").hidden = false;
  $("introGo").onclick = () => { $("intro").hidden = true; store.set("judge-intro", "1"); };
  loadFonts();
  try {
    await new Promise(res => { const off = onAuthStateChanged(auth, u => { off(); res(u); }); });
    if (!auth.currentUser) await signInAnonymously(auth);
    await setDoc(doc(db, "memes_judges", auth.currentUser.uid), { token, at: serverTimestamp() });
  } catch (e) {
    console.error(e);
    if (e.code === "permission-denied") return showDead();
    return showState(`<div><span class="big">😵</span><h2>משהו השתבש</h2><p>בדקו את החיבור לאינטרנט ונסו לרענן את הדף.</p></div>`);
  }
  listen();
}

function listen() {
  unsub = onSnapshot(query(collection(db, "memes"), where("status", "==", "new")), snap => {
    pool = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    // ממים חדשים נכנסים למקום אקראי בתור, כדי ששופטים שונים לא יקבלו את אותו מם יחד
    for (const id of pool.keys()) {
      if (!order.includes(id) && !handled.has(id) && !broken.has(id) && id !== cur?.id) order.splice(order.length ? Math.floor(Math.random() * (order.length + 1)) : 0, 0, id);
    }
    order = order.filter(id => pool.has(id) && !handled.has(id));
    updateCount();
    // המם המוצג נשפט ע"י מישהו אחר / הועבר - עוברים לבא
    if (!busy && (!cur || !pool.has(cur.id))) showNext(cur && !handled.has(cur.id) ? "גם מישהו אחר שפט את המם הזה" : "");
  }, err => {
    console.error(err);
    if (err.code === "permission-denied") showDead();
  });
}

function updateCount() {
  const n = order.length + (cur && pool.has(cur.id) && !handled.has(cur.id) && !order.includes(cur.id) ? 1 : 0);
  $("left").textContent = `נשארו ${n}`;
  $("mine").hidden = !judgedCount;
  $("mine").textContent = `שפטת ${judgedCount}`;
}

// ---------------------------------------------------------------------
//  הצגת מם
// ---------------------------------------------------------------------
async function showNext(note) {
  busy = false;
  if (dead) return;
  const id = order.shift();
  cur = id ? pool.get(id) : null;
  updateCount();
  if (!cur) {
    curImg = null;
    return showState(judgedCount
      ? `<div><span class="big">🎉</span><h2>סיימתם, תודה!</h2><p>שפטתם ${judgedCount} ממים.<br>ממים חדשים יופיעו כאן אוטומטית.</p></div>`
      : `<div><span class="big">📭</span><h2>אין ממים חדשים כרגע</h2><p>ממים חדשים יופיעו כאן אוטומטית.</p></div>`);
  }
  const t = ++loadToken;
  showState(`<div class="spin"></div>`);
  try {
    const [img] = await Promise.all([loadImage(cur.imageUrl), loadFonts()]);
    if (t !== loadToken) return;
    curImg = img;
    drawMeme($("cv"), img, cur, 1400);
    $("state").hidden = true;
    const card = $("card");
    resetCard();
    card.hidden = false;
    card.classList.remove("enter"); void card.offsetWidth; card.classList.add("enter");
    $("btns").hidden = false;
    setBtns(true);
    if (note) toast(note);
    // טעינה מוקדמת של הבא
    const n = pool.get(order[0]);
    if (n) loadImage(n.imageUrl).catch(() => {});
  } catch {
    if (t !== loadToken) return;
    // תמונה שלא נטענת - מדלגים עליה בלי לשפוט (נשארת אצל האדמין)
    if (cur) broken.add(cur.id);
    cur = null;
    busy = true;
    setTimeout(() => showNext(), 200);
  }
}
const setBtns = on => { $("bFunny").disabled = $("bNope").disabled = !on; };

// ---------------------------------------------------------------------
//  שיפוט + ביטול
// ---------------------------------------------------------------------
function judge(funny) {
  if (!cur || dead || $("card").hidden) return;
  commitPending();                       // פעולה קודמת נשמרת מיד
  const m = cur;
  handled.add(m.id);
  judgedCount++;
  setBtns(false);
  flyOut(funny);
  pending = { m, funny, timer: setTimeout(commitPending, UNDO_MS) };
  $("undoTxt").textContent = funny ? "😂 מצחיק! נשמר לעיתון" : "😐 לא מצחיק - נמחק";
  $("undo").hidden = false;
  cur = null;
  busy = true;
  setTimeout(() => showNext(), 260);
}

async function commitPending() {
  const p = pending;
  if (!p) return;
  pending = null;
  clearTimeout(p.timer);
  $("undo").hidden = true;
  try {
    if (p.funny) await updateDoc(doc(db, "memes", p.m.id), { status: "downloaded", judgedAt: serverTimestamp() });
    else await deleteDoc(doc(db, "memes", p.m.id));
  } catch (e) {
    // permission-denied: מישהו אחר כבר שפט אותו, או שהקישור הושבת (המאזין יטפל)
    if (e.code !== "permission-denied") { console.error(e); toast("השמירה נכשלה", true); }
  }
}

$("undoBtn").onclick = () => {
  const p = pending;
  if (!p) return;
  pending = null;
  clearTimeout(p.timer);
  $("undo").hidden = true;
  handled.delete(p.m.id);
  judgedCount--;
  if (cur && !order.includes(cur.id)) order.unshift(cur.id);
  if (pool.has(p.m.id)) order.unshift(p.m.id);
  order = [...new Set(order)];
  cur = null;
  loadToken++;
  showNext();
};

// לפני יציאה מהדף - שומרים מיד את הפעולה האחרונה
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") commitPending(); });
window.addEventListener("pagehide", commitPending);

$("bFunny").onclick = () => judge(true);
$("bNope").onclick = () => judge(false);
document.addEventListener("keydown", e => {
  if (!$("intro").hidden) { if (e.key === "Enter" || e.key === "Escape") $("introGo").click(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") $("undoBtn").click(); return; }
  if (e.key === "ArrowRight") judge(true);
  else if (e.key === "ArrowLeft") judge(false);
  else if (e.code === "KeyZ" || e.key === "Backspace") $("undoBtn").click();
});

// ---------------------------------------------------------------------
//  החלקה: ימינה = מצחיק, שמאלה = לא מצחיק
// ---------------------------------------------------------------------
const card = $("card");
let drag = null;
function resetCard() {
  card.classList.remove("dragging");
  card.style.transform = "";
  card.style.opacity = "";
  $("stFunny").style.cssText = $("stNope").style.cssText = "";
}
function paintDrag(dx) {
  const w = card.offsetWidth || 300;
  card.style.transform = `translateX(${dx}px) rotate(${dx / w * 12}deg)`;
  const k = Math.min(1, Math.abs(dx) / (w * 0.35));
  const st = dx > 0 ? $("stFunny") : $("stNope"), other = dx > 0 ? $("stNope") : $("stFunny");
  st.style.opacity = k; st.style.transform = `scale(${0.6 + k * 0.6})`;
  other.style.opacity = 0;
}
function flyOut(funny) {
  card.classList.remove("dragging");
  const w = window.innerWidth;
  card.style.transform = `translateX(${funny ? w : -w}px) rotate(${funny ? 20 : -20}deg)`;
  card.style.opacity = "0";
}
card.addEventListener("pointerdown", e => {
  if (!cur || (e.pointerType === "mouse" && e.button !== 0)) return;
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0 };
  try { card.setPointerCapture(e.pointerId); } catch {}
  card.classList.add("dragging");
});
card.addEventListener("pointermove", e => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.dx = e.clientX - drag.x;
  paintDrag(drag.dx);
});
const endDrag = e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = drag.dx;
  drag = null;
  if (Math.abs(dx) > Math.min(140, (card.offsetWidth || 300) * 0.3)) judge(dx > 0);
  else resetCard();
};
card.addEventListener("pointerup", endDrag);
card.addEventListener("pointercancel", endDrag);

// ---------------------------------------------------------------------
let toastT;
function toast(msg, err = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("err", err);
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2600);
}
