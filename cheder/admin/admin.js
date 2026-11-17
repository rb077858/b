// =====================================================================
//  תורנויות חדר - ממשק ניהול (reembir.com/b/cheder/admin/)
//  רק rb077858@gmail.com. מצרפים אנשים לחדרים ומגדירים את הלו"ז
// =====================================================================
import {
  db, FS, $, esc, emailKey, isAdminUser, ADMIN_EMAIL, authError, signIn, watchAuth, logout,
  toggleTheme, toast, sheet, confirmSheet, GOOGLE_SVG
} from "../common.js?v=4";
import * as C from "../core.js?v=4";

const { doc, collection, setDoc, deleteDoc, onSnapshot, query, orderBy, limit, serverTimestamp } = FS;

const isMgr = m => (m.role || "manager") === "manager";
const TABS = [
  { id: "people", label: "אנשים", ic: "👥" },
  { id: "rooms", label: "חדרים", ic: "🚪" },
  { id: "duty", label: "תורנויות", ic: "📋" },
  { id: "sug", label: "הצעות", ic: "💡" },
  { id: "settings", label: "הגדרות", ic: "⚙️" }
];
const S = { sugs: [], user: null, members: [], rooms: {}, duties: [], events: [], settings: C.mergeSettings(), settingsRaw: null, tab: "people", filter: "", unsubs: [], editing: null };

$("loginBtn").innerHTML = `${GOOGLE_SVG} התחברות עם Google`;
$("loginBtn").onclick = async () => { $("loginErr").textContent = ""; try { await signIn(ADMIN_EMAIL); } catch (e) { $("loginErr").textContent = authError(e); } };
$("logoutBtn").onclick = async () => { if (await confirmSheet("להתנתק?", "", "התנתקות")) logout(); };
$("themeBtn").onclick = () => toggleTheme();

watchAuth(async u => {
  S.unsubs.forEach(f => f()); S.unsubs = [];
  $("boot").classList.add("hidden");
  if (!u) { $("app").classList.add("hidden"); $("login").classList.remove("hidden"); return; }
  if (!isAdminUser(u)) {
    $("loginErr").textContent = `לחשבון ${u.email} אין הרשאת ניהול.`;
    await logout(); return;
  }
  S.user = u;
  $("login").classList.add("hidden"); $("app").classList.remove("hidden");
  $("hdrSub").textContent = u.email;
  subscribe(); render();
}, e => { $("loginErr").textContent = authError(e); });

function subscribe() {
  const on = (ref, fn) => S.unsubs.push(onSnapshot(ref, s => { fn(s); render(); }, e => toast(`שגיאה בטעינה: ${e.code}${e.code === "permission-denied" ? " - צריך לפרוס את חוקי Firestore" : ""}`, 5000)));
  on(collection(db, "ch_members"), s => { S.members = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (+a.room || 0) - (+b.room || 0) || String(a.room).localeCompare(String(b.room))); });
  on(collection(db, "ch_rooms"), s => { S.rooms = {}; s.forEach(d => { S.rooms[d.id] = d.data(); }); });
  on(query(collection(db, "ch_duties"), orderBy("date", "desc"), limit(60)), s => { S.duties = s.docs.map(d => ({ id: d.id, ...d.data() })); });
  on(query(collection(db, "ch_events"), orderBy("from", "desc"), limit(100)), s => { S.events = s.docs.map(d => ({ id: d.id, ...d.data() })); });
  on(query(collection(db, "ch_suggestions"), orderBy("at", "desc"), limit(100)), s => { S.sugs = s.docs.map(d => ({ id: d.id, ...d.data() })); });
  on(doc(db, "sites", "cheder"), s => { S.settingsRaw = s.exists() ? s.data() : null; S.settings = C.mergeSettings(S.settingsRaw); });
}

