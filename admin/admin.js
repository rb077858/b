// =====================================================================
//  פאנל ניהול למאגר reembir.com/b
//  כניסה עם Google (רק rb077858@gmail.com), ההגדרות נשמרות ב-Firestore.
// =====================================================================
import { app, db, SDK, ADMIN_EMAIL, firebaseConfig } from "../firebase/config.js";
import {
  SITE_ID, DEFAULT_CONFIG, PRESETS, FONTS, DAY_NAMES, mergeConfig, buildWindows, getStatus,
  israelParts, dateKey, todayKey, formatCountdown, windowDateText, isTime, isDate, pad2, uid
} from "../kupa-rashit/schedule.js";

const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } =
  await import(`${SDK}/firebase-auth.js`);
const { doc, onSnapshot, setDoc, updateDoc, addDoc, deleteDoc, collection, query, orderBy, limit, getDocs, serverTimestamp } =
  await import(`${SDK}/firebase-firestore.js`);

// ---------- פרויקטים במאגר שמנוהלים מהפאנל ----------
// להוספת פרויקט עתידי: מוסיפים כאן שורה ומסמך sites/<id> ב-Firestore.
const SITES = [
  { id: SITE_ID, name: "קופה ראשית", url: "../kupa-rashit/", icon: "📺" }
];

const TABS = [
  { id: "overview", label: "סקירה", ic: "◉" },
  { id: "weekly", label: "שידורים קבועים", ic: "↻", count: c => c.weekly.length },
  { id: "specials", label: "תאריכים מיוחדים", ic: "★", count: c => c.specials.filter(s => s.date >= todayKey(Date.now())).length },
  { id: "cancelled", label: "ביטולים", ic: "⊘", count: c => c.cancelled.length },
  { id: "texts", label: "טקסטים", ic: "✎" },
  { id: "design", label: "עיצוב", ic: "◧" },
  { id: "advanced", label: "הגדרות מתקדמות", ic: "⚙" },
  { id: "history", label: "גיבוי והיסטוריה", ic: "⟲" }
];

const ACCENTS = ["#6d5efc", "#2563eb", "#0891b2", "#16a34a", "#ea580c", "#e11d48", "#111827"];

const auth = getAuth(app);
const siteRef = doc(db, "sites", SITE_ID);
const histRef = collection(db, "sites", SITE_ID, "history");

let user = null;
let draft = structuredClone(DEFAULT_CONFIG);
let saved = structuredClone(DEFAULT_CONFIG);
let savedJson = JSON.stringify(saved);
let meta = {};
let tab = (location.hash.slice(1) || "overview").replace(/^kupa-rashit\/?/, "") || "overview";
if (!TABS.some(t => t.id === tab)) tab = "overview";
let previewState = "";
let unsub = null;
let saving = false;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = o => JSON.parse(JSON.stringify(o));

// =====================================================================
//  התחברות
// =====================================================================
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ login_hint: ADMIN_EMAIL, prompt: "select_account" });

$("loginBtn").onclick = async () => {
  $("loginErr").textContent = "";
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      return signInWithRedirect(auth, provider);
    }
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    $("loginErr").textContent = authError(e);
  }
};
getRedirectResult(auth).catch(e => { $("loginErr").textContent = authError(e); });

function authError(e) {
  const map = {
    "auth/unauthorized-domain": "הדומיין הזה לא מאושר ב-Firebase (Authentication → Settings → Authorized domains).",
    "auth/operation-not-allowed": "כניסה עם Google לא הופעלה עדיין ב-Firebase (Authentication → Sign-in method).",
    "auth/configuration-not-found": "Authentication לא הופעל עדיין בפרויקט Firebase.",
    "auth/network-request-failed": "בעיית רשת. נסו שוב."
  };
  return map[e.code] || `שגיאה: ${e.code || e.message}`;
}

$("logoutBtn").onclick = () => { if (!confirmLeave()) return; signOut(auth); };

onAuthStateChanged(auth, async u => {
  $("boot").classList.add("hidden");
  if (unsub) { unsub(); unsub = null; }
  if (!u) {
    user = null;
    $("app").classList.add("hidden"); $("login").classList.remove("hidden");
    return;
  }
  if (u.email !== ADMIN_EMAIL || !u.emailVerified) {
    $("loginErr").textContent = `לחשבון ${u.email} אין הרשאת ניהול.`;
    await signOut(auth);
    return;
  }
  user = u;
  $("login").classList.add("hidden"); $("app").classList.remove("hidden");
  $("avatar").src = u.photoURL || "";
  $("avatar").classList.toggle("hidden", !u.photoURL);
  $("whoName").textContent = u.displayName || "מנהל";
  $("whoMail").textContent = u.email;
  subscribe();
  render();
});

// =====================================================================
//  סנכרון עם Firestore
// =====================================================================
function subscribe() {
  let first = true;
  unsub = onSnapshot(siteRef, snap => {
    setSync(true);
    const data = snap.exists() ? snap.data() : null;
    const { updatedAt, updatedBy, ...rest } = data || {};
    meta = { updatedAt: updatedAt?.toDate?.(), updatedBy, exists: !!data };
    const incoming = mergeConfig(data ? rest : DEFAULT_CONFIG);
    const incomingJson = JSON.stringify(incoming);
    const wasDirty = isDirty();
    if (incomingJson === savedJson && !first) { renderMeta(); return; }
    saved = incoming; savedJson = incomingJson;
    if (!wasDirty || first) draft = structuredClone(incoming);
    else if (!saving) toast("ההגדרות עודכנו ממקום אחר. השינויים שלך עדיין לא נשמרו.", "bad");
    first = false;
    render();
  }, err => {
    setSync(false);
    toast("אין גישה למסד הנתונים: " + err.code, "bad");
  });
}

