// בדיקות ללוגיקה של תורנויות חדר:  node cheder/test/core.test.mjs
import * as C from "../core.js";
let pass = 0, fail = 0;
const eq = (name, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++;
  console.log(ok ? "  ok  " : "  FAIL", name, ok ? "" : `\n        got ${JSON.stringify(a)}\n        exp ${JSON.stringify(b)}`);
};

console.log("--- פענוח הודעות");
const MSG = `[15/11, 8:03] נדב המדריך: חדרים תורנים כמו בשישי:
39
42
47

מטבחון, מועדון, מחוץ לפנימיה - 48
[16/11, 8:01] נדב המדריך: בוקר טוב!
חדרים תורנים היום: (מתחילים סבב חדש)
37
41
45

מטבחון מועדון ומחוץ לפנימיה: 39
[17/11, 7:56] נדב המדריך: בוקר טוב!
חדרים תורנים:
37
41
45

מטבחון מועדון ומחוץ לפנימיה: 39`;
const p = C.parseDutyText(MSG, "2026-11-17");
eq("3 messages", p.length, 3);
eq("msg1", [p[0].date, p[0].floor, p[0].kitchen], ["2026-11-15", ["39", "42", "47"], ["48"]]);
eq("msg2", [p[1].date, p[1].floor, p[1].kitchen, p[1].newRound], ["2026-11-16", ["37", "41", "45"], ["39"], true]);
eq("msg3", [p[2].date, p[2].floor, p[2].kitchen, p[2].sender], ["2026-11-17", ["37", "41", "45"], ["39"], "נדב המדריך"]);
eq("no header -> today", C.parseDutyText("חדרים תורנים: 37, 41, 45\nמטבחון ומועדון\n39", "2026-11-17").map(m => [m.date, m.floor, m.kitchen]), [["2026-11-17", ["37", "41", "45"], ["39"]]]);
eq("floor labels", C.parseDutyText("קומה 1: 37\nקומה 2: 41\nקומה 3 - 45\nמטבחון: 50", "2026-11-17")[0].floor, ["37", "41", "45"]);
eq("export format", C.parseDutyText("16/11/2026, 8:01 - נדב: בוקר טוב\n37\n41\n45\nמטבחון 39", "2026-11-17").map(m => [m.date, m.floor, m.kitchen]), [["2026-11-16", ["37", "41", "45"], ["39"]]]);
eq("year rollover (Dec msg in Jan)", C.parseDutyText("[30/12, 8:00] נדב: 10\n11\n12\nמטבחון 13", "2027-01-02")[0].date, "2026-12-30");
eq("RTL marks", C.parseDutyText("‏[17/11, 7:56] נדב: ‏37\n41\n45\nמטבחון: 39", "2026-11-17")[0].floor, ["37", "41", "45"]);
eq("empty", C.parseDutyText("בוקר טוב לכולם", "2026-11-17"), []);

console.log("--- ימים ומשימות");
const duty = { date: "2026-11-16", floor: ["37", "41", "45"], kitchen: ["39"] };
eq("dutyFor", C.dutyFor([{ date: "2026-11-10" }, duty, { date: "2026-11-20" }], "2026-11-17").date, "2026-11-16");
eq("sunday room 41", C.tasksForDay("2026-11-15", duty, "41"), ["table", "sweep", "trash", "hall", "restroom", "sinks", "toilets", "bins"]);
eq("thursday mop", C.tasksForDay("2026-11-19", null, "41"), ["table", "sweep", "trash", "mop"]);
eq("kitchen room", C.tasksForDay("2026-11-17", duty, "39"), ["table", "sweep", "trash", "kitchen", "club", "outside"]);
eq("shabbat none", C.tasksForDay("2026-11-21", duty, "41"), []);
const ev = [
  { type: "off", from: "2026-11-17", to: "2026-11-18", title: "טיול" },
  { type: "mopmove", from: "2026-11-19", to: "2026-11-20" },
  { type: "noduty", from: "2026-11-22", room: "41" },
  { type: "on", from: "2026-11-28" }
];
eq("trip off", C.tasksForDay("2026-11-18", duty, "41", null, ev), []);
eq("mop moved away", C.tasksForDay("2026-11-19", null, "41", null, ev), ["table", "sweep", "trash"]);
eq("mop moved to friday", C.tasksForDay("2026-11-20", null, "41", null, ev), ["table", "sweep", "trash", "mop"]);
eq("noduty only room 41", C.tasksForDay("2026-11-22", duty, "41", null, ev), ["table", "sweep", "trash"]);
eq("noduty not for 37", C.tasksForDay("2026-11-22", duty, "37", null, ev).length, 8);
eq("shabbat forced on", C.tasksForDay("2026-11-28", null, "41", null, ev), ["table", "sweep", "trash"]);