function render() {
  $("tabs").style.setProperty("--n", TABS.length);
  $("tabs").innerHTML = TABS.map(t => `<button class="tab ${t.id === S.tab ? "on" : ""}" data-tab="${t.id}"><i>${t.ic}</i>${t.label}${t.id === "sug" && S.sugs.some(x => x.status === "open") ? `<span class="badge">${S.sugs.filter(x => x.status === "open").length}</span>` : ""}</button>`).join("");
  const a = document.activeElement;
  if (a && a.closest && a.closest("#view") && a.matches("input, textarea, select")) { S.deferred = true; return; } // לא לשבור הקלדה
  S.deferred = false;
  $("view").innerHTML = ({ people: vPeople, rooms: vRooms, duty: vDuty, settings: vSettings, sug: vSug })[S.tab]();
}
document.addEventListener("focusout", () => setTimeout(() => { if (S.deferred && !(document.activeElement && document.activeElement.matches("input, textarea, select"))) render(); }, 80));
$("tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) { S.tab = b.dataset.tab; document.activeElement && document.activeElement.blur(); S.deferred = false; render(); scrollTo({ top: 0 }); } });

// ---------- אנשים ----------
function vPeople() {
  const me = S.members.find(m => m.id === emailKey(ADMIN_EMAIL));
  const f = S.filter.trim().toLowerCase();
  const list = S.members.filter(m => !f || m.email.includes(f) || String(m.room).includes(f) || (m.name || "").toLowerCase().includes(f));
  let h = `<div class="card"><h2>צירוף אחראי חדר</h2><p class="muted small" style="margin-top:0">מי שיתחבר עם המייל הזה יהיה אחראי החדר. הוא מוסיף את שאר הדיירים ושולח לכל אחד קישור אישי.</p>
    <form class="form-row" data-form="add">
      <label class="field" style="margin:0"><span>מייל Google</span><input class="inp ltr" name="email" type="email" required placeholder="name@gmail.com" autocomplete="off"></label>
      <label class="field" style="margin:0"><span>שם</span><input class="inp" name="name" maxlength="30" placeholder="לא חובה" autocomplete="off"></label>
      <label class="field" style="margin:0"><span>חדר</span><input class="inp ltr" name="room" required inputmode="numeric" maxlength="6" placeholder="41" autocomplete="off"></label>
      <button class="btn pri">צירוף</button>
    </form>
    ${!me ? `<div class="status warn">שימו לב: עוד לא צירפת את עצמך, ולכן לא תוכל להיכנס לאתר הרגיל. <button class="btn sm" data-act="addme">לצרף אותי</button></div>` : ""}
  </div>`;
  h += `<div class="card"><div class="card-hd"><h2>מורשים</h2><span class="chip">${S.members.length}</span></div>
    ${S.members.length > 6 ? `<input class="inp" id="filter" data-keep="1" placeholder="חיפוש לפי מייל, שם או חדר" value="${esc(S.filter)}" style="margin-bottom:8px">` : ""}
    ${list.length ? `<table class="tbl"><thead><tr><th>חדר</th><th>שם</th><th>מייל</th><th class="hide-sm">תפקיד</th><th></th></tr></thead><tbody>
    ${list.map(m => {
      return `<tr><td><span class="room-n" style="font-size:.95rem">${esc(m.room)}</span></td><td>${esc(m.name || "—")}${m.id === emailKey(ADMIN_EMAIL) ? ` <span class="chip me">אני</span>` : ""}</td><td class="ltr small" style="text-align:right">${esc(m.email)}</td><td class="hide-sm"><span class="chip ${isMgr(m) ? "ok" : ""}">${isMgr(m) ? "אחראי" : "דייר"}</span></td>
        <td style="white-space:nowrap"><button class="more-btn" data-act="edit" data-id="${esc(m.id)}" title="עריכה">✏️</button></td></tr>`;
    }).join("")}</tbody></table>` : `<div class="empty">עוד אין אף אחד</div>`}</div>`;
  return h;
}
$("view").addEventListener("input", e => { if (e.target.id === "filter") { S.filter = e.target.value; const pos = e.target.selectionStart; S.tab = "people"; $("view").innerHTML = vPeople(); const f = $("filter"); f.focus(); f.setSelectionRange(pos, pos); } });

async function saveMember({ email, name, room }, oldId) {
  email = emailKey(email); room = String(room || "").trim().replace(/^0+(?=\d)/, ""); name = String(name || "").trim().slice(0, 30);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("מייל לא תקין"); return false; }
  if (!/^[0-9A-Za-zא-ת-]{1,6}$/.test(room)) { toast("מספר חדר לא תקין"); return false; }
  const prev = S.members.find(m => m.id === (oldId || email));
  const role = prev && prev.role === "resident" ? "resident" : "manager";
  const taken = role === "manager" && S.members.find(m => String(m.room) === room && isMgr(m) && m.id !== email && m.id !== oldId);
  if (taken) {
    if (!(await confirmSheet(`לחדר ${room} כבר יש אחראי: ${taken.name || taken.email}`, "לכל חדר אחראי אחד (שאר הדיירים מצטרפים בקישור אישי מהאחראי). להחליף אותו בחשבון החדש? (החשבון הקודם יוסר)", "להחליף", true))) return false;
    await deleteDoc(doc(db, "ch_members", taken.id));
  }
  if (oldId && oldId !== email) await deleteDoc(doc(db, "ch_members", oldId));
  const extra = role === "resident" ? { rid: prev.rid, invite: prev.invite || "" } : {};
  await setDoc(doc(db, "ch_members", email), { email, name, room, role, ...extra, addedAt: prev && prev.addedAt ? prev.addedAt : serverTimestamp(), updatedAt: serverTimestamp() });
  toast(`${name || email} ← חדר ${room} ✓`);
  return true;
}

