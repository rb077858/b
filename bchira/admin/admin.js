// =====================================================================
//  שותפים לחדר - ממשק ניהול (כניסה עם Google, רק rb077858@gmail.com)
//  קישור הזמנה, הכרעת סתירות, עריכת אנשים ותשובות, מיזוג כפילויות, חסימת משתמשים.
//  שום דבר לא נמחק: מיזוג מסמן, חסימה מסמנת.
// =====================================================================
import * as D from "../data.js";
import { QS, NQ, norm, cleanName, fullName, initial, duplicateGroups, qById } from "../core.js";

const $app = document.getElementById("app");
const $ = s => $app.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ROW = 60;

const S = {
  phase: "boot", user: null, tab: "over",
  people: [], users: [], cfg: null,
  pages: { ppl: 0, usr: 0, mrg: 0, dup: 0 },
  pSearch: "", uSearch: "", mSearch: "",
  edit: null,        // { pid, qi, mode: 'q' | 'merge' }
  cf: { i: 0, key: "", claims: null },
  modal: null, confirm: "", busy: "", toast: "", err: ""
};

let unsub = null;
const personById = id => S.people.find(p => p.id === id);
const userByUid = uid => S.users.find(u => u.id === uid);
const live = () => S.people.filter(p => !p.merged);
const conflicts = () => live().flatMap(p => Object.keys(p.conf || {}).map(qid => ({ pid: p.id, qid }))).sort((a, b) => String(personById(a.pid).name).localeCompare(String(personById(b.pid).name), "he") || QS.findIndex(q => q.id === a.qid) - QS.findIndex(q => q.id === b.qid));

let tt = null;
function toast(m) {
  S.toast = m; renderToast();
  clearTimeout(tt); tt = setTimeout(() => { S.toast = ""; renderToast(); }, 2600);
}
function renderToast() {
  let t = $(".toast");
  if (!S.toast) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement("div"); t.className = "toast"; $app.appendChild(t); }
  t.textContent = S.toast;
}

// ---------- כניסה ----------
D.watchAuth(async u => {
  S.modal = null; S.edit = null;
  if (!u) { S.user = null; if (unsub) unsub(); S.phase = "login"; render(); return; }
  S.user = u;
  if (!D.isAdminUser(u)) { S.phase = "denied"; render(); return; }
  S.phase = "boot"; render();
  try {
    S.cfg = await D.ensureConfig();
    S.users = await D.listUsers();
    if (unsub) unsub();
    unsub = D.watchPeople(list => { S.people = list; soft(); }, e => toast(D.authError(e)));
    S.phase = "home"; render();
  } catch (e) {
    S.err = e && e.code === "permission-denied" ? "חוקי האבטחה החדשים עוד לא נפרסו. הרץ: npx firebase-tools deploy --only firestore:rules" : D.authError(e);
    S.phase = "error"; render();
  }
}, e => { S.err = D.authError(e); render(); });

// ---------- כלים ----------
function paged(listEl, pagerEl, items, key, rowFn, emptyHtml) {
  if (!listEl) return;
  if (!items.length) { listEl.innerHTML = emptyHtml || ""; pagerEl.innerHTML = ""; return; }
  const ps = Math.max(2, Math.floor((listEl.clientHeight + 4) / ROW));
  const pages = Math.max(1, Math.ceil(items.length / ps));
  const pg = Math.min(S.pages[key] || 0, pages - 1);
  S.pages[key] = pg;
  listEl.innerHTML = items.slice(pg * ps, pg * ps + ps).map(rowFn).join("");
  pagerEl.innerHTML = pages > 1
    ? `<button data-act="pg" data-k="${key}" data-d="-1"${pg <= 0 ? " disabled" : ""} aria-label="הקודם"><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button><span class="num">עמוד ${pg + 1} מתוך ${pages}</span><button data-act="pg" data-k="${key}" data-d="1"${pg >= pages - 1 ? " disabled" : ""} aria-label="הבא"><svg class="chev flip" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>` : "";
}
const center = h => `<div class="center">${h}</div>`;
const inviteLink = () => new URL("../?i=" + encodeURIComponent(S.cfg.code), location.href).href;
const emptyMsg = t => `<div class="center"><p class="muted" style="text-align:center">${t}</p></div>`;

