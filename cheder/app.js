// =====================================================================
//  תורנויות חדר - האפליקציה לחדרים (reembir.com/b/cheder/)
//  נכנסים עם Google. אחראי החדר = מי שהאדמין צירף. הוא מזמין את שאר
//  הדיירים בקישור אישי (?join=...). דייר רואה הכל ומשנה רק את מה ששלו.
//  מאגר משותף: תורנויות ושינויים בלו"ז מתעדכנים לכל החדרים, אלא אם החדר
//  הזין אחרת לעצמו או יצא מהמאגר המשותף (מצב עצמאי).
// =====================================================================
import {
  db, FS, $, esc, emailKey, isAdminUser, authError, signIn, watchAuth, logout,
  toggleTheme, toast, sheet, confirmSheet, colorOf, initials, GOOGLE_SVG
} from "./common.js?v=5";
import * as C from "./core.js?v=5";

const { doc, collection, getDoc, setDoc, updateDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, runTransaction, writeBatch, serverTimestamp, deleteField, arrayUnion, arrayRemove } = FS;

const TABS = [
  { id: "today", label: "היום", ic: "☀️" },
  { id: "week", label: "השבוע", ic: "📅" },
  { id: "duty", label: "תורנות", ic: "📋" },
  { id: "room", label: "החדר", ic: "👥" },
  { id: "more", label: "עוד", ic: "⚙️" }
];

const S = {
  user: null, member: null, room: null,
  roomDoc: null, days: {}, absList: [], localDuties: [], sharedDuties: [], gEvents: [], sharedRaw: null,
  invites: [], roomMembers: [], suggestions: [],
  duties: [], settings: C.mergeSettings(),
  loaded: { room: false, days: false, abs: false, local: false, duties: false, events: false, settings: false },
  tab: TABS.some(t => t.id === location.hash.slice(1)) ? location.hash.slice(1) : "today",
  viewKey: C.dateKey(), weekOffset: 0, unsubs: []
};
const today = () => C.dateKey();
const loadedAll = () => Object.values(S.loaded).every(Boolean);
const roomRef = () => doc(db, "ch_rooms", S.room);
const dayRef = key => doc(db, "ch_rooms", S.room, "days", key);
const myEmail = () => emailKey(S.user && S.user.email);
const isManager = () => !!S.member && (S.member.role || "manager") === "manager";
const independent = () => !!(S.roomDoc && S.roomDoc.independent);
const residents = () => (S.roomDoc && S.roomDoc.residents) || [];
const active = () => C.activeResidents(residents());
const myRid = () => S.member && S.member.rid ? S.member.rid : ((residents().find(r => r.email && r.email === myEmail()) || {}).id || null);
const legacyAbs = () => ((S.roomDoc && S.roomDoc.absences) || []).map(a => ({ ...a, legacy: true }));
const absences = () => [...legacyAbs(), ...S.absList];
const events = () => C.mergeEvents(S.gEvents, S.roomDoc, S.room);
const nameOf = id => (residents().find(r => r.id === id) || {}).name || "?";
const history = before => Object.values(S.days).filter(d => d.date < before).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
const ctx = key => ({ key, room: S.room, residents: residents(), absences: absences(), duty: C.dutyFor(S.duties, key), history: history(key), settings: S.settings, events: events() });
const fail = e => { console.error(e); toast(authError(e)); };
const canEditPerson = rid => isManager() || rid === myRid();
const newToken = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, b => (b % 36).toString(36)).join(""); };

// =====================================================================
//  התחברות והצטרפות בקישור אישי
// =====================================================================
const urlJoin = new URLSearchParams(location.search).get("join");
if (urlJoin) { try { sessionStorage.setItem("ch-join", urlJoin); } catch (e) {} }
const joinToken = () => { try { return sessionStorage.getItem("ch-join"); } catch (e) { return urlJoin; } };
const clearJoin = () => { try { sessionStorage.removeItem("ch-join"); } catch (e) {} if (location.search.includes("join=")) history_clean(); };
function history_clean() { try { window.history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} }
if (joinToken()) $("loginText").textContent = "הוזמנת להצטרף לחדר! התחברו עם Google כדי להצטרף.";

$("loginBtn").innerHTML = `${GOOGLE_SVG} התחברות עם Google`;
$("loginBtn").onclick = async () => { $("loginErr").textContent = ""; try { await signIn(); } catch (e) { $("loginErr").textContent = authError(e); } };
$("logoutBtn2").onclick = () => logout();
$("themeBtn").onclick = () => toggleTheme();
$("meBtn").onclick = () => go("more");

watchAuth(u => start(u), e => { $("loginErr").textContent = authError(e); });

async function start(u) {
  S.unsubs.forEach(f => f()); S.unsubs = [];
  Object.keys(S.loaded).forEach(k => { S.loaded[k] = false; });
  $("boot").classList.add("hidden");
  $("joinBox").classList.add("hidden");
  if (!u) { showLogin(); return; }
  S.user = u;
  let m = null;
  try {
    const snap = await getDoc(doc(db, "ch_members", emailKey(u.email)));
    m = snap.exists() ? snap.data() : null;
  } catch (e) {
    showLogin(e.code === "permission-denied" ? `לחשבון ${u.email} אין גישה.` : authError(e), true);
    return;
  }
  if (m && m.room) {
    if (joinToken()) { clearJoin(); setTimeout(() => toast(`החשבון הזה כבר משויך לחדר ${m.room}`), 800); }
    return enter(m);
  }
  if (joinToken()) return showJoin(joinToken());
  showLogin(`החשבון ${u.email} לא משויך לאף חדר. בקשו מאחראי החדר קישור הצטרפות.`, true);
}

function showLogin(err = "", signedIn = false) {
  $("app").classList.add("hidden"); $("login").classList.remove("hidden");
  $("loginErr").textContent = err;
  $("loginBtn").classList.toggle("hidden", signedIn);
  $("logoutBtn2").classList.toggle("hidden", !signedIn);
}

async function showJoin(token) {
  showLogin("", true);
  let inv = null;
  try { const s = await getDoc(doc(db, "ch_invites", token)); inv = s.exists() ? s.data() : null; } catch (e) { inv = null; }
  if (!inv) { clearJoin(); return showLogin("הקישור לא תקף או שבוטל. בקשו מאחראי החדר קישור חדש.", true); }
  if (inv.used) { clearJoin(); return showLogin("הקישור הזה כבר שומש. בקשו מאחראי החדר קישור חדש.", true); }
  $("loginText").textContent = "";
  $("joinBox").classList.remove("hidden");
  $("joinBox").innerHTML = `<div class="status on" style="justify-content:center;margin:0 0 14px">🚪 חדר ${esc(inv.room)}</div>
    <p style="margin:0 0 14px">הוזמנת להצטרף בתור <b>${esc(inv.name)}</b>.<br><span class="muted small ltr">${esc(S.user.email)}</span></p>
    <button class="btn pri block" id="joinBtn">הצטרפות לחדר</button>`;
  $("joinBtn").onclick = async () => {
    $("joinBtn").disabled = true;
    try {
      const b = writeBatch(db);
      b.set(doc(db, "ch_members", myEmail()), { email: myEmail(), name: inv.name, room: String(inv.room), role: "resident", rid: inv.rid, invite: token, addedAt: serverTimestamp() });
      b.update(doc(db, "ch_invites", token), { used: true, usedBy: myEmail(), usedAt: serverTimestamp() });
      await b.commit();
      clearJoin();
      $("joinBox").classList.add("hidden");
      await start(S.user);
      toast(`ברוך הבא לחדר ${inv.room}! 👋`);
    } catch (e) { $("joinBtn").disabled = false; $("loginErr").textContent = authError(e); }
  };
}

function enter(m) {
  S.member = m; S.room = String(m.room);
  $("login").classList.add("hidden"); $("app").classList.remove("hidden");
  $("roomDot").textContent = S.room;
  $("hdrSub").textContent = `חדר ${S.room}${m.name ? " · " + m.name : ""}${isManager() ? " · אחראי" : ""}`;
  $("meBtn").innerHTML = S.user.photoURL ? `<img src="${esc(S.user.photoURL)}" alt="" referrerpolicy="no-referrer">` : "👤";
  subscribe();
  render();
}