function editSheet(id) {
  const m = S.members.find(x => x.id === id);
  sheet(`<h2>עריכה</h2><div class="sub ltr" style="text-align:right">${esc(m.email)}</div>
    <label class="field"><span>מייל Google</span><input class="inp ltr" id="eEmail" value="${esc(m.email)}"></label>
    <label class="field"><span>שם</span><input class="inp" id="eName" value="${esc(m.name || "")}" maxlength="30"></label>
    <label class="field"><span>חדר</span><input class="inp ltr" id="eRoom" value="${esc(m.room)}" inputmode="numeric" maxlength="6"></label>
    <div class="status off small" style="margin:0 0 10px">העברה לחדר אחר לא מעבירה את הדיירים - היא פשוט נותנת גישה לחדר החדש.</div>
    <div class="btns"><button class="btn pri grow" data-act="save">שמירה</button><button class="btn danger" data-act="del">הסרה</button></div>`,
  async (act, el, root, close) => {
    try {
      if (act === "save") {
        if (await saveMember({ email: root.querySelector("#eEmail").value, name: root.querySelector("#eName").value, room: root.querySelector("#eRoom").value }, id)) close();
      } else if (act === "del") {
        close();
        if (!(await confirmSheet(`להסיר את ${m.name || m.email}?`, "הוא לא יוכל להיכנס יותר. נתוני החדר נשמרים.", "הסרה", true))) return;
        await deleteDoc(doc(db, "ch_members", id)); toast("הוסר");
      }
    } catch (e) { toast(authError(e)); }
  });
}