// ---------- תצוגות ----------
function header() {
  return `<header class="hdr"><div class="brand">ניהול</div>${S.user ? `<div class="who"><span>${esc(S.user.email || "")}</span><button class="ico" data-act="logout" aria-label="יציאה" title="יציאה">&#10006;</button></div>` : ""}</header>`;
}
function nav() {
  const nc = conflicts().length;
  const t = [["over", "סקירה", ""], ["conf", "סתירות", nc ? String(nc) : "0"], ["ppl", "אנשים", String(live().length)], ["usr", "משתמשים", String(S.users.length)]];
  return `<nav class="nav n4">${t.map(x => `<button data-act="tab" data-id="${x[0]}"${S.tab === x[0] ? ' aria-current="page"' : ""}><b>${x[1]}</b><small class="num">${x[2] || "&nbsp;"}</small></button>`).join("")}</nav>`;
}

function viewOver() {
  const dups = duplicateGroups(S.people).length;
  return `<div class="stack">
    <div class="stats"><div class="stat"><b class="num">${S.users.length}</b><span>משתמשים</span></div><div class="stat"><b class="num">${live().length}</b><span>אנשים</span></div><div class="stat"><b class="num">${conflicts().length}</b><span>סתירות פתוחות</span></div></div>
    <div class="card stack" style="gap:8px"><b>קישור לשליחה לשכבה</b>
      <div class="inp linkbox" id="lnk">${esc(inviteLink())}</div>
      <div class="rowbtns"><button class="btn" data-act="copylink">העתק קישור</button><button class="btn ghost" data-act="newcode">${S.confirm === "newcode" ? "בטוח? הקישור הישן יפסיק לעבוד" : "קישור חדש"}</button></div>
      <div class="switch"><span>הרשמה פתוחה${S.cfg.open ? "" : ' <span class="pill b1">סגורה</span>'}</span><button class="btn sm ${S.cfg.open ? "ghost" : ""}" data-act="toggleopen">${S.cfg.open ? "סגור הרשמה" : "פתח הרשמה"}</button></div>
    </div>
    <div class="rowbtns"><button class="btn ghost" data-act="recompute"${S.busy ? " disabled" : ""}>${S.busy || "חישוב מחדש לכולם"}</button>${dups ? `<button class="btn ghost" data-act="dups">${dups} כפילויות אפשריות</button>` : ""}</div>
  </div>`;
}

function viewConf() {
  const list = conflicts();
  if (!list.length) return emptyMsg("אין סתירות פתוחות.");
  S.cf.i = Math.min(S.cf.i, list.length - 1);
  const c = list[S.cf.i], p = personById(c.pid), q = qById(c.qid), key = c.pid + "|" + c.qid;
  if (S.cf.key !== key) { S.cf.key = key; S.cf.claims = null; D.claimsFor(c.pid).then(cl => { if (S.cf.key === key) { S.cf.claims = cl; soft(); } }).catch(e => toast(D.authError(e))); }
  const cl = (S.cf.claims || []).filter(x => x.qid === c.qid && !x.ignored);
  const byAuthor = new Map(); cl.forEach(x => { const o = byAuthor.get(x.author); if (!o || x.t >= o.t) byAuthor.set(x.author, x); });
  const rows = [...byAuthor.values()].sort((a, b) => a.t - b.t);
  const votes = q.o.map((_, i) => rows.filter(r => r.v === i).length);
  const who = r => { const u = userByUid(r.author); return esc(u ? fullName(u.first, u.last) : "משתמש לא מוכר") + (r.self ? " (על עצמו)" : ""); };
  const cur = (p.eff || {})[c.qid];
  return `<div class="top"><h2>${esc(p.name)}</h2><span class="muted sm num">${S.cf.i + 1} מתוך ${list.length}</span></div>
    <p class="sub2">${q.s}. ${q.t.replace("אתה", "הוא")}</p>
    <div class="cl" style="margin:8px 0">${S.cf.claims ? rows.map(r => `<div><span>${who(r)}</span><b>${esc(q.o[r.v])}</b></div>`).join("") || "<div><span>אין טענות פעילות</span></div>" : '<div><span class="muted">טוען...</span></div>'}</div>
    <p class="muted sm">כרגע בשימוש: ${cur != null ? esc(q.o[cur]) : "אין"}. בחר את התשובה הנכונה:</p>
    <div class="opts" style="margin-top:6px">${q.o.map((o, i) => `<button class="opt" data-act="resolve" data-i="${i}" aria-pressed="${cur === i}"><span class="rd"></span><span>${esc(o)}</span><span class="vote">${votes[i] ? votes[i] + " טענות" : ""}</span></button>`).join("")}</div>
    <div class="fnav" style="margin-top:8px"><button class="btn ghost sm" data-act="cf" data-d="-1"${S.cf.i <= 0 ? " disabled" : ""}>הקודמת</button><button class="btn ghost sm" data-act="cf" data-d="1"${S.cf.i >= list.length - 1 ? " disabled" : ""}>הבאה</button></div>`;
}

