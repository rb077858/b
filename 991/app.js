(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const store = { get(k, d) { try { const v = localStorage.getItem('fx991.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('fx991.' + k, JSON.stringify(v)); } catch (e) {} } };

const calc = new Calc();
const S = { game: null, flip: false, sheet: false, tab: 'keys', key: null, layer: 'm', mode: null, setupHL: null, tut: null, quiz: null, running: false, csub: 'const', convVal: '10', cfilter: '', tcat: 'הכל', hl: null };
const LAYER = { m: { name: 'לחיצה רגילה', c: '#e8ebf2', how: '' }, s: { name: 'SHIFT', c: 'var(--shift)', how: 'SHIFT ואז המקש' }, a: { name: 'ALPHA', c: 'var(--alpha)', how: 'ALPHA ואז המקש' } };
const seqIds = s => s.trim().split(/\s+/).filter(Boolean).map(x => x === '.' ? 'dot' : x);

/* =============== build the calculator =============== */
function capsHTML(id) {
  const k = KEYS[id];
  if (k.kind === 'round') {
    const m = { shift: '<span class="cs">SHIFT</span>', alpha: '<span class="ca">ALPHA</span>', mode: '<span class="cs">SETUP</span><span style="color:#e6e7ea">MODE</span>', on: '<span style="color:#e6e7ea">ON</span>' };
    return m[id];
  }
  const cs = k.cap ? `<span class="cs ${k.capCls && k.capCls.includes('brk') ? 'brk' : ''}">${k.cap}</span>` : '<span></span>';
  const cm = k.mcap ? `<span class="cm">${k.mcap}</span>` : '';
  const ca = k.acap ? `<span class="${k.acapCls ? 'cc' : 'ca'}">${k.acap}</span>` : '<span></span>';
  return cs + cm + ca;
}
function kwHTML(id, style = '') {
  const k = KEYS[id];
  return `<div class="kw ${k.kind}" data-k="${id}" style="${style}"><div class="caps">${capsHTML(id)}</div><button class="key ${k.kind}" data-k="${id}" aria-label="${strip(k.m.n)}">${k.kind === 'round' ? '' : `<span class="lb">${k.lab}</span>`}</button></div>`;
}
function buildCalc() {
  const top = [['shift', 1, 1], ['alpha', 2, 1], ['mode', 5, 1], ['on', 6, 1], ['calc', 1, 2], ['integ', 2, 2], ['inv', 5, 2], ['logab', 6, 2]];
  const arrow = (id, cls, ch) => `<div class="kw arrowkw ${cls}" data-k="${id}"><button class="key arrow" data-k="${id}" aria-label="${KEYS[id].m.n}"><span class="lb">${ch}</span></button></div>`;
  $('#calc').innerHTML = `
    <div class="brand"><div><div class="casio">CASIO</div><div class="model">fx-991ES PLUS</div><div class="vpam">NATURAL-V.P.A.M.</div></div>
      <div><div class="solar"></div><div class="ed">2nd edition</div></div></div>
    <div class="lcd-frame"><div class="lcd" id="lcd"></div></div>
    <div class="krow k-top">${top.map(([id, c, r]) => kwHTML(id, `grid-column:${c};grid-row:${r}`)).join('')}
      <div class="pad"><div class="pad-bg"></div><div class="rep">REPLAY</div>${arrow('up', 'a-up', '▲')}${arrow('down', 'a-down', '▼')}${arrow('left', 'a-left', '◀')}${arrow('right', 'a-right', '▶')}</div></div>
    <div class="krow k-fn">${LAYOUT.fn.flat().map(id => kwHTML(id)).join('')}</div>
    <div class="krow k-num">${LAYOUT.num.flat().map(id => kwHTML(id)).join('')}</div>`;
  $$('#calc .key').forEach(b => {
    b.addEventListener('click', e => { e.preventDefault(); userPress(b.dataset.k); });
    const kw = b.closest('.kw');
    kw.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showTip(kw); });
    kw.addEventListener('pointerleave', hideTip);
  });
  if (!store.get('seenMode', false)) kwEl('mode').classList.add('hint');
}
const kwEl = id => $(`#calc .kw[data-k="${id}"]`);

/* tooltip */
function showTip(kw) {
  const k = KEYS[kw.dataset.k]; const tip = $('#tip');
  const row = (c, t) => `<div class="r"><i class="dot" style="background:${c}"></i>${t}</div>`;
  tip.innerHTML = row('#e8ebf2', `<b>${k.m.n}</b>`) + (k.s ? row('var(--shift)', 'SHIFT: ' + k.s.n) : '') + (k.a ? row('var(--alpha)', 'ALPHA: ' + k.a.n) : '');
  tip.hidden = false;
  const r = kw.getBoundingClientRect(); const tr = tip.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2)) + 'px';
  tip.style.top = Math.max(8, r.top - tr.height - 8) + 'px';
}
function hideTip() { $('#tip').hidden = true; }

/* sound */
let actx = null, soundOn = store.get('sound', true);
function click() {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = 1800; g.gain.setValueAtTime(0.035, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.035);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.04);
  } catch (e) {}
}
function pressAnim(id) {
  const kw = kwEl(id); if (!kw) return; const b = kw.querySelector('.key');
  b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 160); click();
}