// ---------- חדרים ----------
function vRooms() {
  const t0 = C.dateKey();
  const ids = [...new Set([...S.members.map(m => String(m.room)), ...Object.keys(S.rooms)])].sort((a, b) => (+a || 0) - (+b || 0));
  if (!ids.length) return `<div class="card empty"><div class="big">🚪</div>עוד אין חדרים. צרפו אנשים בלשונית "אנשים".</div>`;
  const d = C.dutyFor(S.duties, t0);
  return ids.map(id => {
    const r = S.rooms[id] || {};
    const m = S.members.find(x => String(x.room) === id && isMgr(x));
    const accounts = S.members.filter(x => String(x.room) === id && !isMgr(x)).length;
    const res = C.activeResidents(r.residents);
    const away = res.filter(x => C.absenceOn(r.absences, x.id, t0));
    const roles = C.roomRoles(d, id);
    return `<div class="card"><div class="card-hd"><span class="room-n">${esc(id)}</span><h3 class="grow">${m ? esc(m.name || m.email) : `<span class="muted">אין חשבון משויך</span>`}</h3>
      ${r.independent ? `<span class="chip warn">🔌 עצמאי</span>` : ""}${roles.floor ? `<span class="chip floor">🏢 קומה</span>` : ""}${roles.kitchen ? `<span class="chip kitchen">🍳 מטבחון</span>` : ""}</div>
      <div class="small muted" style="margin:-4px 0 8px">${res.length} דיירים · ${accounts} הצטרפו בקישור</div>
      <div class="chips">${res.map(x => `<span class="chip ${away.includes(x) ? "warn" : ""}">${esc(x.name)}${away.includes(x) ? " · " + C.REASONS[C.absenceOn(r.absences, x.id, t0).reason].name : ""}</span>`).join("") || `<span class="muted small">החדר עוד לא הוסיף דיירים</span>`}</div></div>`;
  }).join("");
}