function viewPeople() {
  if (S.edit && S.edit.mode === "q") return viewEdit();
  if (S.edit && S.edit.mode === "merge") {
    return `<div class="top" style="gap:8px"><button class="link" data-act="edit-back">חזרה</button><b>מזג את ${esc((personById(S.edit.pid) || {}).name)} לתוך:</b></div>
      <input id="msrch" class="inp" placeholder="חיפוש שם" autocomplete="off" value="${esc(S.mSearch)}" style="margin-bottom:8px">
      <div class="list" id="mrgl"></div><div class="pager" id="mrgp"></div>`;
  }
  if (S.edit && S.edit.mode === "dups") {
    return `<div class="top"><button class="link" data-act="edit-back">חזרה</button><b>כפילויות אפשריות</b></div><div class="list" id="dupl"></div><div class="pager" id="dupp"></div>`;
  }
  return `<div class="top"><input id="psrch" class="inp" style="flex:1" placeholder="חיפוש שם" autocomplete="off" value="${esc(S.pSearch)}" aria-label="חיפוש"></div>
    <div class="list" id="pl"></div><div class="pager" id="pp"></div>`;
}
function viewEdit() {
  const p = personById(S.edit.pid); if (!p) return emptyMsg("האדם לא נמצא.");
  const q = QS[S.edit.qi], cur = (p.eff || {})[q.id], conf = (p.conf || {})[q.id];
  const dots = QS.map((x, i) => `<button class="dot ${i === S.edit.qi ? "cur" : (p.eff || {})[x.id] != null ? "done" : ""}" data-act="eq" data-i="${i}" aria-label="שאלה ${i + 1}"></button>`).join("");
  return `<div class="top" style="margin-bottom:6px"><button class="link" data-act="edit-back">חזרה</button><b>${esc(p.name)}</b><span class="muted sm num">${p.n || 0}/${NQ}</span></div>
    <div class="rowbtns" style="margin-bottom:8px"><button class="btn ghost sm" data-act="rename">שנה שם</button><button class="btn ghost sm" data-act="merge-open">מזג לתוך אדם אחר</button></div>
    <div class="dots">${dots}</div>
    <p class="sub2" style="margin-top:8px">${q.s}${conf ? ' <span class="pill b2">סתירה</span>' : ""}</p>
    <h2 class="q" style="font-size:20px;margin:2px 0 6px">${q.t.replace("אתה", "הוא")}</h2>
    <div class="opts">${q.o.map((o, i) => `<button class="opt" data-act="setans" data-i="${i}" aria-pressed="${cur === i}"><span class="rd"></span><span>${esc(o)}</span></button>`).join("")}</div>`;
}

