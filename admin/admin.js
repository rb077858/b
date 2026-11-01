// =====================================================================
//  פאנל ניהול "קופה ראשית" - reembir.com/b/admin
//  כניסה עם Google (רק rb077858@gmail.com). כל שינוי נשמר אוטומטית ל-Firestore.
// =====================================================================
import { app, db, SDK, ADMIN_EMAIL, firebaseConfig } from "../firebase/config.js?v=20261101g";
import {
  SITE_ID, DEFAULT_CONFIG, PRESETS, FONTS, DAY_NAMES, mergeConfig, buildWindows, getStatus,
  israelParts, dateKey, todayKey, formatCountdown, isTime, isDate, pad2, uid
} from "../kupa-rashit/schedule.js?v=20261101g";

const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } =
  await import(`${SDK}/firebase-auth.js`);
const { doc, onSnapshot, setDoc, addDoc, deleteDoc, collection, query, orderBy, limit, getDocs, serverTimestamp } =
  await import(`${SDK}/firebase-firestore.js`);

const TABS = [
  { id: "home", label: "ראשי", ic: "🏠" },
  { id: "schedule", label: "מתי משדרים", ic: "📅" },
  { id: "player", label: "נגן", ic: "▶️" },
  { id: "design", label: "עיצוב", ic: "🎨" },
  { id: "more", label: "עוד", ic: "⚙️" }
];
const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const auth = getAuth(app);
const siteRef = doc(db, "sites", SITE_ID);
const histRef = collection(db, "sites", SITE_ID, "history");

let user = null;
let draft = structuredClone(DEFAULT_CONFIG);
let baseline = null;              // ההגדרות כפי שהיו בכניסה (לגיבוי "לפני עריכה")
let tab = location.hash.slice(1);
if (!TABS.some(t => t.id === tab)) tab = "home";
let previewState = "before";
let unsub = null;
let saveTimer = null, saving = false, pending = false;
let deferRender = false;
let saveFailed = false;
let firstSnapDone = false, lastSnapAt = 0;
const undoStack = [];
let lastUndoKey = "", lastUndoAt = 0;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = o => JSON.parse(JSON.stringify(o));
const range = (a, b) => `<span class="ltr">${a}–${b}</span>`;

// =====================================================================
//  התחברות
// =====================================================================
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ login_hint: ADMIN_EMAIL, prompt: "select_account" });

$("loginBtn").onclick = async () => {
  $("loginErr").textContent = "";
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return signInWithRedirect(auth, provider);
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    $("loginErr").textContent = authError(e);
  }
};
getRedirectResult(auth).catch(e => { $("loginErr").textContent = authError(e); });
function authError(e) {
  const map = {
    "auth/unauthorized-domain": "הדומיין הזה לא מאושר ב-Firebase.",
    "auth/operation-not-allowed": "כניסה עם Google לא הופעלה ב-Firebase.",
    "auth/network-request-failed": "בעיית רשת. נסו שוב."
  };
  return map[e.code] || `שגיאה: ${e.code || e.message}`;
}
$("logoutBtn").onclick = () => { if (confirm("להתנתק?")) signOut(auth); };

onAuthStateChanged(auth, async u => {
  $("boot").classList.add("hidden");
  if (unsub) { unsub(); unsub = null; }
  if (!u) { user = null; $("app").classList.add("hidden"); $("login").classList.remove("hidden"); return; }
  if (u.email !== ADMIN_EMAIL || !u.emailVerified) {
    $("loginErr").textContent = `לחשבון ${u.email} אין הרשאת ניהול.`;
    await signOut(auth); return;
  }
  user = u;
  $("login").classList.add("hidden"); $("app").classList.remove("hidden");
  $("avatar").src = u.photoURL || "";
  $("avatar").classList.toggle("hidden", !u.photoURL);
  if (!u.photoURL) $("logoutBtn").textContent = "יציאה";
  $("logoutBtn").title = `${u.email} · התנתקות`;
  subscribe();
  render();
});

// =====================================================================
//  סנכרון ושמירה אוטומטית
// =====================================================================
function subscribe() {
  unsub = onSnapshot(siteRef, snap => {
    const data = snap.exists() ? snap.data() : null;
    const { updatedAt, updatedBy, ...rest } = data || {};
    const incoming = mergeConfig(data ? rest : DEFAULT_CONFIG);
    if (!baseline) baseline = clean(incoming);
    if (pending || saving || saveFailed) return;  // ההד של השמירה שלנו / שינויים שעוד לא נשמרו
    if (JSON.stringify(incoming) === JSON.stringify(draft) && firstSnapDone) return;
    draft = incoming;
    firstSnapDone = true;
    if (document.activeElement?.closest?.("#view, dialog") && document.activeElement.matches("input, textarea, select")) deferRender = true;
    else render();
  }, err => setSaveState("err", "אין חיבור למסד הנתונים (" + err.code + ")"));
}
document.addEventListener("focusout", () => setTimeout(() => { if (deferRender && !document.activeElement?.matches?.("input, textarea, select")) { deferRender = false; render(); } }, 50));

function setSaveState(state, text) {
  const el = $("saveState");
  el.className = "save-state " + (state === "saving" ? "saving" : state === "err" ? "err" : "");
  el.querySelector("span").textContent = text || (state === "saving" ? "שומר..." : "נשמר ✓");
}

