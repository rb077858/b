// =====================================================================
//  תורנויות חדר (cheder) - לוגיקה טהורה, בלי Firebase
//  משותף לאתר (app.js) ולממשק הניהול (admin/admin.js)
//  - פענוח ההודעה של המדריך
//  - אילו משימות יש בכל יום
//  - חלוקה הוגנת של המשימות בין מי שנמצא בחדר
// =====================================================================

export const TZ = "Asia/Jerusalem";
export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// w = משקל (כמה המשימה "שווה"), כדי שהחלוקה תהיה הוגנת גם כשהמשימות לא שוות
export const TASKS = {
  table:    { name: "פינוי השולחן",          icon: "", w: 1, group: "room" },
  sweep:    { name: "טאטוא החדר",            icon: "", w: 2, group: "room" },
  trash:    { name: "פינוי הפח של החדר",     icon: "", w: 1, group: "room" },
  mop:      { name: "שטיפת החדר",            icon: "", w: 3, group: "room" },
  hall:     { name: "טאטוא המסדרון",         icon: "", w: 2, group: "floor" },
  restroom: { name: "שטיפת השירותים",        icon: "", w: 3, group: "floor" },
  sinks:    { name: "ניקוי הכיורים",         icon: "", w: 1, group: "floor" },
  toilets:  { name: "ניקוי האסלות",          icon: "", w: 2, group: "floor" },
  bins:     { name: "פינוי כל הפחים בקומה לפח הגדול בחוץ", icon: "", w: 2, group: "floor" },
  kitchen:  { name: "ניקוי המטבחון",         icon: "", w: 2, group: "kitchen" },
  club:     { name: "ניקוי המועדון",         icon: "", w: 2, group: "kitchen" },
  outside:  { name: "ניקיון מחוץ לפנימייה",  icon: "", w: 2, group: "kitchen" }
};
export const BED = { name: "סידור המיטה", icon: "" };
export const GROUPS = {
  room:    { name: "ניקיון החדר",        icon: "" },
  floor:   { name: "תורנות קומה",        icon: "" },
  kitchen: { name: "מטבחון ומועדון",     icon: "" }
};
export const REASONS = {
  sick:    { name: "חולה",          icon: "" },
  home:    { name: "נסע הביתה",     icon: "" },
  other:   { name: "אחר",           icon: "" }
};

// סיבה של היעדרות (כולל ישנות שכבר לא ברשימה)
export const reasonOf = a => REASONS[a && a.reason] || REASONS.other;

export const DEFAULT_SETTINGS = {
  activeDays: [0, 1, 2, 3, 4, 5], // ראשון-שישי
  mopDay: 4,                       // חמישי
  outside: true,                   // "מחוץ לפנימייה" חלק מתורנות המטבחון
  staleDays: 3                     // אחרי כמה ימים להזכיר לעדכן תורנות
};
export const mergeSettings = s => ({ ...DEFAULT_SETTINGS, ...(s || {}) });

