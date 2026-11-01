// =====================================================================
//  לוגיקת לוח השידורים של "קופה ראשית".
//  משותף לדף הציבורי (index.html) ולפאנל הניהול (/admin).
//  ההגדרות עצמן נשמרות ב-Firestore במסמך  sites/kupa-rashit
// =====================================================================

export const SITE_ID = "kupa-rashit";
export const TZ = "Asia/Jerusalem";
export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// ---------- ערכות עיצוב מוכנות ----------
export const PRESETS = {
  night:   { label: "לילה",       bg: "#0f1724", bg2: "#1a2a44", card: "#1b2638", text: "#f2f5fa", muted: "#9aa8bd", accent: "#3fa9f5" },
  midnight:{ label: "חצות",       bg: "#05060a", bg2: "#14112b", card: "#121222", text: "#ffffff", muted: "#a5a3c7", accent: "#8b7bff" },
  light:   { label: "בהיר",       bg: "#eef2f7", bg2: "#ffffff", card: "#ffffff", text: "#132036", muted: "#5b6b82", accent: "#1f6feb" },
  sunset:  { label: "שקיעה",      bg: "#2b1029", bg2: "#7a2b3a", card: "#3a1733", text: "#fff3ea", muted: "#e6b9b0", accent: "#ff8a4c" },
  forest:  { label: "יער",        bg: "#0d1f17", bg2: "#1d3b2b", card: "#15302a", text: "#effaf3", muted: "#9fc2ae", accent: "#3ddc84" },
  gold:    { label: "זהב",        bg: "#111111", bg2: "#2a2316", card: "#1b1813", text: "#fbf6ea", muted: "#c7b995", accent: "#e3b341" },
  ocean:   { label: "אוקיינוס",   bg: "#062435", bg2: "#0b4b6b", card: "#0c3249", text: "#eaf8ff", muted: "#98c6dc", accent: "#2dd4bf" },
  rose:    { label: "ורוד",       bg: "#fff1f4", bg2: "#ffe0e8", card: "#ffffff", text: "#3b0d1c", muted: "#8a5163", accent: "#e11d63" }
};

export const FONTS = [
  { id: "Heebo", label: "Heebo" },
  { id: "Rubik", label: "Rubik" },
  { id: "Assistant", label: "Assistant" },
  { id: "Varela Round", label: "Varela Round" },
  { id: "Secular One", label: "Secular One" },
  { id: "Frank Ruhl Libre", label: "Frank Ruhl Libre" },
  { id: "Suez One", label: "Suez One" },
  { id: "system", label: "ברירת מחדל של המכשיר" }
];