// =====================================================================
//  סנכרון
// =====================================================================
function subscribe() {
  const on = (ref, fn, k) => S.unsubs.push(onSnapshot(ref, snap => { fn(snap); if (k) S.loaded[k] = true; changed(); },
    e => { if (k) S.loaded[k] = true; console.error(k, e); if (k) toast(`בעיה בטעינת נתונים (${e.code})`); changed(); }));
  on(doc(db, "sites", "cheder"), s => { S.sharedRaw = s.exists() ? s.data() : null; }, "settings");
  on(roomRef(), s => {
    if (s.exists()) S.roomDoc = s.data();
    else {
      S.roomDoc = { room: S.room, residents: [], events: [] };
      // פעם ראשונה: האחראי יוצר את החדר, ומופיע בו כדייר ראשון
      if (isManager()) {
        const first = S.member.name ? [{ id: C.uid(), name: S.member.name, email: myEmail(), since: today() }] : [];
        setDoc(roomRef(), { room: S.room, residents: first, events: [], ignoredEvents: [], independent: false, createdAt: serverTimestamp() }).catch(fail);
      }
    }
  }, "room");
  on(query(collection(db, "ch_rooms", S.room, "days"), orderBy("date", "desc"), limit(60)), s => { S.days = {}; s.forEach(d => { S.days[d.id] = d.data(); }); }, "days");
  on(collection(db, "ch_rooms", S.room, "absences"), s => { S.absList = s.docs.map(d => ({ ...d.data(), id: d.id })); }, "abs");
  on(query(collection(db, "ch_rooms", S.room, "duties"), orderBy("date", "desc"), limit(30)), s => { S.localDuties = s.docs.map(d => d.data()); }, "local");
  on(query(collection(db, "ch_duties"), orderBy("date", "desc"), limit(40)), s => { S.sharedDuties = s.docs.map(d => d.data()); }, "duties");
  on(query(collection(db, "ch_events"), orderBy("from", "desc"), limit(100)), s => { S.gEvents = s.docs.map(d => ({ id: d.id, ...d.data() })); }, "events");
  on(query(collection(db, "ch_suggestions"), where("room", "==", S.room)), s => { S.suggestions = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at || 0) - (a.at || 0)); });
  if (isManager()) {
    on(query(collection(db, "ch_invites"), where("room", "==", S.room)), s => { S.invites = s.docs.map(d => ({ id: d.id, ...d.data() })); });
    on(query(collection(db, "ch_members"), where("room", "==", S.room)), s => { S.roomMembers = s.docs.map(d => ({ id: d.id, ...d.data() })); });
  }
}

let ensureTimer = null, renderQueued = false, prevDuties = null;
function changed() {
  S.settings = C.roomSettings(S.sharedRaw, S.roomDoc);
  S.duties = C.mergeDuties(S.sharedDuties, S.localDuties, independent());
  if (!loadedAll()) { render(); return; }
  if (prevDuties) notifyDutyChange(prevDuties);
  prevDuties = S.duties;
  clearTimeout(ensureTimer);
  ensureTimer = setTimeout(ensureToday, 400);
  if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }
}

// שומר את החלוקה של היום (כדי שכל המכשירים יראו אותו דבר וההיסטוריה תישמר)
async function ensureToday() {
  const key = today();
  if (!S.roomDoc || !active().length) return;
  const { changed } = C.buildPlan({ ...ctx(key), existing: S.days[key] || null });
  if (!changed) return;
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(dayRef(key));
      const existing = snap.exists() ? snap.data() : null;
      const r = C.buildPlan({ ...ctx(key), existing });
      if (!r.changed) return;
      if (!existing) tx.set(dayRef(key), { ...r.plan, done: {}, manual: {}, at: serverTimestamp() });
      else tx.update(dayRef(key), { tasks: r.plan.tasks, present: r.plan.present, assign: r.plan.assign, byPerson: r.plan.byPerson, dutyDate: r.plan.dutyDate, at: serverTimestamp() });
    });
  } catch (e) { if (e.code !== "unavailable" && e.code !== "failed-precondition") console.warn("ensureToday", e); }
}

// החלוקה של יום: שמורה (עבר/היום) או תחזית (עתיד)
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
function go(tab) { S.tab = tab; try { window.history.replaceState(null, "", location.pathname + "#" + S.tab); } catch (e) {} render(); window.scrollTo({ top: 0 }); }

