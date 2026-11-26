/* fx-991ES PLUS simulator engine.
   Supports COMP (full expression parser), EQN, TABLE, BASE-N, all menus/SETUP/CLR/CONST/CONV, STO/RCL/M+, CALC, SOLVE.
   CMPLX / STAT / MATRIX / VECTOR show their menus; full walkthroughs live in the tutorials. */
(function (global) {
'use strict';

/* ---------- token table ---------- */
const TK = {};
function def(id, d, k, x) { TK[id] = { id, d, k, ...(x || {}) }; }
'0123456789'.split('').forEach(c => def(c, c, 'dig'));
def('.', '.', 'dig');
'ABCDEF'.split('').forEach(c => def('h' + c, c, 'dig', { hex: true }));
def('+', '+', 'op'); def('-', '−', 'op'); def('*', '×', 'op'); def('/', '÷', 'op');
def('^', '^', 'op'); def('frac', '⌟', 'op'); def('nPr', 'P', 'op'); def('nCr', 'C', 'op'); def('xroot', 'ˣ√', 'op');
def('and', ' and ', 'op'); def('or', ' or ', 'op'); def('xor', ' xor ', 'op'); def('xnor', ' xnor ', 'op');
def('neg', '-', 'neg');
def('(', '(', 'lp'); def(')', ')', 'rp'); def(',', ',', 'comma');
def('E', 'ᴇ', 'E'); def('eqs', '=', 'eqs'); def('colon', ':', 'colon');
const FN = { sin:'sin(', cos:'cos(', tan:'tan(', asin:'sin⁻¹(', acos:'cos⁻¹(', atan:'tan⁻¹(', sinh:'sinh(', cosh:'cosh(', tanh:'tanh(',
  asinh:'sinh⁻¹(', acosh:'cosh⁻¹(', atanh:'tanh⁻¹(', log:'log(', ln:'ln(', sqrt:'√(', cbrt:'³√(', abs:'Abs(', integ:'∫(', deriv:'d/dx(',
  sum:'Σ(', pol:'Pol(', rec:'Rec(', rnd:'Rnd(', ranint:'RanInt#(', Not:'Not(', Neg:'Neg(', pP:'P(', pQ:'Q(', pR:'R(' };
for (const f in FN) def(f, FN[f], 'fn', { x: [f + '!', '('] });
for (const f in FN) def(f + '!', '', 'fnname', { fn: f });
def('logab', 'log(', 'fn', { x: ['log!', '('] });
def('pow', '^(', 'op', { x: ['^', '('] });
def('tenpow', '10^(', 'fn', { x: ['N10', '^', '('] });
def('epow', 'e^(', 'fn', { x: ['e', '^', '('] });
def('xroot(', 'ˣ√(', 'op', { x: ['xroot', '('] });
def('N10', '10', 'num10');
const POST = { sq:'²', cube:'³', inv:'⁻¹', fact:'!', pct:'%', du:'°', ru:'ʳ', gu:'ᵍ', dms:'°' };
for (const p in POST) def(p, POST[p], 'post');
const CONSTV = { pi:['π', Math.PI], e:['e', Math.E] };
for (const c in CONSTV) def(c, CONSTV[c][0], 'const');
def('ans', 'Ans', 'const'); def('ran', 'Ran#', 'const');
'ABCDEFXYM'.split('').forEach(v => def('v' + v, v, 'var'));
def('i', '𝑖', 'const');
def('angle', '∠', 'op');

function tokInfo(id) {
  if (TK[id]) return TK[id];
  if (id.startsWith('const:')) { const c = CONSTS.find(r => r[0] === id.slice(6)); return { id, d: c[1], k: 'const' }; }
  if (id.startsWith('conv:')) { const c = CONVS.find(r => r[0] === id.slice(5)); return { id, d: c[1], k: 'post' }; }
  if (id.startsWith('bp')) return { id, d: id[2], k: 'basepfx' };
  return { id, d: '?', k: 'unk' };
}

class CalcError extends Error { constructor(kind) { super(kind); this.kind = kind; } }
const SYN = () => new CalcError('Syntax'); const MATH = () => new CalcError('Math');

/* ---------- lexer ---------- */
function lex(ids, radix) {
  const arr = [];
  ids.forEach(id => { const t = tokInfo(id); if (t.x) arr.push(...t.x); else arr.push(id); });
  const out = []; let i = 0;
  const isD = id => {
    const t = TK[id]; if (!t || t.k !== 'dig') return false;
    if (radix) return id !== '.' && (t.hex ? radix === 16 : true);
    return !t.hex;
  };
  const dc = id => TK[id].hex ? id[1] : id;
  while (i < arr.length) {
    const id = arr[i];
    if (isD(id) || id === 'E') {
      let s = '';
      while (i < arr.length && isD(arr[i])) s += dc(arr[i++]);
      if (radix) {
        const v = parseInt(s, radix);
        if ([...s].some(ch => parseInt(ch, 36) >= radix)) throw SYN();
        out.push({ k: 'num', v }); continue;
      }
      if (s === '') s = '1';
      if ((s.match(/\./g) || []).length > 1 || s === '.') throw SYN();
      if (arr[i] === 'E') {
        i++; let sg = '';
        if (arr[i] === 'neg' || arr[i] === '-') { sg = '-'; i++; }
        let es = ''; while (i < arr.length && TK[arr[i]] && TK[arr[i]].k === 'dig' && arr[i] !== '.') es += arr[i++];
        if (!es) throw SYN();
        s += 'e' + sg + es;
      }
      out.push({ k: 'num', v: parseFloat(s) }); continue;
    }
    if (id === 'N10') { out.push({ k: 'num', v: 10 }); i++; continue; }
    if (id.startsWith('bp')) {
      const r = { d: 10, h: 16, b: 2, o: 8 }[id[2]]; i++;
      let s = ''; while (i < arr.length && TK[arr[i]] && TK[arr[i]].k === 'dig') s += dc(arr[i++]);
      const v = parseInt(s, r); if (isNaN(v)) throw SYN(); out.push({ k: 'num', v }); continue;
    }
    const t = tokInfo(id);
    out.push({ k: t.k, id, fn: t.fn }); i++;
  }
  return out;
}

/* ---------- parser ---------- */
function parse(toks) {
  let p = 0;
  const peek = () => toks[p]; const next = () => toks[p++];
  const isOp = (...ids) => peek() && peek().k === 'op' && ids.includes(peek().id);
  const startsPrimary = t => t && (t.k === 'num' || t.k === 'lp' || t.k === 'fnname' || t.k === 'const' || t.k === 'var');
  function statement() {
    const a = expr();
    if (peek() && peek().k === 'eqs') { next(); const b = expr(); return { t: 'eq', a, b }; }
    return a;
  }
  function expr() { return logicOr(); }
  function logicOr() { let a = logicAnd(); while (isOp('or', 'xor', 'xnor')) { const op = next().id; a = { t: 'bin', op, a, b: logicAnd() }; } return a; }
  function logicAnd() { let a = addsub(); while (isOp('and')) { next(); a = { t: 'bin', op: 'and', a, b: addsub() }; } return a; }
  function addsub() { let a = muldiv(); while (isOp('+', '-')) { const op = next().id; a = { t: 'bin', op, a, b: muldiv() }; } return a; }
  function muldiv() { let a = implicit(); while (isOp('*', '/')) { const op = next().id; a = { t: 'bin', op, a, b: implicit() }; } return a; }
  function implicit() { let a = fracx(); while (startsPrimary(peek())) a = { t: 'bin', op: '*', a, b: fracx() }; return a; }
  function fracx() {
    let a = perm();
    if (isOp('frac')) { next(); const b = perm();
      if (isOp('frac')) { next(); const c = perm(); return { t: 'mixed', a, b, c }; }
      a = { t: 'bin', op: '/', a, b, frac: true };
    }
    return a;
  }
  function perm() { let a = angle(); while (isOp('nPr', 'nCr')) { const op = next().id; a = { t: 'bin', op, a, b: angle() }; } return a; }
  function angle() { let a = unary(); return a; }
  function unary() { if (peek() && peek().k === 'neg') { next(); return { t: 'neg', a: unary() }; } return pow(); }
  function pow() {
    let a = post();
    while (isOp('^', 'xroot')) {
      const op = next().id; let negs = 0; while (peek() && peek().k === 'neg') { next(); negs++; }
      let b = post(); if (negs % 2) b = { t: 'neg', a: b };
      a = op === '^' ? { t: 'bin', op: '^', a, b } : { t: 'bin', op: 'root', a, b };
    }
    return a;
  }
  function post() {
    let a = primary();
    for (;;) {
      const t = peek(); if (!t || t.k !== 'post') break;
      next();
      if (t.id === 'dms') {
        let node = { t: 'dms', a, b: null, c: null };
        if (peek() && peek().k === 'num' && toks[p + 1] && toks[p + 1].id === 'dms') { node.b = primary(); next();
          if (peek() && peek().k === 'num' && toks[p + 1] && toks[p + 1].id === 'dms') { node.c = primary(); next(); } }
        a = node;
      } else a = { t: 'post', op: t.id, a };
    }
    return a;
  }
  function closeParen() { if (!peek()) return; if (peek().k === 'rp') { next(); return; } throw SYN(); }
  function primary() {
    const t = next();
    if (!t) throw SYN();
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'const') return { t: 'const', id: t.id };
    if (t.k === 'var') return { t: 'var', n: t.id[1] };
    if (t.k === 'lp') { const e = expr(); closeParen(); return e; }
    if (t.k === 'fnname') {
      if (peek() && peek().k === 'lp') next();
      const args = [];
      if (peek() && peek().k !== 'rp') { args.push(statementOrExpr()); while (peek() && peek().k === 'comma') { next(); args.push(statementOrExpr()); } }
      closeParen();
      return { t: 'fn', n: t.fn, args };
    }
    throw SYN();
  }
  function statementOrExpr() { return expr(); }
  if (!toks.length) throw SYN();
  const r = statement();
  if (p < toks.length) throw SYN();
  return r;
}

/* ---------- evaluator ---------- */
const ANGF = { D: Math.PI / 180, R: 1, G: Math.PI / 200 };
function clean(v) { if (!isFinite(v)) throw MATH(); if (Math.abs(v) < 1e-99) return 0; return v; }
function isInt(v) { return Math.abs(v - Math.round(v)) < 1e-9; }
function fact(n) { if (n < 0 || !isInt(n) || n > 69) throw MATH(); let r = 1; for (let i = 2; i <= Math.round(n); i++) r *= i; return r; }
function trigRound(v) { return Math.abs(v) < 1e-13 ? 0 : v; }

function evaluate(node, env) {
  const ev = n => evaluate(n, env);
  switch (node.t) {
    case 'num': return node.v;
    case 'const':
      if (node.id === 'pi') { env.flags.pi = true; return Math.PI; }
      if (node.id === 'e') return Math.E;
      if (node.id === 'ans') return env.ans;
      if (node.id === 'ran') { env.flags.rand = true; return Math.floor(Math.random() * 1000) / 1000; }
      if (node.id === 'i') throw new CalcError('Cmplx');
      if (node.id.startsWith('const:')) env.flags.dec = true;
      if (node.id.startsWith('const:')) return CONSTS.find(r => r[0] === node.id.slice(6))[3];
      throw SYN();
    case 'var': return env.vars[node.n] || 0;
    case 'neg': return env.base ? (-ev(node.a)) | 0 : -ev(node.a);
    case 'mixed': { const a = ev(node.a), b = ev(node.b), c = ev(node.c); if (c === 0) throw MATH(); env.flags.frac = true; return a < 0 ? a - b / c : a + b / c; }
    case 'dms': { env.flags.dms = true; let v = Math.abs(ev(node.a)); const s = ev(node.a) < 0 ? -1 : 1; if (node.b) v += ev(node.b) / 60; if (node.c) v += ev(node.c) / 3600; return s * v; }
    case 'bin': {
      const a = ev(node.a), b = ev(node.b);
      if (env.base) {
        const A = a | 0, B = b | 0;
        switch (node.op) {
          case '+': return (A + B) | 0; case '-': return (A - B) | 0; case '*': return Math.imul(A, B);
          case '/': if (B === 0) throw MATH(); return (A / B) | 0;
          case 'and': return A & B; case 'or': return A | B; case 'xor': return A ^ B; case 'xnor': return ~(A ^ B);
        }
        throw SYN();
      }
      switch (node.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': if (b === 0) throw MATH(); if (node.frac) env.flags.frac = true; return a / b;
        case '^': { if (a < 0 && !isInt(b)) { const inv = 1 / b; if (isInt(inv) && Math.round(inv) % 2) return -Math.pow(-a, b); throw MATH(); } if (a === 0 && b < 0) throw MATH(); return Math.pow(a, b); }
        case 'root': { if (a === 0) throw MATH(); if (b < 0) { if (isInt(a) && Math.round(a) % 2) return -Math.pow(-b, 1 / a); throw MATH(); } return Math.pow(b, 1 / a); }
        case 'nPr': if (!isInt(a) || !isInt(b) || b > a || b < 0) throw MATH(); return Math.round(fact(a) / fact(a - b));
        case 'nCr': { if (!isInt(a) || !isInt(b) || b > a || b < 0) throw MATH(); let r = 1; for (let k = 1; k <= b; k++) r = r * (a - b + k) / k; return Math.round(r); }
      }
      throw SYN();
    }
    case 'post': {
      const a = ev(node.a);
      switch (node.op) {
        case 'sq': return a * a; case 'cube': return a * a * a;
        case 'inv': if (a === 0) throw MATH(); return 1 / a;
        case 'fact': return fact(a);
        case 'pct': return a / 100;
        case 'du': return a * (Math.PI / 180) / ANGF[env.angle];
        case 'ru': return a / ANGF[env.angle];
        case 'gu': return a * (Math.PI / 200) / ANGF[env.angle];
      }
      if (node.op.startsWith('conv:')) env.flags.dec = true;
      if (node.op.startsWith('conv:')) return CONVS.find(r => r[0] === node.op.slice(5))[3](a);
      throw SYN();
    }
    case 'fn': return evalFn(node, env);
    case 'eq': return ev(node.a) - ev(node.b);
  }
  throw SYN();
}
function withX(env, x) { return { ...env, vars: { ...env.vars, X: x } }; }
function evalFn(node, env) {
  const A = node.args; const ev = n => evaluate(n, env);
  const need = k => { if (A.length !== k) throw SYN(); };
  const f = node.n; const af = ANGF[env.angle];
  if (env.base) {
    need(1); const v = ev(A[0]) | 0;
    if (f === 'Not') return ~v; if (f === 'Neg') return (-v) | 0; throw SYN();
  }
  switch (f) {
    case 'sin': need(1); return trigRound(Math.sin(ev(A[0]) * af));
    case 'cos': need(1); return trigRound(Math.cos(ev(A[0]) * af));
    case 'tan': { need(1); const x = ev(A[0]) * af; if (Math.abs(Math.cos(x)) < 1e-13) throw MATH(); return trigRound(Math.tan(x)); }
    case 'asin': { need(1); const v = ev(A[0]); if (Math.abs(v) > 1) throw MATH(); return Math.asin(v) / af; }
    case 'acos': { need(1); const v = ev(A[0]); if (Math.abs(v) > 1) throw MATH(); return Math.acos(v) / af; }
    case 'atan': need(1); return Math.atan(ev(A[0])) / af;
    case 'sinh': need(1); return Math.sinh(ev(A[0]));
    case 'cosh': need(1); return Math.cosh(ev(A[0]));
    case 'tanh': need(1); return Math.tanh(ev(A[0]));
    case 'asinh': need(1); return Math.asinh(ev(A[0]));
    case 'acosh': { need(1); const v = ev(A[0]); if (v < 1) throw MATH(); return Math.acosh(v); }
    case 'atanh': { need(1); const v = ev(A[0]); if (Math.abs(v) >= 1) throw MATH(); return Math.atanh(v); }
    case 'log': {
      if (A.length === 1) { const v = ev(A[0]); if (v <= 0) throw MATH(); return Math.log10(v); }
      need(2); const b = ev(A[0]), v = ev(A[1]); if (b <= 0 || b === 1 || v <= 0) throw MATH(); return Math.log(v) / Math.log(b);
    }
    case 'ln': { need(1); const v = ev(A[0]); if (v <= 0) throw MATH(); return Math.log(v); }
    case 'sqrt': { need(1); const v = ev(A[0]); if (v < 0) throw MATH(); env.flags.sqrt = true; return Math.sqrt(v); }
    case 'cbrt': need(1); return Math.cbrt(ev(A[0]));
    case 'abs': need(1); return Math.abs(ev(A[0]));
    case 'rnd': { need(1); return env.round(ev(A[0])); }
    case 'ranint': { need(2); const a = ev(A[0]), b = ev(A[1]); if (!isInt(a) || !isInt(b) || a > b) throw MATH(); env.flags.rand = true; return Math.floor(a + Math.random() * (b - a + 1)); }
    case 'integ': {
      need(3); env.flags.dec = true; const a = ev(A[1]), b = ev(A[2]);
      const fx = x => evaluate(A[0], withX(env, x));
      return gaussKronrod(fx, a, b);
    }
    case 'deriv': {
      need(2); env.flags.dec = true; const x = ev(A[1]); const fx = t => evaluate(A[0], withX(env, t));
      const h = 1e-3 * Math.max(1, Math.abs(x));
      const d = (-fx(x + 2 * h) + 8 * fx(x + h) - 8 * fx(x - h) + fx(x - 2 * h)) / (12 * h);
      return Math.abs(d - Math.round(d)) < 1e-7 ? Math.round(d) : +d.toPrecision(10);
    }
    case 'sum': {
      need(3); const a = ev(A[1]), b = ev(A[2]); if (!isInt(a) || !isInt(b) || b < a || b - a > 100000) throw MATH();
      let s = 0; for (let x = Math.round(a); x <= Math.round(b); x++) s += evaluate(A[0], withX(env, x)); return s;
    }
    case 'pol': { need(2); const x = ev(A[0]), y = ev(A[1]); const r = Math.hypot(x, y), th = Math.atan2(y, x) / af;
      env.vars.X = r; env.vars.Y = th; env.pair = [['r', r], ['θ', th]]; return r; }
    case 'rec': { need(2); const r = ev(A[0]), th = ev(A[1]) * af; const x = trigRound(r * Math.cos(th)), y = trigRound(r * Math.sin(th));
      env.vars.X = x; env.vars.Y = y; env.pair = [['X', x], ['Y', y]]; return x; }
    case 'pP': case 'pQ': case 'pR': { need(1); const t = ev(A[0]); const P = normCdf(t); env.flags.dec = true;
      const v = f === 'pP' ? P : f === 'pQ' ? Math.abs(P - 0.5) : 1 - P; return Math.round(v * 1e5) / 1e5; }
  }
  throw SYN();
}
function gaussKronrod(f, a, b) {
  // adaptive Simpson with good tolerance
  const simpson = (a, b, fa, fm, fb) => (b - a) / 6 * (fa + 4 * fm + fb);
  function rec(a, b, fa, fm, fb, whole, eps, depth) {
    const m = (a + b) / 2, lm = (a + m) / 2, rm = (m + b) / 2;
    const flm = f(lm), frm = f(rm);
    const left = simpson(a, m, fa, flm, fm), right = simpson(m, b, fm, frm, fb);
    if (depth <= 0 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15;
    return rec(a, m, fa, flm, fm, left, eps / 2, depth - 1) + rec(m, b, fm, frm, fb, right, eps / 2, depth - 1);
  }
  const fa = f(a), fb = f(b), fm = f((a + b) / 2);
  const v = rec(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), 1e-11, 40);
  return +v.toPrecision(11);
}
function normCdf(x) { // Abramowitz-Stegun 7.1.26 via erf, high precision variant
  const t = 1 / (1 + 0.5 * Math.abs(x) / Math.SQRT2);
  const y = 1 - t * Math.exp(-x * x / 2 - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/* ---------- formatting ---------- */
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function toFrac(x, maxDen = 9999) {
  if (!isFinite(x)) return null;
  const sgn = x < 0 ? -1 : 1; x = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
  for (let i = 0; i < 30; i++) {
    const a = Math.floor(b); [h1, h0] = [a * h1 + h0, h1]; [k1, k0] = [a * k1 + k0, k1];
    if (k1 > maxDen) return null;
    if (Math.abs(x - h1 / k1) <= 1e-12 * Math.max(1, x)) { if (String(h1).length + String(k1).length > 10) return null; return [sgn * h1, k1]; }
    if (b - a < 1e-15) break; b = 1 / (b - a);
  }
  return null;
}
const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
function sciHTML(m, e) { return `${m}<span class="x10">×10<sup>${e}</sup></span>`; }
function trimZeros(s) { return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
function fmtDec(x, setup) {
  if (x === 0) { if (setup.fmt.t === 'Fix') return (0).toFixed(setup.fmt.n); if (setup.fmt.t === 'Sci') return sciHTML(setup.fmt.n ? (0).toFixed(Math.max(0, setup.fmt.n - 1)) : '0', 0); return '0'; }
  const ax = Math.abs(x); const f = setup.fmt;
  let out;
  if (f.t === 'Sci') { const n = f.n || 10; const [m, e] = x.toExponential(n - 1).split('e'); out = sciHTML(f.n ? m : trimZeros(m), +e); }
  else if (f.t === 'Fix' && ax < 1e10) { out = x.toFixed(f.n); if (+out === 0 && ax > 0 && f.n < 9) out = x.toFixed(f.n); }
  else {
    const lo = f.t === 'Norm' && f.n === 2 ? 1e-9 : 1e-2;
    if (ax >= 1e10 || ax < lo) { const [m, e] = x.toExponential(9).split('e'); out = sciHTML(trimZeros(m), +e); }
    else { const s = x.toPrecision(10); out = s.includes('e') ? String(+s) : trimZeros(s); }
  }
  if (setup.disp === 'Comma') out = out.replace(/(\d)\.(\d)/g, '$1,$2').replace(/^(\d+)\.$/, '$1');
  return out;
}
function fracHTML(n, d, mixed, line) {
  const sg = n < 0 ? '−' : ''; n = Math.abs(n);
  if (mixed && n > d) { const w = Math.floor(n / d), r = n % d; if (r === 0) return sg + w; return line ? `${sg}${w}⌟${r}⌟${d}` : `${sg}${w}<span class="fr"><i>${r}</i><i>${d}</i></span>`; }
  return line ? `${sg}${n}⌟${d}` : `${sg}<span class="fr"><i>${n}</i><i>${d}</i></span>`;
}
function squarefree(n) { for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) return false; return true; }
function exactForm(x, flags, setup, mixed) {
  if (Number.isInteger(+x.toPrecision(12)) && Math.abs(x) < 1e10) return null;
  const fr = toFrac(x);
  if (fr && fr[1] > 1) return fracHTML(fr[0], fr[1], mixed, false);
  if (flags.sqrt) {
    for (let r = 2; r <= 300; r++) { if (!squarefree(r)) continue;
      const q = toFrac(x / Math.sqrt(r), 99); if (q && Math.abs(q[0]) < 1000) {
        const [n, d] = q; const sg = n < 0 ? '−' : ''; const an = Math.abs(n);
        const core = (an === 1 ? '' : an) + '√' + r;
        return d === 1 ? sg + core : `${sg}<span class="fr"><i>${core}</i><i>${d}</i></span>`; } }
  }
  if (flags.pi) {
    const q = toFrac(x / Math.PI, 99); if (q && Math.abs(q[0]) < 1000) {
      const [n, d] = q; const sg = n < 0 ? '−' : ''; const an = Math.abs(n); const core = (an === 1 ? '' : an) + 'π';
      return d === 1 ? sg + core : `${sg}<span class="fr"><i>${core}</i><i>${d}</i></span>`; }
  }
  return null;
}
function dmsHTML(x) {
  const sg = x < 0 ? '−' : ''; x = Math.abs(x);
  let d = Math.floor(x), mf = (x - d) * 60, m = Math.floor(mf + 1e-9), s = (mf - m) * 60;
  s = Math.round(s * 100) / 100; if (s >= 60) { s -= 60; m++; } if (m >= 60) { m -= 60; d++; }
  return `${sg}${d}°${m}°${+s.toFixed(2)}°`;
}
function engHTML(x, shiftCount) {
  if (x === 0) return '0';
  let e = Math.floor(Math.log10(Math.abs(x)) / 3) * 3 + 3 * shiftCount;
  const m = x / Math.pow(10, e);
  return sciHTML(trimZeros((+m.toPrecision(10)).toString()), e);
}
function baseStr(v, radix) {
  if (radix === 10) return String(v | 0);
  if (radix === 2) { if (v < -32768 || v > 32767) return null; return ((v & 0xFFFF) >>> 0).toString(2); }
  return ((v >>> 0)).toString(radix).toUpperCase();
}

/* ---------- poly roots & linear systems ---------- */
function polyRoots(coef) { // coef highest first, returns [{re,im}]
  const n = coef.length - 1; const a0 = coef[0]; const c = coef.map(v => v / a0);
  let roots = []; for (let i = 0; i < n; i++) roots.push({ re: Math.cos(2 * Math.PI * i / n + 0.4) * 1.3, im: Math.sin(2 * Math.PI * i / n + 0.4) * 1.3 });
  const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  const sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
  const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
  const evp = z => { let r = { re: 1, im: 0 }; for (let i = 1; i <= n; i++) r = { re: r.re * z.re - r.im * z.im + c[i], im: r.re * z.im + r.im * z.re }; return r; };
  for (let it = 0; it < 500; it++) {
    roots = roots.map((z, i) => { let den = { re: 1, im: 0 }; roots.forEach((w, j) => { if (i !== j) den = mul(den, sub(z, w)); }); return sub(z, div(evp(z), den)); });
  }
  roots = roots.map(z => ({ re: Math.abs(z.re) < 1e-10 ? 0 : +z.re.toPrecision(12), im: Math.abs(z.im) < 1e-9 ? 0 : +z.im.toPrecision(12) }));
  roots.sort((a, b) => (a.im !== 0) - (b.im !== 0) || b.re - a.re || b.im - a.im);
  if (n === 3) roots.sort((a, b) => (a.im !== 0) - (b.im !== 0) || a.re - b.re || b.im - a.im);
  return roots;
}
function quadRoots([a, b, c]) {
  const D = b * b - 4 * a * c; const p = n => +n.toPrecision(13);
  if (D >= 0) { const s = Math.sqrt(D); const r1 = (-b + (b >= 0 ? -s : s)) / (2 * a); const r2 = r1 !== 0 ? c / (a * r1) : (-b - (b >= 0 ? -s : s)) / (2 * a);
    const rs = [p(r1), p(r2)].sort((x, y) => y - x); return rs.map(re => ({ re, im: 0 })); }
  const re = p(-b / (2 * a)), im = p(Math.sqrt(-D) / (2 * Math.abs(a))); return [{ re, im }, { re, im: -im }];
}
function snapRoot(z, coef) {
  if (Math.abs(z.im) > 1e-6 * Math.max(1, Math.abs(z.re))) return z;
  const pv = x => coef.reduce((s, c) => s * x + c, 0);
  const scale = coef.reduce((s, c) => s + Math.abs(c), 0);
  for (let k = 1; k <= 12; k++) { const r = +z.re.toPrecision(k); if (Math.abs(pv(r)) <= 1e-13 * scale) return { re: r, im: 0 }; }
  return { re: z.re, im: 0 };
}
function solveLinear(M) { // augmented n x (n+1)
  const n = M.length; const A = M.map(r => r.slice());
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((r, i) => +(r[n] / r[i]).toPrecision(12));
}

/* ---------- the calculator ---------- */
const DEFAULT_SETUP = () => ({ io: 'MathO', angle: 'D', fmt: { t: 'Norm', n: 1 }, frac: 'd/c', cplx: 'a+bi', freq: false, disp: 'Dot', contrast: 5 });
const VAR_KEYS = { neg: 'A', dms: 'B', hyp: 'C', sin: 'D', cos: 'E', tan: 'F', rp: 'X', sd: 'Y', mp: 'M' };

const ACT = {
  mode: { m: 'cmd:mode', s: 'cmd:setup' }, on: { m: 'cmd:on' },
  calc: { m: 'cmd:calc', s: 'cmd:solve', a: 'eqs' },
  integ: { m: 'integ', s: 'deriv', a: 'colon' },
  inv: { m: 'inv', s: 'fact' }, logab: { m: 'logab', s: 'sum' },
  frac: { m: 'frac', s: 'frac' }, sqrt: { m: 'sqrt', s: 'cbrt' },
  sq: { m: 'sq', s: 'cube', b: 'cmd:base10' }, pow: { m: 'pow', s: 'xroot(', b: 'cmd:base16' },
  log: { m: 'log', s: 'tenpow', b: 'cmd:base2' }, ln: { m: 'ln', s: 'epow', b: 'cmd:base8' },
  neg: { m: 'neg', s: 'angle', a: 'vA', b: 'hA' }, dms: { m: 'cmd:dms', s: 'cmd:dmsback', a: 'vB', b: 'hB' },
  hyp: { m: 'cmd:hyp', s: 'abs', a: 'vC', b: 'hC' }, sin: { m: 'sin', s: 'asin', a: 'vD', b: 'hD' },
  cos: { m: 'cos', s: 'acos', a: 'vE', b: 'hE' }, tan: { m: 'tan', s: 'atan', a: 'vF', b: 'hF' },
  rcl: { m: 'cmd:rcl', s: 'cmd:sto' }, eng: { m: 'cmd:eng', s: 'cmd:engl', a: 'i' },
  lp: { m: '(', s: 'pct' }, rp: { m: ')', s: ',', a: 'vX' },
  sd: { m: 'cmd:sd', s: 'cmd:mixed', a: 'vY' }, mp: { m: 'cmd:mplus', s: 'cmd:mminus', a: 'vM' },
  '7': { m: '7', s: 'cmd:const' }, '8': { m: '8', s: 'cmd:conv' }, '9': { m: '9', s: 'cmd:clr' },
  del: { m: 'cmd:del', s: 'cmd:ins' }, ac: { m: 'cmd:ac', s: 'cmd:off' },
  '4': { m: '4', s: 'cmd:matrix' }, '5': { m: '5', s: 'cmd:vector' }, '6': { m: '6' },
  mul: { m: '*', s: 'nPr' }, div: { m: '/', s: 'nCr' },
  '1': { m: '1', s: 'cmd:statmenu' }, '2': { m: '2', s: 'cmd:cmplxmenu' }, '3': { m: '3', s: 'cmd:basemenu' },
  add: { m: '+', s: 'pol' }, sub: { m: '-', s: 'rec' },
  '0': { m: '0', s: 'rnd' }, dot: { m: '.', s: 'ran', a: 'ranint' },
  exp: { m: 'E', s: 'pi', a: 'e' }, ans: { m: 'ans', s: 'cmd:drg' }, eq: { m: 'cmd:eq' },
  up: { m: 'cmd:up' }, down: { m: 'cmd:down' }, left: { m: 'cmd:left' }, right: { m: 'cmd:right' },
};

class Calc {
  constructor() { this.setup = DEFAULT_SETUP(); this.vars = {}; 'ABCDEFXYM'.split('').forEach(v => this.vars[v] = 0); this.ans = 0; this.on = true; this.reset(); this.events = []; }
  reset() {
    this.mode = 'COMP'; this.tokens = []; this.result = null; this.err = null; this.menu = null; this.prompt = null;
    this.shift = false; this.alpha = false; this.history = []; this.hIdx = -1; this.msg = null; this.radix = 10;
    this.eqn = null; this.table = null; this.sub = null; this.calcRun = null; this.contrastScreen = false; this.inStat = null;
  }
  emit(e) { this.events.push(e); }
  env() {
    return { angle: this.setup.angle, vars: this.vars, ans: this.ans, flags: {}, base: this.mode === 'BASE-N', round: v => this.roundDisp(v) };
  }
  roundDisp(v) { const f = this.setup.fmt; if (f.t === 'Fix') return +v.toFixed(f.n); if (f.t === 'Sci') return +v.toPrecision(f.n || 10); return +v.toPrecision(10); }
  compute(tokens, extraVars) {
    const toks = lex(tokens, this.mode === 'BASE-N' ? this.radix : 0);
    const ast = parse(toks);
    const env = this.env(); if (extraVars) env.vars = { ...env.vars, ...extraVars };
    let v = evaluate(ast, env);
    if (this.mode === 'BASE-N') { v = v | 0; if (this.radix === 2 && (v < -32768 || v > 32767)) throw MATH(); return { v, env, ast }; }
    v = clean(v);
    if (Math.abs(v) >= 1e100) throw MATH();
    v = +v.toPrecision(14);
    return { v, env, ast };
  }

  /* ------- public ------- */
  press(id) {
    if (id === '.') id = 'dot';
    this.events = [];
    if (!this.on) { if (id === 'on') { this.on = true; this.tokens = []; this.result = null; this.emit({ t: 'key', id, layer: 'm' }); } return this.events; }
    if (id === 'shift') { this.shift = !this.shift; this.alpha = false; this.emit({ t: 'key', id, layer: 'm' }); return this.events; }
    if (id === 'alpha') { this.alpha = !this.alpha; this.shift = false; this.emit({ t: 'key', id, layer: 'm' }); return this.events; }
    let layer = this.shift ? 's' : this.alpha ? 'a' : 'm';
    if (!KEYS[id][layer]) layer = 'm';
    const act = ACT[id];
    this.shift = false; this.alpha = false;
    this.emit({ t: 'key', id, layer, mode: this.mode });
    let a = act[layer] || act.m;
    if (this.mode === 'BASE-N' && layer === 'm' && act.b) a = act.b;
    try { this.dispatch(id, a, layer); }
    catch (e) { if (e instanceof CalcError) this.setErr(e.kind); else throw e; }
    return this.events;
  }
  setErr(kind) {
    if (kind === 'Cmplx') { this.err = { kind: 'Math', note: 'i זמין רק במצב CMPLX' }; }
    else this.err = { kind };
    this.emit({ t: 'error', kind });
  }

  dispatch(id, a, layer) {
    if (a === 'cmd:off') { this.on = false; this.menu = null; this.prompt = null; return; }
    if (a === 'cmd:on') { this.clearScreen(); return; }
    if (this.err) {
      if (a === 'cmd:ac') { this.err = null; this.tokens = []; this.result = null; return; }
      if (a === 'cmd:left' || a === 'cmd:right') { this.err = null; this.result = null; return; }
      return;
    }
    if (this.contrastScreen) {
      if (a === 'cmd:left') this.setup.contrast = Math.max(0, this.setup.contrast - 1);
      else if (a === 'cmd:right') this.setup.contrast = Math.min(10, this.setup.contrast + 1);
      else if (a === 'cmd:ac' || a === 'cmd:mode') this.contrastScreen = false;
      return;
    }
    if (this.menu) return this.menuKey(id, a, layer);
    if (this.prompt) return this.promptKey(id, a, layer);
    if (a === 'cmd:mode') return this.openMode();
    if (a === 'cmd:setup') return this.openSetup();
    if (a === 'cmd:clr') return this.openClr();
    if (this.mode === 'EQN' && this.eqn) return this.eqnKey(id, a, layer);
    if (this.mode === 'TABLE' && this.table && this.table.phase !== 'f') return this.tableKey(id, a, layer);
    this.mainKey(id, a, layer);
  }

  clearScreen() { this.tokens = []; this.result = null; this.err = null; this.menu = null; this.prompt = null; this.calcRun = null; this.msg = null;
    if (this.eqn && this.eqn.phase === 'res') this.eqn.phase = 'edit';
    if (this.table) { this.table.phase = 'f'; } }

  /* ------- main (COMP-like) ------- */
  insert(tok) {
    const t = tokInfo(tok);
    if (this.result) {
      const cont = t.k === 'op' || t.k === 'post' || (tok === 'pow');
      this.tokens = cont && this.mode !== 'TABLE' ? ['ans'] : [];
      this.result = null;
    }
    this.msg = null;
    this.tokens.push(tok);
  }
  mainKey(id, a, layer) {
    if (!a.startsWith('cmd:')) {
      if (this.mode === 'BASE-N' && /^(sin|cos|tan|asin|acos|atan|sqrt|cbrt|log|ln|integ|deriv|sum|pol|rec|logab|frac|E|pi|e|\.|abs|sq|cube|inv|fact|pct|ran|ranint|tenpow|epow|xroot\(|pow)$/.test(a)) { this.emit({ t: 'note', text: 'במצב BASE-N אין פונקציות מדעיות – רק מספרים שלמים ופעולות לוגיות.' }); return; }
      if (a === 'i' && this.mode !== 'CMPLX') { this.emit({ t: 'note', text: 'i זמין רק במצב CMPLX (MODE 2).' }); return; }
      if (a === 'angle' && this.mode !== 'CMPLX') { this.emit({ t: 'note', text: '∠ זמין רק במצב CMPLX (MODE 2).' }); return; }
      if (a === 'colon') { this.emit({ t: 'note', text: 'הסימולטור לא תומך בשרשור פקודות עם ":" – אבל במחשבון האמיתי זה עובד!' }); return; }
      this.insert(a); return;
    }
    const c = a.slice(4);
    switch (c) {
      case 'ac': this.clearScreen(); return;
      case 'del': if (this.result) { this.result = null; } else this.tokens.pop(); return;
      case 'ins': this.emit({ t: 'note', text: 'INS: בסימולטור הסמן תמיד בסוף הביטוי.' }); return;
      case 'eq': return this.equals();
      case 'up': return this.histMove(-1);
      case 'down': return this.histMove(1);
      case 'left': case 'right': if (this.result) { this.result = null; } return;
      case 'hyp': return this.openMenu('hyp', null, [['1:sinh', () => this.insert('sinh')], ['2:cosh', () => this.insert('cosh')], ['3:tanh', () => this.insert('tanh')], ['4:sinh⁻¹', () => this.insert('asinh')], ['5:cosh⁻¹', () => this.insert('acosh')], ['6:tanh⁻¹', () => this.insert('atanh')]]);
      case 'drg': return this.openMenu('drg', null, [['1:°', () => this.insert('du')], ['2:ʳ', () => this.insert('ru')], ['3:ᵍ', () => this.insert('gu')]]);
      case 'const': this.prompt = { kind: 'const', buf: '' }; this.emit({ t: 'panel', tab: 'consts', sub: 'const' }); return;
      case 'conv': this.prompt = { kind: 'conv', buf: '' }; this.emit({ t: 'panel', tab: 'consts', sub: 'conv' }); return;
      case 'sto': this.prompt = { kind: 'sto' }; return;
      case 'rcl': this.prompt = { kind: 'rcl' }; return;
      case 'dms': if (this.result && this.mode !== 'BASE-N') { this.result.view = this.result.view === 'dms' ? 'dec' : 'dms'; return; } this.insert('dms'); return;
      case 'dmsback': if (this.result) this.result.view = 'dec'; return;
      case 'sd': if (this.result && this.mode !== 'BASE-N') { const r = this.result; const cur = this.fmtNum(r.v, r), dec = this.fmtNum(r.v, { ...r, view: 'dec' }); r.view = cur !== dec ? 'dec' : 'exact'; } return;
      case 'mixed': if (this.result) { this.result.mixed = !this.resultMixed(); this.result.view = 'exact'; } return;
      case 'eng': if (this.result) { const r = this.result; r.engK = r.view === 'eng' ? r.engK + 1 : 0; r.view = 'eng'; } return;
      case 'engl': if (this.result) { const r = this.result; r.engK = r.view === 'eng' ? r.engK - 1 : -1; r.view = 'eng'; } return;
      case 'mplus': case 'mminus': {
        const r = this.evalCurrent(); if (!r) return;
        this.vars.M = +(this.vars.M + (c === 'mplus' ? r.v : -r.v)).toPrecision(14);
        this.ans = r.v; this.result.label = 'M' + (c === 'mplus' ? '+' : '−'); return;
      }
      case 'calc': return this.startCalc();
      case 'solve': return this.startSolve();
      case 'statmenu': case 'cmplxmenu': case 'basemenu': case 'matrix': case 'vector': return this.modeMenu(c);
    }
  }
  hasExact() { const r = this.result; if (!r) return false; return !!exactForm(r.v, r.flags, this.setup, false) || !!toFrac(r.v); }
  resultMixed() { return this.result && this.result.mixed != null ? this.result.mixed : this.setup.frac === 'ab/c'; }
  evalCurrent() {
    let toks = this.tokens;
    if (this.result) toks = this.result.tokens;
    if (!toks.length) toks = ['ans'];
    const r = this.compute(toks);
    this.result = { v: r.v, flags: r.env.flags, tokens: toks.slice(), pair: r.env.pair, view: null };
    return r;
  }
  equals() {
    if (this.mode === 'TABLE') return this.tableStart();
    if (this.tokens.length === 0 && !this.result) { this.result = { v: this.ans, flags: {}, tokens: ['ans'], view: null }; return; }
    const toks = this.result ? this.result.tokens : this.tokens.slice();
    if (toks.some(t => t === 'eqs')) { this.tokens = toks; this.emit({ t: 'note', text: 'זו משוואה – כדי לפתור לחצו SHIFT CALC (SOLVE).' }); throw SYN(); }
    const r = this.compute(toks);
    this.ans = r.v;
    this.result = { v: r.v, flags: r.env.flags, tokens: toks, pair: r.env.pair, view: r.env.flags.dms ? 'dms' : null };
    this.tokens = toks;
    if (!this.history.length || this.history[this.history.length - 1].join() !== toks.join()) this.history.push(toks.slice());
    this.hIdx = this.history.length - 1;
  }
  histMove(d) {
    const L = this.history.length; if (!L) return;
    this.hIdx = !this.result ? L - 1 : Math.max(0, Math.min(L - 1, this.hIdx + d));
    const toks = this.history[this.hIdx];
    try { const r = this.compute(toks); this.tokens = toks.slice(); this.result = { v: r.v, flags: r.env.flags, tokens: toks.slice(), pair: r.env.pair, view: null }; } catch (e) { this.tokens = toks.slice(); this.result = null; }
  }

  /* ------- CALC & SOLVE ------- */
  usedVars(toks) { const s = []; toks.forEach(t => { if (t[0] === 'v' && t.length === 2 && !s.includes(t[1])) s.push(t[1]); }); return s; }
  startCalc() {
    const toks = this.result ? this.result.tokens : this.tokens;
    if (!toks.length) return;
    const vs = this.usedVars(toks);
    if (!vs.length) { this.emit({ t: 'note', text: 'CALC מציב ערכים במשתנים – כתבו ביטוי עם X (ALPHA ) ) או A–F.' }); this.equals(); return; }
    this.tokens = toks.slice(); this.result = null;
    this.prompt = { kind: 'calc', vars: vs, i: 0, buf: [], toks: toks.slice() };
  }
  startSolve() {
    const toks = this.result ? this.result.tokens : this.tokens;
    if (!toks.length) return;
    this.tokens = toks.slice(); this.result = null;
    this.prompt = { kind: 'solve', buf: [], toks: toks.slice() };
  }
  doSolve(toks, x0) {
    const solveVar = 'X';
    const ast = parse(lex(toks, 0));
    const f = x => { const env = this.env(); env.vars = { ...env.vars, [solveVar]: x }; return evaluate(ast, env); };
    let x = x0;
    for (let i = 0; i < 200; i++) {
      const fx = f(x); if (!isFinite(fx)) throw MATH();
      if (Math.abs(fx) < 1e-15) break;
      const h = 1e-7 * Math.max(1, Math.abs(x));
      const d = (f(x + h) - f(x - h)) / (2 * h);
      if (!isFinite(d) || d === 0) { x += 0.1 + Math.abs(x) * 0.1; continue; }
      let nx = x - fx / d; if (Math.abs(nx - x) < 1e-14 * Math.max(1, Math.abs(x))) { x = nx; break; } x = nx;
    }
    if (Math.abs(f(x)) > 1e-6) throw new CalcError('Can\'t Solve');
    x = +x.toPrecision(12); if (Math.abs(x - Math.round(x)) < 1e-10) x = Math.round(x);
    this.vars.X = x; this.ans = x;
    const lr = +f(x).toPrecision(3);
    this.msg = { type: 'solve', toks, x, lr: Math.abs(lr) < 1e-12 ? 0 : lr };
    this.result = { v: x, flags: {}, tokens: toks, view: null, solve: true };
  }

  /* ------- prompts ------- */
  promptKey(id, a, layer) {
    const P = this.prompt;
    if (a === 'cmd:ac') { this.prompt = null; if (P.kind === 'calc' || P.kind === 'solve') { this.result = null; } return; }
    if (P.kind === 'fix' || P.kind === 'sci' || P.kind === 'norm') {
      if (!/^\d$/.test(id)) return;
      const n = +id;
      if (P.kind === 'norm' && (n < 1 || n > 2)) return;
      this.setup.fmt = { t: { fix: 'Fix', sci: 'Sci', norm: 'Norm' }[P.kind], n };
      this.prompt = null; this.tokens = []; this.result = null; this.emit({ t: 'setup', item: { fix: 'Fix', sci: 'Sci', norm: 'Norm' }[P.kind], val: n }); return;
    }
    if (P.kind === 'const' || P.kind === 'conv') {
      if (!/^\d$/.test(id)) return;
      P.buf += id;
      if (P.buf.length === 2) {
        const n = +P.buf; this.prompt = null;
        if (n < 1 || n > 40) { this.emit({ t: 'note', text: 'מספרי ' + (P.kind === 'const' ? 'הקבועים' : 'ההמרות') + ' הם 01 עד 40.' }); return; }
        if (P.kind === 'const') { this.insert('const:' + P.buf); this.emit({ t: 'const', n: P.buf }); }
        else { this.insert('conv:' + P.buf); this.emit({ t: 'conv', n: P.buf }); }
      }
      return;
    }
    if (P.kind === 'sto' || P.kind === 'rcl') {
      const v = VAR_KEYS[id]; if (!v) { this.prompt = null; return; }
      this.prompt = null;
      if (P.kind === 'sto') {
        const r = this.evalCurrent(); this.vars[v] = r.v; this.ans = r.v; this.result.label = '→' + v; this.emit({ t: 'var', v, val: r.v });
      } else {
        this.msg = { type: 'rcl', v, val: this.vars[v] }; this.result = { v: this.vars[v], flags: {}, tokens: ['v' + v], view: null, label: v + '=' };
      }
      return;
    }
    if (P.kind === 'calc' || P.kind === 'solve') {
      if (a === 'cmd:eq') {
        let val;
        if (P.buf.length) { val = this.compute(P.buf).v; }
        else val = this.vars[P.kind === 'calc' ? P.vars[P.i] : 'X'];
        if (P.kind === 'calc') {
          this.vars[P.vars[P.i]] = val; P.i++; P.buf = [];
          if (P.i >= P.vars.length) {
            this.prompt = null;
            const toks = P.toks;
            if (toks.includes('eqs')) { const r = this.compute(toks); this.result = { v: r.v, flags: r.env.flags, tokens: toks, view: null, label: 'L−R=' }; this.ans = r.v; return; }
            const r = this.compute(toks); this.ans = r.v; this.result = { v: r.v, flags: r.env.flags, tokens: toks, pair: r.env.pair, view: null };
          }
        } else { this.prompt = null; this.doSolve(P.toks, val); }
        return;
      }
      if (a === 'cmd:del') { P.buf.pop(); return; }
      if (!a.startsWith('cmd:')) P.buf.push(a);
      return;
    }
  }

  /* ------- menus ------- */
  openMenu(name, title, items, pageSize = 8) {
    const pages = []; for (let i = 0; i < items.length; i += pageSize) pages.push(items.slice(i, i + pageSize));
    this.menu = { name, title, pages, page: 0 };
    this.emit({ t: 'menu', name });
  }
  setPages(name, title, pages) { this.menu = { name, title, pages, page: 0 }; this.emit({ t: 'menu', name }); }
  menuKey(id, a, layer) {
    const m = this.menu;
    if (m.name === 'confirm') { if (a === 'cmd:eq') { m.confirm(); this.menu = { name: 'done', title: m.done, pages: [[]], page: 0 }; this.emit({ t: 'cleared', what: m.done }); } else if (a === 'cmd:ac') this.menu = null; return; }
    if (m.name === 'done') { if (a === 'cmd:ac') { this.menu = null; this.tokens = []; this.result = null; } return; }
    if (a === 'cmd:ac') { this.menu = null; return; }
    if (a === 'cmd:mode' && m.name !== 'mode') { this.menu = null; return this.openMode(); }
    if (a === 'cmd:down' || a === 'cmd:up') { const np = m.page + (a === 'cmd:down' ? 1 : -1); if (np >= 0 && np < m.pages.length) m.page = np; this.emit({ t: 'menu', name: m.name, page: m.page }); return; }
    if (/^\d$/.test(id) && layer === 'm') {
      const item = m.pages[m.page][+id - 1];
      if (!item || !item[1]) return;
      this.menu = null; item[1]();
      return;
    }
  }
  openMode() {
    const names = ['COMP', 'CMPLX', 'STAT', 'BASE-N', 'EQN', 'MATRIX', 'TABLE', 'VECTOR'];
    this.openMenu('mode', null, names.map((n, i) => [(i + 1) + ':' + n, () => this.setMode(n)]));
  }
  setMode(n) {
    const keepSetup = this.setup;
    this.mode = n; this.tokens = []; this.result = null; this.eqn = null; this.table = null; this.msg = null; this.inStat = null;
    this.setup = keepSetup; this.radix = 10;
    this.emit({ t: 'mode', mode: n });
    if (n === 'EQN') return this.openMenu('eqntype', null, [['1:anX+bnY=cn', () => this.startEqn(1)], ['2:anX+bnY+cnZ=dn', () => this.startEqn(2)], ['3:aX²+bX+c=0', () => this.startEqn(3)], ['4:aX³+bX²+cX+d=0', () => this.startEqn(4)]], 4);
    if (n === 'TABLE') { this.table = { phase: 'f' }; return; }
    if (n === 'STAT') return this.openMenu('stattype', null, STATMENU.map((s, i) => [s, () => this.demo('STAT', s)]));
    if (n === 'MATRIX') return this.openMenu('matpick', 'Matrix?', [['1:MatA', () => this.dimMenu('MatA')], ['2:MatB', () => this.dimMenu('MatB')], ['3:MatC', () => this.dimMenu('MatC')]], 3);
    if (n === 'VECTOR') return this.openMenu('vctpick', 'Vector?', [['1:VctA', () => this.vdimMenu('VctA')], ['2:VctB', () => this.vdimMenu('VctB')], ['3:VctC', () => this.vdimMenu('VctC')]], 3);
    if (n === 'CMPLX') { this.demo('CMPLX'); this.msg = null; return; }
  }
  dimMenu(m) { this.openMenu('matdim', m + '(m×n)', ['3×3', '3×2', '3×1', '2×3', '2×2', '2×1'].map((d, i) => [(i + 1) + ':' + d, () => this.demo('MATRIX', m + ' ' + d)]), 6); }
  vdimMenu(v) { this.openMenu('vctdim', v + '(m) m?', [['1:3', () => this.demo('VECTOR', v + ' 3D')], ['2:2', () => this.demo('VECTOR', v + ' 2D')]], 2); }
  demo(mode, what) { this.msg = { type: 'demo', mode, what }; this.emit({ t: 'demo', mode, what }); }
  modeMenu(c) {
    const need = { statmenu: 'STAT', cmplxmenu: 'CMPLX', basemenu: 'BASE-N', matrix: 'MATRIX', vector: 'VECTOR' }[c];
    if (this.mode !== need) { this.emit({ t: 'note', text: `התפריט הזה פעיל רק במצב ${need}. ` + 'בחרו קודם MODE ' + ({ STAT: 3, CMPLX: 2, 'BASE-N': 4, MATRIX: 6, VECTOR: 8 }[need]) + '.' }); return; }
    if (c === 'basemenu') return this.setPages('base', null, [
      [['1:and', () => this.insert('and')], ['2:or', () => this.insert('or')], ['3:xnor', () => this.insert('xnor')], ['4:xor', () => this.insert('xor')], ['5:Not', () => this.insert('Not')], ['6:Neg', () => this.insert('Neg')]],
      [['1:d', () => this.insert('bpd')], ['2:h', () => this.insert('bph')], ['3:b', () => this.insert('bpb')], ['4:o', () => this.insert('bpo')]]]);
    const items = {
      statmenu: ['1:Type', '2:Data', '3:Sum', '4:Var', '5:Reg', '6:MinMax'],
      cmplxmenu: ['1:arg', '2:Conjg', '3:▶r∠θ', '4:▶a+bi'],
      matrix: ['1:Dim', '2:Data', '3:MatA', '4:MatB', '5:MatC', '6:MatAns', '7:det', '8:Trn'],
      vector: ['1:Dim', '2:Data', '3:VctA', '4:VctB', '5:VctC', '6:VctAns', '7:Dot'],
    }[c];
    this.openMenu(c, null, items.map(s => [s, () => this.demo(need, s)]));
  }
  openSetup() {
    const S = (item, fn) => () => { fn(); this.tokens = []; this.result = null; this.emit({ t: 'setup', item }); };
    this.setPages('setup', null, [
      [['1:MthIO', () => this.openMenu('mthio', null, [['1:MathO', S('MthIO', () => this.setup.io = 'MathO')], ['2:LineO', S('MthIO', () => this.setup.io = 'LineO')]], 2)],
       ['2:LineIO', S('LineIO', () => this.setup.io = 'Line')],
       ['3:Deg', S('Deg', () => this.setup.angle = 'D')], ['4:Rad', S('Rad', () => this.setup.angle = 'R')], ['5:Gra', S('Gra', () => this.setup.angle = 'G')],
       ['6:Fix', () => { this.prompt = { kind: 'fix' }; this.emit({ t: 'setup', item: 'Fix' }); }],
       ['7:Sci', () => { this.prompt = { kind: 'sci' }; this.emit({ t: 'setup', item: 'Sci' }); }],
       ['8:Norm', () => { this.prompt = { kind: 'norm' }; this.emit({ t: 'setup', item: 'Norm' }); }]],
      [['1:ab/c', S('ab/c', () => this.setup.frac = 'ab/c')], ['2:d/c', S('d/c', () => this.setup.frac = 'd/c')],
       ['3:CMPLX', () => this.openMenu('cplxfmt', null, [['1:a+bi', S('CMPLX', () => this.setup.cplx = 'a+bi')], ['2:r∠θ', S('CMPLX', () => this.setup.cplx = 'r∠θ')]], 2)],
       ['4:STAT', () => this.openMenu('freq', 'Frequency?', [['1:ON', S('STAT', () => this.setup.freq = true)], ['2:OFF', S('STAT', () => this.setup.freq = false)]], 2)],
       ['5:Disp', () => this.openMenu('disp', null, [['1:Dot', S('Disp', () => this.setup.disp = 'Dot')], ['2:Comma', S('Disp', () => this.setup.disp = 'Comma')]], 2)],
       ['6:◀CONT▶', () => { this.contrastScreen = true; this.emit({ t: 'setup', item: 'CONT' }); }]]]);
  }
  openClr() {
    const conf = (title, done, fn) => () => { this.menu = { name: 'confirm', title, done, pages: [[]], page: 0, confirm: fn }; this.emit({ t: 'menu', name: 'clr' }); };
    const clrMem = () => { 'ABCDEFXYM'.split('').forEach(v => this.vars[v] = 0); this.ans = 0; };
    this.openMenu('clr', 'Clear?', [
      ['1:Setup', conf('Reset Setup?', 'Reset Setup', () => { this.setup = DEFAULT_SETUP(); })],
      ['2:Memory', conf('Clear Memory?', 'Clear Memory', clrMem)],
      ['3:All', conf('Reset All?', 'Reset All', () => { this.setup = DEFAULT_SETUP(); clrMem(); this.reset(); })]], 3);
  }

  /* ------- EQN ------- */
  startEqn(type) {
    const dims = { 1: [2, 3], 2: [3, 4], 3: [1, 3], 4: [1, 4] }[type];
    this.eqn = { type, rows: dims[0], cols: dims[1], cells: Array.from({ length: dims[0] }, () => Array(dims[1]).fill(0)), r: 0, c: 0, buf: [], phase: 'edit', sol: null, si: 0 };
    this.emit({ t: 'eqn', type });
  }
  eqnKey(id, a, layer) {
    const E = this.eqn;
    if (E.phase === 'res') {
      if (a === 'cmd:eq' || a === 'cmd:down') { if (E.si < E.sol.length - 1) E.si++; else if (a === 'cmd:eq') E.phase = 'edit'; return; }
      if (a === 'cmd:up') { E.si = Math.max(0, E.si - 1); return; }
      if (a === 'cmd:ac') { E.phase = 'edit'; return; }
      return;
    }
    if (a === 'cmd:ac') { E.buf = []; return; }
    if (a === 'cmd:del') { E.buf.pop(); return; }
    const mv = (dr, dc) => { E.buf = []; E.r = (E.r + dr + E.rows) % E.rows; E.c = (E.c + dc + E.cols) % E.cols; };
    if (a === 'cmd:up') return mv(-1, 0); if (a === 'cmd:down') return mv(1, 0);
    if (a === 'cmd:left') return mv(0, -1); if (a === 'cmd:right') return mv(0, 1);
    if (a === 'cmd:eq') {
      if (E.buf.length) {
        const v = this.compute(E.buf).v; E.cells[E.r][E.c] = v; E.buf = [];
        if (E.c < E.cols - 1) E.c++; else if (E.r < E.rows - 1) { E.r++; E.c = 0; }
        return;
      }
      return this.eqnSolve();
    }
    if (!a.startsWith('cmd:') && /^(\d|\.|neg|frac|sqrt|cbrt|sq|pi|e|\/|\*|\+|-|\(|\)|E|vA|vB|vC|vD|vE|vF|vX|vY|vM|ans|pow)$/.test(a)) E.buf.push(a);
  }
  eqnSolve() {
    const E = this.eqn; let sol;
    if (E.type <= 2) {
      const r = solveLinear(E.cells);
      if (!r) { sol = [{ n: '', v: 'No Solution' }]; }
      else sol = r.map((v, i) => ({ n: ['X', 'Y', 'Z'][i], v }));
    } else {
      const coef = E.cells[0].slice();
      if (coef[0] === 0) throw MATH();
      const roots = E.type === 3 ? quadRoots(coef) : polyRoots(coef).map(z => snapRoot(z, coef));
      sol = roots.map((z, i) => ({ n: 'X' + (i + 1), v: z.im === 0 ? z.re : z }));
      // collapse duplicate real double roots like the real calc (X= single)
      if (E.type === 3 && sol.length === 2 && typeof sol[0].v === 'number' && Math.abs(sol[0].v - sol[1].v) < 1e-9) sol = [{ n: 'X', v: sol[0].v }];
    }
    E.sol = sol; E.si = 0; E.phase = 'res';
  }

  /* ------- TABLE ------- */
  tableStart() {
    if (!this.tokens.length) return;
    lex(this.tokens, 0); parse(lex(this.tokens, 0));
    this.table = { phase: 'start', f: this.tokens.slice(), start: this.table && this.table.start != null ? this.table.start : 1, end: this.table && this.table.end != null ? this.table.end : 5, step: this.table && this.table.step != null ? this.table.step : 1, buf: [], sel: 0, col: 1 };
    this.emit({ t: 'table', phase: 'start' });
  }
  tableKey(id, a, layer) {
    const T = this.table;
    if (T.phase === 'show') {
      if (a === 'cmd:up') T.sel = Math.max(0, T.sel - 1);
      else if (a === 'cmd:down') T.sel = Math.min(T.rows.length - 1, T.sel + 1);
      else if (a === 'cmd:left') T.col = 1; else if (a === 'cmd:right') T.col = 2;
      else if (a === 'cmd:ac') { T.phase = 'f'; this.tokens = T.f.slice(); this.result = null; }
      else if (a === 'cmd:eq') { T.phase = 'start'; }
      return;
    }
    if (a === 'cmd:ac') { T.phase = 'f'; this.tokens = T.f.slice(); return; }
    if (a === 'cmd:del') { T.buf.pop(); return; }
    if (a === 'cmd:eq') {
      const v = T.buf.length ? this.compute(T.buf).v : T[T.phase];
      T[T.phase] = v; T.buf = [];
      if (T.phase === 'start') T.phase = 'end';
      else if (T.phase === 'end') T.phase = 'step';
      else {
        if (T.step <= 0 || T.end < T.start) throw new CalcError('Range');
        const n = Math.floor((T.end - T.start) / T.step + 1e-9) + 1;
        if (n > 30) throw new CalcError('Range');
        T.rows = [];
        for (let i = 0; i < n; i++) {
          const x = +(T.start + i * T.step).toPrecision(12); let y;
          try { y = this.compute(T.f, { X: x }).v; } catch (e) { y = 'ERROR'; }
          T.rows.push([x, y]);
        }
        T.phase = 'show'; T.sel = 0; T.col = 2; this.emit({ t: 'table', phase: 'show' });
      }
      return;
    }
    if (!a.startsWith('cmd:')) T.buf.push(a);
  }

  /* ------- display ------- */
  tokStr(toks) { return toks.map(t => { const d = tokInfo(t).d; return d; }).join(''); }
  fmtNum(v, opt = {}) {
    if (typeof v === 'string') return v;
    if (typeof v === 'object') { // complex
      const re = v.re, im = v.im;
      if (this.setup.cplx === 'r∠θ') { const r = Math.hypot(re, im), th = Math.atan2(im, re) / ANGF[this.setup.angle]; return `${fmtDec(+r.toPrecision(10), this.setup)}∠${fmtDec(+th.toPrecision(10), this.setup)}`; }
      const ims = Math.abs(im) === 1 ? '' : fmtDec(Math.abs(im), this.setup);
      return `${re !== 0 ? fmtDec(re, this.setup) : ''}${im < 0 ? '−' : (re !== 0 ? '+' : '')}${ims}𝑖`.replace(/^-/, '−');
    }
    const s = this.setup;
    const line = s.io !== 'MathO';
    if (opt.view === 'dms') return dmsHTML(v);
    if (opt.view === 'eng') return engHTML(v, opt.engK || 0);
    const mixed = opt.mixed != null ? opt.mixed : s.frac === 'ab/c';
    const wantExact = !opt.flags || !(opt.flags.dec || opt.flags.rand);
    if (opt.view === 'exact' || (opt.view == null && wantExact && s.fmt.t === 'Norm' && (!line || (opt.flags && opt.flags.frac)))) {
      const ex = line ? (() => { const f = toFrac(v); return f && f[1] > 1 ? fracHTML(f[0], f[1], mixed, true) : null; })() : exactForm(v, opt.flags || {}, s, mixed);
      if (ex) return ex;
    }
    let out = fmtDec(v, s);
    if (out.startsWith('-')) out = '−' + out.slice(1);
    return out;
  }
  indicators() {
    const ind = [];
    if (this.shift) ind.push('S'); if (this.alpha) ind.push('A');
    if (this.vars.M !== 0) ind.push('M');
    if (this.prompt && this.prompt.kind === 'sto') ind.push('STO');
    if (this.prompt && this.prompt.kind === 'rcl') ind.push('RCL');
    if (this.mode === 'STAT') ind.push('STAT'); if (this.mode === 'CMPLX') ind.push('CMPLX');
    if (this.mode === 'MATRIX') ind.push('MAT'); if (this.mode === 'VECTOR') ind.push('VCT');
    if (this.mode !== 'BASE-N') ind.push(this.setup.angle);
    if (this.setup.fmt.t === 'Fix') ind.push('FIX'); if (this.setup.fmt.t === 'Sci') ind.push('SCI');
    if (this.setup.io !== 'Line') ind.push('Math');
    if (this.menu && this.menu.pages.length > 1) ind.push(this.menu.page === 0 ? '▼' : '▲');
    if (this.mode === 'TABLE' && this.table && this.table.phase === 'show') ind.push('▲▼');
    if (this.eqn && this.eqn.phase === 'res' && this.eqn.sol.length > 1) ind.push(this.eqn.si === 0 ? '▼' : this.eqn.si === this.eqn.sol.length - 1 ? '▲' : '▲▼');
    return ind;
  }
  screen() {
    if (!this.on) return { type: 'off' };
    const ind = this.indicators(); const R = x => this.fmtNum(x);
    const base = { ind, contrast: this.setup.contrast };
    if (this.contrastScreen) return { ...base, type: 'text', lines: ['CONTRAST', '', 'LIGHT     DARK', '[◀]       [▶]'], bar: this.setup.contrast };
    if (this.err) return { ...base, type: 'text', lines: [this.err.kind === 'Range' ? 'Range ERROR' : this.err.kind === "Can't Solve" ? "Can't Solve" : this.err.kind + ' ERROR', '', '[AC] :Cancel', '[◀][▶]:Goto'], err: true };
    if (this.menu) {
      const m = this.menu;
      if (m.name === 'confirm') return { ...base, type: 'text', lines: [m.title, '', '[=] :Yes', '[AC]:Cancel'] };
      if (m.name === 'done') return { ...base, type: 'text', lines: [m.title, '', 'Press [AC] Key', ''] };
      return { ...base, type: 'menu', title: m.title, items: m.pages[m.page].map(x => x[0]) };
    }
    if (this.prompt) {
      const P = this.prompt;
      if (P.kind === 'fix') return { ...base, type: 'text', lines: ['Fix 0~9?', '', '', ''] };
      if (P.kind === 'sci') return { ...base, type: 'text', lines: ['Sci 0~9?', '', '', ''] };
      if (P.kind === 'norm') return { ...base, type: 'text', lines: ['Norm 1~2?', '', '', ''] };
      if (P.kind === 'const') return { ...base, type: 'text', lines: ['CONST', '', '', (P.buf + '__').slice(0, 2)] };
      if (P.kind === 'conv') return { ...base, type: 'text', lines: ['CONV', '', '', (P.buf + '__').slice(0, 2)] };
      if (P.kind === 'sto' || P.kind === 'rcl') return { ...base, type: 'calc', l1: this.tokStr(this.result ? this.result.tokens : this.tokens) + (P.kind === 'sto' ? '→' : ''), l2: P.kind === 'rcl' ? 'RCL…' : '' };
      if (P.kind === 'calc') return { ...base, type: 'prompt', q: P.vars[P.i] + '?', v: P.buf.length ? this.tokStr(P.buf) : R(this.vars[P.vars[P.i]]), editing: P.buf.length > 0 };
      if (P.kind === 'solve') return { ...base, type: 'prompt', q: 'X?', v: P.buf.length ? this.tokStr(P.buf) : R(this.vars.X), editing: P.buf.length > 0, title: 'Solve for X' };
    }
    if (this.msg && this.msg.type === 'demo') {
      const nm = { STAT: 'STAT', CMPLX: 'CMPLX', MATRIX: 'MATRIX', VECTOR: 'VECTOR' }[this.msg.mode];
      return { ...base, type: 'demo', mode: nm, what: this.msg.what };
    }
    if (this.mode === 'EQN' && this.eqn) {
      const E = this.eqn;
      if (E.phase === 'res') { const s = E.sol[E.si]; return { ...base, type: 'text', lines: [s.n ? s.n + '=' : '', '', '', typeof s.v === 'string' ? s.v : R(s.v)], big: true }; }
      const heads = E.type === 1 ? ['a', 'b', 'c'] : E.type === 2 ? ['a', 'b', 'c', 'd'] : E.type === 3 ? ['a', 'b', 'c'] : ['a', 'b', 'c', 'd'];
      return { ...base, type: 'grid', head: ['', ...heads], rows: E.cells.map((r, i) => [String(i + 1), ...r.map(v => R(v))]), sel: [E.r, E.c], foot: E.buf.length ? this.tokStr(E.buf) : R(E.cells[E.r][E.c]), editing: E.buf.length > 0 };
    }
    if (this.mode === 'TABLE' && this.table) {
      const T = this.table;
      if (T.phase === 'f') return { ...base, type: 'calc', l1: 'f(X)=' + this.tokStr(this.tokens), l2: '', cursor: true };
      if (T.phase !== 'show') { const q = { start: 'Start?', end: 'End?', step: 'Step?' }[T.phase]; return { ...base, type: 'prompt', q, v: T.buf.length ? this.tokStr(T.buf) : R(T[T.phase]), editing: T.buf.length > 0 }; }
      const from = Math.max(0, Math.min(T.sel - 1, T.rows.length - 3));
      const rows = T.rows.slice(from, from + 3).map((r, i) => [String(from + i + 1), R(r[0]), typeof r[1] === 'string' ? r[1] : R(r[1])]);
      const cur = T.rows[T.sel];
      return { ...base, type: 'grid', head: ['', 'X', 'F(X)'], rows, sel: [T.sel - from, T.col - 1], foot: T.col === 1 ? R(cur[0]) : typeof cur[1] === 'string' ? cur[1] : R(cur[1]) };
    }
    if (this.msg && this.msg.type === 'solve') {
      const m = this.msg; return { ...base, type: 'text', lines: [this.tokStr(m.toks), 'X=', R(m.x), 'L−R=' + R(m.lr)], solve: true };
    }
    const l1 = this.tokStr(this.tokens);
    let l2 = '';
    if (this.result) {
      const r = this.result;
      if (this.mode === 'BASE-N') {
        const s = baseStr(r.v, this.radix); l2 = s == null ? 'Math ERROR' : s;
      } else if (r.pair && this.setup.io !== 'x') {
        return { ...base, type: 'pair', l1, a: r.pair[0][0] + '=' + R(r.pair[0][1]), b: r.pair[1][0] + '=' + R(r.pair[1][1]) };
      } else l2 = this.fmtNum(r.v, r);
      if (r.label === '→A' || (r.label && r.label[0] === '→')) l2 = l2;
    }
    const out = { ...base, type: 'calc', l1, l2, cursor: !this.result };
    if (this.result && this.result.label && !(this.msg && this.msg.type === 'rcl')) out.l1 += this.result.label;
    if (this.mode === 'BASE-N') out.radix = { 10: 'Dec', 16: 'Hex', 2: 'Bin', 8: 'Oct' }[this.radix];
    if (this.msg && this.msg.type === 'rcl') { out.l1 = this.msg.v + '='; }
    return out;
  }
}
// BASE-N base switching (placed after class so ACT b: commands resolve)
const origMain = Calc.prototype.mainKey;
Calc.prototype.mainKey = function (id, a, layer) {
  const m = /^cmd:base(\d+)$/.exec(a);
  if (m) { this.radix = +m[1]; this.emit({ t: 'radix', radix: this.radix }); return; }
  if (this.mode === 'BASE-N' && /^h[A-F]$/.test(a) && this.radix !== 16) { this.emit({ t: 'note', text: 'הספרות A–F קיימות רק בבסיס HEX (מקש xⁿ).' }); return; }
  if (this.mode === 'BASE-N' && /^\d$/.test(a)) { const d = +a; if (d >= this.radix) { this.emit({ t: 'note', text: `הספרה ${d} לא קיימת בבסיס ${this.radix}.` }); return; } }
  return origMain.call(this, id, a, layer);
};

global.Calc = Calc;
global.CalcUtil = { lex, parse, evaluate, polyRoots, toFrac };
})(typeof window !== 'undefined' ? window : globalThis);