console.log("--- חלוקה");
const residents = [{ id: "a", name: "אבי" }, { id: "b", name: "בני" }, { id: "c", name: "גדי" }, { id: "d", name: "דני", left: "2026-11-01" }];
const absences = [{ rid: "c", from: "2026-11-17", to: "2026-11-18", reason: "sick" }];
eq("present (sick + left)", C.presentOn(residents, absences, "2026-11-17"), ["a", "b"]);
eq("open-ended absence", C.presentOn(residents, [{ rid: "a", from: "2026-11-01", to: null }], "2027-01-01"), ["b", "c"]);
// סימולציה של 60 יום: העומס צריך להיות מאוזן
let hist = [];
for (let i = 0; i < 60; i++) {
  const key = C.addDays("2026-09-01", i);
  const { plan } = C.buildPlan({ key, room: "41", residents, absences: [], duty: i % 6 < 3 ? duty : null, history: hist.slice(-30), existing: null });
  hist.push({ ...plan, done: Object.fromEntries(plan.tasks.map(t => [t, true])) });
}
const st = C.computeStats(hist, ["a", "b", "c"]);
const loads = ["a", "b", "c"].map(id => st[id].load);
console.log("        loads:", loads.join(", "), " tasks:", ["a", "b", "c"].map(id => JSON.stringify(st[id].tasks)).join(" "));
eq("balanced load (max-min <= 10%)", (Math.max(...loads) - Math.min(...loads)) / Math.max(...loads) <= 0.1, true);
eq("everyone did every room task", ["a", "b", "c"].every(id => st[id].tasks.table && st[id].tasks.sweep && st[id].tasks.trash && st[id].tasks.mop), true);
// עקביות - אותו קלט, אותה תוצאה
const args = { key: "2026-11-17", room: "41", residents, absences: [], duty, history: hist.slice(-30), existing: null };
eq("deterministic", C.buildPlan(args).plan, C.buildPlan(args).plan);
// מישהו חולה אחרי שכבר חולק: שומרים שיבוצים של השאר, ומי שכבר ביצע נשאר
const base = C.buildPlan(args).plan;
const cTask = C.tasksOf(base, "c")[0];
const after = C.buildPlan({ ...args, absences: [{ rid: "c", from: "2026-11-17", to: "2026-11-17" }], existing: { ...base, done: {} } }).plan;
eq("sick person's tasks moved", C.tasksOf(after, "c"), []);
eq("others keep theirs", C.tasksOf(base, "a").every(t => after.assign[t] === "a"), true);
const afterDone = C.buildPlan({ ...args, absences: [{ rid: "c", from: "2026-11-17", to: "2026-11-17" }], existing: { ...base, done: { [cTask]: true } } }).plan;
eq("done task stays with absent", afterDone.assign[cTask], "c");
eq("unchanged -> changed:false", C.buildPlan({ ...args, existing: base }).changed, false);
// תורנות שהודבקה באמצע הבוקר - מוסיפה משימות בלי להזיז קיימות
const noDuty = C.buildPlan({ ...args, duty: null }).plan;
const withDuty = C.buildPlan({ ...args, existing: noDuty }).plan;
eq("late duty keeps room tasks", ["table", "sweep"].every(t => withDuty.assign[t] === noDuty.assign[t]), true);
eq("week projection", C.projectPlans({ fromKey: "2026-11-15", days: 7, room: "41", residents, absences, duties: [duty], history: hist, events: ev }).map(p => p.tasks.length), [3, 8, 0, 0, 8, 9, 0]);
eq("nobody present", C.buildPlan({ ...args, absences: ["a", "b", "c"].map(rid => ({ rid, from: "2026-11-01" })) }).plan.assign, {});

const solo = C.buildPlan({ ...args, residents: [residents[0]] }).plan;
const grown = C.buildPlan({ ...args, existing: { ...solo, done: { table: true }, manual: {} } }).plan;
eq("new roommate -> re-split (done stays)", [grown.assign.table, new Set(Object.values(grown.assign)).size > 1], ["a", true]);
const back = C.buildPlan({ ...args, existing: { ...base, done: {}, manual: { sweep: true } } }).plan;
eq("manual swap kept", back.assign.sweep, base.assign.sweep);