function render() {
  if (!S.room) return;
  $("tabs").style.setProperty("--n", TABS.length);
  const staleBadge = isManager() && dutyStale() ? `<span class="badge">!</span>` : "";
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
const roleChips = key => {
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
const absText = ab => `${C.reasonOf(ab).icon} ${C.reasonOf(ab).name}${ab.to ? ` עד ${C.fmtDate(ab.to)}` : " · עד הודעה חדשה"}${ab.note ? " · " + esc(ab.note) : ""}`;
const modeBanner = () => independent() ? `<div class="status warn" style="margin:0 0 14px">🔌 <span class="grow">החדר במצב עצמאי - לא מחובר למאגר המשותף</span></div>` : "";

// ---------- היום ----------
function vToday() {
  const key = S.viewKey, t0 = today();
  const plan = planFor(key);
  const isFuture = key > t0, isPast = key < t0;
  const info = C.dayInfo(key, S.room, S.settings, events());
  const me = myRid();
  const act = [...active()].sort((a, b) => (b.id === me) - (a.id === me));
  const done = (plan && plan.done) || {};
  const present = (plan && plan.present) || [];
  const items = plan && plan.tasks.length ? [...plan.tasks, ...present.map(id => "bed_" + id)] : [];
  const doneCount = items.filter(k => done[k]).length;
  const pct = items.length ? Math.round(doneCount / items.length * 100) : 0;

  let h = `<div class="card hero">
    <div class="row" style="position:relative;z-index:1"><div class="grow"><div class="day">${esc(C.fmtDay(key, t0))}${isFuture ? " · תחזית" : ""}</div><div class="title">חדר ${esc(S.room)}</div></div>
      <div class="nav"><button data-act="day" data-d="-1" aria-label="יום קודם">→</button>${key !== t0 ? `<button data-act="day" data-d="0">היום</button>` : ""}<button data-act="day" data-d="1" aria-label="יום הבא">←</button></div></div>
    <div class="chips" style="position:relative;z-index:1">${roleChips(key)}</div>
    ${items.length ? `<div class="prog"><div class="bar"><div style="width:${pct}%"></div></div><b>${doneCount}/${items.length}</b></div>` : ""}
  </div>`;

  if (key === t0 && info.active && isManager() && dutyStale()) {
    const d = C.dutyFor(S.duties, t0);
    h += `<div class="status warn" style="margin:-4px 0 14px">⏰ <span class="grow">${d ? `התורנות עודכנה לפני ${C.daysBetween(d.date, t0)} ימים. יש הודעה חדשה מהמדריך?` : "עוד לא הוזנה תורנות קומה/מטבחון."}</span><button class="btn sm" data-act="paste">הדבקה</button></div>`;
  }
  if (!act.length) {
    return h + (isManager()
      ? `<div class="card empty"><div class="big">👋</div><b>ברוכים הבאים לחדר ${esc(S.room)}!</b><p>קודם כל, הוסיפו את כל מי שגר בחדר.</p><button class="btn pri" data-act="go" data-tab="room">הוספת אנשים</button></div>`
      : `<div class="card empty"><div class="big">⏳</div>אחראי החדר עוד לא הוסיף דיירים.</div>`);
  }
  if (!info.active) {
    h += `<div class="card empty"><div class="big">${info.off ? "🏖️" : C.weekday(key) === 6 ? "🕯️" : "😴"}</div><b>${info.off ? esc(info.off.title || "חופשה") : C.weekday(key) === 6 ? "שבת שלום!" : "אין משימות היום"}</b><p class="small">אין סידור ניקיון ביום הזה.</p></div>`;
  }
  if (!plan) return h + `<div class="card empty">אין נתונים שמורים ליום הזה.</div>`;

  if (info.active) for (const r of act) {
    if (!present.includes(r.id)) continue;
    const mine = C.tasksOf(plan, r.id);
    const isMe = r.id === me, canCheck = !isFuture && (isManager() || isMe);
    const rows = [{ k: "bed_" + r.id, ic: C.BED.icon, name: C.BED.name, sub: "כל אחד את שלו", g: "bed" },
      ...mine.map(t => ({ k: t, t, ic: C.TASKS[t].icon, name: C.TASKS[t].name, sub: C.GROUPS[C.TASKS[t].group].name + (plan.manual && plan.manual[t] ? " · הוחלף" : ""), g: C.TASKS[t].group }))];
    const allDone = rows.every(x => done[x.k]);
    h += `<div class="card person" ${isMe ? `style="border-color:var(--a)"` : ""}>
      <div class="person-hd">${avatar(r)}<div class="nm"><b>${esc(r.name)}${isMe ? ` <span class="chip me" style="font-size:.7rem;padding:1px 8px">אני</span>` : ""}${allDone ? " ✨" : ""}</b><span>${mine.length ? `${mine.length} משימות + מיטה` : "רק המיטה היום"}</span></div>
        ${!isPast && canEditPerson(r.id) ? `<button class="more-btn" data-act="person" data-id="${r.id}" aria-label="אפשרויות">⋯</button>` : ""}</div>
      <ul class="tasks">${rows.map(x => `<li class="task g-${x.g} ${x.t ? "t-" + x.t : ""} ${done[x.k] ? "done" : ""}">
        <span class="ic">${x.ic}</span><div class="tx"><b>${esc(x.name)}</b><span>${esc(x.sub)}</span></div>
        ${x.t && isManager() && !isPast ? `<button class="who" data-act="task" data-t="${x.t}" title="להעביר למישהו אחר">⇄</button>` : ""}
        <button class="check" data-act="check" data-k="${x.k}" ${canCheck ? "" : "disabled"} aria-label="בוצע">✓</button></li>`).join("")}</ul>
    </div>`;
  }
  const away = act.filter(r => !present.includes(r.id));
  if (away.length) {
    h += `<div class="sec-title">לא בחדר</div>`;
    for (const r of away) {
      const ab = C.absenceOn(absences(), r.id, key);
      const doneTasks = C.tasksOf(plan, r.id);
      h += `<div class="card person away"><div class="person-hd">${avatar(r)}<div class="nm"><b>${esc(r.name)}</b><span>${ab ? absText(ab) : "לא היה בחדר"}${doneTasks.length ? ` · ביצע: ${doneTasks.map(taskName).join(", ")}` : ""}</span></div>
        ${ab && !isPast && canEditPerson(r.id) ? `<button class="btn sm" data-act="back" data-id="${r.id}">חזר ✓</button>` : ""}</div></div>`;
    }
  }
  if (info.active && away.length) h += `<div class="status off small" style="margin:4px 0 12px">🛏️ <span class="grow">${away.map(r => esc(r.name)).join(", ")} לא בחדר - לדאוג שהמיטה ${away.length > 1 ? "שלהם" : "שלו"} מסודרת. מי שיושב עליה בהמשך - מסדר.</span></div>`;
  if (info.active && !isPast) h += `<p class="muted small center">${isManager() ? "⇄ מעביר משימה למישהו אחר · ⋯ ליד שם: חולה / נסע הביתה / החלפה" : "מסמנים ✓ על מה שעשית · ⋯ ליד השם שלך: חולה / נסע הביתה"}</p>`;
  return h;
}

// ---------- השבוע ----------
function vWeek() {
  const t0 = today();
  const start = C.addDays(t0, S.weekOffset * 7);
  const plans = C.projectPlans({ fromKey: t0, days: S.weekOffset * 7 + 7, room: S.room, residents: residents(), absences: absences(), duties: S.duties, history: history(t0), settings: S.settings, events: events(), existingByDate: S.days }).slice(S.weekOffset * 7);
  const me = myRid();
  let h = modeBanner() + `<div class="card-hd" style="margin:2px 4px 12px"><h2 class="grow" style="margin:0">הלו"ז ${S.weekOffset === 0 ? "לשבוע הקרוב" : `מ-${C.fmtDate(start)}`}</h2>
    <button class="btn sm" data-act="wk" data-d="-1" ${S.weekOffset <= 0 ? "disabled" : ""}>→</button><button class="btn sm" data-act="wk" data-d="1" ${S.weekOffset >= 3 ? "disabled" : ""}>←</button></div>
    ${isManager() ? `<div class="btns" style="margin:0 0 14px"><button class="btn pri sm" data-act="event">＋ חופשה / טיול / שינוי בלו"ז</button></div>` : ""}
    <div class="week">`;
  for (const p of plans) {
    const info = C.dayInfo(p.date, S.room, S.settings, events());
    const awayIds = active().filter(r => !p.present.includes(r.id));
    h += `<div class="wday ${p.date === t0 ? "today" : ""} ${info.active ? "" : "off"}" data-act="openday" data-k="${p.date}">
      <div class="wday-hd"><b>${C.DAY_NAMES[C.weekday(p.date)]}</b><span class="muted">${C.fmtDate(p.date)}${p.date === t0 ? " · היום" : ""}</span><div class="chips">${roleChips(p.date)}</div></div>`;
    if (info.active && p.tasks.length) {
      h += `<div class="wgrid">${p.present.map(id => {
        const ts = C.tasksOf(p, id);
        return `<div class="wrow"><span class="n" ${id === me ? `style="color:var(--a)"` : ""}>${esc(nameOf(id))}</span><span class="t">${ts.length ? ts.map(t => C.TASKS[t].icon + " " + C.TASKS[t].name).join(" · ") : "🛏️ רק מיטה"}</span></div>`;
      }).join("")}</div>`;
    }
    if (awayIds.length) h += `<div class="small muted" style="margin-top:6px">לא בחדר: ${awayIds.map(r => { const a = C.absenceOn(absences(), r.id, p.date); return esc(r.name) + (a ? " " + C.reasonOf(a).icon : ""); }).join(", ")}</div>`;
    h += `</div>`;
  }
  h += `</div><p class="muted small center" style="margin-top:12px">תורנות קומה/מטבחון בימים הבאים מוצגת לפי העדכון האחרון, ותתעדכן כשהמדריך ישלח חדשה.</p>`;

  // שינויים בלו"ז: של החדר + מהמאגר המשותף (כולל כאלה שהחדר החליט שלא חלים עליו)
  const ignored = new Set((S.roomDoc && S.roomDoc.ignoredEvents) || []);
  const shared = independent() ? [] : S.gEvents.filter(e => (e.to || e.from) >= t0).map(e => ({ ...e, room: null, ignored: ignored.has(e.id) }));
  const own = ((S.roomDoc && S.roomDoc.events) || []).filter(e => (e.to || e.from) >= t0).map(e => ({ ...e, room: S.room }));
  const up = [...shared, ...own].sort((a, b) => a.from.localeCompare(b.from));
  h += `<div class="sec-title">שינויים בלו"ז</div><div class="card">`;
  if (!up.length) h += `<div class="muted small">אין שינויים.${isManager() ? " אפשר להוסיף חופשה, טיול, העברת יום שטיפה ועוד." : ""}</div>`;
  else h += `<div class="list">${up.map(e => `<div class="li" ${e.ignored ? `style="opacity:.55"` : ""}><span class="emo">${C.EVENT_TYPES[e.type].icon}</span><div class="tx"><b>${esc(e.title || C.EVENT_TYPES[e.type].name)}${e.ignored ? " · לא חל עלינו" : ""}</b><span>${eventRange(e)} · ${e.room ? "רק החדר שלנו" : `משותף${e.byRoom ? ` (חדר ${esc(e.byRoom)})` : ""}`}</span></div>
      ${isManager() && !e.room ? `<button class="btn sm" data-act="ignore" data-id="${esc(e.id)}" data-v="${e.ignored ? 0 : 1}">${e.ignored ? "להחיל" : "לא חל עלינו"}</button>` : ""}
      ${canDeleteEvent(e) ? `<button class="more-btn" data-act="delevent" data-id="${esc(e.id)}" data-scope="${e.room ? "room" : "all"}" aria-label="מחיקה">🗑</button>` : ""}</div>`).join("")}</div>`;
  h += `</div>`;
  return h;
}
const eventRange = e => e.type === "mopmove" ? `מ-${C.DAY_NAMES[C.weekday(e.from)]} ${C.fmtDate(e.from)} ל-${C.DAY_NAMES[C.weekday(e.to)]} ${C.fmtDate(e.to)}`
  : (!e.to || e.to === e.from) ? `יום ${C.DAY_NAMES[C.weekday(e.from)]} ${C.fmtDate(e.from)}` : `${C.fmtDate(e.from)} – ${C.fmtDate(e.to)}`;
const canDeleteEvent = e => isManager() && (!!e.room || e.byRoom === S.room);

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
  let h = modeBanner() + `<div class="card"><div class="card-hd"><h2>התורנות הנוכחית</h2>${d ? `<span class="chip">מ-${C.DAY_NAMES[C.weekday(d.date)]} ${C.fmtDate(d.date)}</span>` : ""}</div>`;
  if (!d) h += `<div class="empty"><div class="big">📭</div>עוד לא הוזנה תורנות.${isManager() ? " הדביקו את ההודעה של המדריך." : ""}</div>`;
  else {
    h += `<div class="duty-grid"><div class="duty-box"><h4>🏢 תורנות קומה</h4>${roomsHtml(d.floor)}</div><div class="duty-box"><h4>🍳 מטבחון, מועדון${S.settings.outside ? " ומחוץ לפנימייה" : ""}</h4>${roomsHtml(d.kitchen)}</div></div>`;
    h += roles.floor || roles.kitchen
      ? `<div class="status on">⭐ החדר שלכם ב${[roles.floor && "תורנות קומה", roles.kitchen && "מטבחון ומועדון"].filter(Boolean).join(" וגם ב")}</div>`
      : `<div class="status off">😌 החדר שלכם לא בתורנות כרגע</div>`;
    const age = C.daysBetween(d.date, t0);
    if (age >= S.settings.staleDays) h += `<div class="status warn">⏰ עברו ${age} ימים מהעדכון - בדרך כלל מתחלף כל 3 ימים</div>`;
    h += `<div class="small muted" style="margin-top:10px">${d.local ? "🚪 הוזן ע\"י החדר שלכם - חל רק עליכם" : `🏫 מהמאגר המשותף${d.byRoom ? ` · עודכן ע"י חדר ${esc(d.byRoom)}` : ""}`}${d.sender ? ` · מתוך ההודעה של ${esc(d.sender)}${d.time ? " ב-" + esc(d.time) : ""}` : ""}${d.newRound ? " · סבב חדש" : ""}</div>`;
  }
  if (isManager()) h += `<div class="btns"><button class="btn pri grow" data-act="paste">📋 הדבקת הודעה מהמדריך</button><button class="btn" data-act="manual">✏️ עריכה / החלפה</button></div>`;
  h += `</div>`;
  if (S.duties.length) {
    h += `<div class="sec-title">היסטוריה</div><div class="card"><div class="list">${S.duties.slice(0, 15).map(x => {
      const r = C.roomRoles(x, S.room);
      return `<div class="li"><span class="emo">${r.floor ? "🏢" : r.kitchen ? "🍳" : "📋"}</span><div class="tx"><b>${C.DAY_NAMES[C.weekday(x.date)]} ${C.fmtDate(x.date)}${x.local ? " · שלנו בלבד" : ""}</b><span>קומה: ${(x.floor || []).join(", ") || "—"} · מטבחון: ${(x.kitchen || []).join(", ") || "—"}</span></div>
        ${r.floor || r.kitchen ? `<span class="chip me">אנחנו</span>` : ""}${x.local && isManager() ? `<button class="more-btn" data-act="dellocal" data-id="${x.date}" aria-label="מחיקה">🗑</button>` : ""}</div>`;
    }).join("")}</div></div>`;
  }
  return h;
}

// ---------- החדר ----------
function memberOf(rid) { return S.roomMembers.find(m => m.rid === rid && m.role === "resident"); }
function inviteOf(rid) { return S.invites.find(i => i.rid === rid && !i.used); }
function vRoom() {
  const t0 = today();
  const act = active();
  const mgr = isManager();
  const me = myRid();
  let h = `<div class="card"><div class="card-hd"><h2>מי בחדר ${esc(S.room)}</h2><span class="chip">${act.length}</span></div>
    <div class="list">${act.map(r => {
      const ab = C.absenceOn(absences(), r.id, t0);
      let acc = "";
      if (r.email && r.email === (mgr ? myEmail() : null)) acc = `<span class="chip ok">אחראי</span>`;
      else if (mgr) acc = memberOf(r.id) ? `<span class="chip ok">מחובר ✓</span>` : inviteOf(r.id) ? `<span class="chip warn">הוזמן</span>` : "";
      if (r.id === me) acc = `<span class="chip me">אני</span>`;
      return `<div class="li">${avatar(r, 36)}<div class="tx"><b>${esc(r.name)}</b><span>${ab ? absText(ab) : "בחדר"}</span></div>${acc}
        ${mgr && r.id !== me ? `<button class="btn sm" data-act="invite" data-id="${r.id}" title="קישור אישי">🔗</button>` : ""}
        ${mgr ? `<button class="more-btn" data-act="resident" data-id="${r.id}" aria-label="עריכה">⋯</button>` : ""}</div>`;
    }).join("") || `<div class="muted small">עוד אין אף אחד.${mgr ? " הוסיפו את כל מי שגר בחדר." : ""}</div>`}</div>
    ${mgr ? `<form class="row" style="margin-top:12px" data-form="addres"><input class="inp grow" name="name" placeholder="שם של מישהו בחדר" maxlength="30" autocomplete="off"><button class="btn pri">הוספה</button></form>
      <p class="muted small" style="margin-bottom:0">🔗 שולחים לכל אחד קישור אישי. הוא נכנס עם Google, רואה את הלו"ז ומסמן רק את מה ששלו.</p>` : ""}
    ${mgr && !me && act.length ? `<div class="status warn">מי מהרשימה זה אתה? <button class="btn sm" data-act="whoami">לבחור</button></div>` : ""}
  </div>`;

  // היעדרויות
  const abs = absences().filter(a => !a.to || a.to >= C.addDays(t0, -7)).sort((a, b) => b.from.localeCompare(a.from));
  h += `<div class="sec-title">היעדרויות, מחלות וחופשות אישיות</div><div class="card">
    ${abs.length ? `<div class="list">${abs.map(a => {
      const cur = a.from <= t0 && (!a.to || a.to >= t0), fut = a.from > t0;
      return `<div class="li"><span class="emo">${C.reasonOf(a).icon}</span><div class="tx"><b>${esc(nameOf(a.rid))} · ${C.reasonOf(a).name}</b><span>${C.fmtDate(a.from)}${a.to ? (a.to !== a.from ? " – " + C.fmtDate(a.to) : "") : " · עד הודעה חדשה"}${a.note ? " · " + esc(a.note) : ""}</span></div>
        ${cur ? `<span class="chip warn">עכשיו</span>` : fut ? `<span class="chip">בקרוב</span>` : `<span class="chip ok">הסתיים</span>`}
        ${canEditPerson(a.rid) && (!a.legacy || mgr) ? `<button class="more-btn" data-act="delabs" data-id="${a.id}" aria-label="מחיקה">🗑</button>` : ""}</div>`;
    }).join("")}</div>` : `<div class="muted small">אין היעדרויות. מישהו חולה או נסע הביתה? סמנו כאן והמשימות שלו יחולקו לאחרים.</div>`}
    ${mgr || me ? `<div class="btns"><button class="btn" data-act="absence">＋ סימון היעדרות</button></div>` : ""}</div>`;

  // מאגר משותף
  h += `<div class="sec-title">מאגר משותף</div><div class="card">
    ${mgr ? `<label class="switch"><div class="tx"><b>מחוברים למאגר המשותף</b><span>תורנויות וחופשות שחדרים אחרים מזינים מתעדכנים גם אצלכם (אפשר תמיד להזין אחרת רק לחדר)</span></div><input type="checkbox" data-room="shared" ${independent() ? "" : "checked"}></label>`
      : `<div class="status ${independent() ? "warn" : "on"}" style="margin:0">${independent() ? "🔌 החדר במצב עצמאי" : "🏫 החדר מחובר למאגר המשותף"}</div>`}
    ${independent() && mgr ? ownSettingsHtml() : ""}
    ${!independent() ? `<div class="small muted" style="margin-top:8px">ימי ניקיון: ${S.settings.activeDays.map(i => C.DAY_NAMES[i]).join(", ")} · שטיפה: ${S.settings.mopDay >= 0 ? "יום " + C.DAY_NAMES[S.settings.mopDay] : "אין"}. רק המנהל משנה - אפשר להציע לו שינוי בלשונית "עוד".</div>` : ""}
  </div>`;

  // הוגנות
  const hist = Object.values(S.days).filter(d => d.date <= t0 && d.date > C.addDays(t0, -31));
  const st = C.computeStats(hist, act.map(r => r.id));
  const doneOf = id => hist.reduce((a, d) => a + Object.entries(d.assign || {}).filter(([t, x]) => x === id && d.done && d.done[t]).length, 0);
  const max = Math.max(1, ...act.map(r => st[r.id].load));
  h += `<div class="sec-title">הוגנות - 30 הימים האחרונים</div><div class="card">${hist.length ? `<table class="stats"><thead><tr><th>שם</th><th>ימים</th><th>משימות</th><th>בוצע</th><th style="width:30%">עומס</th></tr></thead><tbody>
    ${act.map(r => { const s = st[r.id]; const dn = doneOf(r.id); return `<tr><td><b>${esc(r.name)}</b></td><td>${s.days}</td><td>${s.count}</td><td>${s.count ? Math.round(dn / s.count * 100) + "%" : "—"}</td><td><div class="meter"><div style="width:${s.load / max * 100}%"></div></div></td></tr>`; }).join("")}
    </tbody></table><p class="muted small" style="margin-bottom:0">המערכת מחלקת כל בוקר מחדש: קודם מאזנת את היום, ואז נותנת יותר למי שעשה פחות לאורך זמן (בהתחשב בימים שהיה בחדר). שטיפה ושירותים "שווים" יותר משולחן.</p>` : `<div class="muted small">הנתונים יופיעו אחרי כמה ימים.</div>`}</div>`;
  return h;
}
function ownSettingsHtml() {
  const s = S.settings;
  return `<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
    <div class="field"><span>ימים עם ניקיון בוקר (רק אצלכם)</span><div class="seg">${C.DAY_NAMES.map((n, i) => `<button data-act="own" data-k="day" data-v="${i}" class="${s.activeDays.includes(i) ? "on" : ""}">${n}</button>`).join("")}</div></div>
    <div class="field"><span>יום שטיפת החדר</span><div class="seg">${C.DAY_NAMES.map((n, i) => `<button data-act="own" data-k="mop" data-v="${i}" class="${s.mopDay === i ? "on" : ""}">${n}</button>`).join("")}<button data-act="own" data-k="mop" data-v="-1" class="${s.mopDay < 0 ? "on" : ""}">אין</button></div></div>
    <label class="switch"><div class="tx"><b>"מחוץ לפנימייה" בתורנות המטבחון</b></div><input type="checkbox" data-room="outside" ${s.outside ? "checked" : ""}></label>
  </div>`;
}

// ---------- עוד ----------
const SUG_KINDS = { activeDays: "ימי ניקיון", mopDay: "יום השטיפה", outside: "\"מחוץ לפנימייה\"", other: "אחר" };
const STATUS = { open: ["⏳ ממתין", ""], approved: ["✓ אושר", "ok"], rejected: ["✕ נדחה", "bad"] };
function sugValue(s) {
  if (s.kind === "activeDays") return (s.value || []).map(i => C.DAY_NAMES[i]).join(", ");
  if (s.kind === "mopDay") return s.value >= 0 ? "יום " + C.DAY_NAMES[s.value] : "בלי שטיפה";
  if (s.kind === "outside") return s.value ? "כן" : "לא";
  return "";
}
function vMore() {
  const u = S.user;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let h = `<div class="card"><div class="list">
    <div class="li"><span class="emo">👤</span><div class="tx"><b>${esc(u.displayName || S.member.name || "")}</b><span class="ltr">${esc(u.email)}</span></div><span class="chip">${isManager() ? "אחראי" : "דייר"} · חדר ${esc(S.room)}</span></div>
    <button class="opt" data-act="theme"><span class="emo">🌓</span><span class="tx">מצב כהה / בהיר</span></button>
    ${!standalone ? `<button class="opt" data-act="install"><span class="emo">📲</span><span class="tx">התקנה כאפליקציה<span>להוסיף את האתר למסך הבית</span></span></button>` : ""}
    <button class="opt" data-act="help"><span class="emo">❓</span><span class="tx">איך זה עובד</span></button>
    ${isAdminUser(u) ? `<a class="opt" href="admin/" style="text-decoration:none;color:inherit"><span class="emo">🛠️</span><span class="tx">ממשק ניהול</span></a>` : ""}
    <button class="opt" data-act="logout"><span class="emo">🚪</span><span class="tx" style="color:var(--bad)">התנתקות</span></button>
  </div></div>`;
  h += `<div class="card"><div class="card-hd"><h2>💡 הצעה למנהל</h2></div>
    <p class="muted small" style="margin-top:0">ימי הניקיון, יום השטיפה ושאר ההגדרות המשותפות נקבעים ע"י המנהל. יש רעיון לשינוי? שלחו לו הצעה.</p>
    <button class="btn block" data-act="suggest">שליחת הצעה</button>
    ${S.suggestions.length ? `<div class="list" style="margin-top:8px">${S.suggestions.slice(0, 10).map(s => `<div class="li"><span class="emo">💡</span><div class="tx"><b>${SUG_KINDS[s.kind] || ""}${sugValue(s) ? ": " + esc(sugValue(s)) : ""}</b><span>${esc(s.text || "")}${s.byName ? " · " + esc(s.byName) : ""}${s.reply ? ` · תשובה: ${esc(s.reply)}` : ""}</span></div><span class="chip ${STATUS[s.status][1]}">${STATUS[s.status][0]}</span>
      ${s.status === "open" && s.by === myEmail() ? `<button class="more-btn" data-act="delsug" data-id="${s.id}" aria-label="מחיקה">🗑</button>` : ""}</div>`).join("")}</div>` : ""}
  </div>`;
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
    else if (a === "dellocal") { if (await confirmSheet("למחוק את התורנות שהזנתם לחדר?", "יחזרו לתורנות המשותפת", "מחיקה", true)) await deleteDoc(doc(db, "ch_rooms", S.room, "duties", el.dataset.id)); }
    else if (a === "wk") { S.weekOffset = Math.max(0, Math.min(3, S.weekOffset + +el.dataset.d)); render(); }
    else if (a === "openday") { S.viewKey = el.dataset.k; go("today"); }
    else if (a === "event") eventSheet();
    else if (a === "delevent") await delEvent(el.dataset.id, el.dataset.scope);
    else if (a === "ignore") { e.stopPropagation(); await updateDoc(roomRef(), { ignoredEvents: el.dataset.v === "1" ? arrayUnion(el.dataset.id) : arrayRemove(el.dataset.id) }); }
    else if (a === "resident") residentSheet(el.dataset.id);
    else if (a === "invite") await inviteSheet(el.dataset.id);
    else if (a === "whoami") whoAmISheet();
    else if (a === "absence") absenceSheet(isManager() ? null : myRid());
    else if (a === "delabs") await delAbsence(el.dataset.id);
    else if (a === "own") await ownSetting(el.dataset.k, +el.dataset.v);
    else if (a === "suggest") suggestSheet();
    else if (a === "delsug") { if (await confirmSheet("למחוק את ההצעה?", "", "מחיקה", true)) await deleteDoc(doc(db, "ch_suggestions", el.dataset.id)); }
    else if (a === "theme") toggleTheme();
    else if (a === "install") installHelp();
    else if (a === "help") helpSheet();
    else if (a === "logout") { if (await confirmSheet("להתנתק?", "", "התנתקות")) logout(); }
  } catch (err) { fail(err); }
});
$("view").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === "addres" && isManager()) {
    const name = f.name.value.trim().slice(0, 30);
    if (!name) return;
    if (active().some(r => r.name === name)) return toast("כבר יש מישהו בשם הזה");
    f.name.value = "";
    await saveResidents([...residents(), { id: C.uid(), name, since: today() }]).catch(fail);
    toast(`${name} נוסף לחדר. אפשר לשלוח לו קישור אישי 🔗`);
  }
});
$("view").addEventListener("change", async e => {
  const k = e.target.dataset.room;
  if (!k || !isManager()) return;
  try {
    if (k === "shared") {
      const ind = !e.target.checked;
      if (ind && !(await confirmSheet("לצאת מהמאגר המשותף?", "תורנויות וחופשות שחדרים אחרים מזינים לא ישפיעו עליכם, ותנהלו הכל בעצמכם. אפשר לחזור בכל רגע.", "יציאה"))) { e.target.checked = true; return; }
      const patch = { independent: ind };
      if (ind && !(S.roomDoc && S.roomDoc.ownSettings)) patch.ownSettings = Object.fromEntries(C.SETTING_KEYS.map(x => [x, S.settings[x]]));
      await updateDoc(roomRef(), patch);
      toast(ind ? "החדר במצב עצמאי 🔌" : "חזרתם למאגר המשותף 🏫");
    } else if (k === "outside") await updateDoc(roomRef(), { "ownSettings.outside": e.target.checked });
  } catch (err) { fail(err); }
});
async function ownSetting(k, v) {
  if (!isManager() || !independent()) return;
  if (k === "day") { const d = S.settings.activeDays; await updateDoc(roomRef(), { "ownSettings.activeDays": d.includes(v) ? d.filter(x => x !== v) : [...d, v].sort() }); }
  if (k === "mop") await updateDoc(roomRef(), { "ownSettings.mopDay": v });
}

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

// ---------- העברת משימה (אחראי) ----------
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
        const assign = { ...plan.assign, [t]: id };
        await writeDay(key, { assign, byPerson: byPersonOf(plan.tasks, assign), [`manual.${t}`]: true });
        toast(`${C.TASKS[t].name} ← ${nameOf(id)}`);
      } else if (act === "auto") {
        close();
        const assign = { ...plan.assign }; delete assign[t];
        const r = C.buildPlan({ ...ctx(key), existing: { ...plan, assign } });
        await writeDay(key, { assign: r.plan.assign, byPerson: r.plan.byPerson, [`manual.${t}`]: deleteField() });
      }
    } catch (e) { fail(e); }
  });
}
function byPersonOf(tasks, assign) { const o = {}; for (const t of tasks) if (assign[t]) (o[assign[t]] = o[assign[t]] || []).push(t); return o; }

// ---------- אפשרויות לאדם ----------
function personSheet(id) {
  const key = S.viewKey, plan = planFor(key);
  const r = residents().find(x => x.id === id);
  const others = isManager() ? plan.present.filter(x => x !== id) : [];
  sheet(`<div class="row" style="margin-bottom:12px">${avatar(r)}<div><h2>${esc(r.name)}</h2><div class="sub" style="margin:0">${esc(C.fmtDay(key))}</div></div></div>
    <button class="opt" data-act="abs" data-r="sick"><span class="emo">🤒</span><span class="tx">חולה<span>המשימות יחולקו לאחרים</span></span></button>
    <button class="opt" data-act="abs" data-r="home"><span class="emo">🏠</span><span class="tx">נסע הביתה</span></button>
    <button class="opt" data-act="abs" data-r="other"><span class="emo">📝</span><span class="tx">אחר</span></button>
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
      writeDay(key, { assign, byPerson: byPersonOf(plan.tasks, assign), ...manual }).then(() => toast(`${r.name} ו${nameOf(o)} התחלפו`)).catch(fail);
    }
  });
}

