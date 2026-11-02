/* דף · עורך דף גמרא
 * Layout: three stacked layers (Gemara, right commentary, left commentary) with float "spacers"
 * that carve the classic Vilna shape. Heights are solved iteratively so the text keeps the shape
 * after every edit.
 * Markup in the text:  **bold**   {{big opening word}}   ^small mark^   "# " at line start = heading
 */
(() => {
'use strict';

/* ------------------------------------------------------------------ constants */
const LS_KEY = 'daf-editor-v1';
const LS_HINT = 'daf-editor-hint-closed';
const PW = 900, PAD = 26, MW = 84, MGAP = 12;
const CORE_W = PW - PAD * 2 - MW * 2 - MGAP * 2;  // 656
const INF = 100000;
const DEF_SET = {
  gemSize: 19, commSize: 14, margSize: 10, lineH: 1.1, gemWidth: 41, openLines: 4,
  tone: 'white', gemFont: 'frank', commFont: 'rashi', theme: 'auto', margFit: true
};
const FONT_STACK = {
  gem: { frank: "'Frank Ruhl Libre',serif", david: "'David Libre',serif", custom: "'DafCustomGem','Frank Ruhl Libre',serif" },
  comm: { rashi: "'Noto Rashi Hebrew',serif", frank: "'Frank Ruhl Libre',serif", david: "'David Libre',serif", custom: "'DafCustomComm','Noto Rashi Hebrew',serif" }
};
const FIELD_NAMES = { gemara: 'גמרא', rashi: 'רש"י', tosafot: 'תוספות', notes: 'הערות בתחתית הדף' };

/* ------------------------------------------------------------------ state */
const clone = o => JSON.parse(JSON.stringify(o));
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function normPage(p) {
  p.id = p.id || uid();
  p.amud = p.amud === 'b' ? 'b' : 'a';
  for (const k of ['masechet', 'perek', 'perekNum', 'daf', 'gemara', 'rashi', 'tosafot', 'notes']) if (typeof p[k] !== 'string') p[k] = '';
  if (typeof p.lblOuter !== 'string') p.lblOuter = 'עין משפט\nנר מצוה';
  if (typeof p.lblInner !== 'string') p.lblInner = 'מסורת הש"ס';
  for (const side of ['inner', 'outer']) {
    if (!Array.isArray(p[side]) || !p[side].length) p[side] = [{ title: '', text: '' }];
    p[side] = p[side].map(s => ({ title: String(s.title || ''), text: String(s.text || '') }));
  }
  return p;
}
function defaults() {
  return { pages: clone(window.DAF_DEFAULT.pages).map(normPage), settings: { ...DEF_SET }, cur: 0 };
}
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.pages) && d.pages.length) {
        return { pages: d.pages.map(normPage), settings: { ...DEF_SET, ...(d.settings || {}) }, cur: Math.min(d.cur | 0, d.pages.length - 1) };
      }
    }
  } catch (e) { /* storage unavailable */ }
  return defaults();
}
let S = load();
let zoom = 1;                // multiplier over "fit"
let wraps = [];              // per page DOM refs
let saveTimer = 0;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ pages: S.pages, settings: S.settings, cur: S.cur })); } catch (e) { }
  }, 250);
}

/* ------------------------------------------------------------------ undo / redo */
const hist = { stack: [], i: -1, key: null, t: 0 };
function snap() { return JSON.stringify({ pages: S.pages, settings: S.settings }); }
function pushHist(key) {
  const now = Date.now();
  const s = snap();
  if (hist.i >= 0 && hist.stack[hist.i] === s) return;
  if (key && key === hist.key && now - hist.t < 1500 && hist.i > 0) {
    hist.stack[hist.i] = s;   // coalesce typing
  } else {
    hist.stack.length = hist.i + 1;
    hist.stack.push(s);
    if (hist.stack.length > 150) hist.stack.shift();
    hist.i = hist.stack.length - 1;
  }
  hist.key = key; hist.t = now;
  updUndo();
}
function restore(s) {
  const d = JSON.parse(s);
  S.pages = d.pages; S.settings = d.settings;
  S.cur = Math.min(S.cur, S.pages.length - 1);
  closeQuick(true); closeSheet(true);
  renderAll(); save();
}
function undo() { if (hist.i > 0) { hist.i--; hist.key = null; restore(hist.stack[hist.i]); toast('בוטל'); } updUndo(); }
function redo() { if (hist.i < hist.stack.length - 1) { hist.i++; hist.key = null; restore(hist.stack[hist.i]); } updUndo(); }
function updUndo() { $('#undoBtn').disabled = hist.i <= 0; $('#redoBtn').disabled = hist.i >= hist.stack.length - 1; }
function commit(key) { pushHist(key); save(); }

/* ------------------------------------------------------------------ fields */
function getField(p, f) {
  if (f.includes(':')) { const [side, k] = f.split(':'); return (p[side][+k] || {}).text || ''; }
  return p[f] || '';
}
function setField(p, f, v) {
  if (f.includes(':')) { const [side, k] = f.split(':'); p[side][+k].text = v; }
  else p[f] = v;
}
function fieldLabel(p, f) {
  if (f.includes(':')) {
    const [side, k] = f.split(':'); const sec = p[side][+k];
    if (sec && sec.title) return sec.title;
    return side === 'outer' ? 'עין משפט נר מצוה' : 'מסורת הש"ס';
  }
  return FIELD_NAMES[f] || f;
}