/* =============== LCD =============== */
const INDS = ['S', 'A', 'M', 'STO', 'RCL', 'STAT', 'CMPLX', 'MAT', 'VCT', 'D', 'R', 'G', 'FIX', 'SCI', 'Math', '▼', '▲'];
function indHTML(ind) {
  let set = Array.isArray(ind) ? ind : String(ind == null ? 'Math D' : ind).split(/\s+/);
  set = new Set(set.flatMap(x => x === '▲▼' ? ['▲', '▼'] : [x]));
  const span = n => `<span class="${set.has(n) ? 'on' : ''}">${n}</span>`;
  return `<div class="lcd-ind">${['S', 'A', 'M', 'STO', 'RCL'].map(span).join('')}${['STAT', 'CMPLX', 'MAT', 'VCT'].filter(n => set.has(n)).map(span).join('') || '<span>STAT</span>'}${['D', 'R', 'G', 'FIX', 'SCI', 'Math'].map(span).join('')}<i class="sp"></i>${span('▲')}${span('▼')}</div>`;
}
function renderLCD(s) {
  const lcd = $('#lcd');
  if (s.type === 'off') { lcd.className = 'lcd off'; lcd.innerHTML = indHTML([]) + '<div class="lcd-body"></div>'; return; }
  lcd.className = 'lcd' + (s.err ? ' err' : '') + (S.flip ? ' flip' : '');
  const c = s.contrast == null ? 5 : s.contrast;
  lcd.style.filter = c === 5 ? '' : `contrast(${0.5 + c * 0.1}) brightness(${1.15 - c * 0.03})`;
  let b = '';
  const lines = (L, opts = {}) => `<div class="lcd-text">${L.map((t, i) => {
    const right = (i > 0 && /[=?]$/.test(strip(L[i - 1]))) || (i === 3 && !L[1] && !L[2]);
    return `<div class="${right ? 'r' : ''}">${t || ''}${opts.cursor && i === 3 ? '<span class="cursor"></span>' : ''}</div>`;
  }).join('')}</div>`;
  switch (s.type) {
    case 'calc': b = `<div class="l1">${s.l1 || ''}${s.cursor ? '<span class="cursor"></span>' : ''}</div><div class="l2">${s.l2 || ''}${s.radix ? `<small>${s.radix}</small>` : ''}</div>`; break;
    case 'menu': { const long = s.items.some(x => strip(x).length > 10);
      b = `<div class="lcd-menu ${long ? 'one' : ''}">${s.title ? `<div class="tt">${s.title}</div>` : ''}${s.items.map(x => `<div>${x}</div>`).join('')}</div>`; break; }
    case 'text': b = lines(s.lines); if (s.bar != null) b = b.replace('<div class="">LIGHT', `<div class="contrast-bar"><i style="left:${s.bar * 9.5}%"></i></div><div class="">LIGHT`); break;
    case 'prompt': b = lines(s.title ? [s.title, s.q, '', s.v] : [s.q, '', '', s.v], { cursor: s.editing }); break;
    case 'grid': b = `<table class="lcd-grid">${[s.head, ...s.rows].map((r, ri) => `<tr>${r.map((v, ci) => `<td class="${ri > 0 && s.sel && s.sel[0] === ri - 1 && s.sel[1] === ci - 1 ? 'sel' : ''}">${v}</td>`).join('')}</tr>`).join('')}</table><div class="grid-foot">${s.foot == null ? '' : s.foot}${s.editing ? '<span class="cursor"></span>' : ''}</div>`; break;
    case 'pair': b = `<div class="l1">${s.l1}</div><div class="lcd-text"><div class="r">${s.a}</div><div class="r">${s.b}</div></div>`; break;
    case 'demo': b = `<div class="lcd-demo"><div class="m">${s.mode}</div><div style="font-size:1.2em">${s.what || ''}</div><div class="h">המשך התהליך – במדריך המודרך ←</div></div>`; break;
  }
  lcd.innerHTML = indHTML(s.ind) + `<div class="lcd-body">${b}</div>`;
  const l1 = lcd.querySelector('.l1'); if (l1 && l1.scrollWidth > l1.clientWidth + 2) l1.classList.add('ovf');
}
function tutScreen() {
  const T = S.tut; const st = T.t.steps;
  if (T.pos >= T.seq.length && T.seq.length) return st[T.i].s;
  return T.i === 0 ? { type: 'calc', l1: '', l2: '0', ind: 'Math D', cursor: true } : st[T.i - 1].s;
}
function renderCalcState() {
  if (S.quiz && S.quiz.active) { const Q = S.quiz; renderLCD({ type: 'text', lines: ['QUIZ ' + Math.min(Q.n + 1, Q.total) + '/' + Q.total, 'Where is it?', '', 'SCORE ' + Q.score], ind: Q.mod === 's' ? 'S' : Q.mod === 'a' ? 'A' : '' }); }
  else if (S.tut) renderLCD(tutScreen());
  else renderLCD(calc.screen());
  const el = $('#calc');
  const q = S.quiz && S.quiz.active ? S.quiz.mod : null;
  el.classList.toggle('shift-on', q ? q === 's' : calc.shift);
  el.classList.toggle('alpha-on', q ? q === 'a' : calc.alpha);
  el.classList.toggle('base-on', calc.mode === 'BASE-N');
  renderStatus(); renderPeek();
}
function renderStatus() {
  const s = calc.setup;
  const items = [['מצב', calc.mode], ['זווית', { D: 'Deg', R: 'Rad', G: 'Gra' }[s.angle]], ['תצוגה', s.io === 'Line' ? 'LineIO' : 'MthIO-' + s.io], ['מספרים', s.fmt.t + (s.fmt.t === 'Norm' || s.fmt.n != null ? ' ' + s.fmt.n : '')]];
  if (s.frac === 'ab/c') items.push(['שברים', 'ab/c']);
  if (s.freq) items.push(['FREQ', 'ON']);
  if (calc.mode === 'BASE-N') items.push(['בסיס', { 10: 'DEC', 16: 'HEX', 2: 'BIN', 8: 'OCT' }[calc.radix]]);
  $('#status').innerHTML = items.map(([a, b]) => `<span>${a}: <b>${b}</b></span>`).join('') + `<span>Ans: <b>${strip(calc.fmtNum(calc.ans, { view: 'dec' }))}</b></span>`;
}