function scheduleSave(ms = 800) {
  pending = true;
  setSaveState("saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; doSave(); }, ms);
}

async function doSave() {
  if (saving) { scheduleSave(300); return; }
  saving = true;
  const data = clean(draft);
  try {
    await setDoc(siteRef, { ...data, updatedAt: serverTimestamp(), updatedBy: user.email });
    // גיבוי: מצב לפני העריכה הראשונה בכניסה הזו, ואחר כך כל 10 דקות
    const now = Date.now();
    if (baseline && !lastSnapAt) addDoc(histRef, { config: baseline, savedAt: serverTimestamp(), by: user.email, note: "לפני עריכה" }).catch(() => {});
    else if (now - lastSnapAt > 10 * 60e3) addDoc(histRef, { config: data, savedAt: serverTimestamp(), by: user.email, note: "שמירה אוטומטית" }).catch(() => {});
    if (!lastSnapAt || now - lastSnapAt > 10 * 60e3) lastSnapAt = now;
    const t = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    setSaveState("ok", `נשמר ✓ ${t}`);
    saveFailed = false;
  } catch (e) {
    saveFailed = true;
    setSaveState("err", "השמירה נכשלה");
    toast("השמירה נכשלה: " + (e.code || e.message), "bad", ["נסו שוב", () => scheduleSave(0)]);
  } finally {
    saving = false;
    pending = saveTimer !== null;
  }
}

function pushUndo(key) {
  const now = Date.now();
  if (key && key === lastUndoKey && now - lastUndoAt < 4000) { lastUndoAt = now; return; }
  lastUndoKey = key || ""; lastUndoAt = now;
  undoStack.push(clean(draft));
  if (undoStack.length > 50) undoStack.shift();
  $("undoBtn").disabled = false;
}
$("undoBtn").onclick = () => {
  const prev = undoStack.pop();
  if (!prev) return;
  draft = mergeConfig(prev);
  lastUndoKey = "";
  $("undoBtn").disabled = !undoStack.length;
  scheduleSave(0); render(); toast("השינוי האחרון בוטל");
};

// שינוי מבני (הוספה/מחיקה/בחירה): שומר מיד ומצייר מחדש
function commit(fn, { msg, rerender = true } = {}) {
  pushUndo();
  fn();
  scheduleSave(150);
  if (rerender) render(); else pushPreview();
  if (msg) toast(msg, "", ["ביטול", () => $("undoBtn").click()]);
}

addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.target.matches("input, textarea")) { e.preventDefault(); $("undoBtn").click(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); scheduleSave(0); }
});
addEventListener("beforeunload", e => { if (pending || saving) { e.preventDefault(); e.returnValue = ""; } });

// =====================================================================
//  עזרים לטפסים
// =====================================================================
const getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
function setPath(o, p, v) { const ks = p.split("."); const last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; }

const field = (k, label, { type = "text", ph = "", attrs = "" } = {}) => `
  <label class="f">${label}<input class="in" type="${type}" data-k="${k}" value="${esc(getPath(draft, k))}" placeholder="${esc(ph)}" ${attrs}></label>`;
const area = (k, label, { ph = "", rows = 3, code = false } = {}) => `
  <label class="f">${label}<textarea class="in ${code ? "code" : ""}" data-k="${k}" rows="${rows}" placeholder="${esc(ph)}">${esc(getPath(draft, k))}</textarea></label>`;
const toggle = (k, label, sub = "") => `
  <label class="sw"><input type="checkbox" data-k="${k}" ${getPath(draft, k) ? "checked" : ""}><span class="tr"></span><span>${label}${sub ? `<small>${sub}</small>` : ""}</span></label>`;
const slider = (k, label, { min, max, step = 1, unit = "" }) => `
  <label class="f">${label}<div class="range"><input type="range" data-k="${k}" data-t="num" min="${min}" max="${max}" step="${step}" value="${esc(getPath(draft, k))}"><output data-unit="${unit}">${esc(getPath(draft, k))}${unit}</output></div></label>`;
const select = (k, label, opts, num = false) => `
  <label class="f">${label}<select class="in" data-k="${k}" ${num ? 'data-t="num"' : ""}>${opts.map(([v, l]) => `<option value="${v}" ${String(getPath(draft, k)) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
const choices = (k, opts, num = false) => `
  <div class="choices">${opts.map(([v, title, sub, rec]) => `
    <button class="choice ${String(getPath(draft, k)) === String(v) ? "on" : ""}" data-set="${k}" data-v="${v}" ${num ? 'data-t="num"' : ""}>
      <b>${title}${rec ? '<span class="rec">מומלץ</span>' : ""}</b>${sub ? `<small>${sub}</small>` : ""}</button>`).join("")}</div>`;

$("view").addEventListener("input", onField);
$("view").addEventListener("change", onField);
function onField(e) {
  const el = e.target.closest("[data-k]");
  if (!el) return;
  const k = el.dataset.k;
  let v = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.t === "num") v = v === "" ? 0 : +v;
  if (getPath(draft, k) === v) return;
  pushUndo(k);
  setPath(draft, k, v);
  if (el.type === "range") { const o = el.parentElement.querySelector("output"); o.textContent = v + (o.dataset.unit || ""); }
  if (k.startsWith("design.") && ["bg", "bg2", "card", "text", "muted", "accent"].includes(k.split(".")[1])) {
    draft.design.preset = "custom";
    document.querySelectorAll(".preset.on").forEach(p => p.classList.remove("on"));
  }
  scheduleSave(el.type === "checkbox" || el.tagName === "SELECT" ? 150 : 900);
  pushPreview();
}

$("view").addEventListener("click", e => {
  const c = e.target.closest("[data-set]");
  if (c) {
    let v = c.dataset.v; if (c.dataset.t === "num") v = +v;
    if (getPath(draft, c.dataset.set) === v) return;
    commit(() => setPath(draft, c.dataset.set, v));
    return;
  }
  const b = e.target.closest("[data-act]");
  if (b && ACT[b.dataset.act]) {
    if (b.tagName === "A") e.preventDefault();
    ACT[b.dataset.act](b.dataset, b);
  }
});