function setSync(ok) {
  $("sync").classList.toggle("off", !ok);
  $("sync").querySelector("span").textContent = ok ? "מסונכרן" : "לא מחובר";
}

const isDirty = () => JSON.stringify(draft) !== savedJson;

function validate() {
  const errs = [];
  const urlOk = u => !u || /^https?:\/\/\S+$/.test(u);
  draft.weekly.forEach((w, i) => { if (!isTime(w.start) || !isTime(w.end) || !urlOk(w.url)) errs.push(`weekly.${i}`); });
  draft.specials.forEach((s, i) => { if (!isDate(s.date) || !isTime(s.start) || !isTime(s.end) || !urlOk(s.url)) errs.push(`specials.${i}`); });
  draft.cancelled.forEach((c, i) => { if (!isDate(c.date)) errs.push(`cancelled.${i}`); });
  if (!urlOk(draft.defaults.liveUrl) || !draft.defaults.liveUrl) errs.push("defaults");
  if (!urlOk(draft.override.url)) errs.push("override");
  return errs;
}

async function save(note = "") {
  const errs = validate();
  if (errs.length) {
    render();
    toast("יש שדות לא תקינים (מסומנים באדום). בדקו שעות, תאריכים וקישורים.", "bad");
    return false;
  }
  saving = true;
  $("saveBtn").disabled = true;
  try {
    const data = clean(draft);
    await setDoc(siteRef, { ...data, updatedAt: serverTimestamp(), updatedBy: user.email });
    addDoc(histRef, { config: data, savedAt: serverTimestamp(), by: user.email, note }).catch(() => {});
    toast("נשמר בהצלחה ✓ הדף הציבורי מתעדכן מיד", "ok");
    return true;
  } catch (e) {
    toast("השמירה נכשלה: " + (e.code || e.message), "bad");
    return false;
  } finally {
    saving = false;
    $("saveBtn").disabled = false;
    updateSavebar();
  }
}

// שינוי מהיר של מצב השידור (נשמר מיד, בלי לגעת בשאר השינויים שבעריכה)
async function quickOverride(patch) {
  const o = { ...saved.override, ...patch };
  saving = true;
  try {
    await updateDoc(siteRef, { override: o, updatedAt: serverTimestamp(), updatedBy: user.email });
    draft.override = structuredClone(o);
    toast("מצב השידור עודכן ✓", "ok");
  } catch (e) {
    if (e.code === "not-found") {
      draft.override = o;
      return save("יצירה ראשונית");
    }
    toast("העדכון נכשל: " + e.code, "bad");
  } finally {
    saving = false;
    render();
  }
}

$("saveBtn").onclick = () => save();
$("discardBtn").onclick = () => { draft = structuredClone(saved); render(); toast("השינויים בוטלו"); };
addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (user && isDirty()) save(); }
});
addEventListener("beforeunload", e => { if (user && isDirty()) { e.preventDefault(); e.returnValue = ""; } });
const confirmLeave = () => !isDirty() || confirm("יש שינויים שלא נשמרו. להמשיך בכל זאת?");

function updateSavebar() {
  $("savebar").classList.toggle("show", !!user && isDirty());
}

// =====================================================================
//  עזרים לטפסים
// =====================================================================
function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, val) {
  const ks = path.split("."); const last = ks.pop();
  const target = ks.reduce((o, k) => o[k], obj);
  target[last] = val;
}

const field = (k, label, { type = "text", ph = "", cls = "", attrs = "" } = {}) => `
  <label class="f ${cls}">${label}
    <input class="in ${type === "url" ? "ltr" : ""}" type="${type}" data-k="${k}" value="${esc(getPath(draft, k))}" placeholder="${esc(ph)}" ${attrs}>
  </label>`;

const area = (k, label, { ph = "", rows = 3, rtl = true } = {}) => `
  <label class="f">${label}
    <textarea class="in" data-k="${k}" rows="${rows}" placeholder="${esc(ph)}" ${rtl ? 'style="direction:rtl;text-align:right;font-family:inherit;font-size:.92rem"' : ""}>${esc(getPath(draft, k))}</textarea>
  </label>`;

const toggle = (k, label) => `
  <label class="sw"><input type="checkbox" data-k="${k}" ${getPath(draft, k) ? "checked" : ""}><span class="tr"></span>${label}</label>`;

const num = (k, label, { min = 0, max = 999, step = 1, unit = "" } = {}) => `
  <label class="f">${label}${unit ? ` <span style="opacity:.7">(${unit})</span>` : ""}
    <input class="in" type="number" data-k="${k}" data-t="num" min="${min}" max="${max}" step="${step}" value="${esc(getPath(draft, k))}">
  </label>`;

const range = (k, label, { min, max, step = 1, unit = "" }) => `
  <label class="f">${label}
    <div class="range"><input type="range" data-k="${k}" data-t="num" min="${min}" max="${max}" step="${step}" value="${esc(getPath(draft, k))}"><output>${esc(getPath(draft, k))}${unit}</output></div>
  </label>`;

const daySelect = (k, val) => `
  <select class="in" data-k="${k}" data-t="num">${DAY_NAMES.map((n, i) => `<option value="${i}" ${+val === i ? "selected" : ""}>יום ${n}</option>`).join("")}</select>`;