// מי שלא מסמן שביצע - מקבל יותר
let h2 = [];
for (let i = 0; i < 30; i++) {
  const key = C.addDays("2026-09-01", i);
  const { plan } = C.buildPlan({ key, room: "41", residents, absences: [], duty: null, history: h2, existing: null });
  h2.push({ ...plan, done: Object.fromEntries(plan.tasks.filter(t => plan.assign[t] !== "c").map(t => [t, true])) });
}
const assigned = C.computeStats(h2, ["a", "b", "c"]);
const wOf = id => h2.reduce((x, d) => x + Object.entries(d.assign).filter(([, r]) => r === id).reduce((y, [t]) => y + C.TASKS[t].w, 0), 0);
console.log("        assigned counts:", ["a", "b", "c"].map(id => assigned[id].count).join(", "), " weight:", ["a", "b", "c"].map(wOf).join(", "));
eq("slacker gets more tasks", assigned.c.count > assigned.a.count && assigned.c.count > assigned.b.count, true);
eq("slacker capped (not everything)", assigned.a.count > 0 && assigned.b.count > 0, true);
eq("slacker load stays 0", assigned.c.load, 0);

// יום השטיפה מתחלף בתור, ואף אחד לא שוטף פעמיים ברצף
for (const n of [3, 4]) {
  const ppl = ["a", "b", "c", "d"].slice(0, n).map(id => ({ id, name: id }));
  let hm = []; const mops = [];
  for (let i = 0; i < 7 * 4 * n; i++) {
    const key = C.addDays("2026-09-06", i);
    const { plan } = C.buildPlan({ key, room: "41", residents: ppl, absences: [], duty: i % 9 < 3 ? duty : null, history: hm.slice(-60), existing: null });
    hm.push({ ...plan, done: Object.fromEntries(plan.tasks.map(t => [t, true])) });
    if (plan.assign.mop) mops.push(plan.assign.mop);
  }
  const cnt = ppl.map(p => mops.filter(m => m === p.id).length);
  eq(`mop rotates evenly (${n} people)`, Math.max(...cnt) - Math.min(...cnt) <= 1, true);
  eq(`mop never twice in a row (${n} people)`, mops.some((m, i) => m === mops[i - 1]), false);
}

console.log("--- מאגר משותף");
const sh = [{ date: "2026-11-16", floor: ["37"], kitchen: ["39"] }, { date: "2026-11-19", floor: ["50"], kitchen: [] }];
const lo = [{ date: "2026-11-17", floor: ["41"], kitchen: [] }];
eq("local overrides until next shared", ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"].map(k => C.dutyFor(C.mergeDuties(sh, lo, false), k).floor[0]), ["37", "41", "41", "50"]);
eq("same date: local wins", C.dutyFor(C.mergeDuties(sh, [{ date: "2026-11-16", floor: ["99"] }], false), "2026-11-16").floor, ["99"]);
eq("independent: only local", C.mergeDuties(sh, lo, true).map(d => d.date), ["2026-11-17"]);
const gEv = [{ id: "g1", type: "off", from: "2026-11-18" }, { id: "g2", type: "mop", from: "2026-11-20" }];
eq("ignored shared event", C.mergeEvents(gEv, { ignoredEvents: ["g1"], events: [{ id: "r1", type: "note", from: "2026-11-18" }] }, "41").map(e => e.id + ":" + e.room), ["g2:null", "r1:41"]);
eq("independent events", C.mergeEvents(gEv, { independent: true, events: [] }, "41"), []);
eq("room settings only when independent", [C.roomSettings({ mopDay: 4 }, { ownSettings: { mopDay: 2 } }).mopDay, C.roomSettings({ mopDay: 4 }, { independent: true, ownSettings: { mopDay: 2 } }).mopDay], [4, 2]);
eq("byPerson", (() => { const p = C.buildPlan(args).plan; return Object.entries(p.byPerson).every(([id, ts]) => ts.every(t => p.assign[t] === id)) && Object.values(p.byPerson).flat().length === p.tasks.length; })(), true);

console.log("--- תאריכים");
eq("dateKey tz", C.dateKey(new Date("2026-11-16T22:30:00Z")), "2026-11-17");
eq("slot", C.slotOf(new Date("2026-11-17T05:37:00Z")), "07:30");
eq("fmtDay", C.fmtDay("2026-11-19", "2026-11-17"), "יום חמישי, 19/11");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
