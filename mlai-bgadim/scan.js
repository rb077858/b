/* זיהוי בגדים מתמונה – הכול רץ במכשיר עצמו, בלי שרת.
   מודל: OWLv2 (Google, רישיון Apache-2.0) דרך Transformers.js. מורד פעם אחת ונשמר בדפדפן. */
const CACHE_NAME = 'transformers-cache';
const NO_GPU_KEY = 'mlai-bgadim-nogpu';

// מה מחפשים בתמונה לכל סוג בגד (המודל מבין אנגלית)
const PROMPTS = {
  jeans: ['a pair of jeans', 'folded blue jeans'],
  shirts: ['a t-shirt', 'a shirt on a hanger', 'a folded shirt'],
  pjpants: ['pajama pants'],
  pjshirts: ['a pajama shirt'],
  hats: ['a black hat', 'a hat'],
  tzitzit: ['a white undershirt with tassels'],
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
let worker = null, seq = 0, ready = false;
const pending = {};
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./detect-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'nogpu') { try { localStorage.setItem(NO_GPU_KEY, '1'); } catch (x) { /* */ } return; }
    const p = pending[m.id]; if (!p) return;
    if (m.type === 'progress') { p.onProgress && p.onProgress(m.loaded / m.total, m.loaded, m.total); return; }
    delete pending[m.id];
    if (m.type === 'done') p.res(m); else p.rej(new Error(m.message));
  };
  worker.onerror = (e) => {
    Object.keys(pending).forEach((k) => { pending[k].rej(new Error(e.message || 'שגיאה בזיהוי')); delete pending[k]; });
  };
  return worker;
}
function call(msg, onProgress) {
  let noGpu = false;
  try { noGpu = !!localStorage.getItem(NO_GPU_KEY); } catch (e) { /* */ }
  return new Promise((res, rej) => {
    const id = ++seq; pending[id] = { res, rej, onProgress };
    getWorker().postMessage(Object.assign({ id, noGpu }, msg));
  });
}
export function loadModel(onProgress) {
  return call({ type: 'load' }, onProgress).then((m) => { ready = true; return m; });
}
function runDetect(url, labels, onProgress) {
  return call({ type: 'detect', url, labels }, onProgress).then((m) => m.result);
}

function iou(a, b) {
  const x1 = Math.max(a.xmin, b.xmin), y1 = Math.max(a.ymin, b.ymin);
  const x2 = Math.min(a.xmax, b.xmax), y2 = Math.min(a.ymax, b.ymax);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = (a.xmax - a.xmin) * (a.ymax - a.ymin) + (b.xmax - b.xmin) * (b.ymax - b.ymin) - i;
  return u > 0 ? i / u : 0;
}

