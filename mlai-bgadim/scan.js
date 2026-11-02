/* זיהוי בגדים מתמונה – הכול רץ במכשיר עצמו, בלי שרת.
   מודל: OWLv2 (Google, רישיון Apache-2.0) דרך Transformers.js. מורד פעם אחת ונשמר בדפדפן. */
const CACHE_NAME = 'transformers-cache';

// מה מחפשים בתמונה לכל סוג בגד (המודל מבין אנגלית)
const PROMPTS = {
  jeans: ['a pair of jeans', 'folded blue jeans'],
  shirts: ['a t-shirt', 'a shirt on a hanger', 'a folded shirt'],
  pjpants: ['pajama pants'],
  pjshirts: ['a pajama shirt'],
  hats: ['a black hat', 'a black fedora hat', 'a felt hat with a brim', 'a round hat box', 'a cap'],
  tzitzit: ['tzitzit', 'a tallit katan', 'a white poncho with black stripes'],
  dressshirts: ['a white button-up dress shirt'],
  dresspants: ['dress trousers'],
  suits: ['a suit jacket'],
  socks: ['a pair of socks', 'rolled socks'],
  underwear: ['underwear', 'boxer shorts'],
  tanks: ['a tank top'],
  sweaters: ['a sweater'],
  coats: ['a coat', 'a jacket'],
  kippot: ['a kippah skullcap'],
  shoes: ['a pair of shoes'],
  towels: ['a folded towel']
};

const $ = (id) => document.getElementById(id);

export async function isModelCached() {
  try {
    if (!('caches' in window)) return false;
    const c = await caches.open(CACHE_NAME);
    const keys = await c.keys();
    return keys.some((r) => r.url.includes('owlv2-base-patch16-ensemble') && r.url.includes('model_quantized.onnx'));
  } catch (e) { return false; }
}

/* ---------- העובד ברקע ---------- */
const SAFE_KEY = 'mlai-bgadim-safe';
let worker = null, seq = 0, ready = false, hello = null;
const pending = {};
function isSafe() { try { return !!localStorage.getItem(SAFE_KEY); } catch (e) { return false; } }
function setSafe() { try { localStorage.setItem(SAFE_KEY, '1'); } catch (e) { /* */ } }

function failAll(msg) {
  Object.keys(pending).forEach((k) => { pending[k].rej(new Error(msg)); delete pending[k]; });
}
function killWorker() {
  if (worker) { try { worker.terminate(); } catch (e) { /* */ } }
  worker = null; ready = false; hello = null;
}
function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./detect-worker.js?v=' + (new URL(import.meta.url).searchParams.get('v') || '0'), import.meta.url), { type: 'module' });
  } catch (e) {
    worker = null;
    throw new Error('הדפדפן הזה לא תומך בזיהוי. נסו לעדכן אותו, או לפתוח ב־Chrome או ב־Safari.');
  }
  let gotHello;
  hello = new Promise((res) => { gotHello = res; });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'hello') { gotHello(); return; }
    if (m.type === 'fatal') { failAll(m.message); return; }
    const p = pending[m.id]; if (!p) return;
    if (m.type === 'progress') { p.touch(); if (m.total) p.onProgress && p.onProgress(m.loaded / m.total, m.loaded, m.total); return; }
    p.done();
    if (m.type === 'done') p.res(m); else p.rej(new Error(m.message));
  };
  worker.onerror = (e) => { e.preventDefault && e.preventDefault(); failAll('הזיהוי נעצר בגלל שגיאה (' + (e.message || 'לא ידוע') + ')'); };
  return worker;
}

