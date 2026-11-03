// =====================================================================
//  שותפים לחדר - ליבה (לוגיקה טהורה, בלי Firebase ובלי DOM)
//  שאלות, חישוב תשובה אפקטיבית וסתירות, התאמה, דירוג עם מקומות משותפים,
//  ופענוח קוד הייבוא מהאתר הישן.
// =====================================================================

export const MAXP = 5;

export const QS = [
  { id: "sleep", s: "שעת שינה", t: "באיזו שעה אתה בדרך כלל הולך לישון?", o: ["לפני 23:00", "23:00 עד 00:30", "00:30 עד 02:00", "אחרי 02:00"] },
  { id: "wake", s: "בוקר", t: "איך נראה הבוקר שלך?", o: ["קם מיד עם השעון", "קם אחרי נודניק או שניים", "צריך שיעירו אותי", "קם ברגע האחרון"] },
  { id: "tidy", s: "סדר", t: "כמה מסודר אתה בחדר?", o: ["הכל במקומו תמיד", "בדרך כלל מסודר", "קצת בלגן", "בלגן יצירתי"] },
  { id: "noise", s: "רעש", t: "כמה רעש אתה רוצה בחדר?", o: ["שקט מוחלט", "שיחה בשקט", "אווירה חיה", "הרבה רעש וצחוק"] },
  { id: "temp", s: "טמפרטורה", t: "מה הטמפרטורה האידיאלית בחדר?", o: ["קר מאוד, מזגן חזק", "קריר", "נעים", "חם, בלי מזגן"] },
  { id: "study", s: "לימוד בחדר", t: "כמה אתה לומד בחדר?", o: ["הרוב בחדר", "לפעמים", "כמעט הכל בבית המדרש", "אני כמעט לא בחדר"] },
  { id: "guests", s: "אורחים", t: "כמה חברים מגיעים אליך לחדר?", o: ["אף אחד", "מדי פעם", "הרבה", "החדר שלי הוא המפגש"] },
  { id: "food", s: "אוכל", t: "מה לגבי אוכל בחדר?", o: ["לא אוכל בחדר", "חטיף מדי פעם", "מקרר ומגירת חטיפים", "מטבח שלם"] },
  { id: "night", s: "אחרי כיבוי אור", t: "מה אתה עושה אחרי כיבוי אור?", o: ["ישן מיד", "משפט או שניים", "שיחה בלחש", "שיחות עד מאוחר"] },
  { id: "share", s: "שיתוף חפצים", t: "איך אתה עם שיתוף חפצים?", o: ["הכל פרטי", "מבקשים רשות", "לוקחים ומחזירים", "הכל משותף"] }
];
export const NQ = QS.length;
export const QIDS = QS.map(q => q.id);
export const qById = id => QS.find(q => q.id === id);

// ---------- שמות ----------
const BIDI = /[‎‏‪-‮⁦-⁩]/g;
export function cleanName(s) {
  return String(s == null ? "" : s).replace(BIDI, "").replace(/[|\r\n]/g, " ").replace(/\s+/g, " ").trim();
}
export function norm(s) { return cleanName(s).toLowerCase(); }
export function fullName(first, last) { return cleanName(cleanName(first) + " " + cleanName(last)); }
export function splitName(name) {
  const p = cleanName(name).split(" ");
  return { first: p[0] || "", last: p.slice(1).join(" ") };
}
export function initial(name) { return Array.from(cleanName(name))[0] || "?"; }

export const claimId = (pid, qid, uid) => `${pid}_${qid}_${uid}`;
export const resolvedId = (pid, qid) => `${pid}_${qid}`;

// ---------- תשובה אפקטיבית וסתירות ----------
const validV = (v, q) => Number.isInteger(v) && v >= 0 && v < q.o.length;

