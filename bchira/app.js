// =====================================================================
//  שותפים לחדר - האפליקציה למשתמשים (reembir.com/b/bchira)
//  כניסה עם Google, שאלון עצמי, שאילת חברים, דירוג עם מקומות משותפים ובחירה.
//  כל מסך נכנס לגובה המסך. רשימות מדפדפות במקום לגלול.
// =====================================================================
import * as D from "./data.js";
import { QS, NQ, MAXP, norm, cleanName, fullName, initial, rankPeople, band, listText, readImport } from "./core.js";

const $app = document.getElementById("app");
const $ = s => $app.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ROW = 60; // גובה שורה כולל רווח, לחישוב כמה שורות נכנסות בדף

const S = {
  phase: "boot",      // boot | login | invite | blocked | name | home | error
  user: null, me: null, people: [],
  tab: "rank", flow: null, adding: false, search: "",
  pages: { rank: 0, ask: 0 },
  menu: false, modal: null, toast: "", err: "", loaded: false
};

// ---------- קישור הזמנה ----------
try {
  const code = new URLSearchParams(location.search).get("i");
  if (code) { localStorage.setItem("bchira.invite", code); history.replaceState(null, "", location.pathname); }
} catch (e) {}
const getInvite = () => { try { return localStorage.getItem("bchira.invite") || ""; } catch (e) { return ""; } };

// ---------- נתונים ----------
let unsubPeople = null;
const personById = id => S.people.find(p => p.id === id);
const resolvePid = id => { let p = personById(id), n = 0; while (p && p.merged && p.mergedInto && n++ < 4) p = personById(p.mergedInto); return p ? p.id : id; };
const myPerson = () => (S.me ? personById(resolvePid(S.me.pid)) : null);
const others = () => S.people.filter(p => !p.merged && (!S.me || p.id !== resolvePid(S.me.pid)));
const picksList = () => [...new Set((S.me && S.me.picks || []).map(resolvePid))].map(personById).filter(Boolean);

function startPeople() {
  if (unsubPeople) unsubPeople();
  S.loaded = false;
  unsubPeople = D.watchPeople(list => {
    S.people = list;
    if (!S.loaded) { S.loaded = true; render(); } else softRefresh();
  }, e => toast(D.authError(e)));
}
function stopPeople() { if (unsubPeople) unsubPeople(); unsubPeople = null; S.people = []; S.loaded = false; }

let toastTimer = null;
function toast(msg) {
  S.toast = msg; renderToast();
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = ""; renderToast(); }, 2600);
}
function renderToast() {
  let t = $(".toast");
  if (!S.toast) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement("div"); t.className = "toast"; $app.appendChild(t); }
  t.textContent = S.toast;
}

// ---------- התחברות ----------
D.watchAuth(async u => {
  S.menu = false; S.modal = null; S.flow = null;
  if (!u) { S.user = null; S.me = null; stopPeople(); S.phase = "login"; render(); return; }
  S.user = u; S.phase = "boot"; render();
  try {
    const me = await D.getUser(u.uid);
    if (!me) { S.phase = D.isAdminUser(u) || getInvite() ? "name" : "invite"; render(); return; }
    S.me = me;
    if (me.blocked) { S.phase = "blocked"; render(); return; }
    startPeople(); D.touchUser(u.uid).catch(() => {});
    S.phase = "home"; S.tab = "rank"; render();
  } catch (e) {
    S.err = e && e.code === "permission-denied" ? "המערכת עוד לא מוכנה (חוקי האבטחה לא נפרסו). פנה למנהל." : D.authError(e);
    S.phase = "error"; render();
  }
}, e => { S.err = D.authError(e); render(); });

async function doLogin() {
  S.err = ""; const b = $("[data-act=login]"); if (b) b.disabled = true;
  try { await D.signIn(); } catch (e) { S.err = D.authError(e); render(); }
}

async function doRegister(first, last) {
  first = cleanName(first); last = cleanName(last);
  if (first.length < 1 || last.length < 1) return "צריך שם פרטי ושם משפחה.";
  if (first.length > 30 || last.length > 30) return "השם ארוך מדי.";
  try {
    S.me = await D.register({ uid: S.user.uid, email: S.user.email, first, last, code: D.isAdminUser(S.user) ? "" : getInvite() });
  } catch (e) {
    return e && e.code === "permission-denied" ? "ההרשמה סגורה או שקישור ההזמנה אינו תקף. בקש קישור חדש מהמנהל." : D.authError(e);
  }
  startPeople();
  S.phase = "home"; S.tab = "self"; render();
  startFlow(S.me.pid, true, fullName(first, last));
  return "";
}