// ---------- היעדרות ----------
const absCol = () => collection(db, "ch_rooms", S.room, "absences");
function absenceSheet(rid, reason = "sick", from = today()) {
  const st = { rid: rid || (active()[0] || {}).id, reason, from: from < today() ? today() : from, dur: "1", to: "" };
  const draw = root => {
    root.innerHTML = `<div class="grip"></div><h2>סימון היעדרות${rid ? " - " + esc(nameOf(rid)) : ""}</h2><div class="sub">בזמן הזה לא יקבל משימות, והן יחולקו לאחרים</div>
      ${rid ? "" : `<div class="field"><span>מי?</span><div class="seg">${active().map(r => `<button data-act="rid" data-v="${r.id}" class="${st.rid === r.id ? "on" : ""}">${esc(r.name)}</button>`).join("")}</div></div>`}
      <div class="field"><span>סיבה</span><div class="seg">${Object.entries(C.REASONS).map(([k, v]) => `<button data-act="reason" data-v="${k}" class="${st.reason === k ? "on" : ""}">${v.icon} ${v.name}</button>`).join("")}</div></div>
      <label class="field"><span>מתאריך</span><input class="inp" type="date" id="abFrom" value="${st.from}"></label>
      <div class="field"><span>לכמה זמן?</span><div class="seg">${[["1", "רק היום"], ["2", "יומיים"], ["3", "3 ימים"], ["7", "שבוע"], ["date", "עד תאריך"], ["open", "עד הודעה חדשה"]].map(([k, l]) => `<button data-act="dur" data-v="${k}" class="${st.dur === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      ${st.dur === "date" ? `<label class="field"><span>עד (כולל)</span><input class="inp" type="date" id="abTo" value="${st.to || st.from}" min="${st.from}"></label>` : ""}
      <label class="field"><span>הערה (לא חובה)</span><input class="inp" id="abNote" maxlength="60" placeholder="למשל: בבית חולים, חוזר מחר..."></label>
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
      await addDoc(absCol(), { rid: st.rid, reason: st.reason, from: st.from, to, note, by: myEmail(), at: Date.now() });
      toast(`${nameOf(st.rid)} סומן: ${C.reasonOf(st).name}. המשימות חולקו מחדש\n🛏️ לדאוג עכשיו שהמיטה שלו מסודרת`, 5000);
    } catch (e) { fail(e); }
  });
  draw(s.root);
}
async function endAbsence(rid) {
  const t0 = today();
  const cur = a => a.rid === rid && a.from <= t0 && (!a.to || a.to >= t0);
  for (const a of S.absList.filter(cur)) {
    if (a.from >= t0) await deleteDoc(doc(absCol(), a.id));
    else await updateDoc(doc(absCol(), a.id), { to: C.addDays(t0, -1) });
  }
  if (isManager() && legacyAbs().some(cur)) {
    await updateDoc(roomRef(), { absences: legacyAbs().map(a => !cur(a) ? a : a.from >= t0 ? null : { ...a, to: C.addDays(t0, -1) }).filter(Boolean).map(({ legacy, ...a }) => a) });
  }
  toast(`${nameOf(rid)} חזר לחדר 👋`);
}
async function delAbsence(id) {
  if (!(await confirmSheet("למחוק את ההיעדרות?", "החלוקה של הימים הבאים תחושב מחדש", "מחיקה", true))) return;
  const a = absences().find(x => x.id === id);
  if (a && a.legacy) await updateDoc(roomRef(), { absences: legacyAbs().filter(x => x.id !== id).map(({ legacy, ...x }) => x) });
  else await deleteDoc(doc(absCol(), id));
}