// האזנה כללית לכל שדה עם data-k
$("view").addEventListener("input", onField);
$("view").addEventListener("change", onField);
function onField(e) {
  const el = e.target.closest("[data-k]");
  if (!el) return;
  const k = el.dataset.k;
  let v = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.t === "num") v = v === "" ? 0 : +v;
  const rerender = e.type === "change" && (k.endsWith(".enabled") || k.endsWith(".day") || k.endsWith(".date") || el.tagName === "SELECT");
  if (getPath(draft, k) === v) { if (rerender) renderView(); return; }
  setPath(draft, k, v);
  if (el.type === "range") { const o = el.parentElement.querySelector("output"); if (o) o.textContent = v + (o.textContent.replace(/[\d.\-]/g, "")); }
  if (el.classList.contains("in")) el.classList.remove("bad");
  if (k.startsWith("design.") && ["bg", "bg2", "card", "text", "muted", "accent"].includes(k.split(".")[1])) {
    draft.design.preset = "custom";
    const twin = el.type === "color" ? el.parentElement.querySelector(".hex") : el.parentElement.parentElement.querySelector('input[type="color"]');
    if (twin && /^#[0-9a-f]{6}$/i.test(v)) twin.value = v;
    document.querySelectorAll(".preset.on").forEach(p => p.classList.remove("on"));
  }
  if (rerender) renderView();
  updateSavebar(); renderNav(); pushPreview();
  if (tab === "overview") renderOverviewLive();
}

// כפתורי פעולה עם data-act
$("view").addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const fn = ACTIONS[b.dataset.act];
  if (fn) fn(b.dataset, b);
});

