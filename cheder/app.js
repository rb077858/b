// =====================================================================
//  תורנויות חדר - האפליקציה לחדרים (reembir.com/b/cheder/)
//  נכנסים עם Google. רק מי שהאדמין צירף לחדר נכנס, ורואה רק את החדר שלו.
// =====================================================================
import {
  db, FS, $, esc, emailKey, isAdminUser, authError, signIn, watchAuth, logout,
  toggleTheme, toast, sheet, closeSheet, confirmSheet, colorOf, initials, GOOGLE_SVG
} from "./common.js?v=2";
import * as C from "./core.js?v=2";

const { doc, collection, getDoc, setDoc, updateDoc, addDoc, deleteDoc, onSnapshot, query, orderBy, limit, runTransaction, serverTimestamp, deleteField } = FS;

const TABS = [
  { id: "today", label: "היום", ic: "☀️" },
  { id: "week", label: "השבוע", ic: "📅" },
  { id: "duty", label: "תורנות", ic: "📋" },
  { id: "room", label: "החדר", ic: "👥" },
  { id: "more", label: "עוד", ic: "⚙️" }
];

const S = {
  user: null, member: null, room: null,
  roomDoc: null, days: {}, duties: [], gEvents: [], settings: C.mergeSettings(),
  loaded: { room: false, days: false, duties: false, events: false, settings: false },
  tab: TABS.some(t => t.id === location.hash.slice(1)) ? location.hash.slice(1) : "today",
  viewKey: C.dateKey(), weekOffset: 0, unsubs: []
};
const today = () => C.dateKey();
const loadedAll = () => Object.values(S.loaded).every(Boolean);
const roomRef = () => doc(db, "ch_rooms", S.room);
const dayRef = key => doc(db, "ch_rooms", S.room, "days", key);
const residents = () => (S.roomDoc && S.roomDoc.residents) || [];
const active = () => C.activeResidents(residents());
const absences = () => (S.roomDoc && S.roomDoc.absences) || [];
const events = () => [...S.gEvents, ...((S.roomDoc && S.roomDoc.events) || []).map(e => ({ ...e, room: S.room }))];
const nameOf = id => (residents().find(r => r.id === id) || {}).name || "?";
const history = before => Object.values(S.days).filter(d => d.date < before).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
const ctx = key => ({ key, room: S.room, residents: residents(), absences: absences(), duty: C.dutyFor(S.duties, key), history: history(key), settings: S.settings, events: events() });
const fail = e => { console.error(e); toast(authError(e)); };

// =====================================================================
//  התחברות
// =====================================================================
$("loginBtn").innerHTML = `${GOOGLE_SVG} התחברות עם Google`;
$("loginBtn").onclick = async () => { $("loginErr").textContent = ""; try { await signIn(); } catch (e) { $("loginErr").textContent = authError(e); } };
$("logoutBtn2").onclick = () => logout();
$("themeBtn").onclick = () => toggleTheme();
$("meBtn").onclick = () => go("more");

watchAuth(async u => {
  S.unsubs.forEach(f => f()); S.unsubs = [];
  $("boot").classList.add("hidden");
  if (!u) { showLogin(); return; }
  S.user = u;
  let m = null;
  try {
    const snap = await getDoc(doc(db, "ch_members", emailKey(u.email)));
    m = snap.exists() ? snap.data() : null;
  } catch (e) {
    showLogin(e.code === "permission-denied" ? `לחשבון ${u.email} אין גישה. בקשו מהמנהל לצרף אתכם לחדר.` : authError(e), true);
    return;
  }
  if (!m || !m.room) { showLogin(`החשבון ${u.email} לא משויך לאף חדר. בקשו מהמנהל לצרף אתכם.`, true); return; }
  S.member = m; S.room = String(m.room);
  $("login").classList.add("hidden"); $("app").classList.remove("hidden");
  $("roomDot").textContent = S.room;
  $("hdrSub").textContent = `חדר ${S.room}${m.name ? " · " + m.name : ""}`;
  $("meBtn").innerHTML = u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : "👤";
  subscribe();
  render();
}, e => { $("loginErr").textContent = authError(e); });

function showLogin(err = "", signedIn = false) {
  $("app").classList.add("hidden"); $("login").classList.remove("hidden");
  $("loginErr").textContent = err;
  $("loginBtn").classList.toggle("hidden", signedIn);
  $("logoutBtn2").classList.toggle("hidden", !signedIn);
}

// =====================================================================
//  סנכרון
// =====================================================================
function subscribe() {
  const on = (ref, fn, k) => S.unsubs.push(onSnapshot(ref, snap => { fn(snap); S.loaded[k] = true; changed(); }, e => { S.loaded[k] = true; console.error(k, e); toast(`בעיה בטעינת נתונים (${e.code})`); render(); }));
  on(doc(db, "sites", "cheder"), s => { S.settings = C.mergeSettings(s.exists() ? s.data() : null); }, "settings");
  on(roomRef(), async s => {
    if (s.exists()) S.roomDoc = s.data();
    else {
      // פעם ראשונה: יוצרים את החדר, עם השם של מי שנכנס כדייר ראשון
      S.roomDoc = { room: S.room, residents: [], absences: [], events: [] };
      const first = S.member.name ? [{ id: C.uid(), name: S.member.name, since: today() }] : [];
      setDoc(roomRef(), { room: S.room, residents: first, absences: [], events: [], createdAt: serverTimestamp() }).catch(fail);
    }
  }, "room");
  on(query(collection(db, "ch_rooms", S.room, "days"), orderBy("date", "desc"), limit(60)), s => {
    S.days = {}; s.forEach(d => { S.days[d.id] = d.data(); });
  }, "days");
  on(query(collection(db, "ch_duties"), orderBy("date", "desc"), limit(40)), s => {
    const prev = S.loaded.duties ? S.duties : null;
    S.duties = s.docs.map(d => d.data());
    if (prev) notifyDutyChange(prev);
  }, "duties");
  on(query(collection(db, "ch_events"), orderBy("from", "desc"), limit(100)), s => {
    S.gEvents = s.docs.map(d => ({ id: d.id, ...d.data(), room: null }));
  }, "events");
}

let ensureTimer = null, renderQueued = false;
function changed() {
  if (!loadedAll()) return;
  clearTimeout(ensureTimer);
  ensureTimer = setTimeout(ensureToday, 400);
  if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }
}

// שומר את התוכנית של היום (כדי שכל המכשירים יראו אותו דבר וההיסטוריה תישמר)
async function ensureToday() {
  const key = today();
  const { changed } = C.buildPlan({ ...ctx(key), existing: S.days[key] || null });
  if (!changed) return;
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(dayRef(key));
      const existing = snap.exists() ? snap.data() : null;
      const r = C.buildPlan({ ...ctx(key), existing });
      if (!r.changed) return;
      if (!existing) tx.set(dayRef(key), { ...r.plan, done: {}, manual: {}, at: serverTimestamp() });
      else tx.update(dayRef(key), { tasks: r.plan.tasks, present: r.plan.present, assign: r.plan.assign, dutyDate: r.plan.dutyDate, at: serverTimestamp() });
    });
  } catch (e) { if (e.code !== "unavailable" && e.code !== "failed-precondition") console.warn("ensureToday", e); }
}