// ---------- הגדרות ברירת מחדל (משמשות גם כגיבוי אם אין חיבור למסד הנתונים) ----------
export const DEFAULT_CONFIG = {
  enabled: true,
  defaults: {
    showName: "קופה ראשית",
    liveUrl: "https://www.kan.org.il/live/"
  },
  weekly: [
    { id: "w1", enabled: true, day: 0, start: "21:30", end: "22:00", name: "", url: "", label: "" }
  ],
  specials: [
    { id: "s1", enabled: true, date: "2026-10-27", start: "21:30", end: "22:00", name: "", url: "", label: "פרק מיוחד לכבוד יום הבחירות" }
  ],
  cancelled: [],
  override: {
    mode: "auto",      // auto = לפי הלוח | live = להעביר עכשיו לשידור | off = להציג הודעה בלבד
    url: "",
    title: "",
    message: "",
    until: ""          // "YYYY-MM-DDTHH:MM" שעון ישראל. אחרי הזמן הזה חוזרים אוטומטית ל-auto
  },
  texts: {
    pageTitle: "שידור חי - כאן",
    loading: "טוען...",
    notStartedTitle: "השידור עוד לא התחיל",
    notStartedLead: "השידור הבא יתחיל ב:",
    endedTitle: "השידור הסתיים",
    endedLead: "השידור הבא:",
    noneTitle: "אין שידורים קרובים",
    noneText: "כרגע לא מתוכנן שידור. כדאי לבדוק שוב בקרוב.",
    alreadyLiveTitle: "השידור כבר התחיל!",
    alreadyLiveMsg: "השידור כבר התחיל, צפייה מהנה",
    startingTitle: "השידור מתחיל עכשיו!",
    startingMsg: "צפייה מהנה",
    offTitle: "השידור אינו זמין כרגע",
    offText: "",
    redirectBtn: "לצפייה בשידור",
    countdownLead: "בעוד",
    footer: ""
  },
  design: {
    preset: "night",
    ...stripLabel(PRESETS.night),
    gradient: true,
    font: "Heebo",
    titleSize: 32,
    radius: 16,
    cardWidth: 480,
    bgImage: "",
    bgOverlay: 0.55,
    logoUrl: "",
    logoSize: 72,
    showSpinner: true,
    showCountdown: true,
    showButton: true,
    showName: true,
    showDate: true,
    glass: false,
    shadow: true,
    animation: "rise",   // none | fade | rise | zoom
    customCss: ""
  },
  advanced: {
    joinDelaySec: 3,       // כמה שניות להציג הודעה לפני העברה כשנכנסים באמצע שידור
    startDelaySec: 5,      // כמה שניות להציג הודעה לפני העברה כשהשידור מתחיל בזמן שהדף פתוח
    earlyMinutes: 0,       // להתחיל להעביר כמה דקות לפני שעת ההתחלה
    lookaheadDays: 21,     // כמה ימים קדימה לחפש את השידור הבא
    useServerTime: true,   // להשתמש בשעון חיצוני מדויק במקום שעון המכשיר
    autoRedirect: true,    // להעביר אוטומטית (אם כבוי - רק מוצג כפתור)
    hidePast: true
  }
};

function stripLabel(p) { const { label, ...rest } = p; return rest; }

// מיזוג עמוק של הגדרות שנשמרו עם ברירות המחדל (כדי ששדות חדשים תמיד יהיו קיימים)
export function mergeConfig(saved) {
  const out = structuredClone(DEFAULT_CONFIG);
  if (!saved || typeof saved !== "object") return out;
  for (const key of Object.keys(out)) {
    if (!(key in saved)) continue;
    const v = saved[key];
    if (Array.isArray(out[key])) out[key] = Array.isArray(v) ? v : out[key];
    else if (out[key] && typeof out[key] === "object") out[key] = { ...out[key], ...(v || {}) };
    else out[key] = v;
  }
  return out;
}

// ---------- זמן ישראל (כולל מעבר בין שעון קיץ לחורף) ----------
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const israelFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23"
});

export function israelParts(ms) {
  const p = {};
  for (const part of israelFmt.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: WEEKDAYS[p.weekday] };
}