/* ------------------------------------------------------------------ parser */
// Returns [{h:bool, toks:[{t, cls, s, e, gap, span}]}]   s/e = offsets of the word in the source string
function parse(src) {
  const out = []; let off = 0;
  for (const line of src.split('\n')) {
    let body = line, o = off, h = false;
    const m = /^#\s*/.exec(line);
    if (m) { h = true; body = line.slice(m[0].length); o += m[0].length; }
    const toks = tokenize(body, o);
    if (toks.length) out.push({ h, toks });
    off += line.length + 1;
  }
  return out;
}
function tokenize(str, o) {
  const re = /\*\*([\s\S]+?)\*\*|\{\{([\s\S]+?)\}\}|\^([^\^\s][^\^]*?)\^|(\S+?)(?=\s|\*\*|\{\{|\^|$)/g;
  const toks = []; let m;
  while ((m = re.exec(str))) {
    const gap = m.index === 0 || /\s/.test(str[m.index - 1]);
    if (m[4] !== undefined) { toks.push({ t: m[4], cls: '', s: o + m.index, e: o + m.index + m[4].length, gap }); continue; }
    const kind = m[1] !== undefined ? 'b' : m[2] !== undefined ? 'big' : 'sup';
    const inner = m[1] ?? m[2] ?? m[3];
    const ml = kind === 'sup' ? 1 : 2;
    const is = o + m.index + ml;
    const span = { kind, s: o + m.index, e: o + m.index + m[0].length, is, ie: is + inner.length };
    const wre = /\S+/g; let w, first = true;
    while ((w = wre.exec(inner))) {
      toks.push({ t: w[0], cls: kind, s: is + w.index, e: is + w.index + w[0].length, gap: first ? gap : true, span });
      first = false;
    }
  }
  return toks;
}
function allTokens(src) { return parse(src).flatMap(p => p.toks); }

function renderText(src, f) {
  const paras = parse(src);
  if (!paras.length) return `<p><span class="w ph" data-f="${f}" data-s="0" data-e="0">(ריק · לחצו כאן כדי לכתוב)</span></p>`;
  return paras.map(p => `<p${p.h ? ' class="h"' : ''}>` + p.toks.map((t, k) =>
    (k && t.gap ? ' ' : '') + `<span class="w${t.cls ? ' ' + t.cls : ''}" data-f="${f}" data-s="${t.s}" data-e="${t.e}">${esc(t.t)}</span>`
  ).join('') + '</p>').join('');
}

/* ------------------------------------------------------------------ build pages */
function pageHTML(p) {
  const rashiRight = p.amud !== 'b';
  const R = rashiRight ? 'rashi' : 'tosafot', L = rashiRight ? 'tosafot' : 'rashi';
  const secs = (arr, side) => arr.map((s, k) =>
    `<section class="msec${k === 0 ? ' first' : ''}">${s.title ? `<h4 data-sec="${side}:${k}">${esc(s.title)}</h4>` : ''}` +
    `<div class="mtext">${renderText(s.text, side + ':' + k)}</div></section>`).join('');
  return `
  <header class="daf-head">
    <div class="lbl outer" data-hdr>${esc(p.lblOuter).replace(/\n/g, '<br>')}</div>
    <div class="dafnum" data-hdr>${esc(p.daf)}</div>
    <div class="title" data-hdr><span>${esc(p.perek)}</span><span>${esc(p.perekNum)}</span><span>${esc(p.masechet)}</span></div>
    <div class="lbl inner" data-hdr>${esc(p.lblInner).replace(/\n/g, '<br>')}</div>
  </header>
  <div class="daf-body">
    <aside class="margin inner">${secs(p.inner, 'inner')}</aside>
    <div class="core" style="width:${CORE_W}px">
      <div class="layer L-gem" style="width:${CORE_W}px"><div class="sp sp-top"></div><div class="sp sp-r"></div><div class="sp sp-l"></div>${renderText(p.gemara, 'gemara')}</div>
      <div class="layer L-right" style="width:${CORE_W}px"><div class="sp a"></div><div class="sp b"></div><div class="sp c"></div>${renderText(p[R], R)}</div>
      <div class="layer L-left" style="width:${CORE_W}px"><div class="sp a"></div><div class="sp b"></div><div class="sp c"></div>${renderText(p[L], L)}</div>
    </div>
    <aside class="margin outer">${secs(p.outer, 'outer')}</aside>
  </div>
  <footer class="daf-notes${p.notes.trim() ? '' : ' empty'}">${p.notes.trim() ? renderText(p.notes, 'notes') : ''}</footer>`;
}

function applySettings(d) {
  const st = S.settings;
  const set = (k, v) => d.style.setProperty(k, v);
  set('--pw', PW + 'px'); set('--mw', MW + 'px'); set('--mgap', MGAP + 'px');
  set('--gem-size', st.gemSize + 'px'); set('--gem-lh', (st.gemSize * st.lineH * 0.98).toFixed(2) + 'px');
  set('--comm-size', st.commSize + 'px'); set('--comm-lh', (st.commSize * st.lineH).toFixed(2) + 'px');
  set('--marg-size', st.margSize + 'px'); set('--marg-lh', (st.margSize * st.lineH * 1.06).toFixed(2) + 'px');
  set('--gem-font', FONT_STACK.gem[st.gemFont] || FONT_STACK.gem.frank);
  set('--sq-font', FONT_STACK.gem[st.gemFont] || FONT_STACK.gem.frank);
  set('--comm-font', FONT_STACK.comm[st.commFont] || FONT_STACK.comm.rashi);
  d.classList.remove('tone-parchment', 'tone-ivory');
  if (st.tone !== 'white') d.classList.add('tone-' + st.tone);
}

function buildPage(i) {
  const p = S.pages[i];
  let w = wraps[i];
  if (!w) {
    const el = document.createElement('div');
    el.className = 'daf-wrap';
    el.innerHTML = `<div class="cap"></div><div class="daf editing"></div>`;
    w = wraps[i] = { el, daf: el.querySelector('.daf'), cap: el.querySelector('.cap') };
  }
  w.daf.dataset.amud = p.amud;
  w.daf.dataset.idx = i;
  w.cap.textContent = `${p.masechet} ${p.daf}`.trim();
  applySettings(w.daf);
  w.daf.innerHTML = pageHTML(p);
  const q = s => w.daf.querySelector(s);
  w.gem = q('.L-gem'); w.R = q('.L-right'); w.L = q('.L-left'); w.core = q('.core');
  w.sp = {
    top: q('.L-gem .sp-top'), gr: q('.L-gem .sp-r'), gl: q('.L-gem .sp-l'),
    ra: q('.L-right .a'), rb: q('.L-right .b'), rc: q('.L-right .c'),
    la: q('.L-left .a'), lb: q('.L-left .b'), lc: q('.L-left .c')
  };
  w.el.classList.toggle('current', i === S.cur && S.pages.length > 1);
  return w;
}

/* ------------------------------------------------------------------ layout engine */
function bottomOf(layer) {
  const ps = layer.querySelectorAll(':scope > p');
  if (!ps.length) return 0;
  const p = ps[ps.length - 1];
  return p.offsetTop + p.offsetHeight;
}
function layoutPage(i) {
  const w = wraps[i]; if (!w) return;
  const st = S.settings, sp = w.sp;
  const W = CORE_W;
  const gemW = Math.round(W * st.gemWidth / 100);
  const gapS = 13;                                   // gap gemara <-> narrow commentary
  const side = Math.max(40, Math.floor((W - gemW) / 2 - gapS));
  const halfGap = 9;
  const commLH = st.commSize * st.lineH;
  const topH = Math.round(st.openLines * commLH);
  const gemTop = topH > 0 ? topH + 5 : 0;
  const gapB = 7;
  const H = (el, h) => { el.style.height = Math.max(0, Math.round(h)) + 'px'; };
  const Wd = (el, x) => { el.style.width = Math.round(x) + 'px'; };

  Wd(sp.ra, W / 2 + halfGap / 2); H(sp.ra, topH);
  Wd(sp.la, W / 2 + halfGap / 2); H(sp.la, topH);
  Wd(sp.rb, W - side); Wd(sp.lb, W - side);
  Wd(sp.rc, W / 2 + halfGap / 2); Wd(sp.lc, W / 2 + halfGap / 2);
  H(sp.top, gemTop);
  Wd(sp.gr, side + gapS); Wd(sp.gl, side + gapS);

  let hR = INF, hL = INF, gemEnd = 0, rEnd = 0, lEnd = 0;
  const pass = () => {
    H(sp.gr, hR); H(sp.gl, hL);
    gemEnd = Math.max(bottomOf(w.gem), gemTop);
    const base = gemEnd + gapB;
    const mid = Math.max(0, base - topH);
    H(sp.rb, mid); H(sp.lb, mid); H(sp.rc, INF); H(sp.lc, INF);
    rEnd = bottomOf(w.R); lEnd = bottomOf(w.L);
    if (rEnd > base || lEnd > base) {
      if (rEnd >= lEnd) { H(sp.rc, Math.max(0, lEnd - base)); rEnd = bottomOf(w.R); }
      else { H(sp.lc, Math.max(0, rEnd - base)); lEnd = bottomOf(w.L); }
    }
  };
  for (let it = 0; it < 10; it++) {
    pass();
    // when a commentary column ends beside the gemara, let the gemara widen into its place
    const nR = (rEnd + gapB < gemEnd) ? Math.max(0, rEnd + gapB - gemTop) : (hR !== INF ? hR : INF);
    const nL = (lEnd + gapB < gemEnd) ? Math.max(0, lEnd + gapB - gemTop) : (hL !== INF ? hL : INF);
    if (Math.abs(nR - hR) < 1 && Math.abs(nL - hL) < 1) break;
    hR = nR; hL = nL;
  }
  pass();
  // safety: never let the widened gemara run into commentary text
  const bad = (hR !== INF && rEnd > gemTop + hR + 1 && gemEnd > gemTop + hR) ||
              (hL !== INF && lEnd > gemTop + hL + 1 && gemEnd > gemTop + hL);
  if (bad) { hR = INF; hL = INF; pass(); }
  const coreH = Math.ceil(Math.max(gemEnd, rEnd, lEnd));
  w.core.style.height = coreH + 'px';
  fitMargins(w, coreH);
}
// shrink the side columns (only if needed) so they end together with the main text, like the printed page
function fitMargins(w, coreH) {
  const st = S.settings;
  for (const a of w.daf.querySelectorAll('.margin')) {
    a.style.removeProperty('--marg-size'); a.style.removeProperty('--marg-lh');
    if (!st.margFit) continue;
    const setSz = sz => { a.style.setProperty('--marg-size', sz + 'px'); a.style.setProperty('--marg-lh', (sz * st.lineH * 1.06).toFixed(2) + 'px'); };
    if (a.offsetHeight <= coreH + 2) continue;
    let lo = Math.min(7, st.margSize), hi = st.margSize;
    setSz(lo);
    if (a.offsetHeight > coreH + 2) continue;           // can't fit even at the minimum: keep it small
    for (let k = 0; k < 7; k++) { const mid = (lo + hi) / 2; setSz(mid); if (a.offsetHeight <= coreH + 2) lo = mid; else hi = mid; }
    setSz(Math.floor(lo * 4) / 4);
  }
}

/* ------------------------------------------------------------------ fit / zoom */
function fit() {
  const stage = $('#stage');
  const cs = getComputedStyle(stage);
  const avail = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const n = wraps.length;
  let s = Math.min(1, avail / PW), spread = false;
  if (n >= 2) {
    const s2 = Math.min(1, (avail - 28) / (2 * PW));
    if (s2 >= 0.6) { s = s2; spread = true; }
  }
  s *= zoom;
  $('#pages').style.maxWidth = spread && zoom <= 1 ? (PW * s * 2 + 28 + 4) + 'px' : 'none';
  for (const w of wraps) {
    const h = w.daf.offsetHeight;
    w.daf.style.transform = `scale(${s})`;
    w.el.style.width = (PW * s) + 'px';
    w.el.style.height = (h * s) + 'px';
  }
}

/* ------------------------------------------------------------------ render */
function renderTabs() {
  const t = $('#tabs');
  t.innerHTML = S.pages.map((p, i) =>
    `<button class="tab${i === S.cur ? ' on' : ''}" data-i="${i}" title="${esc(p.masechet + ' ' + p.daf)}">${esc(p.daf || '—')}</button>`
  ).join('') + `<button class="tab add" data-add="1" title="הוספת עמוד">+ עמוד</button>`;
}
function renderAll() {
  renderTabs();
  const host = $('#pages');
  wraps.length = S.pages.length;
  host.innerHTML = '';
  S.pages.forEach((_, i) => { wraps[i] = null; host.appendChild(buildPage(i).el); });
  S.pages.forEach((_, i) => layoutPage(i));
  fit();
  updUndo();
}
let rerenderQ = new Set(), rerenderT = 0;
function rerender(i, now) {
  rerenderQ.add(i);
  clearTimeout(rerenderT);
  const run = () => {
    for (const k of rerenderQ) { if (S.pages[k]) { buildPage(k); layoutPage(k); } }
    rerenderQ.clear(); fit(); renderTabs(); refreshMarks();
  };
  if (now) run(); else rerenderT = setTimeout(run, 90);
}
function setCur(i, scroll) {
  S.cur = Math.max(0, Math.min(i, S.pages.length - 1));
  wraps.forEach((w, k) => w && w.el.classList.toggle('current', k === S.cur && S.pages.length > 1));
  renderTabs(); save();
  if (scroll && wraps[S.cur]) wraps[S.cur].el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' });
}

/* ------------------------------------------------------------------ quick word editor */
let Q = null;  // {pi, f, s, e, orig}
function tokAt(src, pos) {
  const toks = allTokens(src);
  if (!toks.length) return { toks, k: -1 };
  let k = toks.findIndex(t => pos >= t.s && pos <= t.e);
  if (k < 0) { k = toks.findIndex(t => t.s >= pos); if (k < 0) k = toks.length - 1; }
  return { toks, k };
}
function openQuick(pi, f, s) {
  closeSheet(true);
  setCur(pi);
  const p = S.pages[pi];
  const src = getField(p, f);
  const { toks, k } = tokAt(src, s);
  const t = toks[k];
  Q = t ? { pi, f, s: t.s, e: t.e, cls: t.cls } : { pi, f, s: 0, e: 0, cls: '' };
  const inp = $('#quickInput');
  inp.value = t ? src.slice(t.s, t.e) : '';
  $('#quickWhere').textContent = fieldLabel(p, f);
  $('#quick').hidden = false;
  updQuickCtx();
  refreshMarks();
  inp.focus({ preventScroll: true });
  inp.select();
}
function updQuickCtx() {
  if (!Q) return;
  const src = getField(S.pages[Q.pi], Q.f);
  const { toks, k } = tokAt(src, Q.s);
  const b = toks.slice(Math.max(0, k - 4), k).map(t => t.t).join(' ');
  const a = toks.slice(k + 1, k + 5).map(t => t.t).join(' ');
  const cur = src.slice(Q.s, Q.e) || '…';
  $('#quickCtx').innerHTML = `${esc(b)} <mark>${esc(cur)}</mark> ${esc(a)}`;
  const t = toks[k];
  $('#quickBold').classList.toggle('on', !!(t && t.cls === 'b'));
}
function quickInput() {
  if (!Q) return;
  const p = S.pages[Q.pi];
  const src = getField(p, Q.f);
  const v = $('#quickInput').value;
  setField(p, Q.f, src.slice(0, Q.s) + v + src.slice(Q.e));
  Q.e = Q.s + v.length;
  rerender(Q.pi);
  updQuickCtx();
  commit('q:' + Q.pi + Q.f + Q.s);
}
function cleanEmpty(src) { return src.replace(/\*\*\s*\*\*/g, m => (m.length > 4 ? ' ' : '')).replace(/\{\{\s*\}\}/g, '').replace(/\^\s*\^/g, '').replace(/ {2,}/g, ' '); }
function finalizeQuick() {
  // a word that was cleared is removed together with one neighbouring space
  if (!Q) return;
  const p = S.pages[Q.pi];
  let src = getField(p, Q.f);
  if (Q.e === Q.s) {
    let s = Q.s, e = Q.e;
    if (src[e] === ' ') e++; else if (src[s - 1] === ' ') s--;
    src = cleanEmpty(src.slice(0, s) + src.slice(e));
    setField(p, Q.f, src.replace(/^\s+|\s+$/g, ''));
    rerender(Q.pi, true); commit();
  }
}
function closeQuick(silent) {
  if (!Q) { $('#quick').hidden = true; return; }
  if (!silent) finalizeQuick();
  Q = null;
  $('#quick').hidden = true;
  refreshMarks();
}
function quickMove(dir) {
  if (!Q) return;
  const { pi, f } = Q;
  finalizeQuick();
  const src = getField(S.pages[pi], f);
  const { toks, k } = tokAt(src, Q.s);
  let nk = k + dir;
  if (Q.e === Q.s && dir > 0) nk = k;     // the word was deleted: next word now sits at k
  if (nk < 0 || nk >= toks.length) { toast(dir > 0 ? 'סוף הקטע' : 'תחילת הקטע'); return; }
  openQuick(pi, f, toks[nk].s);
}
function quickDelete() {
  if (!Q) return;
  $('#quickInput').value = '';
  quickInput();
  const { pi, f } = Q;
  finalizeQuick();
  const src = getField(S.pages[pi], f);
  const { toks, k } = tokAt(src, Q.s);
  if (k >= 0) openQuick(pi, f, toks[k].s); else closeQuick(true);
  toast('המילה נמחקה');
}
function quickBold() {
  if (!Q) return;
  const p = S.pages[Q.pi];
  const src = getField(p, Q.f);
  const { toks, k } = tokAt(src, Q.s);
  const t = toks[k]; if (!t) return;
  let out, newS;
  if (t.cls === 'b') {
    const sp = t.span;
    const before = src.slice(sp.is, t.s).trim(), after = src.slice(t.e, sp.ie).trim();
    const word = src.slice(t.s, t.e);
    const pre = before ? `**${before}** ` : '';
    out = src.slice(0, sp.s) + pre + word + (after ? ` **${after}**` : '') + src.slice(sp.e);
    newS = sp.s + pre.length;
  } else if (t.cls === '') {
    out = src.slice(0, t.s) + `**${src.slice(t.s, t.e)}**` + src.slice(t.e);
    newS = t.s + 2;
  } else { toast('אפשר לשנות סגנון זה בעריכת הקטע המלא'); return; }
  setField(p, Q.f, out);
  rerender(Q.pi, true); commit();
  const nt = tokAt(out, newS).toks.find(x => x.s === newS);
  if (nt) { Q.s = nt.s; Q.e = nt.e; }
  updQuickCtx(); refreshMarks();
}

/* highlight current word / field */
function refreshMarks() {
  document.querySelectorAll('.w.hl').forEach(e => e.classList.remove('hl'));
  if (Q && wraps[Q.pi]) {
    wraps[Q.pi].daf.querySelectorAll(`.w[data-f="${Q.f}"]`).forEach(e => {
      const s = +e.dataset.s, en = +e.dataset.e;
      if (s >= Q.s && en <= Math.max(Q.e, Q.s) && (en > s || Q.e === Q.s && s === Q.s)) e.classList.add('hl');
    });
  }
  if (SH && SH.f && wraps[SH.pi]) {
    wraps[SH.pi].daf.querySelectorAll(`.w[data-f="${SH.f}"]`).forEach(e => e.classList.add('hl-f'));
  }
}

/* ------------------------------------------------------------------ sheets */
let SH = null;  // {type, pi, f}
function openSheet(title, bodyHTML, state) {
  closeQuick();
  SH = state || {};
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = bodyHTML;
  $('#sheet').hidden = false; $('#scrim').hidden = false;
  if (!document.body.classList.contains('sheet-open')) { document.body.classList.add('sheet-open'); fit(); }
}
function closeSheet(silent) {
  if ($('#sheet').hidden) return;
  $('#sheet').hidden = true; $('#scrim').hidden = true;
  document.body.classList.remove('sheet-open'); fit();
  SH = null;
  document.querySelectorAll('.w.hl-f').forEach(e => e.classList.remove('hl-f'));
  if (!silent) save();
}

function openFieldEditor(pi, f, selS, selE) {
  setCur(pi);
  const p = S.pages[pi];
  const isSec = f.includes(':');
  let extra = '';
  if (isSec) {
    const [side, k] = f.split(':');
    const sec = p[side][+k];
    extra = `<div class="field"><label>כותרת הקטע (אפשר להשאיר ריק)</label><input type="text" id="secTitle" value="${esc(sec.title)}"></div>`;
  }
  openSheet('עריכת ' + fieldLabel(p, f), `
    ${extra}
    <div class="tb">
      <button class="btn ghost" data-wrap="**|**"><b>מודגש</b></button>
      <button class="btn ghost" data-wrap="{{|}}"><b style="font-size:1.2em">גדול</b></button>
      <button class="btn ghost" data-wrap="^|^"><small>אות קטנה</small></button>
      <button class="btn ghost" data-head="1">כותרת</button>
      <button class="btn ghost" data-plain="1">הסרת סגנון</button>
    </div>
    <textarea id="fieldTA" dir="rtl" spellcheck="false">${esc(getField(p, f))}</textarea>
    ${isSec ? `<div class="tb"><button class="btn ghost" id="secAdd">➕ קטע חדש אחרי זה</button><button class="btn ghost danger" id="secDel">🗑️ מחיקת הקטע</button></div>` : ''}
    <div class="help">השינויים מופיעים בדף מיד. סימונים: <code>**מודגש**</code> · <code>{{גדול}}</code> · <code>^קטן^</code> · שורה שמתחילה ב-<code>#</code> היא כותרת ממורכזת. ירידת שורה מתחילה פסקה חדשה.</div>
  `, { type: 'field', pi, f });
  const ta = $('#fieldTA');
  ta.addEventListener('input', () => {
    setField(S.pages[pi], f, ta.value);
    rerender(pi); commit('ta:' + pi + f);
  });
  const st = $('#secTitle');
  if (st) st.addEventListener('input', () => {
    const [side, k] = f.split(':'); S.pages[pi][side][+k].title = st.value;
    rerender(pi); commit('st:' + pi + f);
  });
  $('#sheetBody').querySelectorAll('[data-wrap]').forEach(b => b.addEventListener('click', () => {
    const [a, z] = b.dataset.wrap.split('|');
    let s = ta.selectionStart, e = ta.selectionEnd;
    if (s === e) { // expand to word
      while (s > 0 && !/\s/.test(ta.value[s - 1])) s--;
      while (e < ta.value.length && !/\s/.test(ta.value[e])) e++;
    }
    const sel = ta.value.slice(s, e);
    ta.setRangeText(a + sel + z, s, e, 'select');
    ta.dispatchEvent(new Event('input')); ta.focus();
  }));
  $('#sheetBody').querySelector('[data-head]').addEventListener('click', () => {
    const v = ta.value, s = ta.selectionStart;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    if (v.startsWith('# ', ls)) ta.setRangeText('', ls, ls + 2, 'end'); else ta.setRangeText('# ', ls, ls, 'end');
    ta.dispatchEvent(new Event('input')); ta.focus();
  });
  $('#sheetBody').querySelector('[data-plain]').addEventListener('click', () => {
    let s = ta.selectionStart, e = ta.selectionEnd;
    if (s === e) { s = 0; e = ta.value.length; }
    const sel = ta.value.slice(s, e).replace(/\*\*|\{\{|\}\}|\^/g, '');
    ta.setRangeText(sel, s, e, 'select');
    ta.dispatchEvent(new Event('input')); ta.focus();
  });
  if (isSec) {
    const [side, k] = f.split(':');
    $('#secAdd').addEventListener('click', () => {
      S.pages[pi][side].splice(+k + 1, 0, { title: 'כותרת חדשה', text: 'טקסט חדש' });
      rerender(pi, true); commit();
      openFieldEditor(pi, side + ':' + (+k + 1));
    });
    $('#secDel').addEventListener('click', () => {
      if (!confirm('למחוק את הקטע הזה מהשוליים?')) return;
      S.pages[pi][side].splice(+k, 1);
      if (!S.pages[pi][side].length) S.pages[pi][side].push({ title: '', text: '' });
      rerender(pi, true); commit(); closeSheet();
    });
  }
  refreshMarks();
  const first = wraps[pi] && wraps[pi].daf.querySelector('.w.hl-f');
  if (first) setTimeout(() => first.scrollIntoView({ block: innerWidth < 900 ? 'start' : 'center', behavior: 'smooth' }), 60);
  if (selS != null) {
    requestAnimationFrame(() => {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(selS, selE ?? selS);
      // scroll the textarea so the selection is visible
      const before = ta.value.slice(0, selS);
      const lines = Math.round(before.length / 34) + (before.match(/\n/g) || []).length;
      ta.scrollTop = Math.max(0, lines * 28 - ta.clientHeight / 2);
    });
  }
}

function openPageSheet(pi) {
  setCur(pi);
  const p = S.pages[pi];
  const btn = (f, label) => `<button class="btn ghost" data-ed="${f}">${label}</button>`;
  openSheet('פרטי הדף', `
    <div class="row">
      <div class="field"><label>מסכת</label><input type="text" data-k="masechet" value="${esc(p.masechet)}"></div>
      <div class="field"><label>דף</label><input type="text" data-k="daf" value="${esc(p.daf)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>שם הפרק</label><input type="text" data-k="perek" value="${esc(p.perek)}"></div>
      <div class="field"><label>מספר הפרק</label><input type="text" data-k="perekNum" value="${esc(p.perekNum)}"></div>
    </div>
    <div class="field"><label>עמוד (קובע איפה רש"י ואיפה תוספות)</label>
      <div class="seg" id="amudSeg">
        <button data-v="a" class="${p.amud === 'a' ? 'on' : ''}">עמוד א · רש"י מימין</button>
        <button data-v="b" class="${p.amud === 'b' ? 'on' : ''}">עמוד ב · רש"י משמאל</button>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>תווית שוליים חיצוניים</label><input type="text" data-k="lblOuter" value="${esc(p.lblOuter.replace(/\n/g, ' / '))}"></div>
      <div class="field"><label>תווית שוליים פנימיים</label><input type="text" data-k="lblInner" value="${esc(p.lblInner.replace(/\n/g, ' / '))}"></div>
    </div>
    <div class="card"><h3>עריכת חלקי הדף</h3>
      <div class="tb">${btn('gemara', 'גמרא')}${btn('rashi', 'רש"י')}${btn('tosafot', 'תוספות')}${btn('notes', 'הערות בתחתית')}</div>
      <div class="lbl2">שוליים</div>
      <div class="secs">
        ${p.outer.map((s, k) => btn('outer:' + k, '◂ ' + esc(fieldLabel(p, 'outer:' + k)))).join('')}
        ${p.inner.map((s, k) => btn('inner:' + k, '▸ ' + esc(fieldLabel(p, 'inner:' + k)))).join('')}
      </div>
    </div>
    <div class="help">טיפ: אפשר גם פשוט ללחוץ על כל מילה בדף ולשנות אותה.</div>
  `, { type: 'page', pi });
  $('#sheetBody').querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('input', () => {
    let v = inp.value;
    if (inp.dataset.k.startsWith('lbl')) v = v.replace(/\s*\/\s*/g, '\n');
    S.pages[pi][inp.dataset.k] = v;
    rerender(pi); commit('pg:' + pi + inp.dataset.k);
  }));
  $('#amudSeg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    S.pages[pi].amud = b.dataset.v;
    $('#amudSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    rerender(pi, true); commit();
  }));
  $('#sheetBody').querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => openFieldEditor(pi, b.dataset.ed)));
}