// ---------- דיירים (אחראי) ----------
const saveResidents = list => updateDoc(roomRef(), { residents: list });
function residentSheet(id) {
  const r = residents().find(x => x.id === id);
  sheet(`<h2>${esc(r.name)}</h2><div class="sub">דייר בחדר ${esc(S.room)}</div>
    <label class="field"><span>שם</span><input class="inp" id="rsName" value="${esc(r.name)}" maxlength="30"></label>
    <div class="btns"><button class="btn pri grow" data-act="save">שמירה</button></div>
    <button class="opt" data-act="abs"><span class="emo">🤒</span><span class="tx">סימון היעדרות / מחלה</span></button>
    ${r.id !== myRid() ? `<button class="opt" data-act="inv"><span class="emo">🔗</span><span class="tx">קישור אישי להצטרפות</span></button>` : ""}
    ${r.id !== myRid() ? `<button class="opt" data-act="left"><span class="emo">👋</span><span class="tx" style="color:var(--bad)">עזב את החדר<span>לא יקבל משימות והגישה שלו תבוטל. ההיסטוריה נשמרת</span></span></button>` : ""}`,
  async (act, el, root, close) => {
    try {
      if (act === "save") {
        const name = root.querySelector("#rsName").value.trim().slice(0, 30);
        if (!name) return;
        close(); await saveResidents(residents().map(x => x.id === id ? { ...x, name } : x));
      } else if (act === "abs") { close(); absenceSheet(id); }
      else if (act === "inv") { close(); await inviteSheet(id); }
      else if (act === "left") {
        close();
        if (!(await confirmSheet(`${r.name} עזב את החדר?`, "הוא לא יקבל יותר משימות, והגישה שלו לאתר תבוטל", "כן, עזב", true))) return;
        await saveResidents(residents().map(x => x.id === id ? { ...x, left: today() } : x));
        await revokeAccess(id);
      }
    } catch (e) { fail(e); }
  });
}
async function revokeAccess(rid) {
  const m = memberOf(rid);
  if (m) await deleteDoc(doc(db, "ch_members", m.id));
  for (const i of S.invites.filter(x => x.rid === rid && !x.used)) await deleteDoc(doc(db, "ch_invites", i.id));
}
function whoAmISheet() {
  sheet(`<h2>מי מהרשימה זה אתה?</h2><div class="sub">כדי שהלו"ז יסמן את המשימות שלך</div>
    ${active().filter(r => !memberOf(r.id)).map(r => `<button class="opt" data-act="me" data-id="${r.id}">${avatar(r, 36)}<span class="tx">${esc(r.name)}</span></button>`).join("")}`,
  async (act, el, root, close) => {
    if (act !== "me") return;
    close();
    await saveResidents(residents().map(x => x.id === el.dataset.id ? { ...x, email: myEmail() } : (x.email === myEmail() ? { ...x, email: null } : x))).catch(fail);
  });
}