// ---------- שאלון (עצמי או על חבר) ----------
async function startFlow(pid, self, name) {
  S.flow = { pid, self, name, qi: 0, a: null, busy: true, pending: [], dirty: false, lock: false };
  render();
  const f = S.flow;
  try { f.a = await D.myClaims(pid, S.user.uid); } catch (e) { f.a = {}; toast(D.authError(e)); }
  if (S.flow !== f) return;
  const k = QS.findIndex(q => f.a[q.id] == null);
  f.qi = k < 0 ? 0 : k; f.busy = false; render();
}
function answer(v) {
  const f = S.flow, q = QS[f.qi];
  if (!f || f.busy || f.lock || f.finishing) return;
  f.a[q.id] = v; f.dirty = true; f.lock = true; render();
  f.pending.push(D.saveClaim(f.pid, q.id, v, S.user.uid, S.me.pid).catch(e => { f.err = e; }));
  setTimeout(() => {
    f.lock = false;
    if (S.flow !== f) return;
    if (f.qi < NQ - 1) { f.qi++; render(); } else finishFlow();
  }, 180);
}
async function finishFlow() {
  const f = S.flow; if (!f || f.finishing) return;
  f.finishing = true; render();
  let msg = "נשמר";
  try {
    await Promise.all(f.pending);
    if (f.err) msg = "חלק מהתשובות לא נשמרו: " + D.authError(f.err);
    if (f.dirty) await D.recomputePerson(f.pid);
  } catch (e) { msg = D.authError(e); }
  S.flow = null; S.tab = f.self ? "rank" : "ask"; render(); toast(msg);
}
function toggleWeight() {
  const q = QS[S.flow.qi], w = { ...(S.me.w || {}) };
  if (w[q.id]) delete w[q.id]; else w[q.id] = true;
  S.me.w = w; D.saveMine(S.user.uid, { w }).catch(e => toast(D.authError(e)));
  render();
}

// ---------- בחירה ----------
function togglePick(id) {
  const picks = (S.me.picks || []).map(resolvePid);
  const i = picks.indexOf(id);
  if (i >= 0) picks.splice(i, 1);
  else if (picks.length >= MAXP) { toast(`כבר בחרת ${MAXP}. הסר מישהו כדי להחליף.`); return; }
  else picks.push(id);
  S.me.picks = picks;
  D.saveMine(S.user.uid, { picks }).catch(e => toast(D.authError(e)));
  fillRank();
  const nv = $(".nav"); if (nv) nv.outerHTML = nav();
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("הועתק"); }
  catch (e) { S.modal = { kind: "copy", text }; render(); const t = $("#ctext"); if (t) { t.focus(); t.select(); } }
}

// ---------- תצוגות ----------
const GLOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

function header() {
  const right = S.user && S.phase !== "boot"
    ? `<div class="who"><span>${esc(S.me ? S.me.first : S.user.displayName || "")}</span><button class="ico" data-act="menu" aria-label="תפריט" aria-expanded="${S.menu}">&#8942;</button></div>` : "";
  return `<header class="hdr"><div class="brand">שותפים לחדר</div>${right}</header>`;
}
function nav() {
  const p = myPerson(), n = p ? p.n || 0 : 0;
  const t = [["rank", "דירוג", `${(S.me.picks || []).length}/${MAXP} ברשימה`], ["self", "אני", `${n}/${NQ}`], ["ask", "שאל חבר", ""]];
  return `<nav class="nav">${t.map(x => `<button data-act="tab" data-id="${x[0]}"${S.tab === x[0] ? ' aria-current="page"' : ""}><b>${x[1]}</b><small class="num">${x[2] || "&nbsp;"}</small></button>`).join("")}</nav>`;
}
const center = html => `<div class="center">${html}</div>`;