// claims: [{qid, v, author, self, t, ignored}], resolved: [{qid, v, t}]
// כללים:
//  1. תשובה שהאדמין הכריע קובעת. אם אחר כך הגיעה טענה שונה ממנה, נפתחת סתירה מחדש.
//  2. בלי הכרעה: אם כל הטענות זהות, זו התשובה. אם יש כמה ערכים, יש סתירה שמחכה לאדמין,
//     ובינתיים משתמשים בתשובה של האדם עצמו, ואם אין, בערך הנפוץ (שוויון: הראשון בזמן).
//  3. טענות מסומנות ignored (של משתמש חסום) לא נספרות. לכל כותב נספרת הטענה האחרונה שלו.
export function computeEff(claims, resolved) {
  const eff = {}, conf = {};
  for (const q of QS) {
    const byAuthor = new Map();
    for (const c of claims || []) {
      if (c.qid !== q.id || c.ignored || !validV(c.v, q)) continue;
      const prev = byAuthor.get(c.author);
      if (!prev || (c.t || 0) >= (prev.t || 0)) byAuthor.set(c.author, c);
    }
    const cs = [...byAuthor.values()];
    const rs = (resolved || []).filter(r => r.qid === q.id && validV(r.v, q)).sort((a, b) => (b.t || 0) - (a.t || 0))[0];
    if (rs) {
      eff[q.id] = rs.v;
      if (cs.some(c => (c.t || 0) > (rs.t || 0) && c.v !== rs.v)) conf[q.id] = true;
      continue;
    }
    if (!cs.length) continue;
    if (new Set(cs.map(c => c.v)).size === 1) { eff[q.id] = cs[0].v; continue; }
    conf[q.id] = true;
    const mine = cs.filter(c => c.self).sort((a, b) => (b.t || 0) - (a.t || 0))[0];
    if (mine) { eff[q.id] = mine.v; continue; }
    const cnt = new Map();
    for (const c of cs) {
      const e = cnt.get(c.v) || { n: 0, first: Infinity };
      e.n++; e.first = Math.min(e.first, c.t || 0);
      cnt.set(c.v, e);
    }
    const best = [...cnt.entries()].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)[0];
    eff[q.id] = best[0];
  }
  return { eff, conf, n: Object.keys(eff).length };
}

// ---------- התאמה ודירוג ----------
// a, b: מפות qid -> ערך. w: מפה qid -> true לשאלות שחשובות לי (פי שניים)
export function compat(a, b, w) {
  let num = 0, den = 0, n = 0;
  for (const q of QS) {
    const x = a && a[q.id], y = b && b[q.id];
    if (x == null || y == null) continue;
    const wt = w && w[q.id] ? 2 : 1;
    num += wt * (1 - Math.abs(x - y) / (q.o.length - 1));
    den += wt; n++;
  }
  return n ? { pct: Math.round(num / den * 100), n } : null;
}

// דירוג עם מקומות משותפים: 1,2,2,4. שוויון נקבע לפי האחוז המעוגל.
export function rankPeople(meEff, w, people) {
  const rows = [];
  for (const p of people) {
    const c = compat(meEff, p.eff || {}, w);
    if (c) rows.push({ p, pct: c.pct, n: c.n });
  }
  rows.sort((a, b) => b.pct - a.pct || b.n - a.n || String(a.p.name).localeCompare(String(b.p.name), "he"));
  for (const r of rows) r.place = 1 + rows.filter(o => o.pct > r.pct).length;
  for (const r of rows) r.tied = rows.filter(o => o.pct === r.pct).length > 1;
  return rows;
}

export function band(p) {
  return p >= 80 ? ["קרוב מאוד", "b4"] : p >= 65 ? ["מתאים", "b3"] : p >= 50 ? ["בינוני", "b2"] : ["רחוק", "b1"];
}

// ---------- כפילויות ----------
export function duplicateGroups(people) {
  const g = new Map();
  for (const p of people) {
    if (p.merged) continue;
    const k = norm(p.name);
    if (!k) continue;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(p);
  }
  return [...g.values()].filter(a => a.length > 1);
}