// ---------------------------------------------------------------------
//  תאריכים (תמיד לפי שעון ישראל). מפתח יום = "YYYY-MM-DD"
// ---------------------------------------------------------------------
const pad2 = n => String(n).padStart(2, "0");
export function dateKey(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function israelTime(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map(x => [x.type, x.value]));
  return `${p.hour}:${p.minute}`;
}
// השעה מעוגלת למטה לרבע שעה ("07:15")
export function slotOf(d = new Date()) {
  const [h, m] = israelTime(d).split(":").map(Number);
  return `${pad2(h)}:${pad2(Math.floor(m / 15) * 15)}`;
}
const toUTC = k => new Date(k + "T12:00:00Z");
export function addDays(k, n) { const d = toUTC(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const weekday = k => toUTC(k).getUTCDay();
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
export const isDateKey = k => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);
export function fmtDate(k) { const [, m, d] = k.split("-"); return `${+d}/${+m}`; }
export function fmtDay(k, today = dateKey()) {
  const diff = daysBetween(today, k);
  const rel = diff === 0 ? "היום" : diff === 1 ? "מחר" : diff === -1 ? "אתמול" : "";
  return `${rel ? rel + " · " : ""}יום ${DAY_NAMES[weekday(k)]}, ${fmtDate(k)}`;
}

// ---------------------------------------------------------------------
//  פענוח ההודעה של המדריך
//  תומך בהדבקה של כמה הודעות יחד, בפורמט של העתקה מוואטסאפ:
//    [16/11, 8:01] נדב המדריך: בוקר טוב! ...
//  או בפורמט של ייצוא צ'אט:  16/11/2026, 8:01 - נדב המדריך: ...
// ---------------------------------------------------------------------
const HDR_BRACKET = /^\[(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?,?\s*(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*[AP]M)?\]\s*([^:\n]{0,40}?):\s?/i;
const HDR_EXPORT = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*[AP]M)?\s+-\s+([^:\n]{0,40}?):\s?/i;
const KITCHEN_WORDS = /מטבח|מועדון|מחוץ/;

// שנה למועד בלי שנה: הקרובה ביותר להיום (לא יותר מחודשיים קדימה)
function inferYear(d, m, today) {
  const y = +today.slice(0, 4);
  for (const yy of [y, y - 1, y + 1]) {
    const k = `${yy}-${pad2(m)}-${pad2(d)}`;
    const diff = daysBetween(today, k);
    if (diff <= 60 && diff > -305) return yy;
  }
  return y;
}
function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseBody(lines) {
  const floor = [], kitchen = [];
  let waitKitchen = false;
  const text = lines.join("\n");
  for (const raw of lines) {
    let l = raw
      .replace(/\d{1,2}[:/.]\d{1,2}(?:[:/.]\d{2,4})?/g, " ")  // שעות ותאריכים
      .replace(/קומה\s*['׳"]?\s*\d+/g, " ")                    // "קומה 2: 41"
      .replace(/סבב\s*\d+/g, " ");
    const nums = (l.match(/\d{1,4}/g) || []).map(n => String(+n));
    if (KITCHEN_WORDS.test(l)) {
      if (nums.length) { kitchen.push(...nums); waitKitchen = false; }
      else waitKitchen = true;
      continue;
    }
    if (waitKitchen && nums.length) { kitchen.push(...nums); waitKitchen = false; continue; }
    floor.push(...nums);
  }
  const uniq = a => [...new Set(a)];
  return {
    floor: uniq(floor).slice(0, 6),
    kitchen: uniq(kitchen).slice(0, 3),
    newRound: /סבב חדש/.test(text),
    sameAs: /כמו (ב|אתמול|קודם)/.test(text)
  };
}

export function parseDutyText(text, today = dateKey()) {
  const lines = String(text || "")
    .replace(/[‎‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/\r/g, "")
    .split("\n");
  const msgs = [];
  let cur = null;
  for (const line of lines) {
    const m = line.trim().match(HDR_BRACKET) || line.trim().match(HDR_EXPORT);
    if (m) {
      const d = +m[1], mo = +m[2];
      let y = m[3] ? +m[3] : inferYear(d, mo, today);
      if (y < 100) y += 2000;
      const ok = mo >= 1 && mo <= 12 && validDate(y, mo, d);
      cur = { date: ok ? `${y}-${pad2(mo)}-${pad2(d)}` : today, time: `${pad2(+m[4])}:${m[5]}`, sender: m[6].trim(), lines: [line.trim().slice(m[0].length)] };
      msgs.push(cur);
    } else {
      if (!cur) { cur = { date: today, time: "", sender: "", lines: [] }; msgs.push(cur); }
      cur.lines.push(line);
    }
  }
  const parsed = msgs
    .map(m => ({ date: m.date, time: m.time, sender: m.sender, raw: m.lines.join("\n").trim(), ...parseBody(m.lines) }))
    .filter(m => m.floor.length || m.kitchen.length);
  // כמה הודעות באותו יום - האחרונה קובעת
  const byDate = new Map();
  for (const m of parsed) byDate.set(m.date, m);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// התורנות שבתוקף ביום מסוים: האחרונה שתאריכה <= היום. duties ממוינות או לא
export function dutyFor(duties, key) {
  let best = null;
  for (const d of duties || []) if (d.date <= key && (!best || d.date > best.date)) best = d;
  return best;
}
export function roomRoles(duty, room) {
  room = String(room);
  return {
    floor: !!duty && (duty.floor || []).map(String).includes(room),
    kitchen: !!duty && (duty.kitchen || []).map(String).includes(room)
  };
}

// ---------------------------------------------------------------------
//  משימות ונוכחות
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//  חריגים בלוח: חופשה/טיול, העברת יום שטיפה, ביטול תורנות וכו'
//  event = { id, type, from, to, title, room? }  (room ריק = לכל הפנימייה)
//    off     - אין משימות בכלל (חופשה, טיול, יום מחוץ לפנימייה)    from..to
//    on      - יום רגיל גם אם בדרך כלל אין (למשל שבת בפנימייה)       from..to
//    mopmove - יום השטיפה עובר: from = היום המקורי, to = היום החדש
//    mop     - יום שטיפה נוסף                                         from..to
//    nomop   - אין שטיפה                                              from..to
//    noduty  - אין תורנות קומה/מטבחון (רק ניקיון החדר)               from..to
//    note    - הודעה בלבד                                             from..to
// ---------------------------------------------------------------------
export const EVENT_TYPES = {
  off:     { name: "חופשה / טיול - אין משימות", short: "אין משימות", icon: "" },
  mopmove: { name: "העברת יום השטיפה",          short: "השטיפה עברה", icon: "" },
  mop:     { name: "יום שטיפה נוסף",             short: "יום שטיפה", icon: "" },
  nomop:   { name: "ביטול השטיפה",               short: "בלי שטיפה", icon: "" },
  noduty:  { name: "בלי תורנות קומה ומטבחון",    short: "בלי תורנות", icon: "" },
  on:      { name: "יום רגיל (גם אם בד\"כ אין)",  short: "יום רגיל", icon: "" },
  note:    { name: "הערה / הודעה",               short: "הערה", icon: "" }
};
const inRange = (e, key) => e.from <= key && (e.to || e.from) >= key;
export function eventsOn(events, key, room) {
  return (events || []).filter(e => (!e.room || String(e.room) === String(room)) && (e.type === "mopmove" ? (e.from === key || e.to === key) : inRange(e, key)));
}

// מה קורה ביום מסוים: האם יש משימות, האם יש שטיפה, האם יש תורנות
export function dayInfo(key, room, settings, events) {
  const s = mergeSettings(settings);
  const wd = weekday(key);
  const evs = eventsOn(events, key, room);
  const has = t => evs.some(e => e.type === t);
  let active = s.activeDays.includes(wd);
  if (has("on")) active = true;
  const off = evs.find(e => e.type === "off") || null;
  if (off) active = false;
  let mop = wd === s.mopDay;
  for (const e of evs) if (e.type === "mopmove") { if (e.from === key) mop = false; if (e.to === key) mop = true; }
  if (has("mop")) mop = true;
  if (has("nomop")) mop = false;
  return { active, mop: active && mop, duty: active && !has("noduty"), off, events: evs };
}

export function tasksForDay(key, duty, room, settings, events) {
  const s = mergeSettings(settings);
  const info = dayInfo(key, room, s, events);
  if (!info.active) return [];
  const t = ["table", "sweep", "trash"];
  if (info.mop) t.push("mop");
  if (info.duty) {
    const r = roomRoles(duty, room);
    if (r.floor) t.push("hall", "restroom", "sinks", "toilets", "bins");
    if (r.kitchen) t.push("kitchen", "club", ...(s.outside ? ["outside"] : []));
  }
  return t;
}
export const activeResidents = residents => (residents || []).filter(r => !r.left);
export function absenceOn(absences, rid, key) {
  return (absences || []).find(a => a.rid === rid && a.from <= key && (!a.to || a.to >= key)) || null;
}
export function presentOn(residents, absences, key) {
  return activeResidents(residents).filter(r => !absenceOn(absences, r.id, key)).map(r => r.id);
}

// ---------------------------------------------------------------------
//  חלוקה הוגנת
//  1. קודם כל מאזנים את היום (סכום משקלים דומה לכל אחד)
//  2. אחר כך לפי ממוצע עומס לאורך זמן - רק משימות שבוצעו (מי שעשה פחות - מקבל קודם)
//  3. מנסים לא לתת לאותו אחד את אותה משימה פעמיים ברצף
//  4. שובר שוויון קבוע לפי היום, כך שכל מכשיר יחשב בדיוק אותו דבר
// ---------------------------------------------------------------------
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const W = t => (TASKS[t] ? TASKS[t].w : 1);

export function computeStats(history, ids) {
  const st = {};
  for (const id of ids) st[id] = { days: 0, load: 0, count: 0, tasks: {}, last: {} };
  for (const h of history || []) {
    if (!(h.tasks || []).length) continue; // ימים בלי משימות (שבת, טיול) לא נספרים
    for (const id of h.present || []) if (st[id]) st[id].days++;
    for (const [t, id] of Object.entries(h.assign || {})) {
      if (!st[id]) continue;
      st[id].count++;
      // לעומס נספרות רק משימות שסומנו כבוצעו - מי שלא עשה, יקבל יותר בימים הבאים
      if (h.done && h.done[t]) { st[id].load += W(t); st[id].done = (st[id].done || 0) + 1; }
      st[id].tasks[t] = (st[id].tasks[t] || 0) + 1;
      if (!st[id].last[t] || h.date > st[id].last[t]) st[id].last[t] = h.date;
    }
  }
  return st;
}

export function assignTasks({ tasks, present, history = [], key, keep = {} }) {
  const assign = {};
  if (!present.length) return assign;
  const past = (history || []).filter(h => h.date < key);
  const st = computeStats(past, present);
  const rated = present.filter(id => st[id].days > 0);
  const avg = rated.length ? rated.reduce((a, id) => a + st[id].load / st[id].days, 0) / rated.length : 0;
  const rate = id => (st[id].days > 0 ? st[id].load / st[id].days : avg);
  const today = Object.fromEntries(present.map(id => [id, 0]));
  // התור של כל משימה: הפעם האחרונה שהייתה המשימה, וכמה פעמים כל אחד עשה אותה
  const lastOcc = {};
  for (const h of past) for (const t of h.tasks || []) if (!lastOcc[t] || h.date > lastOcc[t]) lastOcc[t] = h.date;
  const did = (id, t) => st[id].tasks[t] || 0;

  for (const t of tasks) {
    const id = keep[t];
    if (id && present.includes(id)) { assign[t] = id; today[id] += W(t); }
  }
  const todo = tasks.filter(t => !assign[t]).sort((a, b) => W(b) - W(a) || tasks.indexOf(a) - tasks.indexOf(b));
  for (const t of todo) {
    let best = null, bestScore = Infinity;
    const minDid = Math.min(...present.map(id => did(id, t)));
    for (const id of present) {
      const s = st[id];
      // "חוב": כמה פחות ממה שמצופה (לפי הימים שהיה) הוא עשה בפועל. מוגבל, כדי שלא יקבל הכל ביום אחד
      const owed = s.days > 0 ? Math.max(-2, Math.min(2, avg * s.days - s.load)) : 0;
      const score = (today[id] - owed * 0.5) * 100
        + rate(id) * 10
        // תור: מי שעשה את המשימה הזו פחות פעמים מהאחרים - קודם; מי שעשה אותה בפעם הקודמת שהייתה - לא שוב
        + (did(id, t) - minDid) * 45
        + (lastOcc[t] && s.last[t] === lastOcc[t] ? 70 : 0)
        - (s.last[t] ? Math.min(daysBetween(s.last[t], key), 60) : 60) / 10
        + (hash(`${key}|${t}|${id}`) % 1000) / 1000;
      if (score < bestScore) { bestScore = score; best = id; }
    }
    assign[t] = best;
    today[best] += W(t);
  }
  return assign;
}

// בונה (או מעדכן) את התוכנית של יום אחד.
// existing = מה שכבר שמור ליום הזה. שיבוצים קיימים נשמרים כל עוד האדם נמצא (או שהמשימה כבר בוצעה)
export function buildPlan({ key, room, residents, absences, duty, history, existing, settings, events }) {
  const tasks = tasksForDay(key, duty, room, settings, events);
  const present = presentOn(residents, absences, key);
  const done = (existing && existing.done) || {};
  const manual = (existing && existing.manual) || {};
  // מישהו חדש הגיע (נוסף לחדר / חזר) - מחלקים מחדש את מה שעוד לא בוצע ולא הוחלף ידנית
  const joined = !!existing && present.some(id => !(existing.present || []).includes(id));
  const keep = {};
  for (const [t, id] of Object.entries((existing && existing.assign) || {})) {
    if (!tasks.includes(t)) continue;
    if (done[t] || manual[t] || (!joined && present.includes(id))) keep[t] = id;
  }
  const assign = assignTasks({ tasks, present, history, key, keep });
  for (const [t, id] of Object.entries(keep)) if (!present.includes(id)) assign[t] = id; // בוצע לפני שסומן כנעדר
  const byPerson = {};
  for (const t of tasks) if (assign[t]) (byPerson[assign[t]] = byPerson[assign[t]] || []).push(t);
  const plan = { date: key, tasks, present, assign, byPerson, dutyDate: duty ? duty.date : null };
  const same = !!existing
    && JSON.stringify(sortObj(existing.byPerson || {})) === JSON.stringify(sortObj(byPerson))
    && JSON.stringify(existing.tasks || []) === JSON.stringify(tasks)
    && JSON.stringify(existing.present || []) === JSON.stringify(present)
    && JSON.stringify(sortObj(existing.assign || {})) === JSON.stringify(sortObj(assign))
    && (existing.dutyDate || null) === plan.dutyDate;
  return { plan, changed: !same };
}
const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

// ---------------------------------------------------------------------
//  מאגר משותף מול הגדרות של החדר
//  room = מסמך החדר: { independent, ownSettings, ignoredEvents, events }
// ---------------------------------------------------------------------
// תורנות שהחדר הזין לעצמו גוברת על המשותפת מאותו תאריך (עד העדכון המשותף הבא)
export function mergeDuties(shared, local, independent) {
  const loc = (local || []).map(d => ({ ...d, local: true }));
  if (independent) return loc;
  const byDate = new Map((shared || []).map(d => [d.date, d]));
  for (const d of loc) byDate.set(d.date, d);
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}
export function mergeEvents(shared, roomDoc, roomId) {
  const r = roomDoc || {};
  const own = (r.events || []).map(e => ({ ...e, room: String(roomId) }));
  if (r.independent) return own;
  const ignored = new Set(r.ignoredEvents || []);
  return [...(shared || []).filter(e => !ignored.has(e.id)).map(e => ({ ...e, room: null })), ...own];
}
export const SETTING_KEYS = ["activeDays", "mopDay", "outside"];
export function roomSettings(shared, roomDoc) {
  const base = mergeSettings(shared);
  if (!roomDoc || !roomDoc.independent) return base;
  const own = roomDoc.ownSettings || {};
  for (const k of SETTING_KEYS) if (own[k] !== undefined) base[k] = own[k];
  return base;
}

// המשימות של אדם אחד ביום (לפי סדר המשימות)
export function tasksOf(plan, id) {
  return (plan.tasks || []).filter(t => plan.assign && plan.assign[t] === id);
}

// סיכום טקסט קצר של היום
export function planSummary(plan, residents) {
  const names = Object.fromEntries((residents || []).map(r => [r.id, r.name]));
  const parts = [];
  for (const id of plan.present || []) {
    const ts = tasksOf(plan, id).map(t => TASKS[t].name.replace(/^(ניקוי|ניקיון|שטיפת|טאטוא|פינוי) /, "$1 "));
    if (ts.length) parts.push(`${names[id] || "?"}: ${ts.join(", ")}`);
  }
  return parts.join("\n");
}

// תחזית לימים הבאים (לא נשמרת) - כל יום מתווסף להיסטוריה של הבא
export function projectPlans({ fromKey, days, room, residents, absences, duties, history, settings, events, existingByDate = {} }) {
  const out = [];
  let hist = [...(history || [])];
  for (let i = 0; i < days; i++) {
    const key = addDays(fromKey, i);
    const existing = existingByDate[key] || null;
    const { plan } = buildPlan({ key, room, residents, absences, duty: dutyFor(duties, key), history: hist, existing, settings, events });
    out.push(plan);
    hist = [...hist.filter(h => h.date !== key), plan];
  }
  return out;
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