/* שולחים משימה לעובד. אם אין שום סימן חיים בזמן שנקבע – עוצרים ומדווחים במקום להיתקע. */
function call(msg, onProgress, idleMs) {
  return new Promise((res, rej) => {
    let w;
    try { w = getWorker(); } catch (e) { rej(e); return; }
    const id = ++seq;
    let timer = null;
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        delete pending[id];
        killWorker();
        rej(Object.assign(new Error('timeout'), { timeout: true }));
      }, idleMs);
    };
    pending[id] = { res, rej, onProgress, touch, done: () => clearTimeout(timer) };
    touch();
    w.postMessage(Object.assign({ id, safe: isSafe() }, msg));
  });
}

let loadPromise = null;
export function loadModel(onProgress, onRetry) {
  if (ready) return Promise.resolve();
  if (loadPromise) return loadPromise;
  const attempt = () => call({ type: 'load' }, onProgress, 120000);
  loadPromise = attempt().catch((e) => {
    // ניסיון שני במצב בטוח: ליבה אחת (מתאים יותר לטלפונים מסוימים)
    if (isSafe()) throw e;
    console.warn('טעינת המודל נכשלה, מנסים במצב בטוח', e);
    setSafe(); killWorker();
    onRetry && onRetry();
    return attempt();
  }).then((m) => {
    ready = true; loadPromise = null;
    console.info('זיהוי מוכן. ליבות:', m.threads, 'מבודד:', m.isolated);
    return m;
  }, (e) => { loadPromise = null; throw e; });
  return loadPromise;
}
async function runDetect(url, labels) {
  try {
    return (await call({ type: 'detect', url, labels }, null, 240000)).result;
  } catch (e) {
    if (isSafe()) throw e;
    setSafe(); killWorker();
    await loadModel();
    return (await call({ type: 'detect', url, labels }, null, 300000)).result;
  }
}
function friendly(e) {
  if (e && e.timeout) return 'הזיהוי לא הגיב. ייתכן שאין מספיק זיכרון פנוי בטלפון. נסו לסגור אפליקציות אחרות ולנסות שוב.';
  return (e && e.message) || 'משהו השתבש';
}

function iou(a, b) {
  const x1 = Math.max(a.xmin, b.xmin), y1 = Math.max(a.ymin, b.ymin);
  const x2 = Math.min(a.xmax, b.xmax), y2 = Math.min(a.ymax, b.ymax);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = (a.xmax - a.xmin) * (a.ymax - a.ymin) + (b.xmax - b.xmin) * (b.ymax - b.ymin) - i;
  return u > 0 ? i / u : 0;
}

// כובעים וציציות מזוהים תמיד, גם כשהם כבויים ברשימה (ונדלקים אם נמצאו)
const ALWAYS = ['hats', 'tzitzit'];
const detectable = (it) => !!PROMPTS[it.id] && (it.on || ALWAYS.includes(it.id));

// סוגים שהמודל פחות "מכיר" מקבלים חיזוק, כדי שיתגברו על "חולצה" כשמדובר באותו פריט
const BOOST = { tzitzit: 1.15, hats: 1.3, kippot: 1.3 };

/* מסננים: סף ביטחון, בלי מסגרות ענק, ובלי כפילויות (מסגרת אחת לכל פריט, עם הסוג הכי בטוח) */
function filterBoxes(raw, w, h, thr, owner) {
  const kept = [];
  raw.map((d) => Object.assign({}, d, { adj: d.score * (BOOST[owner[d.label]] || 1) }))
    .sort((a, b) => b.adj - a.adj).forEach((d) => {
    if (d.adj < thr) return;
    const bx = d.box;
    if (((bx.xmax - bx.xmin) * (bx.ymax - bx.ymin)) / (w * h) > 0.6) return;
    if (kept.some((k) => iou(k.box, bx) > 0.4)) return;
    kept.push(d);
  });
  return kept;
}

function shrinkImage(file, max) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => b ? res({ url: URL.createObjectURL(b), w: c.width, h: c.height }) : rej(new Error('blob')), 'image/jpeg', 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('לא הצלחנו לקרוא את התמונה')); };
    img.src = url;
  });
}