function viewLogin() {
  return center(`<div class="card stack" style="width:100%">
    <h1>מי איתי בחדר?</h1>
    <p class="muted">עונים על כמה שאלות, ומקבלים דירוג של מי הכי מתאים לך. הכניסה עם חשבון Google.</p>
    <button class="gbtn" data-act="login">${GLOGO} התחברות עם Google</button>
    <div class="err">${esc(S.err)}</div></div>`);
}
function viewMessage(title, text) {
  return center(`<div class="card stack" style="width:100%"><h2>${title}</h2><p class="muted">${text}</p><button class="btn ghost" data-act="logout">התנתק</button></div>`);
}
function viewName() {
  return center(`<form class="card stack" data-form="name" style="width:100%">
    <h2>איך קוראים לך?</h2>
    <p class="muted sm">השם יופיע ברשימה של כל השכבה.</p>
    <div class="field"><label for="fn">שם פרטי</label><input id="fn" class="inp" maxlength="30" autocomplete="given-name"></div>
    <div class="field"><label for="ln">שם משפחה</label><input id="ln" class="inp" maxlength="30" autocomplete="family-name"></div>
    <div class="err" id="nerr"></div>
    <button class="btn" type="submit">המשך</button></form>`);
}

function viewFlow() {
  const f = S.flow;
  if (f.busy || f.finishing) return center('<div class="spin"></div>');
  const q = QS[f.qi], cur = f.a[q.id];
  const who = f.self ? "עליי" : "על " + esc(f.name || (personById(f.pid) || {}).name || "");
  const dots = QS.map((x, i) => `<button class="dot ${i === f.qi ? "cur" : f.a[x.id] != null ? "done" : ""}" data-act="jump" data-i="${i}" aria-label="שאלה ${i + 1}"></button>`).join("");
  const star = f.self ? `<button class="star" data-act="weight" aria-pressed="${!!(S.me.w && S.me.w[q.id])}">חשוב לי</button>` : "<span></span>";
  return `<div class="flow">
    <div class="fnav"><button class="link" data-act="exit">יציאה</button><span class="muted sm num">${who} · ${f.qi + 1} מתוך ${NQ}</span>${star}</div>
    <div class="dots">${dots}</div>
    <p class="sub2">${q.s}. ${f.self ? "בחר את התשובה שמתאימה לך." : "שאל אותו, ובחר את התשובה הכי קרובה למה שענה."}</p>
    <h2 class="q">${q.t}</h2>
    <div class="opts">${q.o.map((o, i) => `<button class="opt" data-act="ans" data-i="${i}" aria-pressed="${cur === i}"><span class="rd"></span><span>${o}</span></button>`).join("")}</div>
    <div class="fnav"><button class="btn ghost sm" data-act="prev"${f.qi === 0 ? " disabled" : ""}>הקודמת</button><button class="btn ghost sm" data-act="next">${f.qi < NQ - 1 ? "דלג" : "סיום"}</button></div>
  </div>`;
}

function viewSelf() {
  const p = myPerson(), n = p ? p.n || 0 : 0, eff = (p && p.eff) || {}, nc = p ? Object.keys(p.conf || {}).length : 0;
  return `<div class="top"><h2>השאלון שלי</h2><span class="muted num">${n}/${NQ}</span></div>
    <div class="chips">${QS.map(q => `<div class="chip ${eff[q.id] != null ? "on" : ""} ${S.me.w && S.me.w[q.id] ? "w" : ""}"><i></i>${q.s}</div>`).join("")}</div>
    ${nc ? `<p class="muted sm" style="margin-top:10px">ב-${nc} שאלות יש תשובות שונות עליך. המנהל יכריע.</p>` : ""}
    <div style="flex:1"></div>
    <button class="btn" data-act="start-self" style="margin-bottom:6px">${n >= NQ ? "ערוך תשובות" : n ? "המשך לענות" : "התחל לענות"}</button>`;
}