// ---------- קישור אישי ----------
async function inviteSheet(rid) {
  const r = residents().find(x => x.id === rid);
  const m = memberOf(rid);
  if (m) {
    sheet(`<h2>${esc(r.name)} מחובר ✓</h2><div class="sub ltr" style="text-align:right">${esc(m.email)}</div>
      <p class="muted small">הוא רואה את הלו"ז ומסמן את המשימות שלו.</p>
      <div class="btns"><button class="btn danger grow" data-act="revoke">ניתוק החשבון</button><button class="btn" data-act="close">סגירה</button></div>`,
    async (act, el, root, close) => {
      if (act !== "revoke") return;
      close();
      if (!(await confirmSheet(`לנתק את ${r.name}?`, "הוא לא יוכל להיכנס יותר. אפשר לשלוח לו קישור חדש בכל רגע", "ניתוק", true))) return;
      await revokeAccess(rid).then(() => toast("נותק")).catch(fail);
    });
    return;
  }
  let inv = inviteOf(rid);
  if (!inv) {
    const token = newToken();
    await setDoc(doc(db, "ch_invites", token), { room: S.room, rid, name: r.name, by: myEmail(), at: serverTimestamp(), used: false });
    inv = { id: token };
  }
  const link = new URL(`./?join=${inv.id}`, location.href).href;
  const msg = `היי ${r.name}! זה הקישור האישי שלך לתורנויות של חדר ${S.room}: ${link}`;
  sheet(`<h2>🔗 קישור אישי ל${esc(r.name)}</h2><div class="sub">שולחים לו את הקישור. הוא נכנס עם Google ומצטרף לחדר. הקישור עובד פעם אחת.</div>
    <input class="inp ltr" id="invLink" value="${esc(link)}" readonly onclick="this.select()">
    <div class="btns">
      <a class="btn pri grow" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" style="text-decoration:none">שליחה בוואטסאפ</a>
      <button class="btn" data-act="copy">העתקה</button>
      ${navigator.share ? `<button class="btn" data-act="share">שיתוף</button>` : ""}
    </div>
    <button class="btn danger block" data-act="cancel" style="margin-top:10px">ביטול הקישור</button>`,
  async (act, el, root, close) => {
    try {
      if (act === "copy") { await navigator.clipboard.writeText(link).then(() => toast("הקישור הועתק"), () => { root.querySelector("#invLink").select(); toast("סמנו והעתיקו"); }); }
      if (act === "share") await navigator.share({ title: "תורנויות חדר", text: msg }).catch(() => {});
      if (act === "cancel") { close(); await deleteDoc(doc(db, "ch_invites", inv.id)); toast("הקישור בוטל"); }
    } catch (e) { fail(e); }
  });
}