function tzOffsetMs(ms) {
  const p = israelParts(ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

// שעה מקומית בישראל -> זמן אבסולוטי
export function israelToEpoch(y, mo, d, h, mi, s = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - tzOffsetMs(guess);
  t = guess - tzOffsetMs(t);
  return t;
}

export const pad2 = n => String(n).padStart(2, "0");
export const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || "");
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const hm = s => s.split(":").map(Number);

export function dateKey(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
export function todayKey(ms) { const p = israelParts(ms); return dateKey(p.y, p.m, p.d); }

// ---------- זמן מדויק משרת חיצוני ----------
async function fetchWithTimeout(url, options = {}, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" }); }
  finally { clearTimeout(timer); }
}

export async function getServerTime() {
  const sources = [
    async () => {
      const res = await fetchWithTimeout("https://worldtimeapi.org/api/timezone/Asia/Jerusalem");
      if (!res.ok) throw new Error();
      return (await res.json()).unixtime * 1000;
    },
    async () => {
      const res = await fetchWithTimeout("https://timeapi.io/api/time/current/zone?timeZone=Asia%2FJerusalem");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(data.dateTime);
      if (!m) throw new Error();
      return israelToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
    },
    async () => {
      const res = await fetchWithTimeout(location.href, { method: "HEAD" });
      const t = Date.parse(res.headers.get("Date"));
      if (isNaN(t)) throw new Error();
      return t;
    }
  ];
  for (const source of sources) {
    try { return await source(); } catch (e) { /* ננסה את המקור הבא */ }
  }
  return Date.now();
}

// ---------- חלונות שידור ----------
// כל חלונות השידור (קבועים + מיוחדים) מיום אתמול ועד lookaheadDays קדימה.
// שעת סיום שקטנה/שווה לשעת ההתחלה = השידור נגמר למחרת (חוצה חצות).
export function buildWindows(cfg, ms) {
  const p = israelParts(ms);
  const windows = [];
  const cancelled = new Set((cfg.cancelled || []).map(c => (typeof c === "string" ? c : c.date)));
  const days = Math.max(1, Math.min(120, +cfg.advanced.lookaheadDays || 21));
  const earlyMs = Math.max(0, +cfg.advanced.earlyMinutes || 0) * 60000;

  function add(src, kind, y, mo, d) {
    if (!isTime(src.start) || !isTime(src.end)) return;
    const [sh, sm] = hm(src.start), [eh, em] = hm(src.end);
    const start = israelToEpoch(y, mo, d, sh, sm, 0);
    let end = israelToEpoch(y, mo, d, eh, em, 0);
    if (end <= start) {
      const n = new Date(Date.UTC(y, mo - 1, d + 1));
      end = israelToEpoch(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), eh, em, 0);
    }
    windows.push({
      id: src.id, kind, y, mo, d,
      date: dateKey(y, mo, d),
      wd: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(),
      name: src.name || cfg.defaults.showName,
      url: src.url || cfg.defaults.liveUrl,
      label: src.label || "",
      start, end,
      openAt: start - earlyMs,
      startText: src.start,
      endText: src.end
    });
  }

  for (let i = -1; i <= days; i++) {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    const y = day.getUTCFullYear(), mo = day.getUTCMonth() + 1, d = day.getUTCDate();
    if (cancelled.has(dateKey(y, mo, d))) continue;
    for (const w of cfg.weekly || []) {
      if (w.enabled === false || +w.day !== day.getUTCDay()) continue;
      add(w, "weekly", y, mo, d);
    }
  }

  for (const sp of cfg.specials || []) {
    if (sp.enabled === false || !isDate(sp.date)) continue;
    const [y, mo, d] = sp.date.split("-").map(Number);
    add(sp, "special", y, mo, d);
  }

  return windows.sort((a, b) => a.start - b.start);
}

function overrideActive(cfg, ms) {
  const o = cfg.override || {};
  if (!o.mode || o.mode === "auto") return null;
  if (o.until) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(o.until);
    if (m && ms >= israelToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5], 0)) return null;
  }
  return o.mode;
}

// מצבים: live | before | ended | none | off
export function getStatus(cfg, ms) {
  const windows = buildWindows(cfg, ms);
  const upcoming = windows.find(w => w.openAt > ms);
  const ov = overrideActive(cfg, ms);

  if (cfg.enabled === false || ov === "off") return { state: "off", next: upcoming, windows };
  if (ov === "live") {
    const o = cfg.override;
    return {
      state: "live", forced: true, windows,
      next: { name: cfg.defaults.showName, url: o.url || cfg.defaults.liveUrl, label: "", forced: true }
    };
  }

  const current = windows.find(w => ms >= w.openAt && ms < w.end);
  if (current) return { state: "live", next: current, windows };
  if (!upcoming) return { state: "none", next: null, windows };
  const t = israelParts(ms);
  const endedToday = windows.some(w => ms >= w.end && w.y === t.y && w.mo === t.m && w.d === t.d);
  return { state: endedToday ? "ended" : "before", next: upcoming, windows };
}

export function formatCountdown(msLeft) {
  if (msLeft <= 0) return "";
  const s = Math.floor(msLeft / 1000);
  const days = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const clock = `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  if (days === 0) return clock;
  return `${days === 1 ? "יום" : days === 2 ? "יומיים" : days + " ימים"} ו-${clock}`;
}

export function windowDateText(w) {
  return `יום ${DAY_NAMES[w.wd]}, ${pad2(w.d)}/${pad2(w.mo)}/${w.y}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}
