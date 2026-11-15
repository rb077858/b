// =====================================================================
//  משותף לדף הממים ולפאנל הניהול: קטגוריות, טעינת ממים וציור המם על canvas
//  כל המידות יחסיות לרוחב/גובה התמונה, כך שהמם נראה זהה בכל רזולוציה
// =====================================================================

// www.memeking.co.il עם תעודת אבטחה שפגה, לכן משתמשים בכתובת בלי www
export const API = "https://memeking.co.il/api/memes/category/";
const API_FALLBACK = "https://www.memeking.co.il/api/memes/category/";

export const CATEGORIES = [
  { id: "popular", name: "הפופולאריים השבוע", ic: "🔥" },
  { id: "new-memes", name: "ממים חדשים", ic: "✨" },
  { id: "all-time-popular", name: "הפופולאריים בכל הזמנים", ic: "🏆" },
  { id: "daily-popular", name: "הורדו לאחרונה", ic: "⏱️" },
  { id: "israeli", name: "ממים ישראליים", ic: "🇮🇱" },
  { id: "dank", name: "דאנק מימז", ic: "😎" },
  { id: "pop", name: "תרבות הפופ", ic: "🎤" },
  { id: "parlament", name: "הפרלמנט", ic: "🏛️" },
  { id: "classic", name: "ממים קלאסיים", ic: "🗿" },
  { id: "eretz_nehederet", name: "ארץ נהדרת", ic: "📺" },
  { id: "kupa", name: "קופה ראשית", ic: "🛒" },
  { id: "asi_guri", name: "אסי וגורי", ic: "🎭" },
  { id: "pigamot", name: "הפיג'מות", ic: "🛌" },
  { id: "jews", name: "היהודים באים", ic: "📜" },
  { id: "hazarot", name: "חזרות", ic: "🎬" },
  { id: "gur_oach", name: "גור ואוח", ic: "🎙️" },
  { id: "tv_abroad", name: "תכניות טלויזיה", ic: "📡" },
  { id: "mashups", name: "מאשאפים", ic: "🧩" },
  { id: "goalstar", name: "גולסטאר", ic: "⚽" }
];
export const catName = id => CATEGORIES.find(c => c.id === id)?.name || id || "";

const cache = new Map();
export async function fetchCategory(id) {
  if (cache.has(id)) return cache.get(id);
  const p = (async () => {
    let lastErr;
    for (const base of [API, API_FALLBACK]) {
      try {
        const r = await fetch(base + encodeURIComponent(id));
        if (!r.ok) throw new Error("HTTP " + r.status);
        const list = await r.json();
        if (!Array.isArray(list)) throw new Error("bad data");
        return list
          .filter(m => m && typeof m.urlPath === "string" && m.urlPath.startsWith(IMG_PREFIX))
          .map(m => ({
            id: String(m.id || m._id || ""),
            url: m.urlPath,
            thumb: typeof m.thumbPath === "string" && m.thumbPath.startsWith(IMG_PREFIX) ? m.thumbPath : m.urlPath,
            desc: String(m.description || m.name || "").trim(),
            category: String(m.category || id)
          }));
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  })();
  cache.set(id, p);
  p.catch(() => cache.delete(id));
  return p;
}

// כל התמונות של memeking נמצאות כאן (נאכף גם בחוקי Firestore)
export const IMG_PREFIX = "https://storage.googleapis.com/meme-king-storage/";

// ---------------------------------------------------------------------
//  פונט: Impact. בטלפונים אין Impact, ולכן Anton (כמעט זהה) כגיבוי,
//  ולעברית (שאין לה אותיות ב-Impact) - Heebo Black
// ---------------------------------------------------------------------
export const FONT_STACK = 'Impact, Anton, Heebo, "Arial Black", sans-serif';
let fontsReady = null;
export function loadFonts() {
  if (!fontsReady) {
    fontsReady = Promise.race([
      Promise.all([
        document.fonts.load('400 48px Anton', "AB"),
        document.fonts.load('900 48px Heebo', "אב")
      ]).catch(() => {}),
      new Promise(r => setTimeout(r, 3000))
    ]);
  }
  return fontsReady;
}

export function loadImage(src, cors = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed"));
    img.src = src;
  });
}

// כתובת דרך wsrv.nl - מוסיפה CORS כדי שאפשר יהיה לשמור את התמונה מה-canvas
export const corsUrl = url => "https://wsrv.nl/?url=" + encodeURIComponent(url.replace(/^https?:\/\//, "")) + "&q=95";

export const SIZE_MIN = 0.6, SIZE_MAX = 1.5;
export const clampSize = s => (typeof s === "number" && isFinite(s)) ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, s)) : 1;

const HEB = /[֐-׿]/;