function viewUsers() {
  return `<div class="top"><input id="usrch" class="inp" style="flex:1" placeholder="חיפוש שם או מייל" autocomplete="off" value="${esc(S.uSearch)}" aria-label="חיפוש"></div>
    <div class="list" id="ul"></div><div class="pager" id="up"></div>`;
}

// ---------- מילוי רשימות ----------
function fillPeople() {
  if (S.edit && S.edit.mode === "merge") {
    const k = norm(S.mSearch);
    const items = live().filter(p => p.id !== S.edit.pid && (!k || norm(p.name).includes(k))).sort((a, b) => String(a.name).localeCompare(String(b.name), "he"));
    paged($("#mrgl"), $("#mrgp"), items, "mrg", p => `<div class="r"><div class="av">${esc(initial(p.name))}</div><div class="nm"><b>${esc(p.name)}</b><span class="sub">${p.n || 0}/${NQ} תשובות</span></div><button class="pk" data-act="merge-pick" data-id="${p.id}">מזג לכאן</button></div>`, emptyMsg("לא נמצא."));
    return;
  }
  if (S.edit && S.edit.mode === "dups") {
    const groups = duplicateGroups(S.people);
    paged($("#dupl"), $("#dupp"), groups, "dup", g => `<div class="r"><div class="nm"><b>${esc(g[0].name)}</b><span class="sub">${g.length} רשומות</span></div><button class="pk" data-act="dup-merge" data-id="${g[0].id}">מזג</button></div>`, emptyMsg("אין כפילויות."));
    return;
  }
  if (S.edit) return;
  const k = norm(S.pSearch);
  const items = live().filter(p => !k || norm(p.name).includes(k)).sort((a, b) => String(a.name).localeCompare(String(b.name), "he"));
  paged($("#pl"), $("#pp"), items, "ppl", p => {
    const nc = Object.keys(p.conf || {}).length;
    return `<div class="r"><div class="av">${esc(initial(p.name))}</div><div class="nm"><b>${esc(p.name)}${nc ? `<span class="pill b2">${nc} סתירות</span>` : ""}</b><span class="sub num">${p.n || 0} מתוך ${NQ} תשובות</span></div><button class="pk" data-act="edit" data-id="${p.id}">ערוך</button></div>`;
  }, emptyMsg("אין אנשים עדיין."));
}
function fillUsers() {
  const k = norm(S.uSearch);
  const items = S.users.filter(u => !k || norm(fullName(u.first, u.last) + " " + u.email).includes(k)).sort((a, b) => String(a.first).localeCompare(String(b.first), "he"));
  paged($("#ul"), $("#up"), items, "usr", u => {
    const isAdm = u.email === D.ADMIN_EMAIL, sure = S.confirm === "blk:" + u.id;
    return `<div class="r"><div class="nm"><b>${esc(fullName(u.first, u.last))}${u.blocked ? '<span class="pill b1">חסום</span>' : ""}</b><span class="sub" dir="ltr" style="text-align:right">${esc(u.email)}</span></div>${isAdm ? "" : `<button class="pk" data-act="block" data-id="${u.id}">${sure ? "בטוח?" : u.blocked ? "שחרר" : "חסום"}</button>`}</div>`;
  }, emptyMsg("אין משתמשים."));
}

function modalHtml() {
  const m = S.modal;
  if (m.kind === "rename") {
    return `<div class="scrim"><form class="modal" data-form="rename"><h2>שינוי שם</h2>
      <div class="field"><label for="rf">שם פרטי</label><input id="rf" class="inp" maxlength="30" value="${esc(m.first)}"></div>
      <div class="field"><label for="rl">שם משפחה</label><input id="rl" class="inp" maxlength="30" value="${esc(m.last)}"></div>
      <div class="err" id="merr"></div><div class="rowbtns"><button type="button" class="btn ghost" data-act="close">ביטול</button><button class="btn" type="submit">שמור</button></div></form></div>`;
  }
  if (m.kind === "confirm") {
    return `<div class="scrim"><div class="modal"><h2>${esc(m.title)}</h2><p class="muted">${m.text}</p><div class="err" id="merr"></div>
      <div class="rowbtns"><button class="btn ghost" data-act="close">ביטול</button><button class="btn" data-act="confirm-yes" id="yes">${esc(m.yes || "אישור")}</button></div></div></div>`;
  }
  return "";
}