const ACTIONS = {
  add(d) {
    const list = draft[d.list];
    const last = list[list.length - 1];
    if (d.list === "weekly") list.push({ id: uid(), enabled: true, day: last ? last.day : 0, start: last?.start || "21:30", end: last?.end || "22:00", name: "", url: "", label: "" });
    if (d.list === "specials") list.push({ id: uid(), enabled: true, date: todayKey(Date.now()), start: "21:30", end: "22:00", name: "", url: "", label: "" });
    if (d.list === "cancelled") list.push({ id: uid(), date: nextWeeklyDate(), note: "" });
    changed();
  },
  dup(d) { const list = draft[d.list]; const copy = { ...structuredClone(list[+d.i]), id: uid() }; list.splice(+d.i + 1, 0, copy); changed(); },
  del(d) { draft[d.list].splice(+d.i, 1); changed(); },
  up(d) { const l = draft[d.list], i = +d.i; if (i > 0) { [l[i - 1], l[i]] = [l[i], l[i - 1]]; changed(); } },
  sort(d) {
    const l = draft[d.list];
    if (d.list === "weekly") l.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
    else l.sort((a, b) => a.date.localeCompare(b.date) || (a.start || "").localeCompare(b.start || ""));
    changed();
  },
  purgePast(d) {
    const t = todayKey(Date.now());
    const before = draft[d.list].length;
    draft[d.list] = draft[d.list].filter(x => x.date >= t);
    toast(`נמחקו ${before - draft[d.list].length} תאריכים שעברו`);
    changed();
  },
  cancelNext(d) {
    const w = draft.weekly[+d.i];
    const date = nextDateForDay(+w.day);
    if (!draft.cancelled.some(c => c.date === date)) draft.cancelled.push({ id: uid(), date, note: "" });
    toast(`השידור ב-${fmtDate(date)} יבוטל לאחר שמירה`);
    changed();
  },
  preset(d) {
    const p = PRESETS[d.p];
    const { label, ...colors } = p;
    Object.assign(draft.design, colors, { preset: d.p });
    changed();
  },
  pstate(d) { previewState = d.s; renderView(); },
  mode(d) {
    if (d.m === "live" && !confirm("להעביר עכשיו את כל מי שנכנס לדף לשידור החי?")) return;
    quickOverride({ mode: d.m });
  },
  saveOverride() {
    const until = $("ovUntil")?.value || "";
    quickOverride({ until, url: $("ovUrl").value.trim(), title: $("ovTitle").value, message: $("ovMsg").value });
  },
  resetSection(d) {
    if (!confirm("לאפס את החלק הזה לברירת המחדל?")) return;
    draft[d.s] = structuredClone(DEFAULT_CONFIG[d.s]);
    changed();
  },
  resetAll() {
    if (!confirm("לאפס את כל ההגדרות לברירת המחדל? (אפשר לשחזר מההיסטוריה)")) return;
    draft = structuredClone(DEFAULT_CONFIG); changed();
  },
  async restore(d) {
    const entry = histCache.find(h => h.id === d.id);
    if (!entry) return;
    draft = mergeConfig(entry.config);
    tab = "overview"; changed();
    toast("הגרסה שוחזרה לעריכה. לחצו שמירה כדי להחיל אותה.", "ok");
  },
  async delHist(d) {
    if (!confirm("למחוק את הגרסה הזו מההיסטוריה?")) return;
    await deleteDoc(doc(histRef, d.id)); loadHistory();
  },
  exportJson() {
    const blob = new Blob([JSON.stringify(clean(draft), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kupa-rashit-${todayKey(Date.now())}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importJson() { $("importFile").click(); },
  async snapshot() {
    const note = prompt("שם לגרסה (לא חובה):", "") ;
    if (note === null) return;
    await addDoc(histRef, { config: clean(draft), savedAt: serverTimestamp(), by: user.email, note: note || "גיבוי ידני" });
    toast("נשמר גיבוי ✓", "ok"); loadHistory();
  },
  copy(d) { navigator.clipboard.writeText(d.v).then(() => toast("הועתק ✓")); }
};

function changed() { render(); }

function nextDateForDay(day) {
  const p = israelParts(Date.now());
  for (let i = 0; i < 8; i++) {
    const dd = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    if (dd.getUTCDay() === day) return dateKey(dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate());
  }
  return todayKey(Date.now());
}
function nextWeeklyDate() {
  const w = buildWindows(draft, Date.now()).find(w => w.kind === "weekly" && w.start > Date.now());
  return w ? w.date : todayKey(Date.now());
}
function fmtDate(k) {
  if (!isDate(k)) return k;
  const [y, m, d] = k.split("-").map(Number);
  return `יום ${DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${pad2(d)}/${pad2(m)}/${y}`;
}
const fmtStamp = d => d ? d.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "—";

// =====================================================================
//  ציור
// =====================================================================
function render() {
  if (!user) return;
  renderNav(); renderView(); updateSavebar(); renderMeta();
}

function renderMeta() {
  const s = SITES[0];
  $("openSite").href = s.url;
  $("pageSub").textContent = meta.updatedAt
    ? `עודכן לאחרונה ${fmtStamp(meta.updatedAt)}`
    : meta.exists === false ? "עדיין לא נשמר במסד הנתונים - מוצגות הגדרות ברירת המחדל" : "";
}

function renderNav() {
  const site = SITES[0];
  $("nav").innerHTML = `
    <h6>פרויקטים</h6>
    ${SITES.map(s => `<button class="nav-btn ${s.id === site.id ? "active" : ""}"><span class="ic">${s.icon}</span>${esc(s.name)}</button>`).join("")}
    <div class="coming">＋ פרויקטים נוספים במאגר יופיעו כאן</div>
    <h6>${esc(site.name)}</h6>
    ${TABS.map(t => `
      <button class="nav-btn ${t.id === tab ? "active" : ""}" data-tab="${t.id}">
        <span class="ic">${t.ic}</span>${t.label}${t.count ? `<span class="count">${t.count(draft)}</span>` : ""}
      </button>`).join("")}`;
  $("nav").querySelectorAll("[data-tab]").forEach(b => b.onclick = () => {
    tab = b.dataset.tab; history.replaceState(null, "", "#" + tab); closeMenu(); renderNav(); renderView(); scrollTo(0, 0);
  });
}

function renderView() {
  const t = TABS.find(t => t.id === tab);
  $("pageTitle").textContent = t.label;
  const errs = new Set(validateSoft());
  $("view").innerHTML = VIEWS[tab](errs);
  if (tab === "overview") renderOverviewLive();
  if (tab === "design") setupPreview();
  if (tab === "history") loadHistory();
}

// שגיאות מוצגות רק בשדות שמולאו (לא חוסם הקלדה)
function validateSoft() { return validate(); }

// ---------------------------------------------------------------------
const VIEWS = {
  overview() {
    const o = draft.override;
    const mode = saved.override.mode || "auto";
    return `
      <div class="card">
        <div class="status-hero" id="hero"></div>
      </div>

      <div class="grid g4 keep" style="margin-top:16px" id="stats"></div>

      <div class="card" style="margin-top:16px">
        <h3>מצב השידור</h3>
        <p class="hint">שינוי כאן נשמר מיד ומשפיע על הדף הציבורי בזמן אמת.</p>
        <div class="mode-pick">
          <button data-act="mode" data-m="auto" class="${mode === "auto" ? "on" : ""}"><b>⏱ אוטומטי</b><small>לפי לוח השידורים</small></button>
          <button data-act="mode" data-m="live" class="${mode === "live" ? "on" : ""}"><b>🔴 שידור עכשיו</b><small>להעביר מיד את כולם לשידור</small></button>
          <button data-act="mode" data-m="off" class="${mode === "off" ? "on" : ""}"><b>⏸ מושבת</b><small>להציג הודעה בלבד, בלי העברה</small></button>
        </div>
        <details style="margin-top:14px" ${mode !== "auto" ? "open" : ""}>
          <summary style="cursor:pointer;color:var(--muted);font-size:.9rem">אפשרויות למצב ידני</summary>
          <div class="grid g2" style="margin-top:12px">
            <label class="f">חזרה אוטומטית ללוח בתאריך ושעה (שעון ישראל)
              <input id="ovUntil" class="in" type="datetime-local" value="${esc(o.until)}"></label>
            <label class="f">קישור לשידור במצב "שידור עכשיו" (ריק = ברירת מחדל)
              <input id="ovUrl" class="in ltr" type="url" value="${esc(o.url)}" placeholder="${esc(draft.defaults.liveUrl)}"></label>
            <label class="f">כותרת במצב מושבת
              <input id="ovTitle" class="in" value="${esc(o.title)}" placeholder="${esc(draft.texts.offTitle)}"></label>
            <label class="f">הודעה במצב מושבת
              <input id="ovMsg" class="in" value="${esc(o.message)}" placeholder="למשל: השידור יחזור בשבוע הבא"></label>
          </div>
          <div style="margin-top:12px"><button class="btn primary sm" data-act="saveOverride">החלת אפשרויות</button></div>
        </details>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="toolbar"><h3 style="margin:0">14 הימים הקרובים</h3><div class="grow"></div>
          <button class="btn sm" data-tab-go="weekly">עריכת לוח</button></div>
        <div class="cal-wrap"><div class="cal" id="cal"></div></div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="card">
          <h3>השידורים הבאים</h3>
          <div class="list" id="upcoming"></div>
        </div>
        <div class="card">
          <h3>ברירות מחדל</h3>
          <p class="hint">משמשות לכל שידור שלא הוגדר לו שם או קישור משלו.</p>
          <div class="grid">
            ${field("defaults.showName", "שם התוכנית")}
            ${field("defaults.liveUrl", "קישור לשידור החי", { type: "url", ph: "https://" })}
            ${toggle("enabled", "הדף פעיל (כבוי = מציג את הודעת 'מושבת')")}
          </div>
        </div>
      </div>`;
  },

  weekly(errs) {
    return `
      <div class="card">
        <div class="toolbar">
          <div><h3>שעות קבועות</h3><p class="hint" style="margin:0">חוזרות כל שבוע. שעת סיום מוקדמת משעת ההתחלה = השידור נגמר אחרי חצות.</p></div>
          <div class="grow"></div>
          <button class="btn sm" data-act="sort" data-list="weekly">⇅ מיון</button>
          <button class="btn primary sm" data-act="add" data-list="weekly">＋ שעה קבועה</button>
        </div>
        <div class="rows">
          ${draft.weekly.length ? draft.weekly.map((w, i) => `
            <div class="row row-weekly ${w.enabled === false ? "off" : ""} ${errs.has("weekly." + i) ? "err" : ""}">
              ${toggle(`weekly.${i}.enabled`, "")}
              <label class="f">יום${daySelect(`weekly.${i}.day`, w.day)}</label>
              ${field(`weekly.${i}.start`, "התחלה", { type: "time" })}
              ${field(`weekly.${i}.end`, "סיום", { type: "time" })}
              ${field(`weekly.${i}.name`, "שם (לא חובה)", { ph: draft.defaults.showName, cls: "wide" })}
              ${field(`weekly.${i}.url`, "קישור (לא חובה)", { type: "url", ph: "ברירת מחדל", cls: "wide" })}
              ${field(`weekly.${i}.label`, "הערה לצופים", { ph: "למשל: עונה חדשה", cls: "wide" })}
              <div class="acts">
                <button class="btn icon sm" title="ביטול השידור הקרוב" data-act="cancelNext" data-i="${i}">⊘</button>
                <button class="btn icon sm" title="שכפול" data-act="dup" data-list="weekly" data-i="${i}">⧉</button>
                <button class="btn icon sm danger" title="מחיקה" data-act="del" data-list="weekly" data-i="${i}">🗑</button>
              </div>
            </div>`).join("") : `<div class="empty">אין שעות קבועות. לחצו "＋ שעה קבועה" כדי להוסיף.</div>`}
        </div>
      </div>`;
  },

  specials(errs) {
    const t = todayKey(Date.now());
    const past = draft.specials.filter(s => s.date < t).length;
    return `
      <div class="card">
        <div class="toolbar">
          <div><h3>תאריכים מיוחדים</h3><p class="hint" style="margin:0">שידורים חד-פעמיים, בנוסף לשעות הקבועות. פועלים גם בתאריך מבוטל.</p></div>
          <div class="grow"></div>
          ${past ? `<button class="btn sm" data-act="purgePast" data-list="specials">ניקוי ${past} שעברו</button>` : ""}
          <button class="btn sm" data-act="sort" data-list="specials">⇅ מיון לפי תאריך</button>
          <button class="btn primary sm" data-act="add" data-list="specials">＋ תאריך מיוחד</button>
        </div>
        <div class="rows">
          ${draft.specials.length ? draft.specials.map((s, i) => `
            <div class="row row-special ${s.enabled === false ? "off" : ""} ${errs.has("specials." + i) ? "err" : ""}">
              ${s.date < t ? `<span class="past">עבר</span>` : ""}
              ${toggle(`specials.${i}.enabled`, "")}
              ${field(`specials.${i}.date`, "תאריך", { type: "date" })}
              ${field(`specials.${i}.start`, "התחלה", { type: "time" })}
              ${field(`specials.${i}.end`, "סיום", { type: "time" })}
              ${field(`specials.${i}.name`, "שם (לא חובה)", { ph: draft.defaults.showName, cls: "wide" })}
              ${field(`specials.${i}.url`, "קישור (לא חובה)", { type: "url", ph: "ברירת מחדל", cls: "wide" })}
              ${field(`specials.${i}.label`, "הערה לצופים", { ph: "למשל: פרק מיוחד", cls: "wide" })}
              <div class="acts">
                <button class="btn icon sm" title="שכפול" data-act="dup" data-list="specials" data-i="${i}">⧉</button>
                <button class="btn icon sm danger" title="מחיקה" data-act="del" data-list="specials" data-i="${i}">🗑</button>
              </div>
            </div>`).join("") : `<div class="empty">אין תאריכים מיוחדים.</div>`}
        </div>
      </div>`;
  },

  cancelled(errs) {
    const t = todayKey(Date.now());
    const past = draft.cancelled.filter(s => s.date < t).length;
    return `
      <div class="card">
        <div class="toolbar">
          <div><h3>ביטול שידור קבוע</h3><p class="hint" style="margin:0">בתאריכים האלה השעות הקבועות לא יפעלו (תאריך מיוחד באותו יום כן יפעל).</p></div>
          <div class="grow"></div>
          ${past ? `<button class="btn sm" data-act="purgePast" data-list="cancelled">ניקוי ${past} שעברו</button>` : ""}
          <button class="btn sm" data-act="sort" data-list="cancelled">⇅ מיון</button>
          <button class="btn primary sm" data-act="add" data-list="cancelled">＋ תאריך לביטול</button>
        </div>
        <div class="rows">
          ${draft.cancelled.length ? draft.cancelled.map((c, i) => `
            <div class="row row-cancel ${errs.has("cancelled." + i) ? "err" : ""}">
              ${c.date < t ? `<span class="past">עבר</span>` : ""}
              ${field(`cancelled.${i}.date`, "תאריך", { type: "date" })}
              ${field(`cancelled.${i}.note`, "סיבה (פנימי, לא מוצג)", { ph: "למשל: חג" })}
              <div class="acts"><button class="btn icon sm danger" title="מחיקה" data-act="del" data-list="cancelled" data-i="${i}">🗑</button></div>
            </div>`).join("") : `<div class="empty">אין ביטולים.</div>`}
        </div>
      </div>`;
  },

  texts() {
    const T = k => `texts.${k}`;
    return `
      <div class="card">
        <div class="toolbar"><div><h3>טקסטים בדף</h3><p class="hint" style="margin:0">כל מה שהצופים רואים. ריק = לא מוצג.</p></div><div class="grow"></div>
          <button class="btn sm" data-act="resetSection" data-s="texts">איפוס</button></div>
        <div class="grid g2">
          ${field(T("pageTitle"), "כותרת הלשונית בדפדפן")}
          ${field(T("loading"), "טעינה")}
        </div>
      </div>
      <div class="card">
        <h3>לפני השידור</h3>
        <div class="grid g3" style="margin-top:12px">
          ${field(T("notStartedTitle"), "כותרת")}
          ${field(T("notStartedLead"), "שורת פתיחה")}
          ${field(T("countdownLead"), "מעל הספירה לאחור")}
        </div>
      </div>
      <div class="card">
        <h3>בזמן שידור</h3>
        <div class="grid g2" style="margin-top:12px">
          ${field(T("alreadyLiveTitle"), "כותרת - נכנס באמצע שידור")}
          ${field(T("alreadyLiveMsg"), "הודעה - נכנס באמצע שידור")}
          ${field(T("startingTitle"), "כותרת - השידור מתחיל כשהדף פתוח")}
          ${field(T("startingMsg"), "הודעה - השידור מתחיל כשהדף פתוח")}
          ${field(T("redirectBtn"), "טקסט כפתור המעבר")}
        </div>
      </div>
      <div class="card">
        <h3>אחרי השידור / אין שידור / מושבת</h3>
        <div class="grid g2" style="margin-top:12px">
          ${field(T("endedTitle"), "כותרת - השידור הסתיים")}
          ${field(T("endedLead"), "שורת פתיחה - השידור הסתיים")}
          ${field(T("noneTitle"), "כותרת - אין שידורים קרובים")}
          ${field(T("noneText"), "טקסט - אין שידורים קרובים")}
          ${field(T("offTitle"), "כותרת - מושבת")}
          ${field(T("offText"), "טקסט - מושבת")}
        </div>
      </div>
      <div class="card">
        <h3>כותרת תחתונה</h3>
        <div class="grid" style="margin-top:12px">${area(T("footer"), "טקסט קטן בתחתית הכרטיס", { rows: 2 })}</div>
      </div>`;
  },

  design() {
    const d = draft.design;
    const colors = [["bg", "רקע"], ["bg2", "רקע משני (הדרגה)"], ["card", "כרטיס"], ["text", "טקסט"], ["muted", "טקסט משני"], ["accent", "צבע הדגשה"]];
    const states = [["", "לפי הלוח"], ["before", "לפני"], ["live", "בשידור"], ["ended", "הסתיים"], ["none", "אין שידור"], ["off", "מושבת"]];
    return `
      <div class="design-wrap">
        <div>
          <div class="card">
            <div class="toolbar"><h3 style="margin:0">ערכות עיצוב</h3><div class="grow"></div>
              <button class="btn sm" data-act="resetSection" data-s="design">איפוס עיצוב</button></div>
            <div class="presets">
              ${Object.entries(PRESETS).map(([id, p]) => `
                <button class="preset ${d.preset === id ? "on" : ""}" data-act="preset" data-p="${id}">
                  <div class="sw-prev" style="background:linear-gradient(135deg,${p.bg},${p.bg2})"><i style="background:${p.card};color:${p.accent}"></i></div>
                  <span>${p.label}</span>
                </button>`).join("")}
            </div>
          </div>

          <div class="card">
            <h3>צבעים</h3>
            <p class="hint">שינוי צבע הופך את הערכה ל"מותאמת אישית".</p>
            <div class="colors">
              ${colors.map(([k, l]) => `
                <div class="color">
                  <input type="color" data-k="design.${k}" value="${esc(d[k])}">
                  <div><small>${l}</small><input class="hex" data-k="design.${k}" value="${esc(d[k])}" maxlength="7"></div>
                </div>`).join("")}
            </div>
            <div class="toggles" style="margin-top:16px">
              ${toggle("design.gradient", "רקע בהדרגה")}
              ${toggle("design.glass", "כרטיס זכוכית (שקוף מטושטש)")}
              ${toggle("design.shadow", "צל לכרטיס")}
            </div>
          </div>

          <div class="card">
            <h3>טיפוגרפיה ומבנה</h3>
            <div class="grid g2" style="margin-top:12px">
              <label class="f">גופן
                <select class="in" data-k="design.font">${FONTS.map(f => `<option value="${f.id}" ${d.font === f.id ? "selected" : ""}>${f.label}</option>`).join("")}</select></label>
              <label class="f">אנימציית כניסה
                <select class="in" data-k="design.animation">
                  ${[["none", "ללא"], ["fade", "הופעה הדרגתית"], ["rise", "עלייה"], ["zoom", "התקרבות"]].map(([v, l]) => `<option value="${v}" ${d.animation === v ? "selected" : ""}>${l}</option>`).join("")}
                </select></label>
              ${range("design.titleSize", "גודל כותרת", { min: 20, max: 56, unit: "px" })}
              ${range("design.radius", "עיגול פינות", { min: 0, max: 40, unit: "px" })}
              ${range("design.cardWidth", "רוחב כרטיס", { min: 320, max: 760, step: 10, unit: "px" })}
            </div>
          </div>

          <div class="card">
            <h3>תמונות</h3>
            <div class="grid g2" style="margin-top:12px">
              ${field("design.bgImage", "תמונת רקע (קישור)", { type: "url", ph: "https://...jpg" })}
              ${range("design.bgOverlay", "כהות מעל התמונה", { min: 0, max: 1, step: 0.05 })}
              ${field("design.logoUrl", "לוגו (קישור)", { type: "url", ph: "https://...png" })}
              ${range("design.logoSize", "גודל לוגו", { min: 32, max: 200, unit: "px" })}
            </div>
          </div>

          <div class="card">
            <h3>מה להציג</h3>
            <div class="toggles" style="margin-top:12px">
              ${toggle("design.showCountdown", "ספירה לאחור")}
              ${toggle("design.showSpinner", "סמל טעינה לפני מעבר")}
              ${toggle("design.showButton", "כפתור מעבר ידני לשידור")}
              ${toggle("design.showName", "שם התוכנית")}
              ${toggle("design.showDate", "תאריך השידור הבא")}
            </div>
          </div>

          <div class="card">
            <h3>CSS מותאם אישית</h3>
            <p class="hint">למתקדמים. לדוגמה: <code>.card { border: 2px solid var(--accent) }</code></p>
            ${area("design.customCss", "", { rows: 5, rtl: false, ph: "/* CSS */" })}
          </div>
        </div>

        <div class="preview-col">
          <div class="toolbar" style="justify-content:center">
            <div class="seg">${states.map(([s, l]) => `<button data-act="pstate" data-s="${s}" class="${previewState === s ? "on" : ""}">${l}</button>`).join("")}</div>
          </div>
          <div class="phone"><iframe id="preview" src="../kupa-rashit/?preview=1" title="תצוגה מקדימה"></iframe></div>
          <p class="hint" style="text-align:center;margin-top:10px">תצוגה חיה של הטיוטה. הצופים יראו רק אחרי שמירה.</p>
        </div>
      </div>`;
  },

  advanced() {
    return `
      <div class="card">
        <h3>תזמון והעברה</h3>
        <p class="hint">איך ומתי הדף מעביר את הצופים לשידור.</p>
        <div class="grid g3">
          ${num("advanced.joinDelaySec", "השהיה לפני העברה - נכנס באמצע שידור", { max: 60, unit: "שניות" })}
          ${num("advanced.startDelaySec", "השהיה לפני העברה - השידור מתחיל כשהדף פתוח", { max: 60, unit: "שניות" })}
          ${num("advanced.earlyMinutes", "להעביר לפני שעת ההתחלה", { max: 120, unit: "דקות" })}
          ${num("advanced.lookaheadDays", "כמה ימים קדימה לחפש שידור", { min: 1, max: 120, unit: "ימים" })}
        </div>
        <div class="toggles" style="margin-top:18px">
          ${toggle("advanced.autoRedirect", "העברה אוטומטית (כבוי = רק כפתור מעבר)")}
          ${toggle("advanced.useServerTime", "שעון מדויק מהאינטרנט (במקום שעון המכשיר)")}
        </div>
      </div>

      <div class="card">
        <h3>פרויקט Firebase</h3>
        <p class="hint">פרויקט אחד משותף לכל המאגר. כל תיקייה שומרת את ההגדרות שלה במסמך משלה.</p>
        <div class="list">
          <div class="li"><span class="when">מזהה פרויקט</span><code class="ltr">${firebaseConfig.projectId}</code>
            <button class="btn ghost sm" data-act="copy" data-v="${firebaseConfig.projectId}">העתקה</button></div>
          <div class="li"><span class="when">מסמך ההגדרות</span><code class="ltr">sites/${SITE_ID}</code></div>
          <div class="li"><span class="when">מנהל מורשה</span><code class="ltr">${ADMIN_EMAIL}</code></div>
          <div class="li"><span class="when">קונסולה</span>
            <a target="_blank" rel="noopener" href="https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/data/~2Fsites~2F${SITE_ID}">פתיחה ב-Firebase ↗</a></div>
        </div>
      </div>

      <div class="card" style="border-color:color-mix(in srgb,var(--bad) 35%,var(--line))">
        <h3>אזור מסוכן</h3>
        <p class="hint">איפוס כל ההגדרות לברירת המחדל (אחרי שמירה). גרסאות קודמות נשמרות בהיסטוריה.</p>
        <button class="btn danger" data-act="resetAll">איפוס הכל</button>
      </div>`;
  },

  history() {
    return `
      <div class="card">
        <div class="toolbar">
          <div><h3>גיבוי וייבוא</h3><p class="hint" style="margin:0">כל שמירה נרשמת אוטומטית בהיסטוריה.</p></div>
          <div class="grow"></div>
          <button class="btn sm" data-act="snapshot">＋ גיבוי עכשיו</button>
          <button class="btn sm" data-act="exportJson">⬇ ייצוא JSON</button>
          <button class="btn sm" data-act="importJson">⬆ ייבוא JSON</button>
          <input type="file" id="importFile" accept="application/json,.json" class="hidden">
        </div>
      </div>
      <div class="card">
        <h3>גרסאות קודמות</h3>
        <div class="list hist" id="hist"><div class="empty">טוען...</div></div>
      </div>`;
  }
};

// מעבר בין לשוניות מתוך כפתורים בתוכן
$("view").addEventListener("click", e => {
  const b = e.target.closest("[data-tab-go]");
  if (b) { tab = b.dataset.tabGo; history.replaceState(null, "", "#" + tab); renderNav(); renderView(); }
});

// ייבוא
$("view").addEventListener("change", async e => {
  if (e.target.id !== "importFile") return;
  const f = e.target.files[0]; if (!f) return;
  try {
    draft = mergeConfig(JSON.parse(await f.text()));
    tab = "overview"; render();
    toast("הקובץ יובא לעריכה. לחצו שמירה כדי להחיל.", "ok");
  } catch (err) { toast("קובץ לא תקין", "bad"); }
});

// ---------- סקירה (מתעדכן כל שנייה) ----------
function renderOverviewLive() {
  const hero = $("hero"); if (!hero) return;
  const now = Date.now();
  const st = getStatus(saved, now);
  const labels = { live: "משדר עכשיו", before: "ממתין לשידור הבא", ended: "השידור של היום הסתיים", none: "אין שידורים קרובים", off: "הדף מושבת" };
  const cls = { live: "live", before: "before", ended: "before", none: "", off: "off" }[st.state];
  const n = st.next;
  hero.innerHTML = `
    <span class="pulse ${cls}"></span>
    <div>
      <div class="big">${labels[st.state]}${st.forced ? " (ידני)" : ""}</div>
      <div style="color:var(--muted)">${n && !n.forced ? `${esc(n.name)} · ${windowDateText(n)} · <span dir="ltr">${n.startText}–${n.endText}</span>${n.label ? " · " + esc(n.label) : ""}` : st.forced ? esc(n.url) : ""}</div>
    </div>
    ${n && !n.forced && st.state !== "live" ? `<div class="cd" title="עד השידור הבא">${formatCountdown(n.openAt - now)}</div>` : ""}
    ${isDirty() ? `<span class="tag" style="width:100%;text-align:center">הסטטוס מחושב לפי ההגדרות השמורות. יש שינויים שעוד לא נשמרו.</span>` : ""}`;

  const ws = buildWindows(draft, now).filter(w => w.end > now);
  const weekCount = ws.filter(w => w.start < now + 7 * 864e5).length;
  $("stats").innerHTML = `
    <div class="stat"><small>שעות קבועות פעילות</small><b>${draft.weekly.filter(w => w.enabled !== false).length}</b></div>
    <div class="stat"><small>תאריכים מיוחדים קרובים</small><b>${draft.specials.filter(s => s.enabled !== false && s.date >= todayKey(now)).length}</b></div>
    <div class="stat"><small>שידורים ב-7 הימים הקרובים</small><b>${weekCount}</b></div>
    <div class="stat"><small>ביטולים עתידיים</small><b>${draft.cancelled.filter(c => c.date >= todayKey(now)).length}</b></div>`;

  if (!renderOverviewLive.static || renderOverviewLive.static !== JSON.stringify(draft) + todayKey(now)) {
    renderOverviewLive.static = JSON.stringify(draft) + todayKey(now);
    const all = buildWindows(draft, now);
    const p = israelParts(now);
    const cancelled = new Set(draft.cancelled.map(c => c.date));
    let cal = "";
    for (let i = 0; i < 14; i++) {
      const dd = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
      const k = dateKey(dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate());
      const items = all.filter(w => w.date === k);
      cal += `<div class="day ${i === 0 ? "today" : ""} ${cancelled.has(k) ? "cancel" : ""}" title="${cancelled.has(k) ? "שידור קבוע מבוטל" : ""}">
        <div class="dh"><span>${DAY_NAMES[dd.getUTCDay()]}</span><b>${dd.getUTCDate()}/${dd.getUTCMonth() + 1}</b></div>
        ${items.map(w => `<span class="chip ${w.kind}" title="${esc(w.name)} ${w.label ? "· " + esc(w.label) : ""}">${w.startText} ${esc(w.name)}</span>`).join("")}
      </div>`;
    }
    $("cal").innerHTML = cal;
    const up = ws.slice(0, 6);
    $("upcoming").innerHTML = up.length ? up.map(w => `
      <div class="li">
        <span class="when">${pad2(w.d)}/${pad2(w.mo)} · <span dir="ltr">${w.startText}–${w.endText}</span></span>
        <span style="flex:1;min-width:0">${esc(w.name)}${w.label ? ` <span style="color:var(--muted)">· ${esc(w.label)}</span>` : ""}</span>
        <span class="tag ${w.kind}">${w.kind === "special" ? "מיוחד" : "קבוע"}</span>
      </div>`).join("") : `<div class="empty">אין שידורים מתוכננים</div>`;
  }
}
setInterval(() => { if (user && tab === "overview") renderOverviewLive(); }, 1000);

// ---------- תצוגה מקדימה ----------
function setupPreview() {
  const f = $("preview");
  f.onload = pushPreview;
}
addEventListener("message", e => { if (e.data?.type === "kr-preview-ready") pushPreview(); });
let previewTimer = null;
function pushPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const f = $("preview");
    if (f?.contentWindow) f.contentWindow.postMessage({ type: "kr-preview", config: clean(draft), state: previewState || null }, "*");
  }, 80);
}

// ---------- היסטוריה ----------
let histCache = [];
async function loadHistory() {
  const el = $("hist"); if (!el) return;
  try {
    const snap = await getDocs(query(histRef, orderBy("savedAt", "desc"), limit(40)));
    histCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    el.innerHTML = histCache.length ? histCache.map(h => `
      <div class="li">
        <span class="when">${fmtStamp(h.savedAt?.toDate?.())}</span>
        <span style="flex:1;min-width:0;color:var(--muted)">${esc(h.note || "שמירה")} · ${(h.config?.weekly || []).length} קבועים · ${(h.config?.specials || []).length} מיוחדים</span>
        <button class="btn sm" data-act="restore" data-id="${h.id}">שחזור</button>
        <button class="btn icon sm danger" data-act="delHist" data-id="${h.id}" title="מחיקה">🗑</button>
      </div>`).join("") : `<div class="empty">עדיין אין גרסאות שמורות.</div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty">שגיאה בטעינת ההיסטוריה (${esc(e.code)})</div>`;
  }
}

// =====================================================================
//  כללי: התראות, ערכת צבעים, תפריט נייד
// =====================================================================
function toast(msg, type = "") {
  const t = document.createElement("div");
  t.className = "toast " + type; t.textContent = msg;
  $("toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = ".3s"; }, 3800);
  setTimeout(() => t.remove(), 4200);
}

$("themeBtn").onclick = () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("adm-theme", t); } catch (e) {}
};

function renderAccents() {
  const cur = getComputedStyle(document.documentElement).getPropertyValue("--a").trim();
  $("accentPick").innerHTML = ACCENTS.map(c => `<button style="background:${c}" data-c="${c}" class="${c === cur ? "on" : ""}" aria-label="${c}"></button>`).join("");
  $("accentPick").querySelectorAll("button").forEach(b => b.onclick = () => {
    document.documentElement.style.setProperty("--a", b.dataset.c);
    try { localStorage.setItem("adm-accent", b.dataset.c); } catch (e) {}
    renderAccents();
  });
}
renderAccents();

function closeMenu() { $("side").classList.remove("open"); $("scrim").className = "hidden"; }
$("menuBtn").onclick = () => { $("side").classList.add("open"); $("scrim").className = "scrim"; };
$("scrim").onclick = closeMenu;