/* ---------- ממשק הסריקה ---------- */
let api = null;
const S = { photos: [], cur: -1, thr: 0.2, delta: {}, mode: 'replace', busy: false };

function view(name) {
  document.querySelectorAll('#scanModal [data-view]').forEach((el) => { el.hidden = el.dataset.view !== name; });
}

function labelMap() {
  // רק סוגים דלוקים שיש להם תיאור לזיהוי
  const labels = [], owner = {};
  api.items().filter(detectable).forEach((it) => {
    PROMPTS[it.id].forEach((p) => { labels.push(p); owner[p] = it.id; });
  });
  return { labels, owner };
}

function boxesFor(ph) { return filterBoxes(ph.raw, ph.w, ph.h, S.thr, ph.owner); }
function keyOf(d) { return d.label + '|' + Math.round(d.box.xmin) + ',' + Math.round(d.box.ymin); }

function totals() {
  const t = {};
  S.photos.forEach((ph) => {
    boxesFor(ph).forEach((d) => {
      const k = keyOf(d);
      if (ph.off.has(k)) return;
      const id = ph.over[k] || ph.owner[d.label]; t[id] = (t[id] || 0) + 1;
    });
    ph.manual.forEach((mb) => { t[mb.id] = (t[mb.id] || 0) + 1; });
  });
  Object.keys(S.delta).forEach((id) => { t[id] = Math.max(0, (t[id] || 0) + S.delta[id]); });
  return t;
}

function renderReview() {
  const ph = S.photos[S.cur];
  const stage = $('scanStage');
  const boxes = boxesFor(ph);
  stage.style.aspectRatio = ph.w + ' / ' + ph.h;
  stage.style.width = 'min(100%, calc(56vh * ' + (ph.w / ph.h).toFixed(4) + '))';
  const boxHtml = (b, it, attrs, cls) => {
    const st = 'left:' + (b.xmin / ph.w * 100) + '%;top:' + (b.ymin / ph.h * 100) + '%;width:' + ((b.xmax - b.xmin) / ph.w * 100) +
      '%;height:' + ((b.ymax - b.ymin) / ph.h * 100) + '%;--c:' + it.color;
    return '<button type="button" class="det' + cls + '" ' + attrs + ' style="' + st + '"><span>' + api.esc(it.name) + '</span></button>';
  };
  stage.innerHTML = '<img src="' + ph.url + '" alt="התמונה שצולמה">' + boxes.map((d) => {
    const k = keyOf(d), it = api.find(ph.over[k] || ph.owner[d.label]);
    return boxHtml(d.box, it, 'data-k="' + api.esc(k) + '"', (ph.off.has(k) ? ' off' : '') + (ph.over[k] ? ' fixed' : ''));
  }).join('') + ph.manual.map((mb, i) => boxHtml(mb.box, api.find(mb.id), 'data-m="' + i + '"', ' fixed manual')).join('');

  $('scanThumbs').innerHTML = S.photos.length > 1 ? S.photos.map((p, i) =>
    '<button type="button" data-i="' + i + '" class="' + (i === S.cur ? 'on' : '') + '"><img src="' + p.url + '" alt="תמונה ' + (i + 1) + '"></button>').join('') : '';

  const t = totals();
  const items = api.items().filter((it) => !!PROMPTS[it.id] && (detectable(it) || t[it.id] || S.delta[it.id] !== undefined));
  const any = items.some((it) => t[it.id]);
  $('scanSummary').innerHTML = items.filter((it) => t[it.id] || S.delta[it.id] !== undefined).map((it) =>
    '<div class="sum-row" style="--c:' + it.color + '"><div class="sum-ic">' + api.icon(it.icon) + '</div><b>' + api.esc(it.name) + '</b>' +
    '<div class="mini-step"><button type="button" data-d="1" data-id="' + it.id + '" aria-label="עוד אחד">+</button><span>' + (t[it.id] || 0) +
    '</span><button type="button" data-d="-1" data-id="' + it.id + '" aria-label="אחד פחות">−</button></div></div>').join('') ||
    '<p class="scan-empty">לא זיהינו בגדים בתמונה 🤔<br>נסו להעלות את הרגישות, לצלם מקרוב יותר, או לפרוס את הבגדים.</p>';
  $('scanApply').disabled = !any;
  $('scanCount').textContent = S.photos.length > 1 ? S.photos.length + ' תמונות' : '';
}