// התוכנית של יום: שמורה (עבר/היום) או תחזית (עתיד)
function planFor(key) {
  const stored = S.days[key];
  if (key < today()) return stored || null;
  if (key === today()) return stored ? { ...stored, ...C.buildPlan({ ...ctx(key), existing: stored }).plan } : C.buildPlan(ctx(key)).plan;
  const proj = C.projectPlans({ fromKey: today(), days: C.daysBetween(today(), key) + 1, room: S.room, residents: residents(), absences: absences(), duties: S.duties, history: history(today()), settings: S.settings, events: events(), existingByDate: S.days });
  const p = proj[proj.length - 1];
  return stored ? { ...stored, ...p, done: stored.done, manual: stored.manual } : p;
}

// כתיבה ליום (יוצר את המסמך מהתחזית אם עוד לא קיים)
async function writeDay(key, fields) {
  const ref = dayRef(key);
  if (!S.days[key]) {
    const p = planFor(key) || C.buildPlan(ctx(key)).plan;
    await setDoc(ref, { ...p, done: {}, manual: {}, at: serverTimestamp() });
  }
  await updateDoc(ref, fields);
}

// =====================================================================
//  תצוגה
// =====================================================================
function go(tab) { S.tab = tab; history_replace(); render(); window.scrollTo({ top: 0 }); }
function history_replace() { try { window.history.replaceState(null, "", "#" + S.tab); } catch (e) {} }