function viewRank() {
  const p = myPerson();
  if (!p || !p.n) {
    return center(`<div class="card stack" style="width:100%"><h2>קודם עונים על עצמך</h2><p class="muted">כדי לראות מי מתאים לך, ענה על השאלות.</p><button class="btn" data-act="start-self">התחל לענות</button></div>`);
  }
  return `<div class="top"><h2>מי מתאים לך</h2><span class="muted sm">בחר עד ${MAXP} למדריך</span></div>
    <div class="list" id="rkl"></div><div class="pager" id="rkp"></div><div class="tray" id="tray"></div>`;
}
function trayHtml() {
  const ps = picksList(), beds = [];
  for (let i = 0; i < MAXP; i++) beds.push(ps[i] ? `<div class="bed f" title="${esc(ps[i].name)}">${esc(initial(ps[i].name))}</div>` : '<div class="bed"></div>');
  const t = ps.length ? `ברשימה <b class="num">${ps.length}</b> מתוך ${MAXP}` : `בחר עד ${MAXP}. אפשר גם פחות`;
  return `<div class="beds">${beds.join("")}</div><div class="tcol"><div class="t">${t}</div>${ps.length ? '<button class="btn sm" data-act="copylist">העתק רשימה</button>' : ""}</div>`;
}

function pagerHtml(key, pg, pages) {
  return `<button data-act="pg" data-k="${key}" data-d="-1"${pg <= 0 ? " disabled" : ""} aria-label="הקודם"><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button><span class="num">עמוד ${pg + 1} מתוך ${pages}</span><button data-act="pg" data-k="${key}" data-d="1"${pg >= pages - 1 ? " disabled" : ""} aria-label="הבא"><svg class="chev flip" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>`;
}
// ממלא רשימה בכמה שורות שנכנסות בגובה הפנוי ומציג דפדוף
function paged(listEl, pagerEl, items, key, rowFn, emptyHtml) {
  if (!listEl) return;
  if (!items.length) { listEl.innerHTML = emptyHtml || ""; pagerEl.innerHTML = ""; return; }
  const ps = Math.max(2, Math.floor((listEl.clientHeight + 4) / ROW));
  const pages = Math.max(1, Math.ceil(items.length / ps));
  const pg = Math.min(S.pages[key] || 0, pages - 1);
  S.pages[key] = pg;
  listEl.innerHTML = items.slice(pg * ps, pg * ps + ps).map(rowFn).join("");
  pagerEl.innerHTML = pages > 1 ? pagerHtml(key, pg, pages) : "";
}

function fillRank() {
  const l = $("#rkl"); if (!l) return;
  const p = myPerson(); if (!p) return;
  const picked = new Set(picksList().map(x => x.id)), full = picked.size >= MAXP;
  const rows = rankPeople(p.eff || {}, S.me.w || {}, others());
  paged(l, $("#rkp"), rows, "rank", r => {
    const b = band(r.pct), on = picked.has(r.p.id);
    return `<div class="r"><div class="pl num">${r.place}${r.tied ? '<span class="eq">=</span>' : ""}</div>
      <div class="nm"><b>${esc(r.p.name)}</b><span class="sub">ענו על ${r.n} מתוך ${NQ}</span><i class="bar ${b[1]}"><u style="width:${r.pct}%"></u></i></div>
      <div class="pc num ${b[1]}" dir="ltr">${r.pct}%</div>
      <button class="pk" data-act="pick" data-id="${r.p.id}" aria-pressed="${on}"${!on && full ? ' aria-disabled="true"' : ""}>${on ? "ברשימה" : "בחר"}</button></div>`;
  }, '<div class="center"><p class="muted" style="text-align:center">עוד אין מי שענה והתאים לשאלות שלך.<br>שלח לחברים את הקישור, או שאל אותם בלשונית "שאל חבר".</p></div>');
  const t = $("#tray"); if (t) t.innerHTML = trayHtml();
}

function viewAsk() {
  if (S.adding) {
    return `<form class="card stack" data-form="add"><h2>חבר חדש</h2>
      <p class="muted sm">אם הוא כבר ברשימה, נפתח את השאלות שלו.</p>
      <div class="field"><label for="fn">שם פרטי</label><input id="fn" class="inp" maxlength="30"></div>
      <div class="field"><label for="ln">שם משפחה</label><input id="ln" class="inp" maxlength="30"></div>
      <div class="err" id="nerr"></div>
      <div class="rowbtns"><button class="btn ghost" type="button" data-act="add-cancel">ביטול</button><button class="btn" type="submit">הוסף ושאל</button></div></form>`;
  }
  return `<div class="top" style="gap:8px"><input id="srch" class="inp" style="flex:1" placeholder="חיפוש שם" autocomplete="off" value="${esc(S.search)}" aria-label="חיפוש"><button class="btn sm" data-act="add">הוסף חבר</button></div>
    <div class="list" id="askl"></div><div class="pager" id="askp"></div>`;
}
function fillAsk() {
  const l = $("#askl"); if (!l) return;
  const k = norm(S.search);
  const items = others().filter(p => !k || norm(p.name).includes(k)).sort((a, b) => String(a.name).localeCompare(String(b.name), "he"));
  paged(l, $("#askp"), items, "ask", p => `<div class="r"><div class="av">${esc(initial(p.name))}</div><div class="nm"><b>${esc(p.name)}</b><span class="sub num">${p.n || 0} מתוך ${NQ} שאלות</span></div><button class="pk" data-act="ask" data-id="${p.id}">שאל</button></div>`,
    '<div class="center"><p class="muted" style="text-align:center">לא נמצא. אפשר להוסיף חבר חדש.</p></div>');
}

