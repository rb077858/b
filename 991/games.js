/* Calculator games & tricks — every one of them works on any ordinary calculator.
   Uses window.APP (exposed by app.js): calc, runSeq, toast, chip, seqChips, renderCalc, setFlip, setGame, closeSheet, kwEl, pressAnim, sleep, panel */
(function () {
'use strict';
const A = () => window.APP;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const digitsSeq = n => [...String(n)].map(c => c === '.' ? 'dot' : c === '-' ? 'neg' : c).join(' ');
const fmt = v => String(+(+v).toPrecision(12));
const confetti = () => {
  const box = document.createElement('div'); box.className = 'confetti';
  const colors = ['#8dc63f', '#f0c330', '#ff4f8b', '#38b2ff', '#b07cff', '#fff'];
  for (let i = 0; i < 70; i++) { const s = document.createElement('i'); s.style.left = Math.random() * 100 + 'vw'; s.style.background = colors[i % colors.length]; s.style.animationDelay = Math.random() * .6 + 's'; s.style.animationDuration = 1.6 + Math.random() * 1.4 + 's'; s.style.transform = `rotate(${Math.random() * 360}deg)`; box.appendChild(s); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 3600);
};

/* ---------------- upside-down words ---------------- */
const FLIP = { O: '0', I: '1', Z: '2', E: '3', H: '4', S: '5', G: '6', L: '7', B: '8' };
function wordToNum(w) {
  const up = w.toUpperCase().replace(/[^A-Z]/g, '');
  if (!up || [...up].some(c => !FLIP[c])) return null;
  let d = [...up].reverse().map(c => FLIP[c]).join('');
  if (d.length > 1 && d[0] === '0') d = '0.' + d.slice(1);
  return d;
}
const RIDDLES = [
  ['מה המחשבון אומר כשמדליקים אותו?', '0.7734', 'hELLO', '2×3×1289÷10000'],
  ['מה סנטה קלאוס צוחק?', '0.40404', 'hOhOhO', '4×3×7×13×37÷100000'],
  ['איזה צעצוע בנוי מלבנים?', '0.637', 'LEgO', '7×7×13÷1000'],
  ['מה עושים למים לפני שמכינים תה?', '7108', 'BOIL', '2×2×1777'],
  ['מי מייצרות דבש?', '5338', 'BEES', '2×17×157'],
  ['ההפך מ"קטן"?', '618', 'BIg', '2×3×103'],
  ['איפה גר הצב?', '77345', 'ShELL', '5×15469'],
  ['מה נועלים ברגל?', '3045', 'ShOE', '3×5×7×29'],
  ['ההפך מ"לנצח"?', '3507', 'LOSE', '3×7×167'],
  ['ממה מכינים צ׳יפס? (שמן)', '710', 'OIL', '2×5×71'],
  ['מה חופר הכלב בגינה?', '3704', 'hOLE', '2×2×2×463'],
  ['ההפך מ"לקנות"?', '7735', 'SELL', '5×7×13×17'],
];
function flipGlyphs(s) { return [...s].map(c => `<span class="fg">${c}</span>`).join(''); }

/* ---------------- game definitions ---------------- */
const GAMES = [
 { id: 'words', emoji: '🙃', title: 'מילים הפוכות', tag: 'מילים', color: '#f0c330', short: 'מקלידים מספר, הופכים את המחשבון – ומופיעה מילה!',
   view() {
     return `<p class="lead">הסוד הוותיק של כל ילד עם מחשבון: ספרות במסך הפוכות נראות כמו אותיות. <b>0=O 1=I 2=Z 3=E 4=h 5=S 6=g 7=L 8=B</b>. מקלידים, הופכים את המחשבון (או לוחצים 🙃) – וקוראים.</p>
       <div class="flipmap">${'012345678'.split('').map(d => `<div><b>${d}</b><span class="fg">${d}</span><i>${'OIZEhSgLB'[+d]}</i></div>`).join('')}</div>
       <h3>חידות – נחשו לפני שמגלים</h3>
       <div class="riddles">${RIDDLES.map((r, i) => `<div class="riddle" data-i="${i}"><div class="rq">${r[0]}</div><div class="ra"><code>${r[3]}</code><button class="btn sm pri" data-r="${i}">חשבו והפכו 🙃</button></div><div class="rw" hidden>${r[2]}</div></div>`).join('')}</div>
       <h3>מכונת המילים ✍️</h3>
       <p class="muted">כתבו מילה באנגלית מהאותיות O I Z E H S G L B – ונגיד לכם איזה מספר להקליד.</p>
       <div class="ctools"><input id="wm" placeholder="למשל: GOOGLE, BOSS, HELLO" maxlength="12" style="direction:ltr;font-family:var(--mono);font-size:17px"><span id="wm-out" class="wmout"></span><button class="btn pri" id="wm-go" disabled>הקלד והפוך 🙃</button></div>`;
   },
   bind(P) {
     $$('[data-r]', P).forEach(b => b.onclick = () => {
       const r = RIDDLES[+b.dataset.r];
       const seq = r[3].replace(/×/g, ' mul ').replace(/÷/g, ' div ').replace(/(\d)/g, ' $1 ').trim().replace(/\s+/g, ' ') + ' eq';
       A().setFlip(false);
       A().runSeq(seq, { after: async () => { A().decimal(); await A().sleep(400); A().setFlip(true); b.closest('.riddle').querySelector('.rw').hidden = false; b.closest('.riddle').classList.add('open'); } });
     });
     const inp = $('#wm', P), out = $('#wm-out', P), go = $('#wm-go', P);
     inp.oninput = () => { const n = wordToNum(inp.value); go.disabled = !n; out.innerHTML = n ? `→ <b>${n}</b>` : inp.value ? '<span class="muted">יש אות שאין לה ספרה 😅</span>' : ''; };
     go.onclick = () => { const n = wordToNum(inp.value); if (!n) return; A().setFlip(false); A().runSeq(digitsSeq(n) + ' eq', { after: async () => { A().decimal(); await A().sleep(350); A().setFlip(true); } }); };
   },
   stop() { A().setFlip(false); } },

 { id: '1089', emoji: '🔮', title: 'הקסם של 1089', tag: 'קסם', color: '#b07cff', short: 'בחרו כל מספר תלת-ספרתי – ואני כבר יודע מה תקבלו.',
   view(g) {
     return `<p class="lead">החיזוי שלי כבר כתוב ונעול במעטפה. בחרו מספר תלת-ספרתי שהספרה הראשונה והאחרונה בו <b>שונות</b> (למשל 742).</p>
       <div class="envelope ${g.reveal ? 'open' : ''}"><div class="env-flap"></div><div class="env-card">${g.reveal ? '1089' : '🔒 החיזוי'}</div></div>
       <div class="ctools" style="justify-content:center"><input id="n3" class="num" maxlength="3" inputmode="numeric" placeholder="742" value="${g.n || ''}"><button class="btn pri" id="n3-go">יאללה</button></div>
       <div id="steps1089"></div>`;
   },
   bind(P, g) {
     const draw = () => {
       const box = $('#steps1089', P); if (!g.n) { box.innerHTML = ''; return; }
       const n = g.n, r = n.split('').reverse().join(''); const big = Math.max(+n, +r), small = Math.min(+n, +r);
       const d = String(big - small).padStart(3, '0'), dr = d.split('').reverse().join('');
       const steps = [
         [`הפכו את סדר הספרות: <span dir="ltr"><b>${n}</b> → <b>${r}</b></span>. חסרו את הקטן מהגדול:`, `${digitsSeq(big)} sub ${digitsSeq(small)} eq`, `${big} − ${small} = <b>${+d}</b>`],
         [`הפכו את התוצאה (<span dir="ltr">${d} → <b>${dr}</b></span>) וחברו:`, `ans add ${digitsSeq(+dr)} eq`, `${d} + ${dr} = <b>1089</b>`],
       ];
       box.innerHTML = steps.map((s, i) => `<div class="gstep ${g.step > i ? 'done' : ''} ${g.step === i ? 'cur' : ''}"><div class="gn">${i + 1}</div><div><div>${s[0]}</div><div class="seq" style="direction:ltr">${A().seqChips(s[1])}</div>${g.step > i ? `<div class="ok">✓ ${s[2]}</div>` : g.step === i ? `<button class="btn pri sm" data-s="${i}">▶ הרץ על המחשבון</button>` : ''}</div></div>`).join('')
         + (g.step >= 2 ? `<div class="celebrate"><div class="e">🤯</div>תמיד 1089! נסו מספר אחר – זה תמיד יוצא.<br><span class="muted">למה? אחרי החיסור מקבלים תמיד כפולה של 99 (198, 297…), וכל כפולה כזו + ההיפוך שלה = 1089.</span></div>` : '');
       $$('[data-s]', box).forEach(b => b.onclick = () => A().runSeq(steps[+b.dataset.s][1], { after: () => { g.step++; if (g.step >= 2) { g.reveal = true; confetti(); A().rerenderGame(); } else draw(); } }));
     };
     $('#n3-go', P).onclick = () => {
       const v = $('#n3', P).value.trim();
       if (!/^\d{3}$/.test(v) || v[0] === '0') return A().toast('צריך מספר תלת-ספרתי (100–999)');
       if (Math.abs(+v[0] - +v[2]) < 2) return A().toast('הספרה הראשונה והאחרונה צריכות להיות שונות לפחות ב-2 🙂');
       g.n = v; g.step = 0; g.reveal = false; A().rerenderGame();
     };
     draw();
   } },

 { id: 'bday', emoji: '🎂', title: 'אני יודע מתי נולדת', tag: 'קסם', color: '#ff4f8b', short: 'כמה פעולות סודיות במחשבון – ואני מנחש את יום ההולדת.',
   view(g) {
     return `<p class="lead">קחו מחשבון (את שלכם או את זה שכאן), <b>אל תראו לי</b>, ועשו בדיוק כך:</p>
       <ol class="olist"><li>הקלידו את <b>היום</b> שבו נולדתם (1–31)</li><li>כפול <b>20</b></li><li>ועוד <b>3</b></li><li>כפול <b>5</b></li><li>ועוד <b>החודש</b> שבו נולדתם (1–12)</li><li>לחצו <kbd class="k num">=</kbd></li></ol>
       <div class="ctools" style="justify-content:center"><label>מה יצא? <input id="bd" class="num" inputmode="numeric" value="${g.v || ''}"></label><button class="btn pri" id="bd-go">נחש! 🔮</button></div>
       <div id="bd-out" class="bigreveal">${g.out || ''}</div>
       <details class="why"><summary>איך זה עובד?</summary>(יום×20+3)×5+חודש = יום×100 + 15 + חודש. מורידים 15 – ומקבלים <b>יום</b> ואחריו <b>חודש</b> בשתי ספרות. למשל 2527−15 = 25|12 → 25 בדצמבר.</details>`;
   },
   bind(P, g) {
     const M = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
     $('#bd-go', P).onclick = () => {
       const v = parseInt($('#bd', P).value, 10); g.v = $('#bd', P).value;
       const x = v - 15, d = Math.floor(x / 100), m = x % 100;
       if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) { g.out = '<span class="muted">משהו לא הסתדר בחישוב 🤔 נסו שוב בדיוק לפי השלבים</span>'; }
       else { g.out = `נולדת ב-<b>${d} ב${M[m - 1]}</b>! 🎉`; confetti(); }
       $('#bd-out', P).innerHTML = g.out;
     };
   } },

 { id: 'fav', emoji: '❤️', title: 'הספרה האהובה עליך', tag: 'קסם', color: '#ff7a59', short: 'מספר מוזר אחד שהופך כל ספרה לשורה שלמה.',
   view() {
     return `<p class="lead">בחרו את הספרה האהובה עליכם. נכפול אותה ב-9, ואז במספר הקסום <b style="direction:ltr;display:inline-block">12345679</b> (שימו לב – <b>אין בו 8</b>!).</p>
       <div class="digits">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="dbtn" data-d="${d}">${d}</button>`).join('')}</div>
       <details class="why"><summary>למה זה עובד?</summary>12345679 × 9 = 111111111. אז 12345679 × 9 × ספרה = הספרה 9 פעמים.</details>`;
   },
   bind(P) { $$('[data-d]', P).forEach(b => b.onclick = () => A().runSeq(`1 2 3 4 5 6 7 9 mul 9 mul ${b.dataset.d} eq`, { after: () => A().toast(`${b.dataset.d.repeat(9)} ✨`) })); } },

 { id: 'race', emoji: '🏁', title: 'מירוץ ל-100', tag: 'נגד המחשב', color: '#8dc63f', short: 'כל אחד בתורו מוסיף 1–9. מי שמגיע בדיוק ל-100 – מנצח.',
   view(g) {
     const t = g.total || 0;
     return `<p class="lead">משחק לשניים שאפשר לשחק בכל מחשבון. מתחילים מ-0, ובכל תור <b>לוחצים ספרה 1–9</b> במחשבון – והיא מתווספת. מי שמביא את הסכום <b>בדיוק ל-100</b> מנצח. אתם מתחילים!</p>
       <div class="race"><div class="track"><i style="width:${t}%"></i>${[10, 20, 30, 40, 50, 60, 70, 80, 90].map(x => `<b style="right:${x}%"></b>`).join('')}</div><div class="rtot">${t}<small>/100</small></div></div>
       <div class="rturn ${g.over ? '' : g.turn === 'me' ? 'me' : 'cpu'}">${g.over ? g.over : g.turn === 'me' ? '👆 התור שלכם – לחצו ספרה 1–9 במחשבון' : '🤖 המחשב חושב…'}</div>
       <div class="rlog">${(g.log || []).map(([w, d, s]) => `<span class="${w}">${w === 'me' ? '🧑' : '🤖'} +${d} = ${s}</span>`).join('')}</div>
       <div class="row" style="justify-content:center;margin-top:10px"><label class="muted">רמה: <select id="lvl">${['קל', 'בינוני', 'אלוף'].map((x, i) => `<option value="${i}" ${(g.lvl ?? 1) === i ? 'selected' : ''}>${x}</option>`).join('')}</select></label><button class="btn sm" id="r-new">משחק חדש</button></div>
       <details class="why" ${g.over ? 'open' : ''}><summary>🤫 הסוד לנצח תמיד</summary>מי שנוחת על <b>90</b> – מנצח (היריב לא יכול להגיע ל-100, ואתם כן). ולכן גם מי שנוחת על 80, 70, 60… כל <b>כפולה של 10</b> היא "תחנה מנצחת". תמיד השלימו לעשרת הבאה – והיריב לעולם לא יוכל.</details>`;
   },
   start(g) { g.total = 0; g.turn = 'me'; g.log = []; g.over = null; A().calc.ans = 0; A().runSeq('ac', { fast: true }); },
   bind(P, g) {
     if (g.total == null) this.start(g);
     $('#r-new', P).onclick = () => { this.start(g); A().rerenderGame(); };
     $('#lvl', P).onchange = e => { g.lvl = +e.target.value; };
   },
   onKey(id, g) {
     if (g.over) { A().toast('המשחק נגמר – "משחק חדש" לסיבוב נוסף'); return true; }
     if (g.turn !== 'me' || A().busy()) return true;
     if (!/^[1-9]$/.test(id)) { A().toast('במירוץ לוחצים רק ספרה 1–9 🙂'); A().shake(id); return true; }
     const d = +id;
     if (g.total + d > 100) { A().toast(`אי אפשר לעבור את 100 – מקסימום ${100 - g.total}`); A().shake(id); return true; }
     this.move(g, 'me', d); return true;
   },
   move(g, who, d) {
     g.turn = 'busy';
     A().runSeq(`ans add ${d} eq`, { fast: true, after: () => {
       g.total += d; g.log.push([who, d, g.total]);
       if (g.total === 100) { g.over = who === 'me' ? '🏆 ניצחתם! הגעתם ל-100!' : '🤖 המחשב הגיע ל-100. נסו לגלות את הסוד למטה…'; if (who === 'me') confetti(); A().rerenderGame(); return; }
       g.turn = who === 'me' ? 'cpu' : 'me'; A().rerenderGame();
       if (g.turn === 'cpu') setTimeout(() => {
         const need = (10 - g.total % 10) % 10; const smart = [0.35, 0.75, 1][g.lvl ?? 1];
         let m = need && Math.random() < smart ? need : 1 + Math.floor(Math.random() * Math.min(9, 100 - g.total));
         if (100 - g.total <= 9) m = 100 - g.total;
         this.move(g, 'cpu', m);
       }, 900);
     } });
   },
   peek(g) { return g.over ? g.over : `🏁 סכום: <b>${g.total || 0}</b> · ${g.turn === 'me' ? 'התור שלכם – לחצו 1–9' : 'המחשב משחק…'}`; } },

 { id: 'broken', emoji: '🔧', title: 'המחשבון השבור', tag: 'אתגר', color: '#38b2ff', short: 'חלק מהמקשים שבורים. תגיעו למספר המטרה בלעדיהם!',
   levels: [
     { target: 100, ban: ['0'], t: 'הגיעו ל-<b>100</b> – אבל המקש <b>0</b> שבור!', hint: '99+1' },
     { target: 10, ban: ['0', '1', '2', '3', '5', '6', '7', '8', '9'], t: 'הגיעו ל-<b>10</b> כשהספרה היחידה שעובדת היא <b>4</b>.', hint: '44÷4−4÷4' },
     { target: 1000, ban: ['0', '1', '2', '3', '4', '5', '6', '7', '9', 'mul'], t: 'הגיעו ל-<b>1000</b> רק עם הספרה <b>8</b> – וגם בלי כפל.', hint: '888+88+8+8+8' },
     { target: 24, ban: ['0', '1', '2', '4', '5', '6', '7', '8', '9'], t: 'הגיעו ל-<b>24</b> רק עם הספרה <b>3</b>.', hint: '3×3×3−3' },
     { target: 7, ban: ['7', 'add', 'sub'], t: 'הגיעו ל-<b>7</b> בלי המקש 7, ובלי פלוס ומינוס.', hint: '14÷2' },
     { target: 2026, ban: ['0', '1', '3', '4', '5', '6', '7', '8', '9'], t: 'הגיעו ל-<b>2026</b> רק עם הספרה <b>2</b>.', hint: '2222−222+22+2+2' },
     { target: 0.5, ban: ['dot', 'div', 'frac', '5'], t: 'הגיעו ל-<b>0.5</b> בלי נקודה, בלי חילוק ובלי 5.', hint: '2 x⁻¹ … או 1−2⁻¹' },
     { target: 1, ban: ['1', 'div', 'frac', 'inv'], t: 'הגיעו ל-<b>1</b> בלי 1 ובלי שום סוג של חילוק.', hint: '3−2 … ואם רוצים קשה: 9×9−80' },
   ],
   view(g) {
     const L = this.levels[g.lv || 0];
     return `<p class="lead">המקשים המסומנים ב-✕ במחשבון <b>שבורים</b>. הקלידו תרגיל על המחשבון שתוצאתו היא מספר המטרה, ולחצו =.</p>
       <div class="levels">${this.levels.map((_, i) => `<span class="${i < (g.best || 0) ? 'd' : ''} ${i === (g.lv || 0) ? 'c' : ''}">${i + 1}</span>`).join('')}</div>
       <div class="target"><div class="muted">שלב ${(g.lv || 0) + 1} מתוך ${this.levels.length}</div><div class="tv">🎯 ${L.target}</div><div>${L.t}</div></div>
       <div class="row" style="justify-content:center"><button class="btn sm" id="b-hint">💡 רמז</button><button class="btn sm" id="b-skip">דלג לשלב הבא ←</button></div>
       <div id="b-fb" class="qfb">${g.fb || ''}</div>`;
   },
   apply(g) { $$('#calc .kw.broken').forEach(k => k.classList.remove('broken')); const L = this.levels[g.lv || 0]; L.ban.forEach(id => { const k = A().kwEl(id); if (k) k.classList.add('broken'); }); },
   bind(P, g) {
     this.apply(g); if (g.applied !== (g.lv || 0)) { g.applied = g.lv || 0; A().runSeq('ac', { fast: true }); }
     $('#b-hint', P).onclick = () => { $('#b-fb', P).innerHTML = '💡 למשל: <span style="direction:ltr;display:inline-block">' + this.levels[g.lv || 0].hint + '</span>'; };
     $('#b-skip', P).onclick = () => { g.lv = ((g.lv || 0) + 1) % this.levels.length; g.fb = ''; A().rerenderGame(); };
   },
   onKey(id, g) { if (this.levels[g.lv || 0].ban.includes(id)) { A().shake(id); A().toast('💥 המקש הזה שבור!'); return true; } return false; },
   after(evs, g) {
     const c = A().calc; if (!evs.some(e => e.t === 'key' && e.id === 'eq') || !c.result) return;
     const L = this.levels[g.lv || 0];
     if (Math.abs(c.result.v - L.target) < 1e-9) {
       confetti(); g.best = Math.max(g.best || 0, (g.lv || 0) + 1);
       if ((g.lv || 0) + 1 < this.levels.length) { g.fb = '✓ תיקנתם! עוברים לשלב הבא…'; A().rerenderGame(); setTimeout(() => { if (A().game() === g) { g.lv = (g.lv || 0) + 1; g.fb = ''; A().rerenderGame(); } }, 1400); }
       else { g.fb = '🏆 סיימתם את כל השלבים! אתם מהנדסי מחשבונים.'; A().rerenderGame(); }
     } else { g.fb = `יצא ${fmt(c.result.v)} – עוד לא ${L.target}. נסו שוב (AC)`; const f = $('#b-fb'); if (f) f.innerHTML = g.fb; }
   },
   peek(g) { const L = this.levels[g.lv || 0]; return `🔧 שלב ${(g.lv || 0) + 1}: הגיעו ל-<b>${L.target}</b> · ${L.t.replace(/<[^>]+>/g, '').replace(/^הגיעו ל-[\d.]+ ?/, '')}`; },
   stop() { $$('#calc .kw.broken').forEach(k => k.classList.remove('broken')); } },

 { id: 'sniper', emoji: '🎯', title: 'צלף השורשים', tag: 'אתגר', color: '#ff9f43', short: 'בלי מקש √: מצאו מספר שבריבוע נותן את המטרה.',
   view(g) {
     return `<p class="lead">המקש <b>√</b> נעלם! מצאו מספר שאם מעלים אותו בריבוע (<kbd class="k fn">x²</kbd>, או מכפילים בעצמו) מקבלים את המטרה – בהפרש של פחות מ-<b>0.01</b>. כמה שפחות ניסיונות!</p>
       <div class="target"><div class="tv">🎯 ${g.target}</div><div class="muted">למשל: 7 x² =  ← ואז מתקנים</div></div>
       <div class="rlog">${(g.tries || []).map(([x, y]) => `<span class="${Math.abs(y - g.target) < .01 ? 'me' : y > g.target ? 'hot' : 'cold'}">${x}² = ${y} ${Math.abs(y - g.target) < .01 ? '🎯' : y > g.target ? '🔥 גבוה' : '❄️ נמוך'}</span>`).join('')}</div>
       <div id="s-fb" class="qfb">${g.fb || ''}</div>
       <div class="row" style="justify-content:center"><button class="btn sm" id="s-new">מטרה חדשה</button><span class="muted">שיא: ${g.record || '—'} ניסיונות</span></div>`;
   },
   newTarget(g) { let t; do { t = 2 + Math.floor(Math.random() * 300); } while (Number.isInteger(Math.sqrt(t))); g.target = t; g.tries = []; g.fb = ''; g.won = false; },
   bind(P, g) {
     if (!g.target) this.newTarget(g);
     const k = A().kwEl('sqrt'); if (k) k.classList.add('broken');
     $('#s-new', P).onclick = () => { this.newTarget(g); A().runSeq('ac', { fast: true }); A().rerenderGame(); };
   },
   onKey(id, g) { if (id === 'sqrt' || id === 'pow') { A().shake(id); A().toast('בלי רמאויות 😉 √ וחזקות שבורים כאן'); return true; } return false; },
   after(evs, g) {
     const c = A().calc; if (g.won || !evs.some(e => e.t === 'key' && e.id === 'eq') || !c.result) return;
     const toks = c.result.tokens; const xi = toks.indexOf('sq'); let x;
     if (xi > 0) x = toks.slice(0, xi).map(t => t === 'dot' ? '.' : t).join('');
     else { const mi = toks.indexOf('*'); if (mi > 0 && toks.slice(0, mi).join() === toks.slice(mi + 1).join()) x = toks.slice(0, mi).join(''); }
     if (x == null) { A().toast('הקלידו מספר ואז x² ו-='); return; }
     const y = +c.result.v.toPrecision(10); g.tries.push([x, y]);
     if (Math.abs(y - g.target) < 0.01) { g.won = true; g.fb = `🎯 בול! ${g.tries.length} ניסיונות`; if (!g.record || g.tries.length < g.record) g.record = g.tries.length; confetti(); }
     A().rerenderGame();
   },
   peek(g) { const t = (g.tries || []).slice(-1)[0]; return `🎯 מטרה: <b>${g.target}</b>${t ? ` · ${t[0]}² = ${t[1]} ${t[1] > g.target ? '🔥' : '❄️'}` : ' · הקלידו מספר, x², ='}`; },
   stop() { $$('#calc .kw.broken').forEach(k => k.classList.remove('broken')); } },

 { id: 'cyclic', emoji: '🔄', title: '142857 – המספר המסתובב', tag: 'קסם', color: '#4ecdc4', short: 'כופלים אותו ב-1 עד 6 – והספרות רק מסתובבות.',
   view() {
     return `<p class="lead">המספר <b style="direction:ltr;display:inline-block">142857</b> מגיע מ-1÷7. כפלו אותו ב-1, 2, 3, 4, 5, 6 – ותראו את <b>אותן ספרות באותו סדר</b>, רק מתחילות ממקום אחר. ואז נסו ×7…</p>
       <div class="digits">${[1, 2, 3, 4, 5, 6, 7].map(d => `<button class="dbtn" data-m="${d}">×${d}</button>`).join('')}</div>
       <div class="cyc" id="cyc"></div>`;
   },
   bind(P) {
     $$('[data-m]', P).forEach(b => b.onclick = () => A().runSeq(`1 4 2 8 5 7 mul ${b.dataset.m} eq`, { after: () => {
       const v = String(142857 * +b.dataset.m); const box = $('#cyc', P);
       box.innerHTML = v === '999999' ? '<b>999999</b> 😮 – ×7 שובר את המעגל!' : [...'142857'.repeat(2)].map((ch, i) => { const s = '142857'.repeat(2).indexOf(v); return `<span class="${i >= s && i < s + 6 ? 'on' : ''}">${ch}</span>`; }).join('');
     } }));
   } },

 { id: 'gallery', emoji: '✨', title: 'גלריית הפלאים', tag: 'טריקים', color: '#c48bff', short: 'תרגילים קצרים עם תוצאות מטורפות. לחצו והופתעו.',
   items: [
     ['פירמידת האחדים', '1 1 1 1 1 sq eq', '11111² = 123454321 – פלינדרום!'],
     ['37 הקסום', '3 7 mul 1 5 eq', '37 × 15 = 555 (ו-37×3=111, 37×6=222…)'],
     ['הגיל שלך פי שלוש', '1 4 mul 7 mul 1 4 4 3 eq', 'גיל × 7 × 1443 = הגיל שלוש פעמים (141414)'],
     ['מדרגות של 8', '1 2 3 4 mul 8 add 4 eq', '1234×8+4 = 9876 (ו-123×8+3=987…)'],
     ['מדרגות של 9', '1 2 3 4 mul 9 add 5 eq', '1234×9+5 = 11111'],
     ['תמיד 3', 'lp 1 7 mul 2 add 9 sub 1 7 sub 1 7 rp div 3 eq', 'בחרו מספר, ×2, +9, פחות המספר, פחות המספר שוב, ÷3 → תמיד 3!'],
     ['שלושה ספרות זהות', '7 7 7 div lp 7 add 7 add 7 rp eq', 'כל ספרה ×3 (777) חלקי סכום הספרות = תמיד 37'],
     ['שלוש פעמים', '7 3 mul 1 0 1 0 1 eq', 'מספר דו-ספרתי × 10101 = המספר שלוש פעמים (737373)'],
     ['שנה קסומה', '2 0 2 6 mul 1 0 0 0 1 eq', 'מספר ארבע-ספרתי × 10001 = המספר פעמיים (20262026)'],
     ['חשבון של בייבי', '0 . 1 add 0 . 2 eq', 'במחשב 0.1+0.2 = 0.30000000000000004. המחשבון חכם יותר 😉'],
   ],
   view() {
     return `<p class="lead">כל אלה עובדים בכל מחשבון. לחצו ▶ כדי לראות על המחשבון – ואז נסו במחשבון שלכם עם מספרים אחרים!</p>
       <div class="gal">${this.items.map((it, i) => `<div class="gi"><div class="gt">${it[0]}</div><div class="seq" style="direction:ltr">${A().seqChips(it[1])}</div><div class="gd">${it[2]}</div><button class="btn sm pri" data-g="${i}">▶</button></div>`).join('')}</div>`;
   },
   bind(P) { $$('[data-g]', P).forEach(b => b.onclick = () => A().runSeq(this.items[+b.dataset.g][1])); } },

 { id: 'speed', emoji: '⚡', title: 'אצבעות מהירות', tag: 'אתגר', color: '#ffd23f', short: 'כמה תרגילים תפתרו על המחשבון ב-45 שניות?',
   view(g) {
     return `<p class="lead">מופיע תרגיל – הקלידו אותו על המחשבון ולחצו =. כל תשובה נכונה = נקודה. יש לכם 45 שניות. (נכון, זה גם אימון מעולה לזריזות במבחן 😉)</p>
       ${g.on ? `<div class="target"><div class="muted">⏱ ${g.left}s · נקודות: ${g.score}</div><div class="tv" style="direction:ltr">${g.q[0]}</div></div>`
       : `<div class="target">${g.score != null ? `<div class="tv">${g.score} 🏅</div><div>${g.score >= 8 ? 'מהירים כמו ברק!' : 'נסו לשבור את השיא'}</div>` : '<div class="tv">⚡</div>'}<div class="muted">שיא: ${g.best || 0}</div></div><div class="row" style="justify-content:center"><button class="btn pri" id="sp-go">התחל ▶</button></div>`}`;
   },
   newQ(g) {
     const r = n => 2 + Math.floor(Math.random() * n), ops = [['×', 'mul', (a, b) => a * b], ['+', 'add', (a, b) => a + b], ['−', 'sub', (a, b) => a - b]];
     const [s, , f] = ops[Math.floor(Math.random() * 3)]; const a = r(90), b = r(40); g.q = [`${a} ${s} ${b}`, f(a, b)];
   },
   bind(P, g) {
     const go = $('#sp-go', P); if (go) go.onclick = () => {
       g.on = true; g.score = 0; g.left = 45; this.newQ(g); A().runSeq('ac', { fast: true }); A().rerenderGame();
       clearInterval(g.timer); g.timer = setInterval(() => { if (A().game() !== g) return clearInterval(g.timer); g.left--; if (g.left <= 0) { clearInterval(g.timer); g.on = false; if (g.score > (g.best || 0)) { g.best = g.score; confetti(); } } A().rerenderGame(); }, 1000);
     };
   },
   after(evs, g) {
     const c = A().calc; if (!g.on || !evs.some(e => e.t === 'key' && e.id === 'eq') || !c.result) return;
     if (Math.abs(c.result.v - g.q[1]) < 1e-9 && !c.result.tokens.includes('ans')) { g.score++; A().toast('✓ +1'); this.newQ(g); A().calc.tokens = []; A().calc.result = null; A().renderCalc(); A().rerenderGame(); }
     else A().toast('✗ לא נכון – AC ונסו שוב');
   },
   peek(g) { return g.on ? `⚡ <b style="direction:ltr;display:inline-block">${g.q[0]}</b> · ⏱ ${g.left}s · ${g.score} נק׳` : '⚡ אצבעות מהירות'; },
   stop(g) { clearInterval(g.timer); g.on = false; } },
];

/* ---------------- UI ---------------- */
const state = {};
function render() {
  const P = A().panel(); const g = A().game();
  if (!g) {
    P.innerHTML = `<div class="games-hero"><div class="gh-e">🎮</div><div><h2>משחקים וטריקים במחשבון</h2><p class="lead" style="margin:0">קסמים, חידות ומשחקים שעובדים <b>בכל מחשבון רגיל</b> – כאן אפשר לשחק ישר על הסימולטור, ואז להפתיע את החברים עם המחשבון שלכם.</p></div></div>
      <div class="ggrid">${GAMES.map(x => `<button class="gcard" style="--c:${x.color}" data-game="${x.id}"><span class="ge">${x.emoji}</span><span class="gtag">${x.tag}</span><span class="gtt">${x.title}</span><span class="gs">${x.short}</span></button>`).join('')}</div>`;
    $$('[data-game]', P).forEach(b => b.onclick = () => open(b.dataset.game));
    return;
  }
  const def = GAMES.find(x => x.id === g.id);
  P.innerHTML = `<div class="game" style="--c:${def.color}"><div class="ph"><div class="ti" style="background:${def.color}">${def.emoji}</div><div style="flex:1"><h2 style="margin:0">${def.title}</h2><div class="muted">${def.tag} · עובד בכל מחשבון</div></div><button class="btn sm" id="g-back">✕ כל המשחקים</button></div>${def.view(g)}</div>`;
  $('#g-back', P).onclick = () => close();
  def.bind && def.bind(P, g);
}
function open(id) {
  close(true);
  const def = GAMES.find(x => x.id === id);
  state[id] = state[id] || { id };
  const g = state[id]; g.def = def;
  A().setGame(g);
  render();
  if (def.peek || def.onKey) A().closeSheet();
}
function close(silent) {
  const g = A().game(); if (g && g.def.stop) g.def.stop(g);
  A().setGame(null); A().setFlip(false);
  if (!silent) render();
}
window.GAMES_UI = { render, open, close, list: GAMES, onKey: (id, g) => g.def.onKey ? g.def.onKey.call(g.def, id, g) : false, after: (evs, g) => g.def.after && g.def.after.call(g.def, evs, g), peek: g => g.def.peek ? g.def.peek.call(g.def, g) : null };
})();