function render() {
  if (!S.room) return;
  $("tabs").style.setProperty("--n", TABS.length);
  const staleBadge = dutyStale() ? `<span class="badge">!</span>` : "";
  $("tabs").innerHTML = TABS.map(t => `<button class="tab ${t.id === S.tab ? "on" : ""}" data-tab="${t.id}"><i>${t.ic}</i>${t.label}${t.id === "duty" ? staleBadge : ""}</button>`).join("");
  if (!loadedAll()) { $("view").innerHTML = `<div class="loader" style="min-height:50vh"><div class="spin"></div></div>`; return; }
  const a = document.activeElement;
  if (a && a.closest && a.closest("#view") && a.matches("input, textarea, select") && a.type !== "checkbox") { S.deferred = true; return; }
  S.deferred = false;
  const scroll = window.scrollY;
  $("view").innerHTML = ({ today: vToday, week: vWeek, duty: vDuty, room: vRoom, more: vMore })[S.tab]();
  window.scrollTo({ top: scroll });
}
$("tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) { document.activeElement && document.activeElement.blur && document.activeElement.blur(); go(b.dataset.tab); } });
document.addEventListener("focusout", () => setTimeout(() => { if (S.deferred && !(document.activeElement && document.activeElement.matches("input, textarea, select"))) render(); }, 80));

const avatar = (r, size = 40) => `<div class="av" style="background:${colorOf(r.id)};width:${size}px;height:${size}px">${esc(initials(r.name))}</div>`;
const taskName = t => C.TASKS[t] ? C.TASKS[t].name : t;
const roleChips = (key, plan) => {
  const info = C.dayInfo(key, S.room, S.settings, events());
  const roles = C.roomRoles(C.dutyFor(S.duties, key), S.room);
  const ch = [];
  if (!info.active) ch.push(`<span class="chip">${info.off ? "🏖️ " + esc(info.off.title || "חופשה") : "😴 אין משימות"}</span>`);
  if (info.active && info.duty && roles.floor) ch.push(`<span class="chip floor">🏢 תורנות קומה</span>`);
  if (info.active && info.duty && roles.kitchen) ch.push(`<span class="chip kitchen">🍳 מטבחון ומועדון</span>`);
  if (info.mop) ch.push(`<span class="chip mop">🪣 יום שטיפה</span>`);
  for (const e of info.events) if (e.type === "note" || (e.type !== "off" && e.title)) ch.push(`<span class="chip">${C.EVENT_TYPES[e.type].icon} ${esc(e.title || C.EVENT_TYPES[e.type].short)}</span>`);
  return ch.join("");
};

// ---------- היום ----------
function vToday() {
  const key = S.viewKey, t0 = today();
  const plan = planFor(key);
  const isFuture = key > t0, isPast = key < t0;
  const info = C.dayInfo(key, S.room, S.settings, events());
  const act = active();
  const done = (plan && plan.done) || {};
  const present = (plan && plan.present) || [];
  const items = plan && plan.tasks.length ? [...(plan.tasks || []), ...present.map(id => "bed_" + id)] : [];
  const doneCount = items.filter(k => done[k]).length;
  const pct = items.length ? Math.round(doneCount / items.length * 100) : 0;

  let h = `<div class="card hero">
    <div class="row" style="position:relative;z-index:1"><div class="grow"><div class="day">${esc(C.fmtDay(key, t0))}${isFuture ? " · תחזית" : ""}</div><div class="title">חדר ${esc(S.room)}</div></div>
      <div class="nav"><button data-act="day" data-d="-1" aria-label="יום קודם">→</button>${key !== t0 ? `<button data-act="day" data-d="0">היום</button>` : ""}<button data-act="day" data-d="1" aria-label="יום הבא">←</button></div></div>
    <div class="chips" style="position:relative;z-index:1">${roleChips(key, plan)}</div>
    ${items.length ? `<div class="prog"><div class="bar"><div style="width:${pct}%"></div></div><b>${doneCount}/${items.length}</b></div>` : ""}
  </div>`;

  if (key === t0 && info.active && dutyStale()) {
    const d = C.dutyFor(S.duties, t0);
    h += `<div class="status warn" style="margin:-4px 0 14px">⏰ <span class="grow">${d ? `התורנות עודכנה לפני ${C.daysBetween(d.date, t0)} ימים. יש הודעה חדשה מהמדריך?` : "עוד לא הוזנה תורנות קומה/מטבחון."}</span><button class="btn sm" data-act="paste">הדבקה</button></div>`;
  }
  if (!act.length) {
    return h + `<div class="card empty"><div class="big">👋</div><b>ברוכים הבאים לחדר ${esc(S.room)}!</b><p>קודם כל, הוסיפו את כל מי שגר בחדר.</p><button class="btn pri" data-act="go" data-tab="room">הוספת אנשים</button></div>`;
  }
  if (!info.active) {
    h += `<div class="card empty"><div class="big">${info.off ? "🏖️" : C.weekday(key) === 6 ? "🕯️" : "😴"}</div><b>${info.off ? esc(info.off.title || "חופשה") : C.weekday(key) === 6 ? "שבת שלום!" : "אין משימות היום"}</b><p class="small">${info.off ? "אין סידור ניקיון ביום הזה." : "אין סידור ניקיון ביום הזה."}</p></div>`;
  }
  if (!plan) return h + `<div class="card empty">אין נתונים שמורים ליום הזה.</div>`;

  // דיירים נוכחים
  for (const r of act) {
    const ab = C.absenceOn(absences(), r.id, key);
    if (ab && !present.includes(r.id)) continue;
    if (!present.includes(r.id)) continue;
    const mine = C.tasksOf(plan, r.id);
    if (!info.active) continue;
    const rows = [{ k: "bed_" + r.id, ic: C.BED.icon, name: C.BED.name, sub: "כל אחד את שלו", g: "bed" },
      ...mine.map(t => ({ k: t, t, ic: C.TASKS[t].icon, name: C.TASKS[t].name, sub: C.GROUPS[C.TASKS[t].group].name + (plan.manual && plan.manual[t] ? " · הוחלף" : ""), g: C.TASKS[t].group }))];
    const allDone = rows.every(x => done[x.k]);
    h += `<div class="card person">
      <div class="person-hd">${avatar(r)}<div class="nm"><b>${esc(r.name)}${allDone ? " ✨" : ""}</b><span>${mine.length ? `${mine.length} משימות + מיטה` : "רק המיטה היום"}</span></div>
        <button class="more-btn" data-act="person" data-id="${r.id}" aria-label="אפשרויות">⋯</button></div>
      <ul class="tasks">${rows.map(x => `<li class="task g-${x.g} ${x.t ? "t-" + x.t : ""} ${done[x.k] ? "done" : ""}">
        <span class="ic">${x.ic}</span><div class="tx"><b>${esc(x.name)}</b><span>${esc(x.sub)}</span></div>
        ${x.t ? `<button class="who" data-act="task" data-t="${x.t}" title="להעביר למישהו אחר">⇄</button>` : ""}
        <button class="check" data-act="check" data-k="${x.k}" ${isFuture ? "disabled" : ""} aria-label="בוצע">✓</button></li>`).join("")}</ul>
    </div>`;
  }
  // נעדרים
  const away = act.filter(r => !present.includes(r.id));
  if (away.length) {
    h += `<div class="sec-title">לא בחדר</div>`;
    for (const r of away) {
      const ab = C.absenceOn(absences(), r.id, key);
      const doneTasks = C.tasksOf(plan, r.id);
      h += `<div class="card person away"><div class="person-hd">${avatar(r)}<div class="nm"><b>${esc(r.name)}</b><span>${ab ? `${C.REASONS[ab.reason].icon} ${C.REASONS[ab.reason].name}${ab.to ? ` עד ${C.fmtDate(ab.to)}` : " · עד הודעה חדשה"}${ab.note ? " · " + esc(ab.note) : ""}` : "לא היה בחדר"}${doneTasks.length ? ` · ביצע: ${doneTasks.map(taskName).join(", ")}` : ""}</span></div>
        ${ab && !isPast ? `<button class="btn sm" data-act="back" data-id="${r.id}">חזר ✓</button>` : ""}</div></div>`;
    }
  }
  if (info.active && !isPast) h += `<p class="muted small center">לחיצה על ⇄ מעבירה משימה למישהו אחר · ⋯ ליד שם: חולה / לא הגיע / החלפה</p>`;
  return h;
}

// ---------- השבוע ----------
function vWeek() {
  const t0 = today();
  const start = C.addDays(t0, S.weekOffset * 7);
  const plans = C.projectPlans({ fromKey: t0, days: S.weekOffset * 7 + 7, room: S.room, residents: residents(), absences: absences(), duties: S.duties, history: history(t0), settings: S.settings, events: events(), existingByDate: S.days }).slice(S.weekOffset * 7);
  let h = `<div class="card-hd" style="margin:2px 4px 12px"><h2 class="grow" style="margin:0">הלו"ז ${S.weekOffset === 0 ? "לשבוע הקרוב" : `מ-${C.fmtDate(start)}`}</h2>
    <button class="btn sm" data-act="wk" data-d="-1" ${S.weekOffset <= 0 ? "disabled" : ""}>→</button><button class="btn sm" data-act="wk" data-d="1" ${S.weekOffset >= 3 ? "disabled" : ""}>←</button></div>
    <div class="btns" style="margin:0 0 14px"><button class="btn pri sm" data-act="event">＋ חופשה / טיול / שינוי בלו"ז</button></div>
    <div class="week">`;
  for (const p of plans) {
    const info = C.dayInfo(p.date, S.room, S.settings, events());
    const awayIds = active().filter(r => !p.present.includes(r.id));
    h += `<div class="wday ${p.date === t0 ? "today" : ""} ${info.active ? "" : "off"}" data-act="openday" data-k="${p.date}">
      <div class="wday-hd"><b>${C.DAY_NAMES[C.weekday(p.date)]}</b><span class="muted">${C.fmtDate(p.date)}${p.date === t0 ? " · היום" : ""}</span><div class="chips">${roleChips(p.date, p)}</div></div>`;
    if (info.active && p.tasks.length) {
      h += `<div class="wgrid">${p.present.map(id => {
        const ts = C.tasksOf(p, id);
        return `<div class="wrow"><span class="n">${esc(nameOf(id))}</span><span class="t">${ts.length ? ts.map(t => C.TASKS[t].icon + " " + C.TASKS[t].name).join(" · ") : "🛏️ רק מיטה"}</span></div>`;
      }).join("")}</div>`;
    }
    if (awayIds.length) h += `<div class="small muted" style="margin-top:6px">לא בחדר: ${awayIds.map(r => { const a = C.absenceOn(absences(), r.id, p.date); return esc(r.name) + (a ? " " + C.REASONS[a.reason].icon : ""); }).join(", ")}</div>`;
    h += `</div>`;
  }
  h += `</div><p class="muted small center" style="margin-top:12px">תורנות קומה/מטבחון בימים הבאים מוצגת לפי העדכון האחרון, ותתעדכן כשהמדריך ישלח חדשה.</p>`;

  // חריגים קרובים
  const up = events().filter(e => (e.to || e.from) >= t0).sort((a, b) => a.from.localeCompare(b.from));
  h += `<div class="sec-title">שינויים בלו"ז</div><div class="card">`;
  if (!up.length) h += `<div class="muted small">אין שינויים. אפשר להוסיף חופשה, טיול, העברת יום שטיפה ועוד.</div>`;
  else h += `<div class="list">${up.map(e => `<div class="li"><span class="emo">${C.EVENT_TYPES[e.type].icon}</span><div class="tx"><b>${esc(e.title || C.EVENT_TYPES[e.type].name)}</b><span>${eventRange(e)} · ${e.room ? "רק החדר שלנו" : "כל הפנימייה"}${e.byRoom && !e.room ? ` · הוסיף חדר ${esc(e.byRoom)}` : ""}</span></div>${canEditEvent(e) ? `<button class="btn sm danger" data-act="delevent" data-id="${esc(e.id)}" data-scope="${e.room ? "room" : "all"}">מחיקה</button>` : ""}</div>`).join("")}</div>`;
  h += `</div>`;
  return h;
}
const eventRange = e => e.type === "mopmove" ? `מ-${C.DAY_NAMES[C.weekday(e.from)]} ${C.fmtDate(e.from)} ל-${C.DAY_NAMES[C.weekday(e.to)]} ${C.fmtDate(e.to)}`
  : (!e.to || e.to === e.from) ? `יום ${C.DAY_NAMES[C.weekday(e.from)]} ${C.fmtDate(e.from)}` : `${C.fmtDate(e.from)} – ${C.fmtDate(e.to)}`;
const canEditEvent = e => !!e.room || e.byRoom === S.room || isAdminUser(S.user);

// ---------- תורנות ----------
function dutyStale() {
  if (!loadedAll()) return false;
  const t0 = today();
  if (!C.dayInfo(t0, S.room, S.settings, events()).active) return false;
  const d = C.dutyFor(S.duties, t0);
  return !d || C.daysBetween(d.date, t0) >= S.settings.staleDays;
}
function vDuty() {
  const t0 = today();
  const d = C.dutyFor(S.duties, t0);
  const roles = C.roomRoles(d, S.room);
  const roomsHtml = l => (l || []).length ? `<div class="rooms">${l.map(n => `<span class="room-n ${String(n) === S.room ? "me" : ""}">${esc(n)}</span>`).join("")}</div>` : `<span class="muted small">—</span>`;
  let h = `<div class="card"><div class="card-hd"><h2>התורנות הנוכחית</h2>${d ? `<span class="chip">מ-${C.DAY_NAMES[C.weekday(d.date)]} ${C.fmtDate(d.date)}</span>` : ""}</div>`;
  if (!d) h += `<div class="empty"><div class="big">📭</div>עוד לא הוזנה תורנות. הדביקו את ההודעה של המדריך.</div>`;
  else {
    h += `<div class="duty-grid"><div class="duty-box"><h4>🏢 תורנות קומה</h4>${roomsHtml(d.floor)}</div><div class="duty-box"><h4>🍳 מטבחון, מועדון${S.settings.outside ? " ומחוץ לפנימייה" : ""}</h4>${roomsHtml(d.kitchen)}</div></div>`;
    h += roles.floor || roles.kitchen
      ? `<div class="status on">⭐ החדר שלכם ב${[roles.floor && "תורנות קומה", roles.kitchen && "מטבחון ומועדון"].filter(Boolean).join(" וגם ב")}</div>`
      : `<div class="status off">😌 החדר שלכם לא בתורנות כרגע</div>`;
    const age = C.daysBetween(d.date, t0);
    if (age >= S.settings.staleDays) h += `<div class="status warn">⏰ עברו ${age} ימים מהעדכון - בדרך כלל מתחלף כל 3 ימים</div>`;
    h += `<div class="small muted" style="margin-top:10px">${d.byRoom ? `עודכן ע"י חדר ${esc(d.byRoom)}` : ""}${d.sender ? ` · מתוך ההודעה של ${esc(d.sender)}${d.time ? " ב-" + esc(d.time) : ""}` : ""}${d.newRound ? " · סבב חדש" : ""}</div>`;
  }
  h += `<div class="btns"><button class="btn pri grow" data-act="paste">📋 הדבקת הודעה מהמדריך</button><button class="btn" data-act="manual">✏️ עריכה / החלפה</button></div></div>`;

  if (S.duties.length) {
    h += `<div class="sec-title">היסטוריה</div><div class="card"><div class="list">${S.duties.slice(0, 15).map(x => {
      const r = C.roomRoles(x, S.room);
      return `<div class="li"><span class="emo">${r.floor ? "🏢" : r.kitchen ? "🍳" : "📋"}</span><div class="tx"><b>${C.DAY_NAMES[C.weekday(x.date)]} ${C.fmtDate(x.date)}</b><span>קומה: ${(x.floor || []).join(", ") || "—"} · מטבחון: ${(x.kitchen || []).join(", ") || "—"}</span></div>${r.floor || r.kitchen ? `<span class="chip me">אנחנו</span>` : ""}</div>`;
    }).join("")}</div></div>`;
  }
  return h;
}

// ---------- החדר ----------
function vRoom() {
  const t0 = today();
  const act = active();
  let h = `<div class="card"><div class="card-hd"><h2>מי בחדר ${esc(S.room)}</h2><span class="chip">${act.length}</span></div>
    <div class="list">${act.map(r => {
      const ab = C.absenceOn(absences(), r.id, t0);
      return `<div class="li">${avatar(r, 36)}<div class="tx"><b>${esc(r.name)}</b><span>${ab ? `${C.REASONS[ab.reason].icon} ${C.REASONS[ab.reason].name}${ab.to ? " עד " + C.fmtDate(ab.to) : ""}` : "בחדר"}</span></div>
        <button class="more-btn" data-act="resident" data-id="${r.id}" aria-label="עריכה">⋯</button></div>`;
    }).join("") || `<div class="muted small">עוד אין אף אחד. הוסיפו את כל מי שגר בחדר.</div>`}</div>
    <form class="row" style="margin-top:12px" data-form="addres"><input class="inp grow" name="name" placeholder="שם של מישהו בחדר" maxlength="30" autocomplete="off"><button class="btn pri">הוספה</button></form></div>`;

  // היעדרויות
  const abs = absences().filter(a => !a.to || a.to >= C.addDays(t0, -7)).sort((a, b) => b.from.localeCompare(a.from));
  h += `<div class="sec-title">היעדרויות, מחלות וחופשות אישיות</div><div class="card">
    ${abs.length ? `<div class="list">${abs.map(a => {
      const cur = a.from <= t0 && (!a.to || a.to >= t0), fut = a.from > t0;
      return `<div class="li"><span class="emo">${C.REASONS[a.reason].icon}</span><div class="tx"><b>${esc(nameOf(a.rid))} · ${C.REASONS[a.reason].name}</b><span>${C.fmtDate(a.from)}${a.to ? (a.to !== a.from ? " – " + C.fmtDate(a.to) : "") : " · עד הודעה חדשה"}${a.note ? " · " + esc(a.note) : ""}</span></div>
        ${cur ? `<span class="chip warn">עכשיו</span>` : fut ? `<span class="chip">בקרוב</span>` : `<span class="chip ok">הסתיים</span>`}
        <button class="more-btn" data-act="delabs" data-id="${a.id}" aria-label="מחיקה">🗑</button></div>`;
    }).join("")}</div>` : `<div class="muted small">אין היעדרויות. מישהו חולה או לא הגיע? סמנו כאן והמשימות שלו יחולקו לאחרים.</div>`}
    <div class="btns"><button class="btn" data-act="absence">＋ סימון היעדרות</button></div></div>`;

  // סטטיסטיקה
  const hist = Object.values(S.days).filter(d => d.date <= t0 && d.date > C.addDays(t0, -31));
  const st = C.computeStats(hist, act.map(r => r.id));
  const doneOf = id => hist.reduce((a, d) => a + Object.entries(d.assign || {}).filter(([t, x]) => x === id && d.done && d.done[t]).length, 0);
  const max = Math.max(1, ...act.map(r => st[r.id].load));
  h += `<div class="sec-title">הוגנות - 30 הימים האחרונים</div><div class="card">${hist.length ? `<table class="stats"><thead><tr><th>שם</th><th>ימים</th><th>משימות</th><th>בוצע</th><th style="width:30%">עומס</th></tr></thead><tbody>
    ${act.map(r => { const s = st[r.id]; const dn = doneOf(r.id); return `<tr><td><b>${esc(r.name)}</b></td><td>${s.days}</td><td>${s.count}</td><td>${s.count ? Math.round(dn / s.count * 100) + "%" : "—"}</td><td><div class="meter"><div style="width:${s.load / max * 100}%"></div></div></td></tr>`; }).join("")}
    </tbody></table><p class="muted small" style="margin-bottom:0">המערכת מחלקת כל בוקר מחדש: קודם מאזנת את היום, ואז נותנת יותר למי שעשה פחות לאורך זמן (בהתחשב בימים שהיה בחדר). שטיפה ושירותים "שווים" יותר משולחן.</p>` : `<div class="muted small">הנתונים יופיעו אחרי כמה ימים.</div>`}</div>`;
  return h;
}

// ---------- עוד ----------
function vMore() {
  const u = S.user;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let h = "";
  h += `<div class="card"><div class="list">
    <div class="li"><span class="emo">👤</span><div class="tx"><b>${esc(u.displayName || S.member.name || "")}</b><span class="ltr">${esc(u.email)}</span></div><span class="chip">חדר ${esc(S.room)}</span></div>
    <button class="opt" data-act="theme"><span class="emo">🌓</span><span class="tx">מצב כהה / בהיר</span></button>
    ${!standalone ? `<button class="opt" data-act="install"><span class="emo">📲</span><span class="tx">התקנה כאפליקציה<span>להוסיף את האתר למסך הבית</span></span></button>` : ""}
    <button class="opt" data-act="help"><span class="emo">❓</span><span class="tx">איך זה עובד</span></button>
    ${isAdminUser(u) ? `<a class="opt" href="admin/" style="text-decoration:none;color:inherit"><span class="emo">🛠️</span><span class="tx">ממשק ניהול</span></a>` : ""}
    <button class="opt" data-act="logout"><span class="emo">🚪</span><span class="tx" style="color:var(--bad)">התנתקות</span></button>
  </div></div>`;
  return h;
}

// =====================================================================
//  פעולות
// =====================================================================
$("view").addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const a = el.dataset.act;
  try {
    if (a === "day") { const d = +el.dataset.d; S.viewKey = d === 0 ? today() : C.addDays(S.viewKey, d); render(); }
    else if (a === "go") go(el.dataset.tab);
    else if (a === "check") await toggleDone(el.dataset.k, el);
    else if (a === "task") taskSheet(el.dataset.t);
    else if (a === "person") personSheet(el.dataset.id);
    else if (a === "back") await endAbsence(el.dataset.id);
    else if (a === "paste") pasteSheet();
    else if (a === "manual") dutyEditor([{ ...(C.dutyFor(S.duties, today()) || { floor: [], kitchen: [] }), date: today(), raw: "", sender: "", time: "" }]);
    else if (a === "wk") { S.weekOffset = Math.max(0, Math.min(3, S.weekOffset + +el.dataset.d)); render(); }
    else if (a === "openday") { S.viewKey = el.dataset.k; go("today"); }
    else if (a === "event") eventSheet();
    else if (a === "delevent") await delEvent(el.dataset.id, el.dataset.scope);
    else if (a === "resident") residentSheet(el.dataset.id);
    else if (a === "absence") absenceSheet(null);
    else if (a === "delabs") await delAbsence(el.dataset.id);
    else if (a === "theme") toggleTheme();
    else if (a === "install") installHelp();
    else if (a === "help") helpSheet();
    else if (a === "logout") { if (await confirmSheet("להתנתק?", "", "התנתקות")) logout(); }
  } catch (err) { fail(err); }
});
$("view").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === "addres") {
    const name = f.name.value.trim().slice(0, 30);
    if (!name) return;
    if (active().some(r => r.name === name)) return toast("כבר יש מישהו בשם הזה");
    await saveResidents([...residents(), { id: C.uid(), name, since: today() }]).catch(fail);
    toast(`${name} נוסף לחדר`);
  }
});
async function toggleDone(k, el) {
  const key = S.viewKey;
  if (key > today()) return;
  const plan = planFor(key);
  const v = !(plan && plan.done && plan.done[k]);
  el.closest(".task")?.classList.toggle("done", v);
  el.classList.add("pop");
  if (v && navigator.vibrate) navigator.vibrate(15);
  await writeDay(key, { [`done.${k}`]: v ? true : deleteField() });
}