function menuHtml() {
  const admin = D.isAdminUser(S.user);
  return `<div class="scrim0" data-act="menu"></div><div class="menu" role="menu">
    ${S.phase === "home" ? '<button data-act="import-open">ייבוא מהאתר הישן</button>' : ""}
    ${admin ? '<a href="admin/">ממשק ניהול</a>' : ""}
    <button data-act="logout">התנתק</button></div>`;
}
function modalHtml() {
  const m = S.modal;
  if (m.kind === "import") {
    return `<div class="scrim"><div class="modal"><h2>ייבוא מהאתר הישן</h2>
      <p class="muted sm">הדבק את הקוד שקיבלת באתר הישן. התשובות נכנסות למערכת המשותפת.</p>
      <textarea id="imp" class="inp" placeholder="הדבק כאן" dir="ltr"></textarea>
      <div class="err" id="impmsg"></div>
      <div class="rowbtns"><button class="btn ghost" data-act="close">סגור</button><button class="btn" data-act="doimp" id="impgo">ייבא</button></div></div></div>`;
  }
  if (m.kind === "copy") {
    return `<div class="scrim"><div class="modal"><h2>העתק ידנית</h2><p class="muted sm">ההעתקה האוטומטית נחסמה. העתק את הטקסט:</p>
      <textarea id="ctext" class="inp" readonly style="direction:rtl">${esc(m.text)}</textarea><button class="btn" data-act="close">סגור</button></div></div>`;
  }
  return "";
}

// ---------- רינדור ----------
function render() {
  let inner = "";
  switch (S.phase) {
    case "boot": inner = center('<div class="spin"></div>'); break;
    case "login": inner = viewLogin(); break;
    case "invite": inner = viewMessage("צריך קישור הזמנה", "כדי להצטרף, פתח את הקישור שהמנהל שלח לך."); break;
    case "blocked": inner = viewMessage("החשבון חסום", "פנה למנהל אם זו טעות."); break;
    case "error": inner = viewMessage("משהו השתבש", esc(S.err)); break;
    case "name": inner = viewName(); break;
    case "home":
      if (S.flow) inner = viewFlow();
      else if (!S.loaded) inner = center('<div class="spin"></div>');
      else inner = S.tab === "rank" ? viewRank() : S.tab === "self" ? viewSelf() : viewAsk();
      break;
  }
  const showNav = S.phase === "home" && !S.flow;
  $app.innerHTML = header() + `<div class="main">${inner}</div>` + (showNav ? nav() : "") + (S.menu ? menuHtml() : "") + (S.modal ? modalHtml() : "");
  if (S.toast) renderToast();
  if (S.phase === "home" && !S.flow) { if (S.tab === "rank") fillRank(); else if (S.tab === "ask" && !S.adding) fillAsk(); }
  if (S.modal && S.modal.kind === "import") { const t = $("#imp"); if (t) t.focus(); }
}
function softRefresh() {
  if (S.phase !== "home" || S.flow || S.modal) return;
  if (S.tab === "rank") {
    const p = myPerson();
    if (!!(p && p.n) !== !!$("#rkl")) { render(); return; }
    fillRank(); const nv = $(".nav"); if (nv) nv.outerHTML = nav();
  }
  else if (S.tab === "ask") { if (!S.adding) fillAsk(); }
  else render();
}