// =====================================================================
//  פעולות
// =====================================================================
const ACT = {
  mode(d) {
    if (d.m === "live" && !confirm("להתחיל לשדר עכשיו לכל מי שנכנס לדף?")) return;
    commit(() => { draft.override.mode = d.m; if (d.m === "auto") draft.override.until = ""; }, { msg: { auto: "חזרה ללוח האוטומטי", live: "🔴 משדרים עכשיו", off: "⏸ הדף הושבת" }[d.m] });
  },
  add(d) { openItem(d.kind, null, d.date ? { date: d.date } : null); },
  edit(d) { openItem(d.kind, +d.i); },
  del(d) {
    const name = d.kind === "weekly" ? "השעה הקבועה" : d.kind === "special" ? "התאריך" : "הביטול";
    commit(() => draft[listOf(d.kind)].splice(+d.i, 1), { msg: `${name} נמחק` });
  },
  toggleItem(d) { commit(() => { const it = draft[listOf(d.kind)][+d.i]; it.enabled = it.enabled === false; }); },
  cancelDate(d) {
    if (draft.cancelled.some(c => c.date === d.date)) return;
    commit(() => draft.cancelled.push({ id: uid(), date: d.date, note: "" }), { msg: `השידור ב-${fmtDate(d.date)} בוטל` });
  },
  uncancel(d) { commit(() => { draft.cancelled = draft.cancelled.filter(c => c.date !== d.date); }, { msg: "הביטול הוסר" }); },
  disableSpecial(d) { commit(() => { const s = draft.specials.find(s => s.id === d.id); if (s) s.enabled = false; }, { msg: "השידור הושבת" }); },
  purgePast() {
    const t = todayKey(Date.now());
    commit(() => { draft.specials = draft.specials.filter(s => s.date >= t); draft.cancelled = draft.cancelled.filter(c => c.date >= t); }, { msg: "התאריכים שעברו נמחקו" });
  },
  day(d) {
    const k = d.date;
    if (draft.cancelled.some(c => c.date === k)) { if (confirm(`להחזיר את השידור ב-${fmtDate(k)}?`)) ACT.uncancel({ date: k }); return; }
    const ws = buildWindows(draft, Date.now()).filter(w => w.date === k);
    const sp = ws.find(w => w.kind === "special");
    if (sp) return openItem("special", draft.specials.findIndex(s => s.id === sp.id));
    if (ws.some(w => w.kind === "weekly")) { if (confirm(`לבטל את השידור ב-${fmtDate(k)}?`)) ACT.cancelDate({ date: k }); return; }
    openItem("special", null, { date: k });
  },
  preset(d) { const { label, ...colors } = PRESETS[d.p]; commit(() => Object.assign(draft.design, colors, { preset: d.p })); },
  pstate(d) { previewState = d.s; document.querySelectorAll(".seg button").forEach(b => b.classList.toggle("on", b.dataset.s === d.s)); pushPreview(); },
  async testSource() {
    const res = $("testRes");
    res.className = "test-res ok"; res.textContent = "בודק...";
    try {
      const src = draft.player.source;
      const r = await fetch(src, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const txt = await r.text();
      if (!txt.includes("#EXTM3U")) throw new Error("הקישור לא מחזיר שידור HLS (m3u8)");
      const heights = [...txt.matchAll(/RESOLUTION=\d+x(\d+)/g)].map(m => +m[1]);
      let dvr = "";
      if (draft.player.dvrParam) {
        const vurl = txt.split("\n").find(l => l && !l.startsWith("#"));
        if (vurl) {
          const u = new URL(vurl, src);
          u.searchParams.set(draft.player.dvrParam, "3600000");
          const vt = await (await fetch(u, { cache: "no-store" })).text();
          const secs = [...vt.matchAll(/#EXTINF:([\d.]+)/g)].reduce((a, m) => a + +m[1], 0);
          dvr = secs > 600 ? ` · אפשר לחזור אחורה ✓ (נבדקה שעה)` : ` · חזרה אחורה לא נתמכת (${Math.round(secs)} שנ׳ בלבד)`;
        }
      }
      res.textContent = `✓ השידור תקין${heights.length ? ` · ${new Set(heights).size} איכויות עד ${Math.max(...heights)}p` : ""}${dvr}`;
    } catch (e) {
      res.className = "test-res bad";
      res.textContent = "✗ לא הצלחנו לטעון את השידור: " + e.message;
    }
  },
  saveOverrideExtras() { scheduleSave(0); },
  async restore(d) {
    const h = histCache.find(x => x.id === d.id); if (!h) return;
    if (!confirm("לשחזר את הגרסה הזו? (אפשר לבטל עם ↶)")) return;
    commit(() => { draft = mergeConfig(h.config); }, { msg: "הגרסה שוחזרה" });
  },
  async delHist(d) { if (!confirm("למחוק את הגרסה מההיסטוריה?")) return; await deleteDoc(doc(histRef, d.id)); loadHistory(); },
  async snapshot() {
    const note = prompt("שם לגיבוי:", "גיבוי ידני"); if (note === null) return;
    await addDoc(histRef, { config: clean(draft), savedAt: serverTimestamp(), by: user.email, note: note || "גיבוי ידני" });
    toast("הגיבוי נשמר ✓"); loadHistory();
  },
  exportJson() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(clean(draft), null, 2)], { type: "application/json" }));
    a.download = `kupa-rashit-${todayKey(Date.now())}.json`; a.click();
  },
  importJson() { $("importFile").click(); },
  resetSection(d) { if (confirm("לאפס לברירת המחדל?")) commit(() => { draft[d.s] = structuredClone(DEFAULT_CONFIG[d.s]); }, { msg: "אופס לברירת המחדל" }); },
  resetAll() { if (confirm("לאפס את כל ההגדרות? (אפשר לבטל עם ↶ או לשחזר מההיסטוריה)")) commit(() => { draft = structuredClone(DEFAULT_CONFIG); }, { msg: "כל ההגדרות אופסו" }); },
  goto(d) { setTab(d.t); }
};

const listOf = kind => ({ weekly: "weekly", special: "specials", cancel: "cancelled" }[kind]);
function fmtDate(k) {
  if (!isDate(k)) return k;
  const [y, m, d] = k.split("-").map(Number);
  return `יום ${DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}/${m}`;
}
const fmtStamp = d => d ? d.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "—";