// ---------- ייבוא מהאתר הישן (קוד RM1) ----------
const keyBytes = () => Array.from(new TextEncoder().encode("shutafim-lahedar-v1"));
const scramble = arr => { const k = keyBytes(); return arr.map((x, i) => (x ^ k[i % k.length] ^ ((i * 13 + 5) & 255)) & 255); };
const sumOf = arr => { let s = 0; for (const x of arr) s = (s + x * 31 + 7) & 0xffff; return s; };

export function decodeToken(tok) {
  try {
    let s = tok.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s), arr = [];
    for (let i = 0; i < bin.length; i++) arr.push(bin.charCodeAt(i));
    if (arr.length < 2) return null;
    const c = (((arr[arr.length - 2] ^ 0xa5) & 255) << 8) | ((arr[arr.length - 1] ^ 0x5a) & 255);
    const plain = scramble(arr.slice(0, -2));
    if (sumOf(plain) !== c) return null;
    return new TextDecoder().decode(new Uint8Array(plain));
  } catch (e) { return null; }
}
export function encodeText(text) {
  const plain = Array.from(new TextEncoder().encode(text)), s = sumOf(plain), out = scramble(plain);
  out.push(((s >> 8) ^ 0xa5) & 255, ((s & 255) ^ 0x5a) & 255);
  let bin = ""; for (const c of out) bin += String.fromCharCode(c);
  return "RM1." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// מחזיר { friends:[{name,a}], me:{qid:v}, w:{qid:true}, picks:[names], conf:[...] }
export function parseLines(text) {
  const out = { friends: [], me: {}, w: {}, picks: [], conf: [] };
  const lines = String(text).replace(BIDI, "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const hi = lines.findIndex(l => /^roommates-v1/i.test(l));
  if (hi < 0) return null;
  let ids = null;
  const readVals = (vals) => {
    const a = {};
    ids.forEach((id, j) => {
      const q = qById(id);
      if (!q || vals[j] == null || vals[j] === "" || vals[j] === "-") return;
      const n = parseInt(vals[j], 10);
      if (!isNaN(n) && n >= 0 && n < q.o.length) a[id] = n;
    });
    return a;
  };
  for (let i = hi + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.charAt(0) === "#") { ids = l.slice(1).split(",").map(x => x.trim()); continue; }
    if (!ids) continue;
    if (l.charAt(0) === "@") {
      const ps = l.slice(1).split("|"), tag = ps[0].trim();
      if (tag === "me") Object.assign(out.me, readVals((ps[1] || "").split(",").map(x => x.trim())));
      else if (tag === "w") (ps[1] || "").split(",").forEach(x => { x = x.trim(); if (qById(x)) out.w[x] = true; });
      else if (tag === "pick") out.picks = out.picks.concat(ps.slice(1).map(cleanName).filter(Boolean));
      else if (tag === "conf" && ps[1] && ps[2]) out.conf.push({ name: cleanName(ps[1]), qid: ps[2].trim() });
      continue;
    }
    const k = l.lastIndexOf("|");
    if (k < 1) continue;
    const name = cleanName(l.slice(0, k));
    if (!name) continue;
    out.friends.push({ name, a: readVals(l.slice(k + 1).split(",").map(x => x.trim())) });
  }
  return out;
}

// מקבל את מה שהודבק (קוד אחד או כמה, או טקסט גלוי ישן). { data } או { bad:true } או { empty:true }
export function readImport(raw) {
  const t = String(raw || "").replace(BIDI, "");
  const toks = t.match(/RM1\.[A-Za-z0-9_-]+/g);
  let text = t;
  if (toks) {
    const parts = [];
    for (const k of toks) {
      const d = decodeToken(k.slice(4));
      if (d == null) return { bad: true };
      parts.push(d);
    }
    text = parts.join("\n");
  }
  const data = parseLines(text);
  if (!data) return { empty: true };
  const any = data.friends.length || Object.keys(data.me).length || data.picks.length || Object.keys(data.w).length;
  return any ? { data } : { empty: true };
}

// טקסט הרשימה למדריך
export function listText(names) {
  return "הילדים שהייתי רוצה להיות איתם בחדר:\n" + names.map((n, i) => `${i + 1}. ${n}`).join("\n");
}