// ---------- רינדור ----------
function render() {
  let inner = "";
  switch (S.phase) {
    case "boot": inner = center('<div class="spin"></div>'); break;
    case "login": inner = center(`<div class="card stack" style="width:100%"><h1>ניהול</h1><p class="muted">כניסה עם חשבון Google של המנהל.</p><button class="gbtn" data-act="login">התחברות עם Google</button><div class="err">${esc(S.err)}</div></div>`); break;
    case "denied": inner = center(`<div class="card stack" style="width:100%"><h2>אין הרשאה</h2><p class="muted">החשבון ${esc(S.user && S.user.email)} אינו מנהל.</p><button class="btn ghost" data-act="logout">התנתק</button></div>`); break;
    case "error": inner = center(`<div class="card stack" style="width:100%"><h2>משהו השתבש</h2><p class="muted" dir="auto">${esc(S.err)}</p><button class="btn ghost" data-act="logout">התנתק</button></div>`); break;
    case "home": inner = S.tab === "over" ? viewOver() : S.tab === "conf" ? viewConf() : S.tab === "ppl" ? viewPeople() : viewUsers(); break;
  }
  $app.innerHTML = header() + `<div class="main">${inner}</div>` + (S.phase === "home" ? nav() : "") + (S.modal ? modalHtml() : "");
  if (S.toast) renderToast();
  if (S.phase === "home") { if (S.tab === "ppl") fillPeople(); else if (S.tab === "usr") fillUsers(); }
}
function soft() {
  if (S.phase !== "home" || S.modal) return;
  if (S.tab === "ppl" && !(S.edit && S.edit.mode === "q")) { fillPeople(); const nv = $(".nav"); if (nv) nv.outerHTML = nav(); }
  else if (S.tab === "usr") fillUsers();
  else render();
}

// ---------- פעולות ----------
async function guard(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); } catch (e) { toast(D.authError(e)); }
}
async function refreshUsers() { try { S.users = await D.listUsers(); } catch (e) { toast(D.authError(e)); } }

function doMerge(src, tgt) {
  const s = personById(src), t = personById(tgt);
  S.modal = { kind: "confirm", title: "מיזוג", text: `למזג את <b>${esc(s.name)}</b> לתוך <b>${esc(t.name)}</b>? הטענות וההכרעות עוברות אל ${esc(t.name)}, והרשומה השנייה מוסתרת. שום דבר לא נמחק.`, yes: "מזג", run: async () => { await D.mergePeople(src, tgt); S.edit = null; } };
  render();
}