// ---------- תורנויות וחריגים ----------
function vDuty() {
  let h = `<div class="card"><div class="card-hd"><h2>תורנויות שהוזנו</h2><span class="chip">${S.duties.length}</span></div>
    ${S.duties.length ? `<div class="list">${S.duties.map(x => `<div class="li"><span class="emo">📋</span><div class="tx"><b>${C.DAY_NAMES[C.weekday(x.date)]} ${C.fmtDate(x.date)}</b><span>קומה: ${(x.floor || []).join(", ") || "—"} · מטבחון: ${(x.kitchen || []).join(", ") || "—"}${x.byRoom ? ` · ע"י חדר ${esc(x.byRoom)}` : ""}</span></div><button class="more-btn" data-act="deld" data-id="${esc(x.id)}" title="מחיקה">🗑</button></div>`).join("")}</div>` : `<div class="muted small">אין עדיין</div>`}</div>`;
  h += `<div class="card"><div class="card-hd"><h2>שינויים בלו"ז לכל הפנימייה</h2><span class="chip">${S.events.length}</span></div>
    ${S.events.length ? `<div class="list">${S.events.map(e => `<div class="li"><span class="emo">${(C.EVENT_TYPES[e.type] || {}).icon || "📌"}</span><div class="tx"><b>${esc(e.title || (C.EVENT_TYPES[e.type] || {}).name || e.type)}</b><span>${C.fmtDate(e.from)}${e.to && e.to !== e.from ? (e.type === "mopmove" ? " ← " : " – ") + C.fmtDate(e.to) : ""}${e.byRoom ? ` · חדר ${esc(e.byRoom)}` : ""}</span></div><button class="more-btn" data-act="dele" data-id="${esc(e.id)}" title="מחיקה">🗑</button></div>`).join("")}</div>` : `<div class="muted small">אין. החדרים מוסיפים חופשות וטיולים מלשונית "השבוע" באתר.</div>`}</div>`;
  return h;
}

// ---------- הצעות ----------
const SUG_KINDS = { activeDays: "ימי ניקיון", mopDay: "יום השטיפה", outside: "\"מחוץ לפנימייה\"", other: "אחר" };
function sugValue(x) {
  if (x.kind === "activeDays") return (x.value || []).map(i => C.DAY_NAMES[i]).join(", ");
  if (x.kind === "mopDay") return x.value >= 0 ? "יום " + C.DAY_NAMES[x.value] : "בלי שטיפה";
  if (x.kind === "outside") return x.value ? "כן" : "לא";
  return "";
}
function curValue(kind) {
  const s = S.settings;
  return kind === "activeDays" ? s.activeDays.map(i => C.DAY_NAMES[i]).join(", ") : kind === "mopDay" ? (s.mopDay >= 0 ? "יום " + C.DAY_NAMES[s.mopDay] : "בלי שטיפה") : kind === "outside" ? (s.outside ? "כן" : "לא") : "";
}
function vSug() {
  const open = S.sugs.filter(x => x.status === "open"), rest = S.sugs.filter(x => x.status !== "open");
  const row = x => `<div class="li" style="align-items:flex-start"><span class="emo">💡</span><div class="tx"><b>חדר ${esc(x.room)} · ${SUG_KINDS[x.kind] || ""}${sugValue(x) ? ": " + esc(sugValue(x)) : ""}</b>
      <span>${x.kind !== "other" ? `כרגע: ${esc(curValue(x.kind))} · ` : ""}${esc(x.text || "")}${x.byName ? " · " + esc(x.byName) : ""}${x.reply ? " · תשובה: " + esc(x.reply) : ""}</span></div>
      ${x.status === "open" ? `<div class="row" style="flex-wrap:wrap;justify-content:flex-end">${x.kind !== "other" ? `<button class="btn sm pri" data-act="sugok" data-id="${x.id}">אישור והחלה</button>` : `<button class="btn sm pri" data-act="sugdone" data-id="${x.id}">טופל</button>`}<button class="btn sm danger" data-act="sugno" data-id="${x.id}">דחייה</button></div>`
        : `<span class="chip ${x.status === "approved" ? "ok" : "bad"}">${x.status === "approved" ? "אושר" : "נדחה"}</span><button class="more-btn" data-act="sugdel" data-id="${x.id}" title="מחיקה">🗑</button>`}</div>`;
  return `<div class="card"><div class="card-hd"><h2>הצעות ממתינות</h2><span class="chip">${open.length}</span></div>
    ${open.length ? `<div class="list">${open.map(row).join("")}</div>` : `<div class="muted small">אין הצעות חדשות. חדרים יכולים להציע שינוי בהגדרות מלשונית "עוד" באתר.</div>`}</div>
    ${rest.length ? `<div class="card"><h2>טופלו</h2><div class="list">${rest.slice(0, 30).map(row).join("")}</div></div>` : ""}`;
}
async function answerSug(id, status) {
  const x = S.sugs.find(y => y.id === id);
  if (!x) return;
  let reply = "";
  if (status === "rejected") {
    reply = await new Promise(res => {
      sheet(`<h2>דחיית ההצעה</h2><label class="field"><span>תשובה לחדר (לא חובה)</span><input class="inp" id="rp" maxlength="120" autofocus></label><div class="btns"><button class="btn danger fill grow" data-act="ok">דחייה</button><button class="btn" data-act="close">ביטול</button></div>`,
        (act, el, root, close) => { if (act === "ok") { const v = root.querySelector("#rp").value.trim(); close(); res(v); } });
    });
    if (reply === undefined) return;
  }
  if (status === "approved" && x.kind !== "other") await saveSettings({ [x.kind]: x.value });
  await setDoc(doc(db, "ch_suggestions", id), { status, reply, answeredAt: Date.now() }, { merge: true });
  toast(status === "approved" ? (x.kind !== "other" ? "אושר וההגדרה עודכנה לכל החדרים ✓" : "סומן כטופל") : "נדחה");
}

// ---------- הגדרות ----------
function vSettings() {
  const s = S.settings;
  return `<div class="card"><h2>לו"ז קבוע (משותף לכל החדרים)</h2><p class="muted small" style="margin:0">חל על כל החדרים שמחוברים למאגר המשותף. חדרים במצב עצמאי קובעים לעצמם.</p>
    <div class="field" style="margin-top:12px"><span>ימים עם ניקיון בוקר</span><div class="seg">${C.DAY_NAMES.map((n, i) => `<button data-act="day" data-v="${i}" class="${s.activeDays.includes(i) ? "on" : ""}">${n}</button>`).join("")}</div></div>
    <div class="field"><span>יום שטיפת החדר</span><div class="seg">${C.DAY_NAMES.map((n, i) => `<button data-act="mop" data-v="${i}" class="${s.mopDay === i ? "on" : ""}">${n}</button>`).join("")}<button data-act="mop" data-v="-1" class="${s.mopDay < 0 ? "on" : ""}">אין</button></div></div>
    <label class="switch"><div class="tx"><b>"מחוץ לפנימייה" כחלק מתורנות המטבחון</b><span>מוסיף משימת ניקיון בחוץ לחדר התורן</span></div><input type="checkbox" data-set="outside" ${s.outside ? "checked" : ""}></label>
    <label class="field" style="margin-top:10px"><span>להזכיר לעדכן תורנות אחרי (ימים)</span><input class="inp" type="number" min="1" max="14" data-set="staleDays" value="${s.staleDays}" style="max-width:120px"></label>
  </div>
`;
}
async function saveSettings(patch) {
  const next = { ...C.mergeSettings(S.settingsRaw), ...patch };
  await setDoc(doc(db, "sites", "cheder"), { activeDays: next.activeDays, mopDay: next.mopDay, outside: next.outside, staleDays: next.staleDays, updatedAt: serverTimestamp() });
  toast("נשמר ✓", 1200);
}

// ---------- אירועים ----------
$("view").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === "add") {
    try { if (await saveMember({ email: f.email.value, name: f.name.value, room: f.room.value })) f.reset(); } catch (err) { toast(authError(err)); }
  }
});
$("view").addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const a = el.dataset.act, s = S.settings;
  try {
    if (a === "edit") editSheet(el.dataset.id);
    else if (a === "addme") {
      sheet(`<h2>לצרף אותי</h2><label class="field"><span>החדר שלי</span><input class="inp ltr" id="myRoom" inputmode="numeric" autofocus></label><div class="btns"><button class="btn pri grow" data-act="ok">צירוף</button></div>`,
        async (act, el2, root, close) => { if (act === "ok" && await saveMember({ email: ADMIN_EMAIL, name: S.user.displayName || "", room: root.querySelector("#myRoom").value })) close(); });
    }
    else if (a === "sugok") await answerSug(el.dataset.id, "approved");
    else if (a === "sugdone") await answerSug(el.dataset.id, "approved");
    else if (a === "sugno") await answerSug(el.dataset.id, "rejected");
    else if (a === "sugdel") await deleteDoc(doc(db, "ch_suggestions", el.dataset.id));
    else if (a === "deld") { if (await confirmSheet("למחוק את התורנות?", "", "מחיקה", true)) await deleteDoc(doc(db, "ch_duties", el.dataset.id)); }
    else if (a === "dele") { if (await confirmSheet("למחוק את השינוי?", "", "מחיקה", true)) await deleteDoc(doc(db, "ch_events", el.dataset.id)); }
    else if (a === "day") { const v = +el.dataset.v; const days = s.activeDays.includes(v) ? s.activeDays.filter(x => x !== v) : [...s.activeDays, v].sort(); await saveSettings({ activeDays: days }); }
    else if (a === "mop") await saveSettings({ mopDay: +el.dataset.v });
  } catch (err) { toast(authError(err)); }
});
$("view").addEventListener("change", async e => {
  const k = e.target.dataset.set;
  if (!k) return;
  let v = e.target.type === "checkbox" ? e.target.checked : e.target.value.trim();
  if (k === "staleDays") v = Math.max(1, Math.min(14, +v || 3));
  try { await saveSettings({ [k]: v }); } catch (err) { toast(authError(err)); }
});