/* מסננים: סף ביטחון, בלי מסגרות ענק, ובלי כפילויות (מסגרת אחת לכל פריט, עם הסוג הכי בטוח) */
function filterBoxes(raw, w, h, thr) {
  const kept = [];
  raw.slice().sort((a, b) => b.score - a.score).forEach((d) => {
    if (d.score < thr) return;
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
  api.items().filter((it) => it.on && PROMPTS[it.id]).forEach((it) => {
    PROMPTS[it.id].forEach((p) => { labels.push(p); owner[p] = it.id; });
  });
  return { labels, owner };
}

function boxesFor(ph) { return filterBoxes(ph.raw, ph.w, ph.h, S.thr); }
function keyOf(d) { return d.label + '|' + Math.round(d.box.xmin) + ',' + Math.round(d.box.ymin); }

function totals() {
  const t = {};
  S.photos.forEach((ph) => boxesFor(ph).forEach((d) => {
    if (ph.off.has(keyOf(d))) return;
    const id = ph.owner[d.label]; t[id] = (t[id] || 0) + 1;
  }));
  Object.keys(S.delta).forEach((id) => { t[id] = Math.max(0, (t[id] || 0) + S.delta[id]); });
  return t;
}

function renderReview() {
  const ph = S.photos[S.cur];
  const stage = $('scanStage');
  const boxes = boxesFor(ph);
  stage.style.aspectRatio = ph.w + ' / ' + ph.h;
  stage.style.width = 'min(100%, calc(56vh * ' + (ph.w / ph.h).toFixed(4) + '))';
  stage.innerHTML = '<img src="' + ph.url + '" alt="התמונה שצולמה">' + boxes.map((d) => {
    const it = api.find(ph.owner[d.label]);
    const b = d.box, k = keyOf(d);
    const st = 'left:' + (b.xmin / ph.w * 100) + '%;top:' + (b.ymin / ph.h * 100) + '%;width:' + ((b.xmax - b.xmin) / ph.w * 100) +
      '%;height:' + ((b.ymax - b.ymin) / ph.h * 100) + '%;--c:' + it.color;
    return '<button type="button" class="det' + (ph.off.has(k) ? ' off' : '') + '" data-k="' + api.esc(k) + '" style="' + st + '"><span>' + api.esc(it.name) + '</span></button>';
  }).join('');

  $('scanThumbs').innerHTML = S.photos.length > 1 ? S.photos.map((p, i) =>
    '<button type="button" data-i="' + i + '" class="' + (i === S.cur ? 'on' : '') + '"><img src="' + p.url + '" alt="תמונה ' + (i + 1) + '"></button>').join('') : '';

  const t = totals();
  const items = api.items().filter((it) => it.on && PROMPTS[it.id]);
  const any = items.some((it) => t[it.id]);
  $('scanSummary').innerHTML = items.filter((it) => t[it.id] || S.delta[it.id] !== undefined).map((it) =>
    '<div class="sum-row" style="--c:' + it.color + '"><div class="sum-ic">' + api.icon(it.icon) + '</div><b>' + api.esc(it.name) + '</b>' +
    '<div class="mini-step"><button type="button" data-d="1" data-id="' + it.id + '" aria-label="עוד אחד">+</button><span>' + (t[it.id] || 0) +
    '</span><button type="button" data-d="-1" data-id="' + it.id + '" aria-label="אחד פחות">−</button></div></div>').join('') ||
    '<p class="scan-empty">לא זיהינו בגדים בתמונה 🤔<br>נסו להעלות את הרגישות, לצלם מקרוב יותר, או לפרוס את הבגדים.</p>';
  $('scanApply').disabled = !any;
  $('scanCount').textContent = S.photos.length > 1 ? S.photos.length + ' תמונות' : '';
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
      S.photos.push({ url: sm.url, w: sm.w, h: sm.h, raw, owner, off: new Set() });
      S.cur = S.photos.length - 1;
    }
    view('review'); renderReview();
  } catch (e) {
    console.error(e);
    $('scanErr').textContent = (e && e.message) || 'משהו השתבש';
    view(S.photos.length ? 'review' : 'error');
    if (S.photos.length) renderReview();
  } finally {
    clearInterval(tick); S.busy = false;
  }
}

async function openScanner() {
  S.photos = []; S.cur = -1; S.delta = {};
  $('scanModal').showModal();
  if (ready || await isModelCached()) { view('pick'); loadModel().catch(() => {}); }
  else view('intro');
}

function startDownload() {
  view('download');
  const bar = $('dlBar'), txt = $('dlText');
  loadModel((p, l, t) => {
    bar.style.width = Math.round(p * 100) + '%';
    txt.textContent = Math.round(l / 1e6) + ' מתוך ' + Math.round(t / 1e6) + ' MB';
  }).then(() => view('pick')).catch((e) => {
    console.error(e);
    $('scanErr').textContent = 'ההורדה נכשלה. בדקו את החיבור לאינטרנט ונסו שוב.';
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
  $('scanStage').addEventListener('click', (e) => {
    const b = e.target.closest('.det'); if (!b) return;
    const ph = S.photos[S.cur], k = b.dataset.k;
    ph.off.has(k) ? ph.off.delete(k) : ph.off.add(k);
    renderReview();
  });
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