// =====================================================================
//  חלון עריכה לשידור
// =====================================================================
function openItem(kind, idx, preset) {
  const dlg = $("dlg");
  const isNew = idx == null;
  const list = draft[listOf(kind)];
  const last = draft.weekly[draft.weekly.length - 1];
  const tmp = isNew
    ? (kind === "weekly" ? { days: [], start: last?.start || "21:30", end: last?.end || "22:00", label: "", name: "", stream: "" }
      : kind === "special" ? { date: preset?.date || todayKey(Date.now()), start: last?.start || "21:30", end: last?.end || "22:00", label: "", name: "", stream: "" }
      : { date: preset?.date || nextWeeklyDate(), note: "" })
    : { ...structuredClone(list[idx]), days: kind === "weekly" ? [+list[idx].day] : undefined };

  const title = { weekly: isNew ? "שעה שבועית חדשה" : "עריכת שעה שבועית", special: isNew ? "שידור חד-פעמי" : "עריכת שידור חד-פעמי", cancel: "ביטול שידור בתאריך" }[kind];
  const draw = () => {
    dlg.innerHTML = `
      <div class="dlg-h">${title}</div>
      <div class="dlg-b">
        ${kind === "weekly" ? `<label class="f">${isNew ? "באילו ימים? (אפשר כמה)" : "יום"}
          <div class="daypick">${DAY_SHORT.map((n, i) => `<button type="button" data-day="${i}" class="${tmp.days.includes(i) ? "on" : ""}" title="יום ${DAY_NAMES[i]}">${n}</button>`).join("")}</div></label>` : ""}
        ${kind !== "weekly" ? `<label class="f">תאריך<input class="in" type="date" name="date" value="${esc(tmp.date)}"></label>` : ""}
        ${kind !== "cancel" ? `
          <div class="grid g2">
            <label class="f">שעת התחלה<input class="in" type="time" name="start" value="${esc(tmp.start)}"></label>
            <label class="f">שעת סיום<input class="in" type="time" name="end" value="${esc(tmp.end)}"></label>
          </div>
          <label class="f">הערה לצופים (לא חובה)<input class="in" name="label" value="${esc(tmp.label)}" placeholder="למשל: פרק מיוחד"></label>
          <details class="more"><summary>אפשרויות נוספות</summary>
            <div class="grid">
              <label class="f">שם אחר לתוכנית<input class="in" name="name" value="${esc(tmp.name)}" placeholder="${esc(draft.defaults.showName)}"></label>
              <label class="f">מקור שידור אחר (m3u8)<input class="in" type="url" name="stream" value="${esc(tmp.stream)}" placeholder="ברירת מחדל"></label>
            </div>
          </details>` : `<label class="f">סיבה (לשימושך בלבד)<input class="in" name="note" value="${esc(tmp.note)}" placeholder="למשל: חג"></label>`}
        <div id="dlgErr" style="color:var(--bad);font-size:.88rem"></div>
      </div>
      <div class="dlg-f">
        <button class="btn primary" data-d="ok">${isNew ? "הוספה" : "שמירה"}</button>
        <button class="btn" data-d="close">ביטול</button>
        <span class="grow"></span>
        ${!isNew ? `<button class="btn danger" data-d="del">מחיקה</button>` : ""}
      </div>`;
  };
  draw();
  dlg.onclick = e => {
    if (e.target === dlg) return dlg.close();
    const day = e.target.closest("[data-day]");
    if (day) {
      const i = +day.dataset.day;
      sync();
      if (isNew) tmp.days = tmp.days.includes(i) ? tmp.days.filter(x => x !== i) : [...tmp.days, i];
      else tmp.days = [i];
      draw(); return;
    }
    const b = e.target.closest("[data-d]"); if (!b) return;
    if (b.dataset.d === "close") return dlg.close();
    if (b.dataset.d === "del") { dlg.close(); return ACT.del({ kind, i: idx }); }
    sync();
    const err = validateTmp(kind, tmp);
    if (err) { $("dlgErr").textContent = err; return; }
    dlg.close();
    commit(() => {
      if (kind === "weekly") {
        const base = { enabled: true, start: tmp.start, end: tmp.end, label: tmp.label, name: tmp.name, stream: tmp.stream, url: "" };
        if (isNew) tmp.days.sort().forEach(d => draft.weekly.push({ id: uid(), day: d, ...base }));
        else Object.assign(draft.weekly[idx], base, { day: tmp.days[0], enabled: draft.weekly[idx].enabled });
        draft.weekly.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
      } else if (kind === "special") {
        const it = { id: isNew ? uid() : tmp.id, enabled: isNew ? true : tmp.enabled, date: tmp.date, start: tmp.start, end: tmp.end, label: tmp.label, name: tmp.name, stream: tmp.stream, url: tmp.url || "" };
        if (isNew) draft.specials.push(it); else draft.specials[idx] = it;
        draft.specials.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
      } else {
        const it = { id: isNew ? uid() : tmp.id, date: tmp.date, note: tmp.note };
        if (isNew) draft.cancelled.push(it); else draft.cancelled[idx] = it;
        draft.cancelled.sort((a, b) => a.date.localeCompare(b.date));
      }
    }, { msg: isNew ? "נוסף ✓" : "עודכן ✓" });
  };
  function sync() { dlg.querySelectorAll("[name]").forEach(i => { tmp[i.name] = i.value.trim(); }); }
  dlg.showModal();
}

function validateTmp(kind, t) {
  if (kind === "weekly" && !t.days.length) return "בחרו לפחות יום אחד";
  if (kind !== "weekly" && !isDate(t.date)) return "בחרו תאריך";
  if (kind === "cancel") return draft.cancelled.some(c => c.date === t.date && c.id !== t.id) ? "התאריך הזה כבר מבוטל" : "";
  if (!isTime(t.start) || !isTime(t.end)) return "מלאו שעת התחלה ושעת סיום";
  if (t.start === t.end) return "שעת הסיום זהה לשעת ההתחלה";
  if (t.stream && !/^https?:\/\/\S+$/.test(t.stream)) return "קישור המקור לא תקין";
  return "";
}

function nextWeeklyDate() {
  const w = buildWindows(draft, Date.now()).find(w => w.kind === "weekly" && w.start > Date.now());
  return w ? w.date : todayKey(Date.now());
}

// =====================================================================
//  ציור
// =====================================================================
function setTab(id) { tab = id; history.replaceState(null, "", "#" + id); render(); scrollTo(0, 0); }

function render() {
  if (!user) return;
  $("tabs").innerHTML = TABS.map(t => `<button class="tab ${t.id === tab ? "on" : ""}" data-tab="${t.id}"><span>${t.ic}</span>${t.label}</button>`).join("");
  $("tabs").querySelectorAll("[data-tab]").forEach(b => b.onclick = () => setTab(b.dataset.tab));
  renderView();
}

function renderView() {
  // שומרים על חלון התצוגה המקדימה כדי שלא ייטען מחדש בכל שינוי
  if (tab === "design" && $("preview") && $("designLeft")) {
    const tmp = document.createElement("div");
    tmp.innerHTML = VIEWS.design();
    const open = [...$("designLeft").querySelectorAll("details")].map(d => d.open);
    $("designLeft").replaceWith(tmp.querySelector("#designLeft"));
    $("designLeft").querySelectorAll("details").forEach((d, i) => { if (open[i]) d.open = true; });
    pushPreview();
    return;
  }
  $("view").innerHTML = VIEWS[tab]();
  if (tab === "home") liveTick();
  if (tab === "design") $("preview").onload = pushPreview;
  if (tab === "more") loadHistory();
}