$app.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const act = b.dataset.act, id = b.dataset.id, i = b.dataset.i != null ? +b.dataset.i : null;
  if (act !== "newcode" && act !== "block") S.confirm = "";
  switch (act) {
    case "login": try { await D.signIn(); } catch (err) { S.err = D.authError(err); render(); } break;
    case "logout": D.logout(); break;
    case "tab": S.tab = id; S.edit = null; S.confirm = ""; if (id === "usr") { await refreshUsers(); } render(); break;
    case "pg": S.pages[b.dataset.k] = Math.max(0, (S.pages[b.dataset.k] || 0) + (b.dataset.d === "1" ? 1 : -1)); soft(); break;
    case "copylink": try { await navigator.clipboard.writeText(inviteLink()); toast("הקישור הועתק"); } catch (err) { const r = document.createRange(); r.selectNodeContents($("#lnk")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("סומן, העתק ידנית"); } break;
    case "newcode":
      if (S.confirm === "newcode") { S.confirm = ""; await guard(async () => { S.cfg.code = await D.newInviteCode(); }, "נוצר קישור חדש"); }
      else S.confirm = "newcode";
      render(); break;
    case "toggleopen": await guard(async () => { await D.setOpen(!S.cfg.open); S.cfg.open = !S.cfg.open; }, S.cfg.open ? "ההרשמה נפתחה" : "ההרשמה נסגרה"); render(); break;
    case "recompute":
      S.busy = "מחשב..."; render();
      await guard(() => D.recomputeAll(S.people, (n, t) => { S.busy = `מחשב ${n} מתוך ${t}`; const bt = $("[data-act=recompute]"); if (bt) bt.textContent = S.busy; }), "החישוב הסתיים");
      S.busy = ""; render(); break;
    case "dups": S.tab = "ppl"; S.edit = { mode: "dups" }; render(); break;
    case "cf": S.cf.i += +b.dataset.d; S.cf.key = ""; render(); break;
    case "resolve": {
      const c = conflicts()[S.cf.i]; if (!c) break;
      await guard(() => D.resolveAnswer(c.pid, c.qid, i), "נשמר"); S.cf.key = ""; render(); break;
    }
    case "edit": S.edit = { pid: id, qi: 0, mode: "q" }; render(); break;
    case "edit-back": S.edit = null; render(); break;
    case "eq": S.edit.qi = i; render(); break;
    case "setans": await guard(() => D.resolveAnswer(S.edit.pid, QS[S.edit.qi].id, i), "נשמר"); render(); break;
    case "rename": { const p = personById(S.edit.pid); S.modal = { kind: "rename", first: p.first || "", last: p.last || "" }; render(); break; }
    case "merge-open": S.edit.mode = "merge"; S.mSearch = ""; S.pages.mrg = 0; render(); break;
    case "merge-pick": doMerge(S.edit.pid, id); break;
    case "dup-merge": {
      const g = duplicateGroups(S.people).find(x => x[0].id === id); if (!g) break;
      const reg = g.find(p => S.users.some(u => u.pid === p.id));
      const keep = reg || [...g].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
      const rest = g.filter(p => p.id !== keep.id);
      S.modal = { kind: "confirm", title: "מיזוג כפילויות", text: `להשאיר את <b>${esc(keep.name)}</b> (${reg ? "יש לו חשבון" : "הרשומה הוותיקה"}) ולמזג אליו ${rest.length} רשומות נוספות?`, yes: "מזג", run: async () => { for (const r of rest) await D.mergePeople(r.id, keep.id); } };
      render(); break;
    }
    case "block": {
      const u = userByUid(id);
      if (S.confirm === "blk:" + id) {
        S.confirm = "";
        await guard(async () => { const n = await D.setBlocked(id, !u.blocked); u.blocked = !u.blocked; toast(u.blocked ? `נחסם. ${n} אנשים חושבו מחדש` : `שוחרר. ${n} אנשים חושבו מחדש`); });
      } else S.confirm = "blk:" + id;
      render(); break;
    }
    case "close": S.modal = null; render(); break;
    case "confirm-yes": {
      const m = S.modal; b.disabled = true;
      try { await m.run(); S.modal = null; toast("בוצע"); render(); }
      catch (err) { b.disabled = false; const er = $("#merr"); if (er) er.textContent = D.authError(err); }
      break;
    }
  }
});
$app.addEventListener("input", e => {
  if (e.target.id === "psrch") { S.pSearch = e.target.value; S.pages.ppl = 0; fillPeople(); }
  else if (e.target.id === "usrch") { S.uSearch = e.target.value; S.pages.usr = 0; fillUsers(); }
  else if (e.target.id === "msrch") { S.mSearch = e.target.value; S.pages.mrg = 0; fillPeople(); }
});
$app.addEventListener("submit", async e => {
  const form = e.target.closest("form"); if (!form) return;
  e.preventDefault();
  if (form.dataset.form === "rename") {
    const f = cleanName($("#rf").value), l = cleanName($("#rl").value);
    if (!f) { $("#merr").textContent = "צריך שם פרטי."; return; }
    try { await D.renamePerson(S.edit.pid, f, l); S.modal = null; toast("נשמר"); render(); }
    catch (err) { $("#merr").textContent = D.authError(err); }
  }
});
window.addEventListener("resize", () => soft());
render();