/* ---------- תיקון בלחיצה: מה זה? ---------- */
let sheetTarget = null;
function openSheet(target, title) {
  sheetTarget = target;
  const ph = S.photos[S.cur];
  let cur = null;
  if (target.k) cur = ph.off.has(target.k) ? 'off' : (ph.over[target.k] || ph.owner[target.label]);
  if (target.m !== undefined) cur = ph.manual[target.m].id;
  $('fixTitle').textContent = title;
  $('fixOpts').innerHTML = api.items().filter((it) => !!PROMPTS[it.id]).map((it) =>
    '<button type="button" data-cat="' + it.id + '" style="--c:' + it.color + '" class="' + (cur === it.id ? 'on' : '') + '">' +
    api.icon(it.icon) + '<span>' + api.esc(it.name) + '</span></button>').join('');
  $('fixDel').hidden = target.add;
  $('fixDel').textContent = target.m !== undefined ? '🗑 למחוק' : (cur === 'off' ? '↩ להחזיר' : '🚫 זה לא בגד');
  $('fixSheet').hidden = false;
}
function closeSheet() { $('fixSheet').hidden = true; sheetTarget = null; }
function onStageTap(e) {
  const ph = S.photos[S.cur]; if (!ph) return;
  const b = e.target.closest('.det');
  if (b && b.dataset.k !== undefined) {
    const d = boxesFor(ph).find((x) => keyOf(x) === b.dataset.k);
    openSheet({ k: b.dataset.k, label: d && d.label }, 'מה זה?');
    return;
  }
  if (b && b.dataset.m !== undefined) { openSheet({ m: +b.dataset.m }, 'מה זה?'); return; }
  // לחיצה על מקום ריק: מוסיפים פריט שהזיהוי פספס
  const r = $('scanStage').getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * ph.w, y = (e.clientY - r.top) / r.height * ph.h;
  const half = Math.min(ph.w, ph.h) * 0.11;
  openSheet({ add: true, box: { xmin: Math.max(0, x - half), ymin: Math.max(0, y - half), xmax: Math.min(ph.w, x + half), ymax: Math.min(ph.h, y + half) } }, 'מה פספסנו כאן?');
}
function onSheet(e) {
  const ph = S.photos[S.cur], t = sheetTarget;
  if (e.target === $('fixSheet') || e.target.closest('#fixCancel')) { closeSheet(); return; }
  if (!t) return;
  const opt = e.target.closest('[data-cat]');
  if (opt) {
    const id = opt.dataset.cat;
    if (t.add) ph.manual.push({ box: t.box, id });
    else if (t.m !== undefined) ph.manual[t.m].id = id;
    else { ph.off.delete(t.k); if (id === ph.owner[t.label]) delete ph.over[t.k]; else ph.over[t.k] = id; }
  } else if (e.target.closest('#fixDel')) {
    if (t.m !== undefined) ph.manual.splice(t.m, 1);
    else if (ph.off.has(t.k)) ph.off.delete(t.k);
    else ph.off.add(t.k);
  } else return;
  closeSheet(); renderReview();
}