const VIEWS = {
  // ------------------------------------------------------------- ראשי
  home() {
    const mode = draft.override.mode || "auto";
    const now = Date.now();
    const up = buildWindows(draft, now).filter(w => w.end > now).slice(0, 5);
    return `
      <div class="card"><div class="hero" id="hero"></div></div>

      <div class="card">
        <h3>מצב הדף</h3>
        <p class="hint">בדרך כלל משאירים על "אוטומטי": הדף משדר לבד לפי הלוח.</p>
        <div class="modes">
          <button class="mode ${mode === "auto" ? "on" : ""}" data-act="mode" data-m="auto"><span class="em">⏱</span><span><b>אוטומטי</b><small>לפי לוח השידורים</small></span></button>
          <button class="mode live ${mode === "live" ? "on" : ""}" data-act="mode" data-m="live"><span class="em">🔴</span><span><b>משדרים עכשיו</b><small>הנגן פועל מיד לכולם</small></span></button>
          <button class="mode off ${mode === "off" ? "on" : ""}" data-act="mode" data-m="off"><span class="em">⏸</span><span><b>מושבת</b><small>מציג הודעה בלבד</small></span></button>
        </div>
        ${mode !== "auto" ? `
          <div class="grid g2" style="margin-top:14px">
            <label class="f">לחזור לאוטומטי בתאריך ושעה (לא חובה)<input class="in" type="datetime-local" data-k="override.until" value="${esc(draft.override.until)}"></label>
            ${mode === "off" ? `<label class="f">הודעה לצופים<input class="in" data-k="override.message" value="${esc(draft.override.message)}" placeholder="למשל: השידור יחזור בשבוע הבא"></label>` : ""}
          </div>` : ""}
      </div>

      <div class="card">
        <div class="sec-head"><div><h3>השידורים הקרובים</h3></div>
          <button class="btn sm" data-act="goto" data-t="schedule">עריכת הלוח</button></div>
        <div class="items">
          ${up.length ? up.map(w => `
            <div class="item">
              <div class="ic ${w.kind === "special" ? "sp" : ""}">${w.kind === "special" ? "★" : "↻"}</div>
              <div class="tx"><b>${fmtDate(w.date)} · ${range(w.startText, w.endText)}</b><small>${esc(w.name)}${w.label ? " · " + esc(w.label) : ""}</small></div>
              ${w.start > now ? (w.kind === "weekly"
                ? `<button class="btn ghost sm" data-act="cancelDate" data-date="${w.date}">ביטול השבוע</button>`
                : `<button class="btn ghost sm" data-act="disableSpecial" data-id="${esc(w.id)}">ביטול</button>`) : `<span class="muted" style="font-size:.85rem">🔴 עכשיו</span>`}
            </div>`).join("") : `<div class="empty">אין שידורים מתוכננים. <a href="#" data-act="goto" data-t="schedule">להוספה</a></div>`}
        </div>
      </div>`;
  },

  // ------------------------------------------------------------- לוח
  schedule() {
    const t = todayKey(Date.now());
    const upcoming = draft.specials.map((s, i) => ({ s, i })).filter(x => x.s.date >= t);
    const cancels = draft.cancelled.map((c, i) => ({ c, i })).filter(x => x.c.date >= t);
    const past = draft.specials.filter(s => s.date < t).length + draft.cancelled.filter(c => c.date < t).length;
    return `
      <div class="card">
        <h3>14 הימים הקרובים</h3>
        <p class="hint">לחיצה על יום: יום עם שידור קבוע = ביטול השבוע. יום ריק = הוספת שידור. יום מבוטל = החזרה.</p>
        ${calendar()}
        <div class="legend"><span><span class="pill" style="display:inline-block">↻</span> קבוע</span><span><span class="pill special" style="display:inline-block">★</span> חד-פעמי</span><span>▨ מבוטל</span></div>
      </div>

      <div class="card">
        <div class="sec-head"><div><h3>↻ כל שבוע</h3><p class="hint">השעות הקבועות של התוכנית.</p></div></div>
        <div class="items">
          ${draft.weekly.map((w, i) => `
            <div class="item ${w.enabled === false ? "off" : ""}">
              <div class="ic">↻</div>
              <div class="tx"><b>כל יום ${DAY_NAMES[w.day]} · ${range(w.start, w.end)}</b><small>${esc(w.name || draft.defaults.showName)}${w.label ? " · " + esc(w.label) : ""}${w.enabled === false ? " · מושהה" : ""}</small></div>
              <div class="acts">
                <label class="sw" title="${w.enabled === false ? "מושהה" : "פעיל"}"><input type="checkbox" ${w.enabled !== false ? "checked" : ""} data-act="toggleItem" data-kind="weekly" data-i="${i}"><span class="tr"></span></label>
                <button class="btn ghost icon" data-act="edit" data-kind="weekly" data-i="${i}" title="עריכה">✎</button>
                <button class="btn ghost icon danger" data-act="del" data-kind="weekly" data-i="${i}" title="מחיקה">🗑</button>
              </div>
            </div>`).join("")}
          <button class="add-btn" data-act="add" data-kind="weekly">＋ הוספת שעה שבועית</button>
        </div>
      </div>

      <div class="card">
        <div class="sec-head"><div><h3>★ שידורים חד-פעמיים</h3><p class="hint">פרקים מיוחדים בתאריך מסוים (בנוסף לשעות הקבועות).</p></div></div>
        <div class="items">
          ${upcoming.map(({ s, i }) => `
            <div class="item ${s.enabled === false ? "off" : ""}">
              <div class="ic sp">★</div>
              <div class="tx"><b>${fmtDate(s.date)} · ${range(s.start, s.end)}</b><small>${esc(s.name || draft.defaults.showName)}${s.label ? " · " + esc(s.label) : ""}${s.enabled === false ? " · מושהה" : ""}</small></div>
              <div class="acts">
                <label class="sw"><input type="checkbox" ${s.enabled !== false ? "checked" : ""} data-act="toggleItem" data-kind="special" data-i="${i}"><span class="tr"></span></label>
                <button class="btn ghost icon" data-act="edit" data-kind="special" data-i="${i}" title="עריכה">✎</button>
                <button class="btn ghost icon danger" data-act="del" data-kind="special" data-i="${i}" title="מחיקה">🗑</button>
              </div>
            </div>`).join("")}
          <button class="add-btn" data-act="add" data-kind="special">＋ הוספת שידור חד-פעמי</button>
        </div>
      </div>

      <div class="card">
        <div class="sec-head"><div><h3>⊘ שבועות בלי שידור</h3><p class="hint">בתאריכים האלה השעה הקבועה לא תפעל.</p></div></div>
        <div class="chips">
          ${cancels.map(({ c }) => `<span class="chip">${fmtDate(c.date)}${c.note ? ` · <span class="muted">${esc(c.note)}</span>` : ""}<button data-act="uncancel" data-date="${c.date}" title="החזרת השידור">✕</button></span>`).join("")}
          <button class="btn sm" data-act="add" data-kind="cancel">＋ ביטול תאריך</button>
        </div>
      </div>
      ${past ? `<p class="muted" style="text-align:center;font-size:.88rem">${past} תאריכים ישנים שמורים ברקע · <a href="#" data-act="purgePast">ניקוי</a></p>` : ""}`;
  },

  // ------------------------------------------------------------- נגן
  player() {
    const p = draft.player;
    return `
      <div class="card">
        <h3>מקור השידור</h3>
        <p class="hint">קישור ה-m3u8 של השידור. הנגן מוטמע בדף שלנו, הצופים לא עוברים לאתר אחר.</p>
        <div style="display:flex;gap:8px"><input class="in" type="url" data-k="player.source" value="${esc(p.source)}"><button class="btn" data-act="testSource">בדיקה</button></div>
        <div id="testRes" class="test-res"></div>
        <details class="more" style="margin-top:12px"><summary>במקום נגן: העברה לאתר אחר</summary>
          ${choices("player.mode", [["embed", "נגן בתוך הדף", "השידור מוטמע אצלנו", true], ["redirect", "העברה לאתר אחר", "מעביר לקישור שבהמשך"]])}
          <div style="margin-top:12px">${field("defaults.liveUrl", "קישור להעברה / גיבוי אם הנגן לא עובד", { type: "url" })}</div>
        </details>
      </div>

      <div class="card">
        <h3>⏳ השהיה (דיליי)</h3>
        <p class="hint">כמה שניות מאחורי השידור החי מנגנים. השהיה גדולה יותר = פחות תקיעות.</p>
        ${choices("player.delayMode", [
          ["auto", "אוטומטית לכל מכשיר", "כל טלפון ומחשב מזהה לבד כמה הוא נתקע ומתאים לעצמו את ההשהיה", true],
          ["fixed", "קבועה לכולם", "אותה השהיה בדיוק בכל המכשירים"]])}
        <div class="grid" style="margin-top:16px">
          ${slider("player.delay", p.delayMode === "auto" ? "השהיה בהתחלה" : "השהיה", { min: 4, max: 60, unit: " שנ׳" })}
          ${p.delayMode === "auto" ? `<div class="grid g2">
            ${slider("player.delayMin", "לא פחות מ-", { min: 2, max: 30, unit: " שנ׳" })}
            ${slider("player.delayMax", "לא יותר מ-", { min: 10, max: 120, unit: " שנ׳" })}</div>
            <p class="hint" style="margin:0">איך זה עובד: בכל פעם שהשידור נתקע אצל צופה, הנגן שלו מוסיף השהיה. כשהחיבור יציב 4 דקות, ההשהיה יורדת בהדרגה. כל מכשיר זוכר את ההשהיה שמתאימה לו.</p>` : ""}
          ${toggle("player.viewerDelay", "לאפשר לצופים לשנות השהיה בעצמם", "בתפריט ההגדרות של הנגן")}
        </div>
      </div>

      <div class="card">
        <h3>נכנסים באמצע התוכנית</h3>
        <p class="hint">מה קורה כשצופה נכנס אחרי שהתוכנית כבר התחילה.</p>
        ${choices("player.joinMode", [["ask", "לשאול את הצופה", "מציג כפתור \"מההתחלה\"", true], ["start", "מתחילת התוכנית", "תמיד מהדקה הראשונה"], ["live", "ישר לשידור החי", "בלי לשאול"]])}
      </div>

      <div class="card">
        <h3>בסוף התוכנית</h3>
        ${choices("player.afterEnd", [["stop", "לעצור", "ולהציג מתי השידור הבא", true], ["continue", "להמשיך לנגן", "את הערוץ, עד שהצופה סוגר"]])}
        <div class="grid g2" style="margin-top:14px">
          ${select("player.replayHours", "צפייה חוזרת אחרי השידור", [[0, "כבוי"], [1, "שעה"], [3, "3 שעות"], [6, "6 שעות"]], true)}
          ${select("player.dvrMinutes", "אפשר לחזור אחורה בשידור", [[0, "רק מתחילת התוכנית"], [15, "15 דקות"], [30, "30 דקות"], [60, "שעה"], [120, "שעתיים"]], true)}
        </div>
      </div>

      <div class="card">
        <h3>עוד אפשרויות</h3>
        <div class="toggles">
          ${toggle("player.autoplay", "הפעלה אוטומטית", "הנגן מתחיל לבד כשהשידור מתחיל")}
          ${toggle("player.startMuted", "להתחיל בלי קול", "חלק מהדפדפנים מחייבים זאת. הצופה מפעיל קול בלחיצה")}
          ${toggle("player.alwaysOn", "צפייה בערוץ גם מחוץ לשעות", "מציג כפתור \"לצפייה בערוץ עכשיו\"")}
          ${toggle("player.showStatsOption", "אפשרות \"נתונים טכניים\" לצופים", "מהירות, השהיה ותקיעות בזמן אמת")}
        </div>
        <div class="grid g2" style="margin-top:14px">
          ${select("player.defaultQuality", "איכות התחלתית", [["auto", "אוטומטית (מומלץ)"], ["1080", "1080p"], ["720", "720p"], ["540", "540p"], ["360", "360p - חוסך גלישה"]])}
          ${select("player.seekStep", "דילוג בלחיצה", [[5, "5 שניות"], [10, "10 שניות"], [15, "15 שניות"], [30, "30 שניות"]], true)}
        </div>
      </div>`;
  },

  // ------------------------------------------------------------- עיצוב
  design() {
    const d = draft.design;
    const colors = [["bg", "רקע"], ["bg2", "רקע משני"], ["card", "כרטיס"], ["text", "טקסט"], ["muted", "טקסט משני"], ["accent", "הדגשה"]];
    const states = [["before", "לפני"], ["live", "בשידור"], ["ended", "הסתיים"], ["off", "מושבת"]];
    return `
      <div class="design-wrap">
        <div id="designLeft">
          <div class="card">
            <h3>ערכת צבעים</h3>
            <p class="hint">בחירה אחת וזהו. אפשר לדייק בהמשך.</p>
            <div class="presets">
              ${Object.entries(PRESETS).map(([id, p]) => `
                <button class="preset ${d.preset === id ? "on" : ""}" data-act="preset" data-p="${id}">
                  <div class="pv" style="background:linear-gradient(135deg,${p.bg},${p.bg2})"><i style="background:${p.card};color:${p.accent}"></i></div>
                  <span>${p.label}</span></button>`).join("")}
            </div>
          </div>
          <div class="card">
            <h3>כותרות</h3>
            <div class="grid">
              ${field("defaults.showName", "שם התוכנית")}
              ${field("design.logoUrl", "לוגו (קישור לתמונה, לא חובה)", { type: "url", ph: "https://" })}
            </div>
          </div>
          <details class="acc">
            <summary>🎨 התאמה אישית <small>צבעים, גופן, רקע, אנימציה</small></summary>
            <div class="body">
              <div class="colors">
                ${colors.map(([k, l]) => `<label class="color"><input type="color" data-k="design.${k}" value="${esc(d[k])}"><small>${l}</small></label>`).join("")}
              </div>
              <div class="grid g2" style="margin-top:14px">
                ${select("design.font", "גופן", FONTS.map(f => [f.id, f.label]))}
                ${select("design.animation", "אנימציית כניסה", [["none", "ללא"], ["fade", "הופעה"], ["rise", "עלייה"], ["zoom", "התקרבות"]])}
                ${slider("design.titleSize", "גודל כותרת", { min: 20, max: 56, unit: "px" })}
                ${slider("design.radius", "עיגול פינות", { min: 0, max: 40, unit: "px" })}
                ${slider("design.cardWidth", "רוחב כרטיס", { min: 320, max: 760, step: 10, unit: "px" })}
                ${slider("design.logoSize", "גודל לוגו", { min: 32, max: 200, unit: "px" })}
                ${field("design.bgImage", "תמונת רקע (קישור)", { type: "url", ph: "https://" })}
                ${slider("design.bgOverlay", "כהות מעל התמונה", { min: 0, max: 1, step: 0.05 })}
              </div>
              <div class="toggles" style="margin-top:14px">
                ${toggle("design.gradient", "רקע בהדרגה")}
                ${toggle("design.glass", "כרטיס שקוף מטושטש")}
                ${toggle("design.shadow", "צל")}
                ${toggle("design.showCountdown", "ספירה לאחור")}
                ${toggle("design.showName", "שם התוכנית בכרטיס")}
                ${toggle("design.showDate", "תאריך השידור הבא")}
              </div>
              <div style="margin-top:14px">${area("design.customCss", "CSS מותאם (למתקדמים)", { rows: 4, code: true, ph: ".card { border: 2px solid var(--accent) }" })}</div>
              <div style="margin-top:10px"><button class="btn sm" data-act="resetSection" data-s="design">איפוס עיצוב</button></div>
            </div>
          </details>
        </div>
        <div class="preview-col">
          <div class="seg">${states.map(([s, l]) => `<button data-act="pstate" data-s="${s}" class="${previewState === s ? "on" : ""}">${l}</button>`).join("")}</div>
          <div class="phone"><iframe id="preview" src="../kupa-rashit/?preview=1" title="תצוגה מקדימה" allow="autoplay; fullscreen; picture-in-picture"></iframe></div>
        </div>
      </div>`;
  },

  // ------------------------------------------------------------- עוד
  more() {
    const T = k => `texts.${k}`;
    return `
      <details class="acc">
        <summary>✏️ טקסטים בדף <small>כל מה שהצופים קוראים</small></summary>
        <div class="body"><div class="grid g2">
          ${field(T("pageTitle"), "כותרת הלשונית בדפדפן")}
          ${field(T("liveBadge"), "תווית \"שידור חי\"")}
          ${field(T("notStartedTitle"), "לפני השידור - כותרת")}
          ${field(T("notStartedLead"), "לפני השידור - פתיח")}
          ${field(T("countdownLead"), "מעל הספירה לאחור")}
          ${field(T("endedTitle"), "אחרי השידור - כותרת")}
          ${field(T("endedLead"), "אחרי השידור - פתיח")}
          ${field(T("replayBtn"), "כפתור צפייה חוזרת")}
          ${field(T("watchNowBtn"), "כפתור צפייה בערוץ")}
          ${field(T("noneTitle"), "אין שידורים - כותרת")}
          ${field(T("noneText"), "אין שידורים - טקסט")}
          ${field(T("offTitle"), "מושבת - כותרת")}
          ${field(T("offText"), "מושבת - טקסט")}
          ${field(T("fallbackLink"), "קישור גיבוי מתחת לנגן")}
          ${field(T("footer"), "שורה קטנה בתחתית")}
        </div>
        <div style="margin-top:12px"><button class="btn sm" data-act="resetSection" data-s="texts">איפוס טקסטים</button></div></div>
      </details>

      <details class="acc">
        <summary>⏱ תזמון מתקדם</summary>
        <div class="body"><div class="grid g2">
          ${select("advanced.earlyMinutes", "להתחיל את הנגן לפני שעת ההתחלה", [[0, "בדיוק בזמן"], [1, "דקה לפני"], [2, "2 דקות לפני"], [5, "5 דקות לפני"], [10, "10 דקות לפני"]], true)}
          ${select("player.endGraceMinutes", "לעצור אחרי שעת הסיום", [[0, "בדיוק בזמן"], [1, "אחרי דקה"], [2, "אחרי 2 דקות"], [5, "אחרי 5 דקות"], [10, "אחרי 10 דקות"]], true)}
          ${select("advanced.lookaheadDays", "להציג את השידור הבא עד", [[7, "שבוע קדימה"], [14, "שבועיים"], [21, "3 שבועות"], [60, "חודשיים"]], true)}
        </div>
        <div class="toggles" style="margin-top:12px">
          ${toggle("advanced.useServerTime", "שעון מדויק מהאינטרנט", "לא תלוי בשעון של המכשיר")}
          ${toggle("enabled", "הדף פעיל")}
        </div>
        ${draft.player.mode === "redirect" ? `<div class="grid g2" style="margin-top:12px">
          ${slider("advanced.joinDelaySec", "השהיה לפני העברה (נכנס באמצע)", { min: 0, max: 30, unit: " שנ׳" })}
          ${slider("advanced.startDelaySec", "השהיה לפני העברה (השידור התחיל)", { min: 0, max: 30, unit: " שנ׳" })}
        </div>` : ""}</div>
      </details>

      <details class="acc" open>
        <summary>🕓 גיבויים והיסטוריה <small>שחזור גרסה קודמת</small></summary>
        <div class="body">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <button class="btn sm" data-act="snapshot">＋ גיבוי עכשיו</button>
            <button class="btn sm" data-act="exportJson">⬇ הורדת קובץ</button>
            <button class="btn sm" data-act="importJson">⬆ טעינת קובץ</button>
            <input type="file" id="importFile" accept=".json,application/json" class="hidden">
          </div>
          <div class="list" id="hist"><div class="empty">טוען...</div></div>
        </div>
      </details>

      <details class="acc">
        <summary>🔧 מידע טכני</summary>
        <div class="body list">
          <div class="li"><span class="muted">פרויקט Firebase</span><code class="ltr">${firebaseConfig.projectId}</code></div>
          <div class="li"><span class="muted">מסמך</span><code class="ltr">sites/${SITE_ID}</code></div>
          <div class="li"><span class="muted">מנהל</span><code class="ltr">${ADMIN_EMAIL}</code></div>
          <div class="li"><a target="_blank" rel="noopener" href="https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/data/~2Fsites~2F${SITE_ID}">פתיחה ב-Firebase ↗</a></div>
          <div class="li"><button class="btn sm danger" data-act="resetAll">איפוס כל ההגדרות</button></div>
        </div>
      </details>`;
  }
};