// ---------- העברת משימה ----------
function taskSheet(t) {
  const key = S.viewKey, plan = planFor(key);
  const cur = plan.assign[t];
  const ppl = plan.present.map(id => residents().find(r => r.id === id)).filter(Boolean);
  sheet(`<h2>${C.TASKS[t].icon} ${C.TASKS[t].name}</h2><div class="sub">${esc(C.fmtDay(key))} · למי להעביר?</div>
    ${ppl.map(r => { const n = C.tasksOf(plan, r.id).length; return `<button class="opt ${r.id === cur ? "cur" : ""}" data-act="to" data-id="${r.id}">${avatar(r, 36)}<span class="tx">${esc(r.name)}<span>${n ? n + " משימות היום" : "אין לו משימות היום"}</span></span>${r.id === cur ? "✓" : ""}</button>`; }).join("")}
    ${plan.manual && plan.manual[t] ? `<button class="btn block" data-act="auto" style="margin-top:8px">↺ לחזור לחלוקה האוטומטית</button>` : ""}`,
  async (act, el, root, close) => {
    try {
      if (act === "to") {
        const id = el.dataset.id; close();
        if (id === cur) return;
        await writeDay(key, { [`assign.${t}`]: id, [`manual.${t}`]: true });
        toast(`${C.TASKS[t].name} ← ${nameOf(id)}`);
      } else if (act === "auto") {
        close();
        const assign = { ...plan.assign }; delete assign[t];
        const r = C.buildPlan({ ...ctx(key), existing: { ...plan, assign } });
        await writeDay(key, { assign: r.plan.assign, [`manual.${t}`]: deleteField() });
      }
    } catch (e) { fail(e); }
  });
}