function openDesign() {
  const st = S.settings;
  const rng = (k, label, min, max, step, unit = '') =>
    `<div class="field"><label>${label}</label><div class="rng"><input type="range" data-s="${k}" min="${min}" max="${max}" step="${step}" value="${st[k]}"><output>${st[k]}${unit}</output></div></div>`;
  const seg = (k, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${st[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  openSheet('עיצוב ופונטים', `
    <div class="card"><h3>נייר</h3>${seg('tone', [['white', 'לבן'], ['ivory', 'שנהב'], ['parchment', 'קלף']])}
      ${seg('theme', [['auto', 'מצב אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']])}</div>
    <div class="card"><h3>פונטים</h3>
      <div class="field"><label>גמרא וכותרות</label>${seg('gemFont', [['frank', 'פרנק־רוהל'], ['david', 'דוד'], ['custom', 'פונט שלי']])}
        <button class="btn ghost" data-upload="gem">⬆️ העלאת פונט לגמרא (TTF / OTF / WOFF)</button></div>
      <div class="field"><label>רש"י ותוספות</label>${seg('commFont', [['rashi', 'כתב רש"י'], ['frank', 'פרנק־רוהל'], ['custom', 'פונט שלי']])}
        <button class="btn ghost" data-upload="comm">⬆️ העלאת פונט לרש"י (TTF / OTF / WOFF)</button></div>
      <div class="help">יש לכם את הפונטים המקוריים של הש"ס (למשל Vilna ו-Rashi)? העלו אותם כאן והדף ייראה בדיוק כמו בדפוס. הפונט נשמר בדפדפן שלכם.</div>
    </div>
    <div class="card"><h3>גדלים ומבנה</h3>
      ${rng('gemSize', 'גודל אותיות הגמרא', 13, 28, 0.5, 'px')}
      ${rng('commSize', 'גודל אותיות רש"י ותוספות', 9, 20, 0.5, 'px')}
      ${rng('margSize', 'גודל אותיות השוליים', 7, 14, 0.5, 'px')}
      ${rng('lineH', 'מרווח בין שורות', 0.95, 1.5, 0.01)}
      ${rng('gemWidth', 'רוחב עמודת הגמרא', 28, 62, 1, '%')}
      ${rng('openLines', 'שורות פתיחה של רש"י ותוספות מעל הגמרא', 0, 12, 1)}
      <div class="field"><label>השוליים</label>${seg('margFit', [[true, 'מתכווצים לגובה הדף'], [false, 'גודל קבוע']])}</div>
      <button class="btn ghost" id="resetDesign">↺ איפוס העיצוב</button>
    </div>
  `, { type: 'design' });
  const body = $('#sheetBody');
  body.querySelectorAll('input[type=range]').forEach(r => r.addEventListener('input', () => {
    S.settings[r.dataset.s] = +r.value;
    r.nextElementSibling.textContent = r.value + (/Size$/.test(r.dataset.s) ? 'px' : r.dataset.s === 'gemWidth' ? '%' : '');
    relayoutAll(); commit('set:' + r.dataset.s);
  }));
  body.querySelectorAll('[data-seg]').forEach(sg => sg.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    const k = sg.dataset.seg, v = b.dataset.v === 'true' ? true : b.dataset.v === 'false' ? false : b.dataset.v;
    if ((k === 'gemFont' || k === 'commFont') && v === 'custom' && !customFonts[k === 'gemFont' ? 'gem' : 'comm']) {
      pickFont(k === 'gemFont' ? 'gem' : 'comm'); return;
    }
    S.settings[k] = v;
    sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (k === 'theme') applyTheme();
    await fontsReady(); relayoutAll(); commit();
  })));
  body.querySelectorAll('[data-upload]').forEach(b => b.addEventListener('click', () => pickFont(b.dataset.upload)));
  $('#resetDesign').addEventListener('click', () => {
    S.settings = { ...DEF_SET, theme: S.settings.theme };
    relayoutAll(); commit(); openDesign();
  });
}