function calendar() {
  const now = Date.now();
  const all = buildWindows(draft, now);
  const p = israelParts(now);
  const cancelled = new Set(draft.cancelled.map(c => c.date));
  const weeklyDays = new Set(draft.weekly.filter(w => w.enabled !== false).map(w => +w.day));
  let h = `<div class="cal">`;
  for (let i = 0; i < 14; i++) {
    const dd = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    const k = dateKey(dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate());
    const items = all.filter(w => w.date === k);
    const isCx = cancelled.has(k) && weeklyDays.has(dd.getUTCDay());
    h += `<button class="day ${i === 0 ? "today" : ""} ${isCx ? "cancel" : ""}" data-act="day" data-date="${k}">
      <div class="dh"><span>${DAY_SHORT[dd.getUTCDay()]}</span><b>${dd.getUTCDate()}/${dd.getUTCMonth() + 1}</b></div>
      ${items.map(w => `<span class="pill ${w.kind}">${w.startText}</span>`).join("")}
      ${isCx ? `<span class="muted" style="font-size:.72rem">מבוטל</span>` : ""}
    </button>`;
  }
  return h + `</div>`;
}

// ---------- סטטוס חי בדף הראשי ----------
function liveTick() {
  const hero = $("hero"); if (!hero) return;
  const now = Date.now();
  const st = getStatus(draft, now);
  const labels = { live: "🔴 משדרים עכשיו", before: "ממתינים לשידור הבא", ended: "השידור של היום הסתיים", none: "אין שידורים מתוכננים", off: "הדף מושבת" };
  const cls = { live: "live", before: "before", ended: "before", none: "", off: "off" }[st.state];
  const n = st.next;
  hero.innerHTML = `
    <span class="pulse ${cls}"></span>
    <div><div class="big">${labels[st.state]}${st.forced ? " (ידני)" : ""}</div>
      <div class="muted">${n && !n.forced ? `${esc(n.name)} · ${fmtDate(n.date)} · ${range(n.startText, n.endText)}${n.label ? " · " + esc(n.label) : ""}` : ""}</div></div>
    ${n && !n.forced && st.state !== "live" ? `<div class="cd"><b>${formatCountdown(n.openAt - now)}</b><small>עד השידור הבא</small></div>` : ""}
    ${st.state === "live" ? `<a class="btn primary" href="../kupa-rashit/" target="_blank" rel="noopener" style="margin-inline-start:auto">לצפייה ↗</a>` : ""}`;
}
setInterval(() => { if (user && tab === "home") liveTick(); }, 1000);