// ---------- אפשרויות לאדם ----------
function personSheet(id) {
  const key = S.viewKey, plan = planFor(key);
  const r = residents().find(x => x.id === id);
  const others = plan.present.filter(x => x !== id);
  sheet(`<div class="row" style="margin-bottom:12px">${avatar(r)}<div><h2>${esc(r.name)}</h2><div class="sub" style="margin:0">${esc(C.fmtDay(key))}</div></div></div>
    <button class="opt" data-act="abs" data-r="sick"><span class="emo">🤒</span><span class="tx">חולה<span>המשימות שלו יחולקו לאחרים</span></span></button>
    <button class="opt" data-act="abs" data-r="missing"><span class="emo">🚫</span><span class="tx">לא הגיע</span></button>
    <button class="opt" data-act="abs" data-r="home"><span class="emo">🏠</span><span class="tx">בבית / נסע</span></button>
    ${others.length ? `<button class="opt" data-act="swap"><span class="emo">🔄</span><span class="tx">החלפת תורנות עם מישהו<span>מתחלפים בכל המשימות של היום</span></span></button>` : ""}`,
  (act, el, root, close) => {
    if (act === "abs") { close(); absenceSheet(id, el.dataset.r, key); }
    if (act === "swap") {
      root.innerHTML = `<div class="grip"></div><h2>🔄 ${esc(r.name)} מתחלף עם...</h2><div class="sub">כל המשימות של היום מתחלפות ביניהם</div>
        ${others.map(o => { const p = residents().find(x => x.id === o); return `<button class="opt" data-act="swapwith" data-id="${o}">${avatar(p, 36)}<span class="tx">${esc(p.name)}<span>${C.tasksOf(plan, o).map(taskName).join(", ") || "רק מיטה"}</span></span></button>`; }).join("")}`;
    }
    if (act === "swapwith") {
      const o = el.dataset.id; close();
      const assign = { ...plan.assign }, manual = {};
      for (const [t, x] of Object.entries(plan.assign)) {
        if (x === id) { assign[t] = o; manual[`manual.${t}`] = true; }
        if (x === o) { assign[t] = id; manual[`manual.${t}`] = true; }
      }
      writeDay(key, { assign, ...manual }).then(() => toast(`${r.name} ו${nameOf(o)} התחלפו`)).catch(fail);
    }
  });
}