function relayoutAll() {
  wraps.forEach((w, i) => { if (w) { applySettings(w.daf); layoutPage(i); } });
  fit();
}
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* ------------------------------------------------------------------ custom fonts (IndexedDB) */
const customFonts = { gem: null, comm: null };
let fontTarget = 'gem';
function idb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open('daf-editor', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('fonts');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function idbPut(k, v) { try { const db = await idb(); db.transaction('fonts', 'readwrite').objectStore('fonts').put(v, k); } catch (e) { } }
async function idbGet(k) {
  try {
    const db = await idb();
    return await new Promise(res => { const r = db.transaction('fonts').objectStore('fonts').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
  } catch (e) { return null; }
}
function injectCustomFonts() {
  let el = document.getElementById('customFontCSS');
  if (!el) { el = document.createElement('style'); el.id = 'customFontCSS'; document.head.appendChild(el); }
  el.textContent = [['gem', 'DafCustomGem'], ['comm', 'DafCustomComm']]
    .filter(([k]) => customFonts[k])
    .map(([k, fam]) => `@font-face{font-family:'${fam}';src:url(${customFonts[k].url});font-display:block}`).join('\n');
  fontCSS = null;
}
function pickFont(target) { fontTarget = target; $('#fontFile').value = ''; $('#fontFile').click(); }
$('#fontFile').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  customFonts[fontTarget] = { name: file.name, url };
  await idbPut(fontTarget, customFonts[fontTarget]);
  injectCustomFonts();
  S.settings[fontTarget === 'gem' ? 'gemFont' : 'commFont'] = 'custom';
  try { await document.fonts.load(`16px ${fontTarget === 'gem' ? 'DafCustomGem' : 'DafCustomComm'}`, 'אבג'); } catch (err) { }
  relayoutAll(); commit();
  toast('הפונט "' + file.name + '" נטען');
  if (SH && SH.type === 'design') openDesign();
});
async function fontsReady() { try { await document.fonts.ready; } catch (e) { } }

/* ------------------------------------------------------------------ image export */
let fontCSS = null;
async function getFontCSS(node) {
  if (!fontCSS) fontCSS = htmlToImage.getFontEmbedCSS(node).catch(() => '');
  return fontCSS;
}
async function pageCanvas(i, ratio) {
  // render an un-scaled copy of the page that sits at the top-left corner of the viewport (invisible)
  const src = wraps[i].daf;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:0;top:0;width:${PW}px;opacity:0;pointer-events:none;z-index:-1;direction:rtl`;
  const d = src.cloneNode(true);
  d.classList.add('exporting'); d.classList.remove('editing');
  d.style.transform = 'none'; d.style.position = 'relative'; d.style.top = '0'; d.style.right = '0';
  d.querySelectorAll('.hl,.hl-f').forEach(e => e.classList.remove('hl', 'hl-f'));
  host.appendChild(d); document.body.appendChild(host);
  try {
    const width = d.offsetWidth, height = d.offsetHeight;
    const css = await getFontCSS(d);
    return await htmlToImage.toCanvas(d, {
      pixelRatio: ratio, width, height, fontEmbedCSS: css || undefined,
      backgroundColor: getComputedStyle(d).backgroundColor
    });
  } finally { host.remove(); }
}
function fileName(list) {
  const p = list.map(i => S.pages[i]);
  const name = p.length > 1 ? `${p[0].masechet} ${p.map(x => x.daf).join(' ')}` : `${p[0].masechet} ${p[0].daf}`;
  return (name.replace(/[\\/:*?"<>|]/g, '').trim() || 'daf') + '.png';
}
async function renderImage(list) {
  const ratio = list.length > 1 ? 2.2 : 3;
  const cs = [];
  for (const i of list) cs.push(await pageCanvas(i, ratio));
  if (cs.length === 1) return cs[0];
  const gap = Math.round(40 * ratio);
  const out = document.createElement('canvas');
  out.width = cs.reduce((a, c) => a + c.width, 0) + gap * (cs.length + 1);
  out.height = Math.max(...cs.map(c => c.height)) + gap * 2;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#e9e3d6'; ctx.fillRect(0, 0, out.width, out.height);
  let x = out.width - gap;              // right to left, like a Hebrew book
  for (const c of cs) { x -= c.width; ctx.drawImage(c, x, gap); x -= gap; }
  return out;
}
const toBlob = c => new Promise(r => c.toBlob(r, 'image/png'));
async function download(list) {
  closeQuick(); busy(true, 'מכין תמונה באיכות גבוהה…');
  try {
    await fontsReady();
    const c = await renderImage(list);
    const blob = await toBlob(c);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName(list);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('התמונה ירדה ✓');
  } catch (e) {
    console.error(e);
    toast('לא הצלחתי ליצור תמונה. נסו לפתוח את האתר דרך שרת (לא מקובץ מקומי).', 5000);
  } finally { busy(false); }
}
async function share() {
  closeQuick(); busy(true, 'מכין תמונה לשיתוף…');
  try {
    const c = await renderImage([S.cur]);
    const blob = await toBlob(c);
    const file = new File([blob], fileName([S.cur]), { type: 'image/png' });
    busy(false);
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: fileName([S.cur]) });
    else { toast('השיתוף לא נתמך בדפדפן הזה, מוריד במקום'); download([S.cur]); }
  } catch (e) { busy(false); if (e.name !== 'AbortError') toast('השיתוף נכשל'); }
}

/* ------------------------------------------------------------------ pages management */
function uid() { return Math.random().toString(36).slice(2, 9); }
const HEB = [['ת', 400], ['ש', 300], ['ר', 200], ['ק', 100], ['צ', 90], ['פ', 80], ['ע', 70], ['ס', 60], ['נ', 50], ['מ', 40], ['ל', 30], ['כ', 20], ['י', 10], ['ט', 9], ['ח', 8], ['ז', 7], ['ו', 6], ['ה', 5], ['ד', 4], ['ג', 3], ['ב', 2], ['א', 1]];
function toHeb(n) {
  let s = '';
  for (const [c, v] of HEB) while (n >= v) { if (n === 15) { s += 'טו'; n = 0; break; } if (n === 16) { s += 'טז'; n = 0; break; } s += c; n -= v; }
  return s;
}
function fromHeb(s) { const m = Object.fromEntries(HEB); return [...s].reduce((a, c) => a + (m[c] || 0), 0); }
function nextDaf(p) {
  const raw = (p.daf || '').trim();
  const n = fromHeb(raw.replace(/[^א-ת]/g, ''));
  if (!n) return { daf: raw, amud: p.amud === 'a' ? 'b' : 'a' };
  return p.amud === 'a' ? { daf: toHeb(n) + ':', amud: 'b' } : { daf: toHeb(n + 1) + '.', amud: 'a' };
}
function filler(phrase, n) { return Array.from({ length: n }, () => phrase).join(' '); }
function addPage() {
  const c = S.pages[S.cur] || S.pages[S.pages.length - 1];
  const nd = c ? nextDaf(c) : { daf: 'ב.', amud: 'a' };
  const p = normPage({
    masechet: c ? c.masechet : 'ברכות', perek: c ? c.perek : '', perekNum: c ? c.perekNum : '', daf: nd.daf, amud: nd.amud,
    gemara: filler('כאן כותבים את לשון הגמרא', 32),
    rashi: '**דיבור המתחיל.** ' + filler('כאן כותבים את פירוש רש"י', 46),
    tosafot: '{{דיבור}} **המתחיל.** ' + filler('כאן כותבים את דברי התוספות', 40),
    inner: [{ title: '', text: 'מסורת הש"ס' }, { title: 'רבינו חננאל', text: filler('פירוש', 30) }],
    outer: [{ title: '', text: '**א** עין משפט' }, { title: 'מוסף רש"י', text: filler('פירוש', 30) }],
    notes: ''
  });
  S.pages.splice(S.cur + 1, 0, p);
  S.cur = S.cur + 1;
  renderAll(); commit(); setCur(S.cur, true);
  toast('נוסף עמוד ' + p.daf);
}
function dupPage() {
  const p = normPage(clone(S.pages[S.cur])); p.id = uid();
  S.pages.splice(S.cur + 1, 0, p); S.cur++;
  renderAll(); commit(); setCur(S.cur, true); toast('העמוד שוכפל');
}
function delPage() {
  if (S.pages.length < 2) { toast('צריך להשאיר לפחות עמוד אחד'); return; }
  if (!confirm(`למחוק את עמוד ${S.pages[S.cur].daf}?`)) return;
  S.pages.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1);
  renderAll(); commit(); toast('העמוד נמחק (אפשר לבטל)');
}

/* ------------------------------------------------------------------ misc ui */
let toastT = 0;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
function busy(on, txt) { $('#busy').hidden = !on; if (txt) $('#busyTxt').textContent = txt; }
function toggleMenu(force) {
  const m = $('#menu'); const show = force ?? m.hidden;
  m.hidden = !show;
}
function exportJSON() {
  const blob = new Blob([JSON.stringify({ app: 'daf', version: 1, pages: S.pages, settings: S.settings }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = (S.pages[0].masechet || 'daf') + ' - עבודה.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.pages) || !d.pages.length) throw new Error('bad');
    S.pages = d.pages.map(normPage); S.settings = { ...DEF_SET, ...(d.settings || {}) }; S.cur = 0;
    applyTheme(); renderAll(); commit(); toast('הקובץ נטען ✓');
  } catch (err) { toast('הקובץ לא תקין'); }
  e.target.value = '';
});
function help() {
  openSheet('איך עורכים?', `
    <div class="help" style="font-size:15px;color:var(--txt)">
      <p>👆 <b>לחיצה על מילה</b> בדף פותחת חלונית קטנה: מקלידים את המילה החדשה והדף מתעדכן מיד. אפשר לעבור למילה הבאה / הקודמת, למחוק, או להדגיש.</p>
      <p>📝 <b>"עריכת כל הקטע"</b> פותח את כל הטקסט של הגמרא / רש"י / תוספות / השוליים בתיבה גדולה ונוחה, גם בטלפון.</p>
      <p>🏷️ <b>לחיצה על הכותרת</b> (שם הפרק, המסכת או מספר הדף) פותחת את פרטי הדף: שם המסכת, הפרק, הדף ועמוד א/ב.</p>
      <p>🎨 <b>עיצוב</b>: גודל האותיות, רוחב הגמרא, כמה שורות של רש"י ותוספות יופיעו מעל הגמרא, צבע הנייר והפונטים. אפשר להעלות פונט משלכם.</p>
      <p>🖼️ <b>הורדת תמונה</b> שומרת את העמוד הנוכחי כ-PNG באיכות גבוהה. בתפריט ⋮ אפשר להוריד את כל העמודים יחד, לשתף או להדפיס.</p>
      <p>💾 הכול נשמר אוטומטית בדפדפן. ↶ מבטל כל שינוי.</p>
      <p>סימונים בתיבת העריכה: <code>**מודגש**</code> · <code>{{מילה גדולה}}</code> · <code>^אות קטנה^</code> · שורה שמתחילה ב-<code>#</code> היא כותרת (כמו "הדרן עלך").</p>
    </div>`, { type: 'help' });
}

/* ------------------------------------------------------------------ events */
$('#pages').addEventListener('click', e => {
  const daf = e.target.closest('.daf'); if (!daf) return;
  const pi = +daf.dataset.idx;
  const w = e.target.closest('.w');
  if (w) { e.stopPropagation(); openQuick(pi, w.dataset.f, +w.dataset.s); return; }
  const h4 = e.target.closest('h4[data-sec]');
  if (h4) { openFieldEditor(pi, h4.dataset.sec); return; }
  if (e.target.closest('[data-hdr]')) { openPageSheet(pi); return; }
  if (Q) closeQuick();
  setCur(pi);
});
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  if (b.dataset.add) { addPage(); return; }
  setCur(+b.dataset.i, true);
});
$('#quickInput').addEventListener('input', quickInput);
$('#quickInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); closeQuick(); }
  else if (e.key === 'Escape') closeQuick();
  else if (e.key === 'Tab') { e.preventDefault(); quickMove(e.shiftKey ? -1 : 1); }
});
$('#quickOk').addEventListener('click', () => closeQuick());
$('#quickClose').addEventListener('click', () => closeQuick());
$('#quickNext').addEventListener('click', () => quickMove(1));
$('#quickPrev').addEventListener('click', () => quickMove(-1));
$('#quickDel').addEventListener('click', quickDelete);
$('#quickBold').addEventListener('click', quickBold);
$('#quickFull').addEventListener('click', () => {
  if (!Q) return; const { pi, f, s, e } = Q; closeQuick(); openFieldEditor(pi, f, s, e);
});
$('#sheetDone').addEventListener('click', () => closeSheet());
$('#scrim').addEventListener('click', () => closeSheet());
$('#designBtn').addEventListener('click', () => (SH && SH.type === 'design') ? closeSheet() : openDesign());
$('#downloadBtn').addEventListener('click', () => download([S.cur]));
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
$('#menuBtn').addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', e => { if (!e.target.closest('#menu')) toggleMenu(false); });
$('#menu').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  toggleMenu(false);
  const a = b.dataset.act;
  if (a === 'addPage') addPage();
  else if (a === 'dupPage') dupPage();
  else if (a === 'delPage') delPage();
  else if (a === 'downloadAll') download(S.pages.map((_, i) => i));
  else if (a === 'share') share();
  else if (a === 'print') { closeQuick(); closeSheet(); setTimeout(() => print(), 50); }
  else if (a === 'export') exportJSON();
  else if (a === 'import') $('#importFile').click();
  else if (a === 'reset') {
    if (!confirm('לחזור לדפים המקוריים? כל השינויים יימחקו (אפשר לבטל עם ↶).')) return;
    const th = S.settings.theme; S = defaults(); S.settings.theme = th; renderAll(); commit(); toast('הדפים אופסו');
  }
  else if (a === 'help') help();
});
$('#zoomIn').addEventListener('click', () => { zoom = Math.min(4, zoom * 1.25); fit(); });
$('#zoomOut').addEventListener('click', () => { zoom = Math.max(0.3, zoom / 1.25); fit(); });
$('#zoomFit').addEventListener('click', () => { zoom = 1; fit(); });
$('#hintClose').addEventListener('click', () => { $('#hint').remove(); try { localStorage.setItem(LS_HINT, '1'); } catch (e) { } fit(); });
document.addEventListener('keydown', e => {
  const inField = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && !inField) {
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  }
  if (e.key === 'Escape') { closeQuick(); closeSheet(); toggleMenu(false); }
});
let rzT = 0;
addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(fit, 80); });

/* ------------------------------------------------------------------ boot */
(async function boot() {
  try { if (localStorage.getItem(LS_HINT)) $('#hint').remove(); } catch (e) { }
  applyTheme();
  const [g, c] = await Promise.all([idbGet('gem'), idbGet('comm')]);
  if (g) customFonts.gem = g; if (c) customFonts.comm = c;
  injectCustomFonts();
  if (S.settings.gemFont === 'custom' && !g) S.settings.gemFont = 'frank';
  if (S.settings.commFont === 'custom' && !c) S.settings.commFont = 'rashi';
  renderAll();                 // first paint (fallback fonts)
  try {
    await Promise.all([
      document.fonts.load("500 19px 'Frank Ruhl Libre'", 'אבג'), document.fonts.load("900 19px 'Frank Ruhl Libre'", 'אבג'),
      document.fonts.load("14px 'Noto Rashi Hebrew'", 'אבג'), document.fonts.load("700 14px 'David Libre'", 'אבג')
    ]);
    await fontsReady();
  } catch (e) { }
  relayoutAll();               // re-solve with real font metrics
  pushHist();
  if (S.pages.length > 1) setCur(S.cur);
  window.DAF = { S, layoutPage, relayoutAll };   // handy for debugging
})();
})();