/* =============== toast =============== */
let toastT;
function toast(html, ms = 3200) { const t = $('#toast'); t.innerHTML = html; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
const ERR = { Syntax: '<b>Syntax ERROR</b> – שגיאת כתיב: חסר מספר, אופרטור כפול, או סוגריים לא תקינים. ◀▶ חוזרים לתיקון.', Math: '<b>Math ERROR</b> – פעולה לא חוקית: חלוקה ב-0, שורש/לוג של שלילי, מחוץ לתחום של sin⁻¹, או תוצאה גדולה מדי.', Range: '<b>Range ERROR</b> – הטווח לא חוקי (למשל יותר מ-30 שורות בטבלה).', "Can't Solve": '<b>Can\'t Solve</b> – SOLVE לא מצא פתרון. נסו ניחוש התחלתי אחר.' };

/* =============== key presses =============== */
function userPress(id) {
  hideTip();
  if (id === 'mode') { kwEl('mode').classList.remove('hint'); store.set('seenMode', true); }
  if (S.running) return;
  if (S.quiz && S.quiz.active) { pressAnim(id); return quizPress(id); }
  if (S.tut) { return tutPress(id); }
  if (S.game && GAMES_UI.onKey(id, S.game)) { pressAnim(id); return; }
  pressAnim(id);
  const evs = calc.press(id);
  renderCalcState();
  if (S.game) { handleEvents(evs, false); GAMES_UI.after(evs, S.game); return; }
  handleEvents(evs);
}
function handleEvents(evs, follow = true) {
  evs.filter(e => e.t === 'note').forEach(e => toast('💡 ' + e.text, 4200));
  evs.filter(e => e.t === 'error').forEach(e => toast(ERR[e.kind] || e.kind, 5200));
  evs.filter(e => e.t === 'cleared').forEach(e => toast('✓ ' + e.what + ' – לחצו AC'));
  evs.filter(e => e.t === 'var').forEach(e => toast(`✓ נשמר: <b>${e.v}</b> = ${strip(calc.fmtNum(e.val, { view: 'dec' }))}`));
  if (!follow) return;
  const prim = [...evs].reverse().find(e => e.t !== 'key' && e.t !== 'note' && e.t !== 'error' && e.t !== 'var' && e.t !== 'radix' && e.t !== 'cleared');
  const key = evs.find(e => e.t === 'key');
  if (prim) {
    const menuMap = { mode: ['modes', null], eqntype: ['modes', 'EQN'], stattype: ['modes', 'STAT'], matpick: ['modes', 'MATRIX'], matdim: ['modes', 'MATRIX'], vctpick: ['modes', 'VECTOR'], vctdim: ['modes', 'VECTOR'], base: ['modes', 'BASE-N'],
      statmenu: ['modes', 'STAT'], cmplxmenu: ['modes', 'CMPLX'], matrix: ['modes', 'MATRIX'], vector: ['modes', 'VECTOR'], setup: ['setup', null], mthio: ['setup', 'MthIO'], cplxfmt: ['setup', 'CMPLX'], freq: ['setup', 'STAT'], disp: ['setup', 'Disp'] };
    if (prim.t === 'menu' && menuMap[prim.name]) {
      const [tab, x] = menuMap[prim.name];
      quick(tab === 'modes' ? 'תפריט <b>' + (x || 'MODE') + '</b> פתוח – בחרו ספרה' : 'תפריט <b>SETUP</b> פתוח – בחרו ספרה');
      if (tab === 'modes') { if (prim.name === 'mode' && S.tab === 'modes' && !x) { S.mode = null; } else if (x) S.mode = x; return go('modes'); }
      S.setupHL = x; return go('setup');
    }
    if (prim.t === 'menu' && key) return showKey(key.id, key.layer);
    if (prim.t === 'mode') { S.mode = prim.mode; quick(`מצב <b>${prim.mode}</b> – ${MODES.find(m => m.id === prim.mode).heb}`); return go('modes'); }
    if (prim.t === 'demo') { S.mode = prim.mode; go('modes'); const tut = MODES.find(m => m.id === prim.mode).tuts[0]; toast(`בסימולטור מוצגים התפריטים של ${prim.mode}. את התהליך המלא תראו במדריך – <b>לחצו על "${TUTS.find(t => t.id === tut).t}"</b>`, 5200); return; }
    if (prim.t === 'setup') { S.setupHL = prim.item; return go('setup'); }
    if (prim.t === 'eqn' || prim.t === 'table') { S.mode = calc.mode; return go('modes'); }
    if (prim.t === 'panel') { S.csub = prim.sub; S.hl = null; return go('consts'); }
    if (prim.t === 'const' || prim.t === 'conv') { S.csub = prim.t; S.hl = prim.n; return go('consts'); }
  }
  if (key) {
    if (['up', 'down', 'left', 'right', 'eq', 'ac', 'del'].includes(key.id) && S.tab !== 'keys') return; // don't yank the panel on navigation keys
    if (/^\d$|^dot$/.test(key.id) && key.layer === 'm' && (S.tab !== 'keys' || (S.key && !/^\d$|^dot$/.test(S.key)))) return;
    showKey(key.id, key.layer);
  }
}

/* run a scripted key sequence on the live engine */
async function runSeq(seq, opts = {}) {
  if (S.running) return;
  if (S.tut) exitTut(false);
  S.running = true; closeSheet();
  const c = calc;
  c.menu = null; c.prompt = null; c.err = null; c.contrastScreen = false; c.shift = c.alpha = false; c.msg = null; c.on = true;
  if (opts.comp !== false && c.mode !== 'COMP') { c.setMode('COMP'); c.menu = null; }
  if (c.eqn) c.eqn = null;
  c.tokens = []; c.result = null;
  renderCalcState();
  const evAll = [];
  for (const id of seqIds(seq)) {
    await sleep(opts.fast ? 160 : 340);
    pressAnim(id); const evs = c.press(id); evAll.push(...evs); renderCalcState();
  }
  S.running = false;
  handleEvents(evAll.filter(e => e.t === 'note' || e.t === 'error'), false);
  if (opts.after) opts.after(evAll);
}

/* =============== panel navigation =============== */
function go(tab) {
  if (tab !== 'tuts' && S.tut) exitTut(false);
  if (tab !== 'quiz' && S.quiz) { S.quiz.active = false; S.quiz = null; renderCalcState(); }
  if (tab !== 'games' && S.game) GAMES_UI.close(true);
  S.tab = tab;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const P = $('#panel'); P.style.animation = 'none'; void P.offsetWidth; P.style.animation = '';
  ({ keys: renderKeys, modes: renderModes, setup: renderSetup, tuts: renderTuts, consts: renderConsts, quiz: renderQuiz, games: GAMES_UI.render })[tab]();
  $('#panel').scrollTop = 0; renderPeek();
  $$('#calc .kw.sel').forEach(k => k.classList.remove('sel'));
  if (tab === 'keys' && S.key) { const k = kwEl(S.key); if (k) k.classList.add('sel'); }
}
function showKey(id, layer = 'm') { S.key = id; S.layer = layer; go('keys'); const L = KEYS[id][layer]; quick(`${layer === 's' ? '<b class="c-shift">SHIFT</b> ' : layer === 'a' ? '<b class="c-alpha">ALPHA</b> ' : ''}<b>${L.n}</b> · ${L.t}`); }
function quick(html) { S.quickHTML = html; const q = $('#quick'); q.innerHTML = `<span>${html}</span><button class="btn sm" onclick="document.querySelector('.panel').scrollIntoView({behavior:'smooth'})">להסבר ↓</button>`; q.hidden = false; renderPeek(); }

/* =============== mobile: bottom sheet + bottom nav =============== */
const mq = matchMedia('(max-width: 920px)');
const isMobile = () => mq.matches;
function openSheet() { if (!isMobile()) return; S.sheet = true; $('.panel').classList.add('open'); document.body.classList.add('sheet-open'); }
function closeSheet() { S.sheet = false; $('.panel').classList.remove('open'); document.body.classList.remove('sheet-open'); }
function renderPeek() {
  const c = $('#peek-c'); if (!c) return;
  let h;
  if (S.tut) {
    const T = S.tut, st = T.t.steps[T.i], done = T.pos >= T.seq.length, last = T.i === T.t.steps.length - 1;
    h = `<div class="pk-tut"><div class="pk-top"><b class="pk-n">${T.i + 1}/${T.t.steps.length}</b><span class="pk-t">${st.t}</span></div>
      <div class="pk-row"><div class="pk-seq">${T.seq.map((id, i) => chip(id, i < T.pos ? 'done' : i === T.pos ? 'cur' : '')).join('')}</div>
      <button class="btn sm" data-pk="prev" ${T.i === 0 ? 'disabled' : ''}>→</button><button class="btn sm" data-pk="show" ${done ? 'disabled' : ''}>👁</button><button class="btn sm ${done ? 'pri' : ''}" data-pk="next">${done && last ? '🏁' : '←'}</button></div></div>`;
  } else if (S.quiz && S.quiz.active) h = `<div class="pk-line">★ איפה נמצאת: <b>${S.quiz.q.n}</b> <span class="muted">(${S.quiz.n + 1}/${S.quiz.total} · ${S.quiz.score} נק׳)</span></div>`;
  else if (S.game && GAMES_UI.peek(S.game)) h = `<div class="pk-line">${GAMES_UI.peek(S.game)}</div>`;
  else h = `<div class="pk-line">${S.quickHTML || '👆 לחצו על מקש במחשבון – או משכו למעלה להסברים'}</div>`;
  c.innerHTML = h + `<span class="pk-open">${S.sheet ? '▼' : '▲'}</span>`;
  $$('[data-pk]', c).forEach(b => b.onclick = e => { e.stopPropagation(); const a = b.dataset.pk, T = S.tut;
    if (a === 'prev') setStep(T.i - 1); else if (a === 'show') showMe();
    else { if (T.pos < T.seq.length) T.pos = T.seq.length; if (T.i === T.t.steps.length - 1) finishTut(); else setStep(T.i + 1); } });
  requestAnimationFrame(fitMobile);
}
function fitMobile() {
  const root = document.documentElement;
  if (!isMobile()) { root.style.removeProperty('--cw'); root.style.removeProperty('--peekh'); return; }
  const pk = $('#peek'); const ph = pk.offsetHeight; root.style.setProperty('--peekh', ph + 'px');
  const nav = $('#tabs').offsetHeight; const head = $('.hero').offsetHeight;
  const el = $('#calc'); const ratio = el.offsetHeight / el.offsetWidth || 2.2;
  const avail = innerHeight - head - nav - ph - 22;
  const cw = Math.max(285, Math.min(innerWidth - 20, 440, avail / ratio));
  root.style.setProperty('--cw', cw + 'px');
}
function placeNav() {
  const nav = $('#tabs');
  if (isMobile()) { if (nav.parentElement !== document.body) document.body.appendChild(nav); }
  else { const p = $('.panel'); if (nav.parentElement !== p) p.prepend(nav); closeSheet(); }
  fitMobile();
}

/* chip for a key id */
function chip(id, extra = '') {
  if (id === 'shift') return `<kbd class="k shift ${extra}">SHIFT</kbd>`;
  if (id === 'alpha') return `<kbd class="k alpha ${extra}">ALPHA</kbd>`;
  const k = KEYS[id]; if (!k) return `<kbd class="k">${id}</kbd>`;
  const lab = k.kind === 'round' ? k.lab : k.lab;
  return `<kbd class="k ${k.kind === 'pad' ? 'padk' : k.kind} ${extra}" data-k="${id}">${lab}</kbd>`;
}
const seqChips = (seq, cls) => seqIds(seq).map((id, i) => chip(id, cls ? cls(i) : '')).join('');

/* ---------- KEYS tab ---------- */
function renderKeys() {
  const P = $('#panel');
  if (!S.key) {
    const group = (t, ids) => `<h3>${t}</h3><div class="keygrid">${ids.map(id => `<span data-go="${id}">${chip(id)}</span>`).join('')}</div>`;
    P.innerHTML = `<div class="welcome">
      <div><h2>ברוכים הבאים למחשבון 👋</h2><p class="lead">זה סימולטור חי של ה-fx-991ES PLUS. כל לחיצה על מקש במחשבון <b>מבצעת</b> את הפעולה וגם <b>מסבירה</b> אותה כאן. נסו!</p></div>
      <div class="cta"><div class="big">👈</div><div><b>התחילו מ-MODE</b> – לחצו על הכפתור העגול <b>MODE</b> (למעלה מימין במחשבון) וראו את כל 8 מצבי העבודה. או הקלידו <kbd class="k num">2</kbd><kbd class="k num">+</kbd><kbd class="k num">3</kbd><kbd class="k num">=</kbd>.</div></div>
      <h3>איך קוראים את המקשים?</h3>
      <div class="legend">
        <div class="lg"><i class="sw" style="background:#fff"></i><div><b>הכיתוב על המקש</b><span>לחיצה רגילה.</span></div></div>
        <div class="lg"><i class="sw" style="background:var(--shift)"></i><div><b class="c-shift">צהוב – SHIFT</b><span>לוחצים SHIFT ואז המקש.</span></div></div>
        <div class="lg"><i class="sw" style="background:var(--alpha)"></i><div><b class="c-alpha">אדום – ALPHA</b><span>משתנים A–F, X, Y, M ועוד.</span></div></div>
        <div class="lg"><i class="sw" style="background:var(--mode)"></i><div><b class="c-mode">כחול – BASE-N</b><span>DEC/HEX/BIN/OCT במצב בסיסים.</span></div></div>
        <div class="lg"><i class="sw" style="background:var(--brk)"></i><div><b style="color:#c8b6ff">סוגר סגול</b><span>תפריט שפעיל רק במצב המתאים (STAT, MATRIX…).</span></div></div>
      </div>
      ${group('מקשי בקרה', ['shift', 'alpha', 'mode', 'on', 'up', 'down', 'left', 'right', 'del', 'ac'])}
      ${group('פונקציות', ['calc', 'integ', 'inv', 'logab', 'frac', 'sqrt', 'sq', 'pow', 'log', 'ln', 'neg', 'dms', 'hyp', 'sin', 'cos', 'tan', 'rcl', 'eng', 'lp', 'rp', 'sd', 'mp'])}
      ${group('ספרות ופעולות', ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', 'dot', 'exp', 'mul', 'div', 'add', 'sub', 'ans', 'eq'])}
    </div>`;
    $$('[data-go]', P).forEach(e => e.onclick = () => showKey(e.dataset.go));
    return;
  }
  const k = KEYS[S.key];
  const layers = ['m', 's', 'a'].filter(l => k[l]);
  P.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn sm" id="back">→ כל המקשים</button><span class="muted">טיפ: עברו עם העכבר על מקש כדי לראות את שלוש הפונקציות שלו</span></div>
    <div class="kd-head">${chip(S.key, 'kd-key')}<div><h2>${k.m.n}</h2><div class="muted">${layers.length === 1 ? 'פונקציה אחת' : layers.length + ' פונקציות'} על המקש הזה${k.mcap ? ' + ' + k.mcap + ' במצב BASE-N' : ''}</div></div></div>
    <div class="layers">${layers.map(l => layerHTML(k, l)).join('')}</div>`;
  $('#back').onclick = () => { S.key = null; go('keys'); };
  bindExamples(P);
  const on = P.querySelector('.layer.on'); if (on && S.layer !== 'm') on.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function layerHTML(k, l) {
  const L = k[l], meta = LAYER[l];
  const how = l === 'm' ? chip(S.key) : `${chip(l === 's' ? 'shift' : 'alpha')} ${chip(S.key)}`;
  return `<div class="layer ${S.layer === l ? 'on' : ''}" style="--c:${meta.c}">
    <div class="lh"><span class="lt">${L.t}</span><span class="how">${how}</span></div>
    <div class="ld">${L.d}</div>
    ${L.mode && l === 'm' ? `<div class="note">${L.mode}</div>` : ''}
    ${L.only ? `<div class="note only">🔒 פעיל רק במצב <b>${L.only}</b></div>` : ''}
    ${(L.ex || []).map(ex => exHTML(ex)).join('')}
    ${L.tut ? `<div class="row" style="margin-top:10px"><button class="btn sm" data-tut="${L.tut}">▶ מדריך: ${TUTS.find(t => t.id === L.tut).t}</button></div>` : ''}
  </div>`;
}
function exHTML(ex) { return `<div class="ex"><div class="seq">${seqChips(ex.k)}</div><div class="res">← <b>${ex.r}</b></div><button class="btn sm pri" data-run="${ex.k}">▶ הרץ</button></div>`; }
function bindExamples(P) {
  $$('[data-run]', P).forEach(b => b.onclick = () => runSeq(b.dataset.run, { comp: !b.dataset.nocomp }));
  $$('[data-tut]', P).forEach(b => b.onclick = () => openTut(b.dataset.tut));
}

/* ---------- MODES tab ---------- */
function renderModes() {
  const P = $('#panel');
  P.innerHTML = `<h2>8 מצבי העבודה</h2><p class="lead">לחיצה על <kbd class="k round">MODE</kbd> פותחת את הרשימה; בוחרים במספר. המצב הנוכחי מסומן. בחרו מצב כדי ללמוד עליו:</p>
    <div class="mgrid">${MODES.map(m => `<div class="mcard ${S.mode === m.id ? 'on' : ''}" style="--c:${m.color}" data-m="${m.id}"><span class="num">${m.n}</span><div class="ic">${m.icon}</div><div class="mn">${m.id}</div><div class="mh">${m.heb}</div>${calc.mode === m.id ? '<span class="cur">פעיל</span>' : ''}</div>`).join('')}</div>
    <div id="mdetail"></div>`;
  $$('.mcard', P).forEach(c => c.onclick = () => { S.mode = c.dataset.m; renderModes(); $('#mdetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  if (!S.mode) return;
  const m = MODES.find(x => x.id === S.mode);
  const list = (title, items) => `<h3>${title}</h3><ul class="mlist">${items.map(([a, b]) => `<li><code>${a}</code><span>${b}</span></li>`).join('')}</ul>`;
  $('#mdetail').innerHTML = `<div class="mdetail" style="--c:${m.color}">
    <div class="mt"><div class="ic">${m.icon}</div><div><h2 style="margin:0">${m.n}: ${m.id} <span class="muted" style="font-size:16px">– ${m.heb}</span></h2>
      <div class="row" style="margin-top:6px">${chip('mode')} ${chip(String(m.n))} ${m.ind ? `<span class="muted">במסך יופיע</span> <span class="ind">${m.ind}</span>` : ''}</div></div></div>
    <p class="ld" style="margin:14px 0 0">${m.d}</p>
    ${m.tips ? `<ul style="color:var(--ink2);font-size:14px">${m.tips.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
    ${m.sub ? list(m.sub.title, m.sub.items) : ''}
    ${m.menu ? list(m.menu.title, m.menu.items) : ''}
    ${m.extra ? list('עוד דברים חשובים', m.extra) : ''}
    <h3>מדריכים צעד-אחר-צעד</h3><div class="chips">${m.tuts.map(t => { const T = TUTS.find(x => x.id === t); return `<button class="chip" data-tut="${t}">${T.icon} ${T.t}</button>`; }).join('')}</div>
    <div class="row" style="margin-top:16px"><button class="btn pri" data-run="mode ${m.n}" data-nocomp="1">⚡ עבור למצב ${m.id} במחשבון</button></div>
  </div>`;
  bindExamples($('#mdetail'));
}

/* ---------- SETUP tab ---------- */
function renderSetup() {
  const P = $('#panel'); const s = calc.setup;
  const now = [['קלט/פלט', s.io === 'Line' ? 'LineIO' : 'MthIO · ' + s.io], ['זווית', { D: 'Deg', R: 'Rad', G: 'Gra' }[s.angle]], ['מספרים', s.fmt.t + ' ' + s.fmt.n], ['שברים', s.frac], ['מרוכבים', s.cplx], ['FREQ', s.freq ? 'ON' : 'OFF'], ['Disp', s.disp]];
  const item = it => `<div class="sitem ${S.setupHL === it.id ? 'on' : ''}" id="set-${it.id.replace('/', '')}"><div class="sn"><small>${it.page === 2 ? '▼ ' : ''}${it.n}</small>${it.lab}</div><div><div class="st">${it.t}</div><div class="sd">${it.d}</div>
    <div class="row" style="margin-top:8px"><span style="direction:ltr;display:inline-flex;gap:2px">${chip('shift')}${chip('mode')}${it.page === 2 ? chip('down') : ''}${chip(it.n)}</span><button class="btn sm" data-run="shift mode ${it.page === 2 ? 'down ' : ''}${it.n}" data-nocomp="1">⚡ נסו</button></div></div></div>`;
  P.innerHTML = `<h2>הגדרות – SETUP</h2><p class="lead">${chip('shift')} ${chip('mode')} פותחים את ההגדרות. יש <b>שני עמודים</b> – ${chip('down')} עובר לעמוד השני. ההגדרות נשמרות גם אחרי כיבוי, ואיפוס מלא: SHIFT 9 3 = AC.</p>
    <div class="setup-now">${now.map(([a, b]) => `<span>${a}: <b>${b}</b></span>`).join('')}</div>
    <div class="page-h">עמוד 1</div><div class="sgrid">${SETUP.filter(x => x.page === 1).map(item).join('')}</div>
    <div class="page-h">עמוד 2 (▼)</div><div class="sgrid">${SETUP.filter(x => x.page === 2).map(item).join('')}</div>
    <h3>מדריכים קשורים</h3><div class="chips">${['t-reset', 't-angle', 't-fix', 't-mathio', 't-freq'].map(t => { const T = TUTS.find(x => x.id === t); return `<button class="chip" data-tut="${t}">${T.icon} ${T.t}</button>`; }).join('')}</div>`;
  $$('[data-run]', P).forEach(b => b.onclick = () => runSeq(b.dataset.run, { comp: false, after: () => { const evs = []; toast('בחרו אפשרות על גבי המחשבון 👆 (או AC ליציאה)'); } }));
  $$('[data-tut]', P).forEach(b => b.onclick = () => openTut(b.dataset.tut));
  if (S.setupHL) { const el = $('#set-' + S.setupHL.replace('/', '')); if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); }
}

/* ---------- TUTORIALS ---------- */
function renderTuts() {
  const P = $('#panel');
  if (S.tut) return renderPlayer();
  const done = store.get('done', []);
  const cats = ['הכל', ...new Set(TUTS.map(t => t.cat))];
  const list = TUTS.filter(t => S.tcat === 'הכל' || t.cat === S.tcat);
  P.innerHTML = `<h2>מדריכים צעד-אחר-צעד</h2><p class="lead">בכל מדריך: המקשים שצריך ללחוץ <b>מסומנים במספרים על המחשבון</b>. לחצו עליהם בעצמכם – או "הראה לי" וצפו. המסך מראה בדיוק מה תראו במחשבון האמיתי.</p>
    <div class="chips">${cats.map(c => `<button class="chip ${S.tcat === c ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('')}</div>
    <div class="tgrid">${list.map(t => `<div class="tcard ${done.includes(t.id) ? 'done' : ''}" data-tut="${t.id}"><div class="ti">${done.includes(t.id) ? '✓' : t.icon}</div><div><div class="tt">${t.t}</div><div class="ts">${t.sub}</div><span class="tc">${t.cat} · ${t.steps.length} שלבים</span></div></div>`).join('')}</div>
    <p class="muted" style="margin-top:14px">השלמתם ${done.length} מתוך ${TUTS.length} מדריכים.</p>`;
  $$('[data-cat]', P).forEach(b => b.onclick = () => { S.tcat = b.dataset.cat; renderTuts(); });
  $$('[data-tut]', P).forEach(b => b.onclick = () => openTut(b.dataset.tut));
}
function openTut(id) {
  const t = TUTS.find(x => x.id === id);
  S.tut = { t, i: 0, seq: seqIds(t.steps[0].k), pos: 0, fb: '' };
  if (S.tab !== 'tuts') { S.tab = 'tuts'; $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === 'tuts')); }
  $$('#calc .kw.sel').forEach(k => k.classList.remove('sel'));
  renderPlayer(); renderCalcState(); placeBadges();
  if (isMobile()) closeSheet(); else $('#panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function exitTut(rerender = true) {
  S.tut = null; clearBadges(); renderCalcState(); if (rerender) renderTuts();
}
function setStep(i) {
  const T = S.tut; T.i = Math.max(0, Math.min(T.t.steps.length - 1, i)); T.seq = seqIds(T.t.steps[T.i].k); T.pos = 0; T.fb = '';
  renderPlayer(); renderCalcState(); placeBadges();
}
function renderPlayer() {
  const T = S.tut, t = T.t, st = t.steps[T.i]; const done = T.pos >= T.seq.length; const last = T.i === t.steps.length - 1;
  const P = $('#panel');
  P.innerHTML = `<div class="player">
    <div class="ph"><div class="ti">${t.icon}</div><div style="flex:1"><h2 style="margin:0">${t.t}</h2><div class="muted">${t.sub}</div></div><button class="btn sm" id="t-exit">✕ יציאה</button></div>
    <div class="prog">${t.steps.map((_, i) => `<i class="${i < T.i || (i === T.i && done) ? 'd' : ''} ${i === T.i ? 'c' : ''}" data-i="${i}" title="שלב ${i + 1}"></i>`).join('')}</div>
    <div class="step">
      <div class="sh"><span class="n">${T.i + 1}</span>שלב ${T.i + 1} מתוך ${t.steps.length}</div>
      <div class="stx">${st.t}</div>
      <div class="seqbox">${T.seq.map((id, i) => chip(id, i < T.pos ? 'done' : i === T.pos ? 'cur' : '')).join('')}</div>
      <div class="fb ${T.fbc || ''}" id="t-fb">${T.fb || (done ? '' : '👆 לחצו על המקשים המסומנים במחשבון – לפי הסדר')}</div>
      <div class="pctl"><button class="btn" id="t-prev" ${T.i === 0 ? 'disabled' : ''}>→ הקודם</button>
        <button class="btn" id="t-show" ${done ? 'disabled' : ''}>👁 הראה לי</button><span class="sp"></span>
        ${done && last ? '<button class="btn pri" id="t-fin">🏁 סיום</button>' : `<button class="btn ${done ? 'pri' : ''}" id="t-next">${done ? 'הבא ←' : 'דלג ←'}</button>`}</div>
    </div>
    ${done && last ? `<div class="celebrate"><div class="e">🎉</div>סיימתם את המדריך!</div>` : ''}
    <div class="steplist">${t.steps.map((s, i) => `<div class="${i === T.i ? 'c' : ''} ${i < T.i ? 'd' : ''}" data-i="${i}"><b>${i < T.i ? '✓' : i + 1}</b><span>${s.t}</span></div>`).join('')}</div>
  </div>`;
  $('#t-exit').onclick = () => exitTut();
  $('#t-prev').onclick = () => setStep(T.i - 1);
  const nx = $('#t-next'); if (nx) nx.onclick = () => { if (!done) { T.pos = T.seq.length; } if (last) { finishTut(); return; } setStep(T.i + 1); };
  const fin = $('#t-fin'); if (fin) fin.onclick = () => { finishTut(); };
  $('#t-show').onclick = showMe;
  $$('[data-i]', P).forEach(e => e.onclick = () => setStep(+e.dataset.i));
  if (done && last) markDone(t.id);
}
function markDone(id) { const d = store.get('done', []); if (!d.includes(id)) { d.push(id); store.set('done', d); } }
function finishTut() { markDone(S.tut.t.id); exitTut(); toast('🏆 כל הכבוד! המדריך סומן כהושלם.'); }
function clearBadges() { $$('#calc .badge').forEach(b => b.remove()); $$('#calc .kw.reveal').forEach(k => k.classList.remove('reveal')); }
function placeBadges() {
  clearBadges(); const T = S.tut; if (!T) return;
  const map = {};
  T.seq.forEach((id, i) => (map[id] = map[id] || []).push(i));
  for (const id in map) {
    const kw = kwEl(id); if (!kw) continue;
    const idx = map[id]; const allDone = idx.every(i => i < T.pos); const isNext = idx.includes(T.pos);
    const shown = idx.filter(i => i >= T.pos).map(i => i + 1);
    const b = document.createElement('span'); b.className = 'badge' + (allDone ? ' done' : '') + (isNext ? ' next' : '');
    b.textContent = allDone ? '✓' : (shown.length > 3 ? shown.slice(0, 3).join(',') + '…' : shown.join(','));
    kw.appendChild(b);
  }
}
function stepAdvance() {
  const T = S.tut; T.pos++;
  if (T.pos >= T.seq.length) { T.fb = '✓ מעולה! ככה זה נראה במסך.'; T.fbc = 'ok'; }
  else { T.fb = ''; T.fbc = ''; }
  renderPlayer(); renderCalcState(); placeBadges();
}
function tutPress(id) {
  const T = S.tut; pressAnim(id);
  if (T.pos >= T.seq.length) { toast('השלב הושלם – לחצו "הבא ←" להמשך'); return; }
  const exp = T.seq[T.pos];
  if (id === exp) return stepAdvance();
  const kw = kwEl(id); kw.classList.remove('shake'); void kw.offsetWidth; kw.classList.add('shake');
  const ek = kwEl(exp); ek.classList.add('reveal'); setTimeout(() => ek.classList.remove('reveal'), 1100);
  T.fb = `לא בדיוק 🙂 המקש הבא הוא ${chip(exp)}`; T.fbc = 'bad';
  const fb = $('#t-fb'); if (fb) { fb.innerHTML = T.fb; fb.className = 'fb bad'; }
}
async function showMe() {
  const T = S.tut; if (S.running) return; S.running = true;
  while (S.tut === T && T.pos < T.seq.length) { await sleep(380); if (S.tut !== T) break; pressAnim(T.seq[T.pos]); stepAdvance(); }
  S.running = false;
}

/* ---------- CONSTANTS & CONVERSIONS ---------- */
function fmtSci(v) { if (v === 0) return '0'; const a = Math.abs(v); if (a >= 1e-3 && a < 1e10) return String(+v.toPrecision(10)); const [m, e] = v.toExponential(9).split('e'); return `${+m}×10<sup>${+e}</sup>`; }
function renderConsts() {
  const P = $('#panel'); const f = S.cfilter.trim().toLowerCase();
  const isC = S.csub === 'const';
  const rowsC = CONSTS.filter(r => !f || (r[0] + r[1] + r[2] + r[4]).toLowerCase().includes(f));
  const val = parseFloat(S.convVal); const okv = isFinite(val);
  const rowsV = CONVS.filter(r => !f || (r[0] + r[1] + r[2]).toLowerCase().includes(f));
  P.innerHTML = `<h2>קבועים והמרות</h2>
    <div class="subtabs"><button class="chip ${isC ? 'on' : ''}" data-sub="const">ℏ 40 קבועים (SHIFT 7)</button><button class="chip ${!isC ? 'on' : ''}" data-sub="conv">⇄ 40 המרות (SHIFT 8)</button></div>
    <p class="lead">${isC ? `${chip('shift')}${chip('7')} ואז <b>מספר דו-ספרתי</b>. למשל 28 = מהירות האור. לחצו "הכנס" כדי לראות את זה במחשבון.` : `מקלידים ערך, ואז ${chip('shift')}${chip('8')} ו<b>מספר דו-ספרתי</b> של ההמרה. הטבלה מחשבת בשבילכם את הערך שתבחרו:`}</p>
    <div class="ctools"><input id="cf" type="search" placeholder="סינון…" value="${S.cfilter}">${!isC ? `<label class="muted">ערך: <input id="cv" class="num" value="${S.convVal}" inputmode="decimal"></label>` : ''}</div>
    <table class="ctable">${isC ? rowsC.map(r => `<tr class="${S.hl === r[0] ? 'hl' : ''}" id="c-${r[0]}"><td>${r[0]}</td><td class="sym">${r[1]}</td><td>${r[2]}</td><td class="val">${fmtSci(r[3])} <span class="muted hide-sm">${r[4]}</span></td><td><button class="btn sm" data-run="shift 7 ${r[0][0]} ${r[0][1]} eq">הכנס ▶</button></td></tr>`).join('')
      : rowsV.map(r => `<tr class="${S.hl === r[0] ? 'hl' : ''}" id="c-${r[0]}"><td>${r[0]}</td><td class="sym">${r[1]}</td><td class="hide-sm">${r[2]}</td><td class="val">${okv ? fmtSci(+r[3](val).toPrecision(10)) : '—'}</td><td><button class="btn sm" data-conv="${r[0]}">חשב ▶</button></td></tr>`).join('')}</table>`;
  $$('[data-sub]', P).forEach(b => b.onclick = () => { S.csub = b.dataset.sub; S.hl = null; renderConsts(); });
  const cf = $('#cf'); cf.oninput = () => { S.cfilter = cf.value; const pos = cf.selectionStart; renderConsts(); const n = $('#cf'); n.focus(); n.setSelectionRange(pos, pos); };
  const cv = $('#cv'); if (cv) cv.oninput = () => { S.convVal = cv.value; $$('.ctable tr', P).forEach((tr, i) => { const r = rowsV[i]; const v = parseFloat(cv.value); tr.querySelector('.val').innerHTML = isFinite(v) ? fmtSci(+r[3](v).toPrecision(10)) : '—'; }); };
  $$('[data-run]', P).forEach(b => b.onclick = () => runSeq(b.dataset.run));
  $$('[data-conv]', P).forEach(b => b.onclick = () => {
    const v = String(S.convVal).trim(); if (!isFinite(parseFloat(v))) return toast('הקלידו ערך מספרי');
    const keys = [...v].map(ch => ch === '-' ? 'neg' : ch === '.' ? 'dot' : ch).filter(x => /^(\d|neg|dot)$/.test(x)).join(' ');
    const n = b.dataset.conv; runSeq(`${keys} shift 8 ${n[0]} ${n[1]} eq`);
  });
  if (S.hl) { const el = $('#c-' + S.hl); if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); }
}

/* ---------- QUIZ ---------- */
function quizPool() {
  const pool = [];
  for (const id in KEYS) for (const l of ['m', 's', 'a']) {
    const L = KEYS[id][l]; if (!L) continue;
    if (['shift', 'alpha'].includes(id)) continue;
    if (l === 'm' && (/^\d$/.test(id) || ['dot', 'eq', 'add', 'sub', 'mul', 'div', 'up', 'down', 'left', 'right', 'lp', 'rp'].includes(id))) continue;
    pool.push({ id, l, n: L.n, t: L.t });
  }
  return pool;
}
function renderQuiz() {
  const P = $('#panel'); const Q = S.quiz; const best = store.get('best', 0);
  if (!Q || !Q.active) {
    const fin = Q && Q.finished;
    P.innerHTML = `<div class="quiz"><h2>★ אתגר: איפה המקש?</h2><p class="lead">אנחנו נותנים שם של פונקציה – אתם לוחצים עליה במחשבון. אם היא בצהוב, לחצו קודם ${chip('shift')}; אם באדום – ${chip('alpha')}. 10 שאלות. מוכנים?</p>
      ${fin ? `<div class="qbox"><div style="font-size:48px">${Q.score >= 8 ? '🏆' : Q.score >= 5 ? '👏' : '💪'}</div><div class="qf">${Q.score}/${Q.total}</div><div class="qd">${Q.score >= 8 ? 'מקצוענים! אתם מכירים את המחשבון בעל-פה.' : Q.score >= 5 ? 'יפה מאוד! עוד סיבוב ואתם שם.' : 'זה בדיוק בשביל זה יש לנו מדריכים 🙂 נסו שוב!'}</div></div>` : ''}
      <div class="qstats"><div><b>${best}</b><span>שיא אישי</span></div><div><b>${quizPool().length}</b><span>פונקציות במאגר</span></div></div>
      <div class="row" style="justify-content:center;margin-top:18px"><button class="btn pri" id="q-start">${fin ? 'סיבוב נוסף' : 'התחל'} ▶</button></div></div>`;
    $('#q-start').onclick = startQuiz; return;
  }
  const q = Q.q;
  P.innerHTML = `<div class="quiz"><div class="qstats"><div><b>${Q.n + 1}/${Q.total}</b><span>שאלה</span></div><div><b>${Q.score}</b><span>נקודות</span></div><div><b>${Q.streak}🔥</b><span>רצף</span></div></div>
    <div class="qbox"><div class="qq">איפה נמצאת הפונקציה…</div><div class="qf">${q.n}</div><div class="qd">${q.t}</div>
      <div class="qmod"><kbd class="k shift ${Q.mod === 's' ? 'on' : ''}">SHIFT</kbd><kbd class="k alpha ${Q.mod === 'a' ? 'on' : ''}">ALPHA</kbd></div>
      <div class="qfb ${Q.fbc || ''}" id="q-fb">${Q.fb || ''}</div></div>
    <div class="row" style="justify-content:center"><button class="btn sm" id="q-hint">💡 רמז</button><button class="btn sm" id="q-skip">דלג</button><button class="btn sm" id="q-stop">סיום</button></div></div>`;
  $('#q-hint').onclick = () => { Q.fb = q.l === 's' ? 'רמז: זה בצהוב – צריך SHIFT' : q.l === 'a' ? 'רמז: זה באדום – צריך ALPHA' : 'רמז: זה הכיתוב על המקש עצמו'; Q.fbc = ''; renderQuiz(); };
  $('#q-skip').onclick = () => quizAnswer(false, true);
  $('#q-stop').onclick = () => { Q.active = false; Q.finished = true; renderQuiz(); renderCalcState(); };
}
function startQuiz() {
  const pool = quizPool().sort(() => Math.random() - 0.5);
  S.quiz = { active: true, qs: pool.slice(0, 10), n: 0, total: 10, score: 0, streak: 0, mod: 'm', fb: '', locked: false };
  S.quiz.q = S.quiz.qs[0]; renderQuiz(); renderCalcState(); closeSheet();
}
function quizPress(id) {
  const Q = S.quiz; if (Q.locked) return;
  if (id === 'shift') { Q.mod = Q.mod === 's' ? 'm' : 's'; renderQuiz(); renderCalcState(); return; }
  if (id === 'alpha') { Q.mod = Q.mod === 'a' ? 'm' : 'a'; renderQuiz(); renderCalcState(); return; }
  quizAnswer(id === Q.q.id && Q.mod === Q.q.l);
}
function quizAnswer(ok, skipped) {
  const Q = S.quiz; Q.locked = true;
  if (ok) { Q.score++; Q.streak++; Q.fb = ['✓ נכון!', '✓ מצוין!', '✓ בול!', '✓ אלופים!'][Math.floor(Math.random() * 4)]; Q.fbc = 'ok'; }
  else {
    Q.streak = 0; const how = Q.q.l === 's' ? 'SHIFT + ' : Q.q.l === 'a' ? 'ALPHA + ' : '';
    Q.fb = (skipped ? 'הנה הוא: ' : '✗ לא – זה ') + how + `<span style="direction:ltr;display:inline-block">${strip(KEYS[Q.q.id].lab)}</span>`; Q.fbc = 'bad';
    const kw = kwEl(Q.q.id); kw.classList.add('reveal'); setTimeout(() => kw.classList.remove('reveal'), 1700);
  }
  Q.mod = 'm'; renderQuiz(); renderCalcState();
  setTimeout(() => {
    if (S.quiz !== Q) return;
    Q.n++; Q.fb = ''; Q.locked = false;
    if (Q.n >= Q.total) { Q.active = false; Q.finished = true; if (Q.score > store.get('best', 0)) store.set('best', Q.score); }
    else Q.q = Q.qs[Q.n];
    renderQuiz(); renderCalcState();
  }, ok ? 900 : 1900);
}

/* =============== search =============== */
const IDX = [];
for (const id in KEYS) for (const l of ['m', 's', 'a']) { const L = KEYS[id][l]; if (!L || (l === 'm' && /^\d$/.test(id))) continue; IDX.push({ tag: l === 'm' ? 'מקש' : l === 's' ? 'SHIFT' : 'ALPHA', t: L.n + ' – ' + L.t, d: strip(L.d), go: () => showKey(id, l) }); }
MODES.forEach(m => IDX.push({ tag: 'מצב', t: m.id + ' – ' + m.heb, d: strip(m.d) + ' ' + [...(m.sub ? m.sub.items : []), ...(m.menu ? m.menu.items : []), ...(m.extra || [])].map(x => x.join(' ')).join(' '), go: () => { S.mode = m.id; go('modes'); } }));
SETUP.forEach(s => IDX.push({ tag: 'הגדרה', t: s.lab + ' – ' + s.t, d: strip(s.d), go: () => { S.setupHL = s.id; go('setup'); } }));
TUTS.forEach(t => IDX.push({ tag: 'מדריך', t: t.t, d: t.sub + ' ' + t.steps.map(s => strip(s.t)).join(' '), go: () => openTut(t.id) }));
CONSTS.forEach(c => IDX.push({ tag: 'קבוע ' + c[0], t: c[1] + ' – ' + c[2], d: c[4], go: () => { S.csub = 'const'; S.hl = c[0]; go('consts'); } }));
CONVS.forEach(c => IDX.push({ tag: 'המרה ' + c[0], t: c[1] + ' – ' + c[2], d: '', go: () => { S.csub = 'conv'; S.hl = c[0]; go('consts'); } }));
function doSearch() {
  const q = $('#search').value.trim().toLowerCase(); const box = $('#search-res');
  if (!q) { box.hidden = true; return; }
  const words = q.split(/\s+/);
  const res = IDX.map(x => { const tt = x.t.toLowerCase(), dd = x.d.toLowerCase(); let sc = 0; for (const w of words) { if (tt.includes(w)) sc += 3; else if (dd.includes(w)) sc += 1; else return null; } return [sc, x]; }).filter(Boolean).sort((a, b) => b[0] - a[0]).slice(0, 14);
  box.hidden = false;
  box.innerHTML = res.length ? res.map(([, x], i) => `<div class="sr" data-i="${i}"><span class="tag">${x.tag}</span><div><div class="t">${x.t}</div>${x.d ? `<div class="d">${x.d.slice(0, 90)}${x.d.length > 90 ? '…' : ''}</div>` : ''}</div></div>`).join('') : '<div class="sr"><div class="d">לא נמצא… נסו מילה אחרת</div></div>';
  $$('.sr[data-i]', box).forEach(e => e.onclick = () => { res[+e.dataset.i][1].go(); box.hidden = true; $('#search').value = ''; $('#search').blur(); if (isMobile()) openSheet(); else $('.panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

/* =============== keyboard =============== */
const KB = { '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '.': 'dot', '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '(': 'lp', ')': 'rp', '^': 'pow', Enter: 'eq', '=': 'eq', Backspace: 'del', Escape: 'ac', Delete: 'ac', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
document.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const id = KB[e.key]; if (!id) return;
  e.preventDefault(); userPress(id);
});

/* =============== init =============== */
buildCalc();
$$('#tabs button').forEach(b => b.onclick = () => {
  if (isMobile() && S.sheet && S.tab === b.dataset.tab) { closeSheet(); renderPeek(); return; }
  if (!isMobile() || S.sheet) { if (b.dataset.tab === 'keys' && S.tab === 'keys') S.key = null; if (b.dataset.tab === 'modes' && S.tab === 'modes') S.mode = null; }
  if (b.dataset.tab === 'games' && S.tab === 'games' && S.game && (!isMobile() || S.sheet)) GAMES_UI.close(true);
  go(b.dataset.tab); openSheet(); renderPeek();
});
$('#peek').addEventListener('click', e => { if (e.target.closest('button') || justDragged) return; S.sheet ? closeSheet() : openSheet(); renderPeek(); });
$('#scrim').onclick = () => { closeSheet(); renderPeek(); };
/* finger-following drag for the bottom sheet */
let drag = null, justDragged = false;
const panelEl = $('.panel'), scrimEl = $('#scrim'), bodyEl = $('#panel');
const closedOff = () => panelEl.offsetHeight - $('#peek').offsetHeight;
function dragStart(y, fromBody) { if (!isMobile()) return; drag = { y0: y, base: S.sheet ? 0 : closedOff(), R: closedOff(), off: null, moved: false, fromBody, hist: [[y, performance.now()]] }; }
function dragMove(y, e) {
  if (!drag) return;
  const dy = y - drag.y0;
  if (!drag.moved) {
    if (Math.abs(dy) < 6) return;
    if (drag.fromBody && (dy < 0 || bodyEl.scrollTop > 0)) { drag = null; return; } // let the content scroll
    drag.moved = true; panelEl.style.transition = 'none'; scrimEl.style.transition = 'none'; document.body.classList.add('sheet-open');
  }
  if (e.cancelable) e.preventDefault();
  let off = drag.base + dy;
  if (off < 0) off = off / 4; // soft rubber-band past fully open
  off = Math.min(off, drag.R);
  drag.off = off; panelEl.style.transform = `translateY(${off}px)`;
  scrimEl.style.opacity = String(Math.max(0, Math.min(1, 1 - off / drag.R)));
  drag.hist.push([y, performance.now()]); if (drag.hist.length > 5) drag.hist.shift();
}
function dragEnd() {
  if (!drag) return; const d = drag; drag = null;
  if (!d.moved) return;
  const [y1, t1] = d.hist[0], [y2, t2] = d.hist[d.hist.length - 1];
  const v = (y2 - y1) / Math.max(1, t2 - t1); // px per ms, + = downward
  const projected = d.off + v * 220;
  panelEl.style.transition = ''; scrimEl.style.transition = '';
  panelEl.style.transform = ''; scrimEl.style.opacity = '';
  if (Math.abs(v) > 0.5 ? v < 0 : projected < d.R / 2) openSheet(); else closeSheet();
  justDragged = true; setTimeout(() => { justDragged = false; }, 80);
  renderPeek();
}
$('#peek').addEventListener('touchstart', e => dragStart(e.touches[0].clientY, false), { passive: true });
bodyEl.addEventListener('touchstart', e => { if (S.sheet && bodyEl.scrollTop <= 0) dragStart(e.touches[0].clientY, true); }, { passive: true });
document.addEventListener('touchmove', e => { if (drag) dragMove(e.touches[0].clientY, e); }, { passive: false });
document.addEventListener('touchend', dragEnd); document.addEventListener('touchcancel', dragEnd);
mq.addEventListener('change', placeNav); addEventListener('resize', fitMobile);
placeNav();
$('#btn-flip').onclick = () => setFlip(!S.flip);
function setFlip(v) { S.flip = v; $('#lcd').classList.toggle('flip', v); $('#btn-flip').classList.toggle('on', v); }
window.APP = { calc, runSeq, toast, chip, seqChips, sleep, kwEl, pressAnim, setFlip, closeSheet,
  renderCalc: renderCalcState, panel: () => $('#panel'), game: () => S.game, busy: () => S.running,
  setGame: g => { S.game = g; renderPeek(); }, rerenderGame: () => { if (S.tab === 'games') GAMES_UI.render(); renderPeek(); },
  shake: id => { const k = kwEl(id); if (k) { k.classList.remove('shake'); void k.offsetWidth; k.classList.add('shake'); } },
  decimal: () => { if (calc.result) { calc.result.view = 'dec'; renderCalcState(); } } };
$('#search').addEventListener('input', doSearch);
$('#search').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('#search-res .sr[data-i]'); if (f) f.click(); } if (e.key === 'Escape') { $('#search-res').hidden = true; } });
document.addEventListener('click', e => { if (!e.target.closest('.search')) $('#search-res').hidden = true; });
$('#btn-sound').textContent = soundOn ? '🔊' : '🔇';
$('#btn-sound').onclick = () => { soundOn = !soundOn; store.set('sound', soundOn); $('#btn-sound').textContent = soundOn ? '🔊' : '🔇'; };
$('#btn-reset').onclick = () => { if (S.tut) exitTut(false); const c = calc; c.setup = { ...c.setup, io: 'MathO', angle: 'D', fmt: { t: 'Norm', n: 1 }, frac: 'd/c', cplx: 'a+bi', freq: false, disp: 'Dot', contrast: 5 }; c.reset(); c.on = true; renderCalcState(); toast('הסימולטור אופס'); if (S.tab === 'setup') renderSetup(); };
renderCalcState();
go('keys');
const hash = location.hash.slice(1); if (hash && TUTS.find(t => t.id === hash)) openTut(hash);
})();