// ---------- תצוגה מקדימה ----------
addEventListener("message", e => { if (e.data?.type === "kr-preview-ready") pushPreview(); });
let previewT = null;
function pushPreview() {
  clearTimeout(previewT);
  previewT = setTimeout(() => {
    const f = $("preview");
    if (f?.contentWindow) f.contentWindow.postMessage({ type: "kr-preview", config: clean(draft), state: previewState }, "*");
  }, 120);
}

// ---------- היסטוריה ----------
let histCache = [];
async function loadHistory() {
  const el = $("hist"); if (!el) return;
  try {
    const snap = await getDocs(query(histRef, orderBy("savedAt", "desc"), limit(30)));
    histCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    el.innerHTML = histCache.length ? histCache.map(h => `
      <div class="li">
        <span style="min-width:120px">${fmtStamp(h.savedAt?.toDate?.())}</span>
        <span class="muted" style="flex:1">${esc(h.note || "שמירה")}</span>
        <button class="btn sm" data-act="restore" data-id="${h.id}">שחזור</button>
        <button class="btn ghost icon danger" data-act="delHist" data-id="${h.id}" title="מחיקה">🗑</button>
      </div>`).join("") : `<div class="empty">עוד אין גיבויים. גיבוי נוצר אוטומטית בשינוי הראשון.</div>`;
  } catch (e) { el.innerHTML = `<div class="empty">שגיאה בטעינה (${esc(e.code)})</div>`; }
}
$("view").addEventListener("change", async e => {
  if (e.target.id !== "importFile") return;
  const f = e.target.files[0]; if (!f) return;
  try { const cfg = mergeConfig(JSON.parse(await f.text())); commit(() => { draft = cfg; }, { msg: "הקובץ נטען" }); }
  catch (err) { toast("קובץ לא תקין", "bad"); }
});

// =====================================================================
//  כללי
// =====================================================================
function toast(msg, type = "", action) {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.innerHTML = `<span></span>`;
  t.firstChild.textContent = msg;
  if (action) { const b = document.createElement("button"); b.textContent = action[0]; b.onclick = () => { t.remove(); action[1](); }; t.appendChild(b); }
  $("toasts").appendChild(t);
  setTimeout(() => { t.style.transition = ".3s"; t.style.opacity = "0"; }, 4200);
  setTimeout(() => t.remove(), 4600);
}

$("themeBtn").onclick = () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("adm-theme", t); } catch (e) {}
};