// ---------- היעדרות ----------
function absenceSheet(rid, reason = "sick", from = today()) {
  const st = { rid: rid || (active()[0] || {}).id, reason, from: from < today() ? today() : from, dur: "1", to: "" };
  const draw = root => {
    root.innerHTML = `<div class="grip"></div><h2>סימון היעדרות</h2><div class="sub">בזמן הזה לא יקבל משימות, והן יחולקו לאחרים</div>
      ${rid ? "" : `<div class="field"><span>מי?</span><div class="seg">${active().map(r => `<button data-act="rid" data-v="${r.id}" class="${st.rid === r.id ? "on" : ""}">${esc(r.name)}</button>`).join("")}</div></div>`}
      <div class="field"><span>סיבה</span><div class="seg">${Object.entries(C.REASONS).map(([k, v]) => `<button data-act="reason" data-v="${k}" class="${st.reason === k ? "on" : ""}">${v.icon} ${v.name}</button>`).join("")}</div></div>
      <label class="field"><span>מתאריך</span><input class="inp" type="date" id="abFrom" value="${st.from}"></label>
      <div class="field"><span>לכמה זמן?</span><div class="seg">${[["1", "רק היום"], ["2", "יומיים"], ["3", "3 ימים"], ["7", "שבוע"], ["date", "עד תאריך"], ["open", "עד הודעה חדשה"]].map(([k, l]) => `<button data-act="dur" data-v="${k}" class="${st.dur === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      ${st.dur === "date" ? `<label class="field"><span>עד (כולל)</span><input class="inp" type="date" id="abTo" value="${st.to || st.from}" min="${st.from}"></label>` : ""}
      <label class="field"><span>הערה (לא חובה)</span><input class="inp" id="abNote" maxlength="60" placeholder="למשל: בבית חולים, חזר מחר..."></label>
      <div class="btns"><button class="btn pri grow" data-act="save">שמירה</button><button class="btn" data-act="close">ביטול</button></div>`;
  };
  const s = sheet("", async (act, el, root, close) => {
    const fromEl = root.querySelector("#abFrom");
    if (fromEl && C.isDateKey(fromEl.value)) st.from = fromEl.value;
    const toEl = root.querySelector("#abTo");
    if (toEl) st.to = toEl.value;
    if (["rid", "reason", "dur"].includes(act)) { st[act] = el.dataset.v; const note = root.querySelector("#abNote").value; draw(root); root.querySelector("#abNote").value = note; return; }
    if (act !== "save") return;
    if (!st.rid) return toast("בחרו מי");
    let to = null;
    if (st.dur === "date") { if (!C.isDateKey(st.to) || st.to < st.from) return toast("תאריך סיום לא תקין"); to = st.to; }
    else if (st.dur !== "open") to = C.addDays(st.from, +st.dur - 1);
    const note = root.querySelector("#abNote").value.trim().slice(0, 60);
    close();
    try {
      await updateDoc(roomRef(), { absences: [...absences(), { id: C.uid(), rid: st.rid, reason: st.reason, from: st.from, to, note, at: Date.now() }] });
      toast(`${nameOf(st.rid)} סומן: ${C.REASONS[st.reason].name}. המשימות חולקו מחדש`);
    } catch (e) { fail(e); }
  });
  draw(s.root);
}
async function endAbsence(rid) {
  const t0 = today();
  const list = absences().map(a => {
    if (a.rid !== rid || !(a.from <= t0 && (!a.to || a.to >= t0))) return a;
    return a.from >= t0 ? null : { ...a, to: C.addDays(t0, -1) };
  }).filter(Boolean);
  await updateDoc(roomRef(), { absences: list });
  toast(`${nameOf(rid)} חזר לחדר 👋`);
}
async function delAbsence(id) {
  if (!(await confirmSheet("למחוק את ההיעדרות?", "החלוקה של הימים הבאים תחושב מחדש", "מחיקה", true))) return;
  await updateDoc(roomRef(), { absences: absences().filter(a => a.id !== id) });
}

// ---------- דיירים ----------
const saveResidents = list => updateDoc(roomRef(), { residents: list });
function residentSheet(id) {
  const r = residents().find(x => x.id === id);
  sheet(`<h2>${esc(r.name)}</h2><div class="sub">דייר בחדר ${esc(S.room)}</div>
    <label class="field"><span>שם</span><input class="inp" id="rsName" value="${esc(r.name)}" maxlength="30"></label>
    <div class="btns"><button class="btn pri grow" data-act="save">שמירה</button></div>
    <button class="opt" data-act="abs"><span class="emo">🤒</span><span class="tx">סימון היעדרות / מחלה</span></button>
    <button class="opt" data-act="left"><span class="emo">👋</span><span class="tx" style="color:var(--bad)">עזב את החדר<span>ההיסטוריה שלו נשמרת</span></span></button>`,
  async (act, el, root, close) => {
    try {
      if (act === "save") {
        const name = root.querySelector("#rsName").value.trim().slice(0, 30);
        if (!name) return;
        close(); await saveResidents(residents().map(x => x.id === id ? { ...x, name } : x));
      } else if (act === "abs") { close(); absenceSheet(id); }
      else if (act === "left") {
        close();
        if (!(await confirmSheet(`${r.name} עזב את החדר?`, "הוא לא יקבל יותר משימות", "כן, עזב", true))) return;
        await saveResidents(residents().map(x => x.id === id ? { ...x, left: today() } : x));
      }
    } catch (e) { fail(e); }
  });
}

// ---------- חריגים בלו"ז ----------
function eventSheet() {
  const t0 = today();
  const st = { type: "off", scope: "all", from: t0, to: t0, title: "" };
  const titles = { off: ["טיול", "חופשה", "יום מחוץ לפנימייה", "שבת בבית"], on: ["שבת בפנימייה"], note: ["ביקורת ניקיון", "ניקיון כללי"] };
  const draw = root => {
    const mm = st.type === "mopmove";
    root.innerHTML = `<div class="grip"></div><h2>שינוי בלו"ז</h2><div class="sub">חופשה, טיול, העברת יום שטיפה ועוד</div>
      <div class="field"><span>מה קורה?</span>${Object.entries(C.EVENT_TYPES).map(([k, v]) => `<button class="opt ${st.type === k ? "cur" : ""}" data-act="type" data-v="${k}"><span class="emo">${v.icon}</span><span class="tx">${v.name}</span>${st.type === k ? "✓" : ""}</button>`).join("")}</div>
      <div class="row">
        <label class="field grow"><span>${mm ? "יום השטיפה המקורי" : "מתאריך"}</span><input class="inp" type="date" id="evFrom" value="${st.from}"></label>
        <label class="field grow"><span>${mm ? "עובר ליום" : "עד (כולל)"}</span><input class="inp" type="date" id="evTo" value="${st.to}"></label>
      </div>
      ${mm ? `<div class="small muted" style="margin:-6px 0 12px">יום השטיפה הקבוע הוא יום ${C.DAY_NAMES[S.settings.mopDay]}. הקרוב: ${C.fmtDate(nextWeekday(S.settings.mopDay))}</div>` : ""}
      <label class="field"><span>תיאור (לא חובה)</span><input class="inp" id="evTitle" maxlength="60" value="${esc(st.title)}" placeholder="למשל: טיול שנתי">
        ${titles[st.type] ? `<div class="chips" style="margin-top:6px">${titles[st.type].map(x => `<button class="chip" data-act="title" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}</label>
      <div class="field"><span>למי זה?</span><div class="seg"><button data-act="scope" data-v="all" class="${st.scope === "all" ? "on" : ""}">🏫 כל הפנימייה</button><button data-act="scope" data-v="room" class="${st.scope === "room" ? "on" : ""}">🚪 רק החדר שלנו</button></div></div>
      <div class="btns"><button class="btn pri grow" data-act="save">שמירה</button><button class="btn" data-act="close">ביטול</button></div>`;
  };
  const read = root => { st.from = root.querySelector("#evFrom").value; st.to = root.querySelector("#evTo").value; st.title = root.querySelector("#evTitle").value; };
  const s = sheet("", async (act, el, root, close) => {
    read(root);
    if (act === "type") {
      st.type = el.dataset.v;
      if (st.type === "mopmove") { st.from = nextWeekday(S.settings.mopDay); st.to = C.addDays(st.from, 1); }
      draw(root); return;
    }
    if (act === "scope") { st.scope = el.dataset.v; draw(root); return; }
    if (act === "title") { st.title = el.dataset.v; draw(root); return; }
    if (act !== "save") return;
    if (!C.isDateKey(st.from) || !C.isDateKey(st.to)) return toast("בחרו תאריכים");
    if (st.type !== "mopmove" && st.to < st.from) return toast("תאריך הסיום לפני ההתחלה");
    if (st.type === "mopmove" && st.to === st.from) return toast("בחרו יום אחר");
    const ev = { type: st.type, from: st.from, to: st.to, title: st.title.trim().slice(0, 60), by: emailKey(S.user.email), byRoom: S.room, at: Date.now() };
    close();
    try {
      if (st.scope === "all") await addDoc(collection(db, "ch_events"), ev);
      else await updateDoc(roomRef(), { events: [...((S.roomDoc && S.roomDoc.events) || []), { id: C.uid(), ...ev }] });
      toast("נשמר. הלו\"ז עודכן");
    } catch (e) { fail(e); }
  });
  draw(s.root);
}
function nextWeekday(wd) { let k = today(); for (let i = 0; i < 7; i++) { if (C.weekday(k) === wd) return k; k = C.addDays(k, 1); } return k; }
async function delEvent(id, scope) {
  if (!(await confirmSheet("למחוק את השינוי?", "", "מחיקה", true))) return;
  if (scope === "room") await updateDoc(roomRef(), { events: (S.roomDoc.events || []).filter(e => e.id !== id) });
  else await deleteDoc(doc(db, "ch_events", id));
}

// ---------- הדבקת תורנות ----------
function pasteSheet() {
  sheet(`<h2>📋 הדבקת הודעה מהמדריך</h2><div class="sub">מעתיקים מהקבוצה את ההודעה (או כמה הודעות יחד) ומדביקים כאן. המערכת תזהה את החדרים.</div>
    <textarea class="inp" id="pasteTx" placeholder="[17/11, 7:56] נדב המדריך: בוקר טוב!&#10;חדרים תורנים:&#10;37&#10;41&#10;45&#10;&#10;מטבחון מועדון ומחוץ לפנימיה: 39" autofocus></textarea>
    <div class="btns">${navigator.clipboard && navigator.clipboard.readText ? `<button class="btn" data-act="clip">📥 הדבקה מהלוח</button>` : ""}<button class="btn pri grow" data-act="parse">זיהוי</button></div>`,
  async (act, el, root) => {
    const tx = root.querySelector("#pasteTx");
    if (act === "clip") { try { tx.value = await navigator.clipboard.readText(); } catch (e) { toast("אין גישה ללוח. הדביקו ידנית (לחיצה ארוכה ← הדבקה)"); } }
    if (act === "clip" || act === "parse") {
      if (!tx.value.trim()) return act === "parse" && toast("הדביקו קודם את ההודעה");
      const msgs = C.parseDutyText(tx.value, today());
      if (!msgs.length) return toast("לא מצאתי מספרי חדרים בהודעה. אפשר להזין ידנית");
      dutyEditor(msgs);
    }
  });
}
function dutyEditor(msgs) {
  const list = msgs.map(m => ({ ...m, floor: (m.floor || []).join(", "), kitchen: (m.kitchen || []).join(", ") }));
  const draw = root => {
    root.innerHTML = `<div class="grip"></div><h2>בדיקה ושמירה</h2><div class="sub">${list.length > 1 ? `זוהו ${list.length} הודעות. ` : ""}אפשר לתקן לפני השמירה. מפרידים בפסיק.</div>
      ${list.map((m, i) => `<div class="card" style="box-shadow:none;background:var(--panel-2)">
        <div class="row"><label class="field grow" style="margin-bottom:8px"><span>בתוקף מתאריך</span><input class="inp" type="date" data-i="${i}" data-f="date" value="${m.date}"></label>
          ${list.length > 1 ? `<button class="more-btn" data-act="rm" data-i="${i}" aria-label="הסרה">✕</button>` : ""}</div>
        <label class="field"><span>🏢 תורנות קומה</span><input class="inp ltr" inputmode="numeric" data-i="${i}" data-f="floor" value="${esc(m.floor)}" placeholder="37, 41, 45"></label>
        <label class="field" style="margin-bottom:0"><span>🍳 מטבחון ומועדון</span><input class="inp ltr" inputmode="numeric" data-i="${i}" data-f="kitchen" value="${esc(m.kitchen)}" placeholder="39"></label>
      </div>`).join("")}
      <div class="btns"><button class="btn pri grow" data-act="save">שמירה לכל הפנימייה</button><button class="btn" data-act="close">ביטול</button></div>`;
  };
  const read = root => root.querySelectorAll("[data-f]").forEach(inp => { list[+inp.dataset.i][inp.dataset.f] = inp.value; });
  const s = sheet("", async (act, el, root, close) => {
    read(root);
    if (act === "rm") { list.splice(+el.dataset.i, 1); draw(root); return; }
    if (act !== "save") return;
    const nums = v => [...new Set((String(v).match(/\d{1,4}/g) || []).map(n => String(+n)))];
    const out = list.map(m => ({ date: m.date, floor: nums(m.floor).slice(0, 6), kitchen: nums(m.kitchen).slice(0, 3), raw: String(m.raw || "").slice(0, 3000), time: m.time || "", sender: String(m.sender || "").slice(0, 40), newRound: !!m.newRound }));
    if (out.some(m => !C.isDateKey(m.date))) return toast("תאריך לא תקין");
    if (out.some(m => !m.floor.length && !m.kitchen.length)) return toast("חסרים מספרי חדרים");
    close();
    try {
      for (const m of out) await setDoc(doc(db, "ch_duties", m.date), { ...m, by: emailKey(S.user.email), byRoom: S.room, at: serverTimestamp() });
      const r = C.roomRoles(C.dutyFor([...S.duties, ...out], today()), S.room);
      toast(r.floor || r.kitchen ? `נשמר! החדר שלכם ב${r.floor ? "תורנות קומה" : "מטבחון ומועדון"} 💪` : "נשמר! החדר שלכם לא בתורנות 😌", 3500);
    } catch (e) { fail(e); }
  });
  draw(s.root);
}

// הודעה בתוך האתר כשהחדר נכנס לתורנות
function notifyDutyChange(prev) {
  const t0 = today();
  const before = C.roomRoles(C.dutyFor(prev, t0), S.room), now = C.roomRoles(C.dutyFor(S.duties, t0), S.room);
  if ((now.floor && !before.floor) || (now.kitchen && !before.kitchen)) {
    const msg = `חדר ${S.room} נכנס ל${now.floor ? "תורנות קומה" : "מטבחון ומועדון"}`;
    toast("📋 " + msg, 4000);
  }
}

// =====================================================================
//  עזרה
// =====================================================================
function installHelp() {
  sheet(`<h2>📲 התקנה כאפליקציה</h2>
    <div class="list"><div class="li"><span class="emo">🍎</span><div class="tx"><b>אייפון</b><span>בספארי: כפתור השיתוף ⬆️ ← "הוספה למסך הבית"</span></div></div>
    <div class="li"><span class="emo">🤖</span><div class="tx"><b>אנדרואיד</b><span>בכרום: תפריט ⋮ ← "התקנת אפליקציה" / "הוספה למסך הבית"</span></div></div></div>
    <div class="btns"><button class="btn block" data-act="close">הבנתי</button></div>`);
}
function helpSheet() {
  sheet(`<h2>❓ איך זה עובד</h2>
    <div class="list">
      <div class="li"><span class="emo">☀️</span><div class="tx"><b>כל בוקר חלוקה חדשה</b><span>כל אחד מסדר את המיטה שלו. פינוי שולחן וטאטוא מתחלקים, ובחמישי גם שטיפה.</span></div></div>
      <div class="li"><span class="emo">📋</span><div class="tx"><b>תורנות קומה ומטבחון</b><span>כשהמדריך שולח הודעה - מדביקים אותה בלשונית "תורנות". מספיק שחדר אחד ידביק, וזה מתעדכן לכולם.</span></div></div>
      <div class="li"><span class="emo">🤒</span><div class="tx"><b>מישהו חולה / לא הגיע</b><span>לוחצים ⋯ ליד השם. המשימות שלו עוברות לאחרים, ומה שכבר בוצע נשאר.</span></div></div>
      <div class="li"><span class="emo">⇄</span><div class="tx"><b>החלפות</b><span>⇄ ליד משימה מעביר אותה למישהו אחר. ⋯ ← "החלפת תורנות" מחליף את כל המשימות בין שניים.</span></div></div>
      <div class="li"><span class="emo">🏖️</span><div class="tx"><b>חופשות, טיולים ושינויים</b><span>בלשונית "השבוע": יום בלי משימות, העברת יום השטיפה, ביטול תורנות ועוד.</span></div></div>
      <div class="li"><span class="emo">⚖️</span><div class="tx"><b>הוגנות</b><span>מי שעשה פחות לאורך זמן מקבל קודם. שטיפה ושירותים נחשבים יותר משולחן.</span></div></div>
    </div><div class="btns"><button class="btn block" data-act="close">סגירה</button></div>`);
}

// יום חדש בזמן שהאתר פתוח
let lastDay = today();
setInterval(() => { const t = today(); if (t !== lastDay) { if (S.viewKey === lastDay) S.viewKey = t; lastDay = t; changed(); } }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) changed(); });