function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (let w of words) {
    // מילה ארוכה מדי לשורה אחת - שוברים לפי אותיות
    while (ctx.measureText(w).width > maxW && w.length > 1) {
      if (cur) { lines.push(cur); cur = ""; }
      let i = w.length - 1;
      while (i > 1 && ctx.measureText(w.slice(0, i)).width > maxW) i--;
      lines.push(w.slice(0, i));
      w = w.slice(i);
    }
    const t = cur ? cur + " " + w : w;
    if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function fit(ctx, text, W, H, scale) {
  const maxW = W * 0.92, maxH = H * 0.3;
  const min = Math.max(8, W * 0.03);
  let size = Math.max(min, Math.round(Math.min(W * 0.105, H * 0.13) * scale));
  for (;;) {
    ctx.font = `900 ${size}px ${FONT_STACK}`;
    const lines = wrapLines(ctx, text, maxW);
    const lh = size * 1.1;
    if (lines.length * lh <= maxH || size <= min) return { size, lines, lh };
    size = Math.max(min, Math.floor(size * 0.92));
  }
}

// מיקום טקסט: {x, y} = מרכז הבלוק כשבר מרוחב/גובה התמונה (0..1). בלי מיקום = ברירת מחדל
export const validPos = p => p && typeof p.x === "number" && typeof p.y === "number" && isFinite(p.x) && isFinite(p.y);
const clamp = (v, a, b) => b < a ? (a + b) / 2 : Math.min(b, Math.max(a, v));
const round4 = v => Math.round(v * 10000) / 10000;
export const cleanPos = p => validPos(p) ? { x: round4(clamp(p.x, 0, 1)), y: round4(clamp(p.y, 0, 1)) } : null;

function drawBlock(ctx, text, W, H, scale, where, pos) {
  text = String(text || "").trim().toUpperCase();
  if (!text) return null;
  const { size, lines, lh } = fit(ctx, text, W, H, scale);
  ctx.font = `900 ${size}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#fff";
  const bh = lines.length * lh;
  const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + ctx.lineWidth;
  // ברירת מחדל - טקסט עליון: קצת מתחת לקצה העליון. טקסט תחתון: בחלק התחתון, קצת מעל הקצה
  const edge = H * 0.055;
  let cx = W / 2, cy = where === "top" ? edge + bh / 2 : H - edge - bh / 2;
  if (validPos(pos)) {
    // מיקום שנגרר - הבלוק נשאר כולו בתוך התמונה
    cx = clamp(pos.x * W, bw / 2, W - bw / 2);
    cy = clamp(pos.y * H, bh / 2, H - bh / 2);
  }
  lines.forEach((line, i) => {
    const y = cy - bh / 2 + lh * (i + 0.5);
    if ("direction" in ctx) ctx.direction = HEB.test(line) ? "rtl" : "ltr";
    ctx.strokeText(line, cx, y);
    ctx.fillText(line, cx, y);
  });
  return { cx, cy, w: bw, h: bh };
}

// ציור מם מלא על canvas. maxDim = הצלע הארוכה המקסימלית בפיקסלים
export function drawMeme(canvas, img, { top = "", bottom = "", size = 1, topPos = null, bottomPos = null } = {}, maxDim = 1200) {
  const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
  const k = Math.min(1, maxDim / Math.max(nw, nh));
  const W = Math.max(1, Math.round(nw * k)), H = Math.max(1, Math.round(nh * k));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const s = clampSize(size);
  // שומרים את מיקומי הבלוקים לגרירה
  canvas._boxes = {
    top: drawBlock(ctx, top, W, H, s, "top", topPos),
    bottom: drawBlock(ctx, bottom, W, H, s, "bottom", bottomPos)
  };
}

// ---------------------------------------------------------------------
//  גרירת טקסט על ה-canvas (עכבר ומגע).
//  onMove(key, pos) נקרא בזמן הגרירה, key = "top" / "bottom"
// ---------------------------------------------------------------------
export function enableDrag(canvas, { enabled = () => true, onMove, onEnd = () => {} }) {
  let drag = null;
  const pt = e => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
  };
  const hit = p => {
    const bx = canvas._boxes || {};
    const pad = canvas.width * 0.04;
    let best = null, bestD = Infinity;
    for (const key of ["top", "bottom"]) {
      const b = bx[key];
      if (!b) continue;
      if (Math.abs(p.x - b.cx) <= b.w / 2 + pad && Math.abs(p.y - b.cy) <= b.h / 2 + pad) {
        const d = Math.hypot(p.x - b.cx, p.y - b.cy);
        if (d < bestD) { bestD = d; best = key; }
      }
    }
    return best;
  };
  canvas.addEventListener("pointerdown", e => {
    if (!enabled() || (e.pointerType === "mouse" && e.button !== 0)) return;
    const p = pt(e), key = hit(p);
    if (!key) return;
    e.preventDefault();
    const b = canvas._boxes[key];
    drag = { key, id: e.pointerId, dx: p.x - b.cx, dy: p.y - b.cy };
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag) {
      if (e.pointerType === "mouse") canvas.style.cursor = enabled() && hit(pt(e)) ? "grab" : "";
      return;
    }
    if (e.pointerId !== drag.id) return;
    e.preventDefault();
    const p = pt(e);
    let x = (p.x - drag.dx) / canvas.width;
    if (Math.abs(x - 0.5) < 0.025) x = 0.5;   // הצמדה למרכז
    onMove(drag.key, cleanPos({ x, y: (p.y - drag.dy) / canvas.height }));
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const key = drag.key;
    drag = null;
    canvas.classList.remove("dragging");
    onEnd(key);
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