async function addPhotos(files) {
  if (!files || !files.length || S.busy) return;
  S.busy = true;
  view('busy');
  const timer = $('scanTimer');
  const t0 = Date.now();
  const tick = setInterval(() => { timer.textContent = Math.round((Date.now() - t0) / 1000) + ' שניות'; }, 500);
  try {
    $('scanBusyText').textContent = 'מכינים את מודל הזיהוי...';
    await loadModel((p) => { $('scanBusyText').textContent = 'טוענים את המודל... ' + Math.round(p * 100) + '%'; });
    $('scanBusyText').textContent = 'מזהים בגדים...';
    const { labels, owner } = labelMap();
    if (!labels.length) throw new Error('אין סוגי בגדים דלוקים שאפשר לזהות');
    for (let i = 0; i < files.length; i++) {
      const sm = await shrinkImage(files[i], 1280);
      $('scanBusyImg').src = sm.url;
      $('scanBusyText').textContent = files.length > 1 ? 'מזהים בגדים... (' + (i + 1) + '/' + files.length + ')' : 'מזהים בגדים...';
      const raw = await runDetect(sm.url, labels);
      S.photos.push({ url: sm.url, w: sm.w, h: sm.h, raw, owner, off: new Set(), over: {}, manual: [] });
      S.cur = S.photos.length - 1;
    }
    view('review'); renderReview();
  } catch (e) {
    console.error(e);
    $('scanErr').textContent = friendly(e);
    view(S.photos.length ? 'review' : 'error');
    if (S.photos.length) renderReview();
  } finally {
    clearInterval(tick); S.busy = false;
  }
}

async function openScanner() {
  S.photos = []; S.cur = -1; S.delta = {};
  $('scanModal').showModal();
  if (ready || await isModelCached()) { view('pick'); loadModel().catch((e) => console.warn(e)); }
  else view('intro');
}

function startDownload() {
  view('download');
  const bar = $('dlBar'), txt = $('dlText'), track = bar.parentNode;
  track.classList.add('indet');
  txt.textContent = 'מתחילים...';
  loadModel((p, l, t) => {
    track.classList.remove('indet');
    bar.style.width = Math.round(p * 100) + '%';
    txt.textContent = Math.round(l / 1e6) + ' מתוך ' + Math.round(t / 1e6) + ' MB';
    if (p >= 1) txt.textContent = 'ההורדה הסתיימה, מכינים את המודל...';
  }, () => {
    track.classList.add('indet');
    txt.textContent = 'מנסים שוב בדרך אחרת...';
  }).then(() => view('pick')).catch((e) => {
    console.error(e);
    $('scanErr').textContent = e && e.timeout ? 'ההורדה לא התקדמה. בדקו את החיבור לאינטרנט ושיש מספיק מקום פנוי בטלפון, ונסו שוב.' : friendly(e);
    view('error');
  });
}

function apply() {
  const t = totals();
  api.applyCounts(t, S.mode);
  $('scanModal').close();
}

export function setup(appApi) {
  api = appApi;
  const m = $('scanModal');
  $('dlBtn').addEventListener('click', startDownload);
  $('retryBtn').addEventListener('click', () => { ready ? view('pick') : view('intro'); });
  ['camInput', 'galInput', 'moreInput'].forEach((id) => {
    $(id).addEventListener('change', (e) => { const f = Array.from(e.target.files || []); e.target.value = ''; addPhotos(f); });
  });
  $('scanStage').addEventListener('click', onStageTap);
  $('fixSheet').addEventListener('click', onSheet);
  $('scanThumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { S.cur = +b.dataset.i; renderReview(); } });
  $('scanSummary').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    const id = b.dataset.id, cur = totals()[id] || 0, d = +b.dataset.d;
    if (cur + d < 0) return;
    S.delta[id] = (S.delta[id] || 0) + d;
    renderReview();
  });
  $('scanThr').addEventListener('input', (e) => { S.thr = 0.36 - (+e.target.value) / 100; renderReview(); });
  m.querySelectorAll('input[name="scanMode"]').forEach((r) => r.addEventListener('change', () => { S.mode = r.value; }));
  $('scanApply').addEventListener('click', apply);
  return { open: openScanner };
}