// ---------- שינויים בלו"ז (אחראי) ----------
function eventSheet() {
  const t0 = today();
  const st = { type: "off", scope: independent() ? "room" : "all", from: t0, to: t0, title: "" };
  const titles = { off: ["טיול", "חופשה", "יום מחוץ לפנימייה", "שבת בבית"], on: ["שבת בפנימייה"], note: ["ביקורת ניקיון", "ניקיון כללי"] };
  const draw = root => {
    const mm = st.type === "mopmove";
    root.innerHTML = `<div class="grip"></div><h2>שינוי בלו"ז</h2><div class="sub">חופשה, טיול, העברת יום שטיפה ועוד</div>
      <div class="field"><span>מה קורה?</span>${Object.entries(C.EVENT_TYPES).map(([k, v]) => `<button class="opt ${st.type === k ? "cur" : ""}" data-act="type" data-v="${k}"><span class="emo">${v.icon}</span><span class="tx">${v.name}</span>${st.type === k ? "✓" : ""}</button>`).join("")}</div>
      <div class="row">
        <label class="field grow"><span>${mm ? "יום השטיפה המקורי" : "מתאריך"}</span><input class="inp" type="date" id="evFrom" value="${st.from}"></label>
        <label class="field grow"><span>${mm ? "עובר ליום" : "עד (כולל)"}</span><input class="inp" type="date" id="evTo" value="${st.to}"></label>
      </div>
      ${mm && S.settings.mopDay >= 0 ? `<div class="small muted" style="margin:-6px 0 12px">יום השטיפה הקבוע הוא יום ${C.DAY_NAMES[S.settings.mopDay]}. הקרוב: ${C.fmtDate(nextWeekday(S.settings.mopDay))}</div>` : ""}
      <label class="field"><span>תיאור (לא חובה)</span><input class="inp" id="evTitle" maxlength="60" value="${esc(st.title)}" placeholder="למשל: טיול שנתי">
        ${titles[st.type] ? `<div class="chips" style="margin-top:6px">${titles[st.type].map(x => `<button class="chip" data-act="title" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}</label>
      ${independent() ? `<div class="status warn" style="margin:0 0 12px">🔌 מצב עצמאי - השינוי יחול רק על החדר שלכם</div>`
        : `<div class="field"><span>למי זה?</span><div class="seg"><button data-act="scope" data-v="all" class="${st.scope === "all" ? "on" : ""}">🏫 כל הפנימייה (משותף)</button><button data-act="scope" data-v="room" class="${st.scope === "room" ? "on" : ""}">🚪 רק החדר שלנו</button></div></div>`}
      <div class="btns"><button class="btn pri grow" data-act="save">שמירה</button><button class="btn" data-act="close">ביטול</button></div>`;
  };
  const read = root => { st.from = root.querySelector("#evFrom").value; st.to = root.querySelector("#evTo").value; st.title = root.querySelector("#evTitle").value; };
  const s = sheet("", async (act, el, root, close) => {
    read(root);
    if (act === "type") {
      st.type = el.dataset.v;
      if (st.type === "mopmove" && S.settings.mopDay >= 0) { st.from = nextWeekday(S.settings.mopDay); st.to = C.addDays(st.from, 1); }
      draw(root); return;
    }
    if (act === "scope") { st.scope = el.dataset.v; draw(root); return; }
    if (act === "title") { st.title = el.dataset.v; draw(root); return; }
    if (act !== "save") return;
    if (!C.isDateKey(st.from) || !C.isDateKey(st.to)) return toast("בחרו תאריכים");
    if (st.type !== "mopmove" && st.to < st.from) return toast("תאריך הסיום לפני ההתחלה");
    if (st.type === "mopmove" && st.to === st.from) return toast("בחרו יום אחר");
    const ev = { type: st.type, from: st.from, to: st.to, title: st.title.trim().slice(0, 60), by: myEmail(), byRoom: S.room, at: Date.now() };
    close();
    try {
      if (st.scope === "all" && !independent()) await addDoc(collection(db, "ch_events"), ev);
      else await updateDoc(roomRef(), { events: [...((S.roomDoc && S.roomDoc.events) || []), { id: C.uid(), ...ev }] });
      toast(st.scope === "all" && !independent() ? "נשמר ומתעדכן לכל הפנימייה" : "נשמר לחדר שלכם");
    } catch (e) { fail(e); }
  });
  draw(s.root);
}
function nextWeekday(wd) { let k = today(); for (let i = 0; i < 7; i++) { if (C.weekday(k) === wd) return k; k = C.addDays(k, 1); } return k; }
async function delEvent(id, scope) {
  if (!(await confirmSheet("למחוק את השינוי?", scope === "all" ? "הוא יימחק לכל הפנימייה" : "", "מחיקה", true))) return;
  if (scope === "room") await updateDoc(roomRef(), { events: (S.roomDoc.events || []).filter(e => e.id !== id) });
  else await deleteDoc(doc(db, "ch_events", id));
}

// ---------- הדבקת תורנות (אחראי) ----------
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
  let scope = independent() ? "room" : "all";
  const draw = root => {
    root.innerHTML = `<div class="grip"></div><h2>בדיקה ושמירה</h2><div class="sub">${list.length > 1 ? `זוהו ${list.length} הודעות. ` : ""}אפשר לתקן לפני השמירה. מפרידים בפסיק.</div>
      ${list.map((m, i) => `<div class="card" style="box-shadow:none;background:var(--panel-2)">
        <div class="row"><label class="field grow" style="margin-bottom:8px"><span>בתוקף מתאריך</span><input class="inp" type="date" data-i="${i}" data-f="date" value="${m.date}"></label>
          ${list.length > 1 ? `<button class="more-btn" data-act="rm" data-i="${i}" aria-label="הסרה">✕</button>` : ""}</div>
        <label class="field"><span>🏢 תורנות קומה</span><input class="inp ltr" inputmode="numeric" data-i="${i}" data-f="floor" value="${esc(m.floor)}" placeholder="37, 41, 45"></label>
        <label class="field" style="margin-bottom:0"><span>🍳 מטבחון ומועדון</span><input class="inp ltr" inputmode="numeric" data-i="${i}" data-f="kitchen" value="${esc(m.kitchen)}" placeholder="39"></label>
      </div>`).join("")}
      ${independent() ? `<div class="status warn" style="margin:0 0 4px">🔌 מצב עצמאי - נשמר רק לחדר שלכם</div>`
        : `<div class="field"><span>למי לשמור?</span><div class="seg"><button data-act="scope" data-v="all" class="${scope === "all" ? "on" : ""}">🏫 לכל הפנימייה</button><button data-act="scope" data-v="room" class="${scope === "room" ? "on" : ""}">🚪 רק לחדר שלנו</button></div></div>`}
      <div class="btns"><button class="btn pri grow" data-act="save">שמירה</button><button class="btn" data-act="close">ביטול</button></div>`;
  };
  const read = root => root.querySelectorAll("[data-f]").forEach(inp => { list[+inp.dataset.i][inp.dataset.f] = inp.value; });
  const s = sheet("", async (act, el, root, close) => {
    read(root);
    if (act === "rm") { list.splice(+el.dataset.i, 1); draw(root); return; }
    if (act === "scope") { scope = el.dataset.v; draw(root); return; }
    if (act !== "save") return;
    const nums = v => [...new Set((String(v).match(/\d{1,4}/g) || []).map(n => String(+n)))];
    const out = list.map(m => ({ date: m.date, floor: nums(m.floor).slice(0, 6), kitchen: nums(m.kitchen).slice(0, 3), raw: String(m.raw || "").slice(0, 3000), time: m.time || "", sender: String(m.sender || "").slice(0, 40), newRound: !!m.newRound }));
    if (out.some(m => !C.isDateKey(m.date))) return toast("תאריך לא תקין");
    if (out.some(m => !m.floor.length && !m.kitchen.length)) return toast("חסרים מספרי חדרים");
    close();
    try {
      for (const m of out) {
        const data = { ...m, by: myEmail(), byRoom: S.room, at: serverTimestamp() };
        if (scope === "all" && !independent()) await setDoc(doc(db, "ch_duties", m.date), data);
        else await setDoc(doc(db, "ch_rooms", S.room, "duties", m.date), data);
      }
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
  if ((now.floor && !before.floor) || (now.kitchen && !before.kitchen)) toast(`📋 חדר ${S.room} נכנס ל${now.floor ? "תורנות קומה" : "מטבחון ומועדון"}`, 4000);
}

// ---------- הצעה למנהל ----------
function suggestSheet() {
  const cur = S.settings;
  const st = { kind: "mopDay", days: [...cur.activeDays], mop: cur.mopDay, outside: !cur.outside };
  const draw = root => {
    root.innerHTML = `<div class="grip"></div><h2>💡 הצעה למנהל</h2><div class="sub">המנהל יראה את ההצעה ויוכל לאשר אותה בלחיצה</div>
      <div class="field"><span>מה לשנות?</span><div class="seg">${Object.entries(SUG_KINDS).map(([k, v]) => `<button data-act="kind" data-v="${k}" class="${st.kind === k ? "on" : ""}">${v}</button>`).join("")}</div></div>
      ${st.kind === "activeDays" ? `<div class="field"><span>ימים עם ניקיון</span><div class="seg">${C.DAY_NAMES.map((n, i) => `<button data-act="d" data-v="${i}" class="${st.days.includes(i) ? "on" : ""}">${n}</button>`).join("")}</div></div>` : ""}
      ${st.kind === "mopDay" ? `<div class="field"><span>יום שטיפה</span><div class="seg">${C.DAY_NAMES.map((n, i) => `<button data-act="m" data-v="${i}" class="${st.mop === i ? "on" : ""}">${n}</button>`).join("")}<button data-act="m" data-v="-1" class="${st.mop < 0 ? "on" : ""}">אין</button></div></div>` : ""}
      ${st.kind === "outside" ? `<div class="field"><span>"מחוץ לפנימייה" בתורנות המטבחון</span><div class="seg"><button data-act="o" data-v="1" class="${st.outside ? "on" : ""}">כן</button><button data-act="o" data-v="0" class="${!st.outside ? "on" : ""}">לא</button></div></div>` : ""}
      <label class="field"><span>${st.kind === "other" ? "מה ההצעה?" : "הסבר (לא חובה)"}</span><textarea class="inp" id="sgText" maxlength="300" style="min-height:80px"></textarea></label>
      <div class="btns"><button class="btn pri grow" data-act="send">שליחה</button><button class="btn" data-act="close">ביטול</button></div>`;
  };
  const s = sheet("", async (act, el, root, close) => {
    const text = root.querySelector("#sgText").value;
    const keep = () => { draw(root); root.querySelector("#sgText").value = text; };
    if (act === "kind") { st.kind = el.dataset.v; return keep(); }
    if (act === "d") { const v = +el.dataset.v; st.days = st.days.includes(v) ? st.days.filter(x => x !== v) : [...st.days, v].sort(); return keep(); }
    if (act === "m") { st.mop = +el.dataset.v; return keep(); }
    if (act === "o") { st.outside = el.dataset.v === "1"; return keep(); }
    if (act !== "send") return;
    if (st.kind === "other" && !text.trim()) return toast("כתבו מה ההצעה");
    const value = st.kind === "activeDays" ? st.days : st.kind === "mopDay" ? st.mop : st.kind === "outside" ? st.outside : null;
    close();
    try {
      await addDoc(collection(db, "ch_suggestions"), { room: S.room, by: myEmail(), byName: S.member.name || S.user.displayName || "", kind: st.kind, value, text: text.trim().slice(0, 300), status: "open", at: Date.now() });
      toast("ההצעה נשלחה למנהל 💡");
    } catch (e) { fail(e); }
  });
  draw(s.root);
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
      <div class="li"><span class="emo">👥</span><div class="tx"><b>אחראי ודיירים</b><span>אחראי החדר מוסיף את הדיירים ושולח לכל אחד קישור אישי. דייר רואה את הלו"ז ומסמן את מה ששלו.</span></div></div>
      <div class="li"><span class="emo">📋</span><div class="tx"><b>תורנות קומה ומטבחון</b><span>מדביקים את ההודעה של המדריך בלשונית "תורנות". מספיק שחדר אחד ידביק, וזה מתעדכן לכולם. אפשר גם להזין אחרת רק לחדר.</span></div></div>
      <div class="li"><span class="emo">🤒</span><div class="tx"><b>מישהו חולה / נסע הביתה</b><span>⋯ ליד השם. המשימות שלו עוברות לאחרים, ומה שכבר בוצע נשאר.</span></div></div>
      <div class="li"><span class="emo">⇄</span><div class="tx"><b>החלפות</b><span>האחראי מעביר משימה (⇄) או מחליף בין שניים את כל המשימות (⋯ ← החלפת תורנות).</span></div></div>
      <div class="li"><span class="emo">🏖️</span><div class="tx"><b>חופשות, טיולים ושינויים</b><span>בלשונית "השבוע". משותף לכל הפנימייה או רק לחדר, ואפשר לסמן שינוי משותף "לא חל עלינו".</span></div></div>
      <div class="li"><span class="emo">🔌</span><div class="tx"><b>מצב עצמאי</b><span>בלשונית "החדר" אפשר לצאת מהמאגר המשותף ולנהל הכל לבד, כולל ימי ניקיון ויום שטיפה.</span></div></div>
      <div class="li"><span class="emo">⚖️</span><div class="tx"><b>הוגנות</b><span>מי שעשה פחות לאורך זמן מקבל קודם. שטיפה ושירותים נחשבים יותר משולחן.</span></div></div>
    </div><div class="btns"><button class="btn block" data-act="close">סגירה</button></div>`);
}

// יום חדש בזמן שהאתר פתוח
let lastDay = today();
setInterval(() => { const t = today(); if (t !== lastDay) { if (S.viewKey === lastDay) S.viewKey = t; lastDay = t; changed(); } }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.room) changed(); });