// ---------- ייבוא ----------
async function runImport() {
  const msg = $("#impmsg"), go = $("#impgo"), raw = ($("#imp") || {}).value || "";
  const say = (t, ok) => { msg.className = ok ? "ok" : "err"; msg.textContent = t; };
  const r = readImport(raw);
  if (r.bad) return say("הקוד פגום או נחתך. העתק אותו שוב במלואו.");
  if (!r.data) return say("הקוד לא מזוהה. ודא שהעתקת את כולו.");
  go.disabled = true; say("מייבא...", true);
  try {
    const res = await D.importData(r.data, { uid: S.user.uid, me: S.me, people: S.people, onProgress: t => say(t, true) });
    S.me = await D.getUser(S.user.uid);
    const parts = [];
    if (res.created) parts.push(`נוספו ${res.created} חברים`);
    if (res.claims) parts.push(`נשמרו ${res.claims} תשובות`);
    if (res.me) parts.push(`${res.me} מהן שלך`);
    if (res.picks) parts.push(`${res.picks} נוספו לרשימה`);
    say("הייבוא הסתיים. " + (parts.join(", ") || "אין מה לעדכן.") + (res.skipped ? ` (${res.skipped} שמות לא תקינים דולגו)` : ""), true);
    go.textContent = "סגור"; go.dataset.act = "close"; go.disabled = false;
  } catch (e) { say(D.authError(e)); go.disabled = false; }
}

// ---------- אירועים ----------
$app.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const act = b.dataset.act, id = b.dataset.id;
  switch (act) {
    case "login": doLogin(); break;
    case "logout": S.menu = false; D.logout(); break;
    case "menu": S.menu = !S.menu; render(); break;
    case "close": S.modal = null; render(); break;
    case "import-open": S.menu = false; S.modal = { kind: "import" }; render(); break;
    case "doimp": runImport(); break;
    case "tab": S.tab = id; S.adding = false; render(); break;
    case "start-self": startFlow(S.me.pid, true, fullName(S.me.first, S.me.last)); break;
    case "ask": startFlow(id, false, (personById(id) || {}).name); break;
    case "add": S.adding = true; render(); break;
    case "add-cancel": S.adding = false; render(); break;
    case "pg": S.pages[b.dataset.k] = Math.max(0, (S.pages[b.dataset.k] || 0) + (b.dataset.d === "1" ? 1 : -1)); if (b.dataset.k === "rank") fillRank(); else fillAsk(); break;
    case "pick": togglePick(id); break;
    case "copylist": copyText(listText(picksList().map(p => p.name))); break;
    case "ans": answer(+b.dataset.i); break;
    case "jump": if (S.flow && !S.flow.lock) { S.flow.qi = +b.dataset.i; render(); } break;
    case "prev": if (S.flow.qi > 0) { S.flow.qi--; render(); } break;
    case "next": if (S.flow.qi < NQ - 1) { S.flow.qi++; render(); } else finishFlow(); break;
    case "exit": finishFlow(); break;
    case "weight": toggleWeight(); break;
  }
});
$app.addEventListener("input", e => {
  if (e.target.id === "srch") { S.search = e.target.value; S.pages.ask = 0; fillAsk(); }
});
$app.addEventListener("submit", async e => {
  const form = e.target.closest("form"); if (!form) return;
  e.preventDefault();
  const first = $("#fn").value, last = $("#ln").value, nerr = $("#nerr");
  if (form.dataset.form === "name") {
    const msg = await doRegister(first, last);
    if (msg && $("#nerr")) $("#nerr").textContent = msg;
  } else if (form.dataset.form === "add") {
    const name = fullName(first, last);
    if (cleanName(first).length < 1 || cleanName(last).length < 1) { nerr.textContent = "צריך שם פרטי ושם משפחה."; return; }
    const ex = others().find(p => norm(p.name) === norm(name));
    S.adding = false;
    if (ex) { startFlow(ex.id, false, ex.name); return; }
    try {
      const pid = await D.addPerson({ first, last, uid: S.user.uid });
      startFlow(pid, false, name);
    } catch (err) { S.adding = true; render(); toast(D.authError(err)); }
  }
});
$app.addEventListener("keydown", e => { if (e.key === "Escape" && (S.modal || S.menu)) { S.modal = null; S.menu = false; render(); } });
window.addEventListener("resize", () => softRefresh());
document.addEventListener("visibilitychange", () => {
  const f = S.flow;
  if (document.hidden && f && f.dirty && !f.finishing) Promise.all(f.pending).then(() => D.recomputePerson(f.pid)).catch(() => {});
});
render();
