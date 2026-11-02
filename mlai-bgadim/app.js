(function () {
  'use strict';

  var STORE_KEY = 'mlai-bgadim-v1';
  var COLORS = ['#4f8ef7', '#ff6b6b', '#9b6dff', '#4cc9f0', '#ff9f1c', '#06d6a0', '#f15bb5', '#ffbe0b',
    '#2a9d8f', '#e63946', '#3a0ca3', '#80b918', '#b5651d', '#4a4e69'];
  var UNITS = { d: ['יום', 'יומיים', 'ימים', 1], w: ['שבוע', 'שבועיים', 'שבועות', 7], m: ['חודש', 'חודשיים', 'חודשים', 30], y: ['שנה', 'שנתיים', 'שנים', 365] };

  function preset(id, name, icon, color, on, count, per, unit) {
    return { id: id, name: name, icon: icon, color: color, on: on, count: count, per: per, unit: unit || 'd', note: '', custom: false };
  }
  function defaults() {
    return {
      owner: '', notes: '',
      items: [
        preset('jeans', "ג'ינסים", 'jeans', '#4f8ef7', true, 3, 3),
        preset('shirts', 'חולצות', 'tshirt', '#ff6b6b', true, 7, 1),
        preset('pjpants', "מכנסי פיג'מה", 'pjpants', '#9b6dff', true, 2, 4),
        preset('pjshirts', "חולצות פיג'מה", 'pjshirt', '#4cc9f0', true, 2, 4),
        preset('tzitzit', 'ציציות', 'tzitzit', '#2a7de1', true, 6, 1),
        preset('socks', 'גרביים (זוגות)', 'socks', '#06d6a0', true, 7, 1),
        preset('underwear', 'תחתונים', 'underwear', '#ffbe0b', true, 7, 1),
        preset('hats', 'כובעים', 'hat', '#ff9f1c', false, 1, '', 'y'),
        preset('dressshirts', 'חולצות מכופתרות', 'dressshirt', '#7b8cde', false, 4, 1),
        preset('dresspants', 'מכנסי בד', 'dresspants', '#4a4e69', false, 2, 4),
        preset('suits', 'חליפות', 'suit', '#1d3557', false, 1, '', 'y'),
        preset('tanks', 'גופיות', 'tank', '#57cc99', false, 5, 1),
        preset('sweaters', 'סוודרים', 'sweater', '#f77f00', false, 2, 5),
        preset('coats', 'מעילים', 'coat', '#2a9d8f', false, 1, '', 'y'),
        preset('kippot', 'כיפות', 'kippah', '#7209b7', false, 3, '', 'm'),
        preset('shoes', 'נעליים (זוגות)', 'shoes', '#b5651d', false, 2, '', 'm'),
        preset('towels', 'מגבות', 'towel', '#f15bb5', false, 3, 3)
      ]
    };
  }

  var state;
  try { state = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { state = null; }
  if (!state || !Array.isArray(state.items)) state = defaults();
  else {
    // מוסיפים פריטים מובנים חדשים שלא היו בשמירה הקודמת
    var have = {}; state.items.forEach(function (it) { have[it.id] = 1; });
    defaults().items.forEach(function (it) { if (!have[it.id]) state.items.push(it); });
  }

  var saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* אין אחסון */ }
    }, 200);
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function iconSvg(key) { return window.ICONS[key] || window.ICONS.hanger; }

  /* ---------- ניסוח זמנים ---------- */
  function unitWord(n, u) {
    var w = UNITS[u] || UNITS.d;
    if (n === 1) return w[0];
    if (n === 2) return w[1];
    return fmtNum(n) + ' ' + w[2];
  }
  function fmtNum(n) { return Math.round(n * 10) / 10 + ''; }
  function approx(days) {
    if (days >= 730) return unitWord(Math.round(days / 365), 'y');
    if (days >= 60) return unitWord(Math.round(days / 30), 'm');
    if (days >= 14) return unitWord(Math.round(days / 7), 'w');
    return '';
  }
  function perNum(it) { var p = parseFloat(it.per); return p > 0 ? p : 0; }
  function totalText(it) {
    var p = perNum(it), c = +it.count || 0;
    if (!p || !c) return '';
    var total = p * c;
    var main = unitWord(total, it.unit);
    var extra = '';
    if (it.unit === 'd' || it.unit === 'w') {
      var a = approx(total * UNITS[it.unit][3]);
      if (a && a !== main) extra = ' (בערך ' + a + ')';
    }
    return 'יספיק ל־' + main + extra;
  }
  function itemsWord(n) { return n === 1 ? 'פריט אחד' : fmtNum(n) + ' פריטים'; }

  /* ---------- בניית הממשק ---------- */
  function heroIcons() {
    $('heroIcons').innerHTML = ['tshirt', 'jeans', 'tzitzit', 'hat', 'pjshirt', 'socks'].map(function (k) {
      return '<span>' + iconSvg(k) + '</span>';
    }).join('');
  }

  function cardHtml(it) {
    var units = Object.keys(UNITS).map(function (u) {
      return '<option value="' + u + '"' + (it.unit === u ? ' selected' : '') + '>' + UNITS[u][2] + '</option>';
    }).join('');
    var showNote = it.note || it.noteOpen;
    return '<article class="card' + (it.on ? '' : ' off') + '" data-id="' + esc(it.id) + '" style="--c:' + esc(it.color) + '">' +
      '<div class="card-head">' +
        '<div class="icon-bubble">' + iconSvg(it.icon) + '</div>' +
        '<div class="titles"><h3>' + esc(it.name) + '</h3><span class="sub"></span></div>' +
        '<label class="switch" title="הפעלה / כיבוי"><input type="checkbox" data-act="toggle"' + (it.on ? ' checked' : '') +
          ' aria-label="' + esc(it.name) + '"><span></span></label>' +
      '</div>' +
      '<div class="card-body">' +
        '<div><div class="row-label">כמה יש לי</div>' +
          '<div class="stepper"><button type="button" data-act="plus" aria-label="עוד אחד">+</button>' +
          '<input type="number" inputmode="numeric" min="0" max="999" data-act="count" value="' + (+it.count || 0) + '" aria-label="כמות">' +
          '<button type="button" class="minus" data-act="minus" aria-label="אחד פחות">−</button></div></div>' +
        '<div><div class="row-label">לכמה זמן (לא חובה)</div>' +
          '<div class="dur"><span class="lbl">כל פריט מספיק ל־</span>' +
          '<input type="number" inputmode="decimal" min="0" step="0.5" data-act="per" value="' + esc(it.per) + '" placeholder="—" aria-label="משך לפריט">' +
          '<select data-act="unit" aria-label="יחידת זמן">' + units + '</select></div></div>' +
        '<div class="result-chip"></div>' +
        '<textarea class="note" data-act="note" rows="2" maxlength="200" placeholder="הערה (למשל: אחד צריך תיקון)"' + (showNote ? '' : ' hidden') + '>' + esc(it.note) + '</textarea>' +
        '<div class="card-foot">' +
          '<button type="button" class="chip-btn" data-act="noteToggle"' + (showNote ? ' hidden' : '') + '>📝 הוספת הערה</button>' +
          (it.custom ? '<button type="button" class="chip-btn del" data-act="delete">🗑 מחיקה</button>' : '<span></span>') +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function render() {
    $('grid').innerHTML = state.items.map(cardHtml).join('') +
      '<button type="button" class="add-card" id="addCard"><span class="plus">+</span>הוספת סוג בגד</button>';
    state.items.forEach(updateCard);
    updateBar();
  }

  function cardEl(id) { return $('grid').querySelector('.card[data-id="' + CSS.escape(id) + '"]'); }
  function findItem(id) { for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i]; return null; }

  function updateCard(it) {
    var el = cardEl(it.id); if (!el) return;
    el.classList.toggle('off', !it.on);
    var t = totalText(it);
    el.querySelector('.sub').textContent = it.on ? itemsWord(+it.count || 0) + (t ? ' · ' + t : '') : 'כבוי – לחצו להפעלה';
    el.querySelector('.result-chip').textContent = t ? '⏳ ' + t : '';
  }

  function activeItems() { return state.items.filter(function (it) { return it.on; }); }
  function updateBar() {
    var act = activeItems();
    var total = act.reduce(function (s, it) { return s + (+it.count || 0); }, 0);
    $('totalItems').textContent = total;
    $('totalText').textContent = (total === 1 ? 'פריט' : 'פריטים') + ' · ' + act.length + ' סוגים';
  }

  /* ---------- אירועים ---------- */
  function onGrid(e) {
    var t = e.target;
    if (t.closest('#addCard')) { openAdd(); return; }
    var actEl = t.closest('[data-act]'), act = actEl && actEl.getAttribute('data-act');
    var card = t.closest('.card'); if (!card || !act) return;
    var it = findItem(card.getAttribute('data-id')); if (!it) return;

    if (e.type === 'click') {
      if (act === 'plus' || act === 'minus') {
        it.count = Math.max(0, Math.min(999, (+it.count || 0) + (act === 'plus' ? 1 : -1)));
        card.querySelector('[data-act="count"]').value = it.count;
        bump(card.querySelector('.stepper input'));
      } else if (act === 'noteToggle') {
        it.noteOpen = true;
        var ta = card.querySelector('.note'); ta.hidden = false; ta.focus();
        actEl.hidden = true;
      } else if (act === 'delete') {
        if (!confirm('למחוק את "' + it.name + '"?')) return;
        state.items = state.items.filter(function (x) { return x !== it; });
        render(); save(); return;
      } else if (act === 'toggle') {
        return; // מטופל ב-change
      } else return;
    } else {
      if (act === 'toggle') it.on = t.checked;
      else if (act === 'count') it.count = Math.max(0, Math.min(999, Math.floor(+t.value || 0)));
      else if (act === 'per') it.per = t.value;
      else if (act === 'unit') it.unit = t.value;
      else if (act === 'note') it.note = t.value;
      else return;
    }
    updateCard(it); updateBar(); save();
  }
  function bump(el) {
    el.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
  }

  /* ---------- הוספת סוג חדש ---------- */
  var addSel = { icon: 'hanger', color: COLORS[6] };
  function openAdd() {
    addSel = { icon: 'hanger', color: COLORS[(state.items.length + 3) % COLORS.length] };
    $('addName').value = '';
    $('iconPick').innerHTML = Object.keys(window.ICONS).map(function (k) {
      return '<button type="button" data-icon="' + k + '" title="' + esc(window.ICON_NAMES[k] || k) + '" aria-label="' + esc(window.ICON_NAMES[k] || k) + '">' + window.ICONS[k] + '</button>';
    }).join('');
    $('colorPick').innerHTML = COLORS.map(function (c) {
      return '<button type="button" data-color="' + c + '" style="background:' + c + '" aria-label="צבע ' + c + '"></button>';
    }).join('');
    paintAdd();
    $('addModal').showModal();
    setTimeout(function () { $('addName').focus(); }, 50);
  }
  function paintAdd() {
    $('addPreview').innerHTML = '<div class="icon-bubble" style="--c:' + addSel.color + '">' + iconSvg(addSel.icon) + '</div>';
    $('iconPick').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.icon === addSel.icon); });
    $('colorPick').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.color === addSel.color); });
  }

  /* ---------- תאריך עברי ---------- */
  function gematria(n) {
    var map = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'],
      [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
    var s = '';
    while (n > 0) {
      if (n === 15) { s += 'טו'; break; }
      if (n === 16) { s += 'טז'; break; }
      for (var i = 0; i < map.length; i++) if (map[i][0] <= n) { s += map[i][1]; n -= map[i][0]; break; }
    }
    return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
  }
  function hebrewDate(d) {
    try {
      var parts = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
      var day, month, year;
      parts.forEach(function (p) {
        if (p.type === 'day') day = parseInt(p.value, 10);
        if (p.type === 'month') month = p.value.replace(/^ב/, '');
        if (p.type === 'year') year = parseInt(p.value, 10);
      });
      if (!day || !month || !year) return '';
      return gematria(day) + ' ' + month + ' ' + gematria(year % 1000);
    } catch (e) { return ''; }
  }

  /* ---------- התמונה: תבנית קבועה ---------- */
  function loadImg(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
  }
  function svgUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrapLines(ctx, text, maxW, maxLines) {
    var out = [];
    String(text).split(/\n/).forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), line = '';
      words.forEach(function (w) {
        var test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
      });
      if (line) out.push(line);
    });
    if (maxLines && out.length > maxLines) { out = out.slice(0, maxLines); out[maxLines - 1] += '…'; }
    return out;
  }
  function tint(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function mix(hex, toWhite) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    function m(c) { return Math.round(c + (255 - c) * toWhite); }
    return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
  }
  function seeded(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  var FD = '"Fredoka", "Rubik", sans-serif', FB = '"Rubik", sans-serif';

  async function makeImage() {
    try {
      await Promise.all([
        document.fonts.load('700 60px Fredoka', 'אבג'), document.fonts.load('600 40px Fredoka', 'אבג'),
        document.fonts.load('400 28px Rubik', 'אבג'), document.fonts.load('700 28px Rubik', 'אבג'), document.fonts.load('800 28px Rubik', 'אבג')
      ]);
    } catch (e) { /* ממשיכים עם גופן גיבוי */ }

    var items = activeItems().filter(function (it) { return (+it.count || 0) > 0 || it.note; });
    var W = 1080, P = 56, GAP = 28, COLS = 2, CW = (W - P * 2 - GAP) / COLS;
    var cv = document.createElement('canvas'), ctx = cv.getContext('2d');

    // מדידות מקדימות
    ctx.font = '400 25px ' + FB;
    var cards = items.map(function (it) {
      var noteLines = it.note ? wrapLines(ctx, it.note, CW - 64, 4) : [];
      var dur = totalText(it);
      var h = 208 + (dur ? 0 : -6) + (noteLines.length ? 26 + noteLines.length * 34 : 0);
      return { it: it, noteLines: noteLines, dur: dur, h: h };
    });
    var rows = [];
    for (var i = 0; i < cards.length; i += COLS) {
      var rowCards = cards.slice(i, i + COLS);
      rows.push({ cards: rowCards, h: Math.max.apply(null, rowCards.map(function (c) { return c.h; })) });
    }
    ctx.font = '400 28px ' + FB;
    var notesLines = state.notes.trim() ? wrapLines(ctx, state.notes.trim(), W - P * 2 - 80, 12) : [];

    var HEADER = 400, STATS = 190;
    var gridH = rows.reduce(function (s, r) { return s + r.h + GAP; }, 0);
    if (!rows.length) gridH = 180;
    var notesH = notesLines.length ? 120 + notesLines.length * 42 : 0;
    var H = HEADER + STATS + 40 + gridH + (notesH ? notesH + 20 : 0) + 110;

    var SCALE = 1;
    cv.width = W * SCALE; cv.height = H * SCALE; ctx.scale(SCALE, SCALE);
    ctx.direction = 'rtl';

    // רקע
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#7b2ff7'); g.addColorStop(.35, '#f107a3'); g.addColorStop(.7, '#ff6a3d'); g.addColorStop(1, '#ffb703');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var g2 = ctx.createRadialGradient(W * .85, 120, 20, W * .85, 120, 520);
    g2.addColorStop(0, 'rgba(76,201,240,.55)'); g2.addColorStop(1, 'rgba(76,201,240,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
    var g3 = ctx.createRadialGradient(80, H * .6, 20, 80, H * .6, 600);
    g3.addColorStop(0, 'rgba(6,214,160,.35)'); g3.addColorStop(1, 'rgba(6,214,160,0)');
    ctx.fillStyle = g3; ctx.fillRect(0, 0, W, H);

    // קונפטי (קבוע – אותו דפוס בכל פעם)
    var rnd = seeded(20261102), conf = ['#ffd166', '#ffffff', '#4cc9f0', '#06d6a0', '#ff9ecd', '#caffbf'];
    for (var k = 0; k < 70; k++) {
      var cx = rnd() * W, cy = rnd() * H, s = 6 + rnd() * 14, col = conf[k % conf.length];
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rnd() * Math.PI); ctx.globalAlpha = .35 + rnd() * .4; ctx.fillStyle = col; ctx.strokeStyle = col;
      var type = k % 4;
      if (type === 0) { ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill(); }
      else if (type === 1) { ctx.fillRect(-s / 2, -s / 5, s, s / 2.5); }
      else if (type === 2) { ctx.beginPath(); ctx.moveTo(0, -s / 1.6); ctx.lineTo(s / 1.8, s / 2); ctx.lineTo(-s / 1.8, s / 2); ctx.closePath(); ctx.fill(); }
      else { ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(-s / 2, -s / 1.4, 0, 0); ctx.quadraticCurveTo(s / 2, s / 1.4, s, 0); ctx.stroke(); }
      ctx.restore();
    }

    // איורים
    var keys = {}; items.forEach(function (it) { keys[it.icon] = 1; });
    ['tshirt', 'jeans', 'tzitzit', 'hat', 'socks'].forEach(function (k2) { keys[k2] = 1; });
    var imgs = {};
    await Promise.all(Object.keys(keys).map(function (k2) {
      return loadImg(svgUrl(iconSvg(k2))).then(function (im) { imgs[k2] = im; }).catch(function () {});
    }));
    function drawIcon(k2, x, y, size, rot) {
      var im = imgs[k2]; if (!im) return;
      ctx.save(); ctx.translate(x + size / 2, y + size / 2); if (rot) ctx.rotate(rot); ctx.drawImage(im, -size / 2, -size / 2, size, size); ctx.restore();
    }

    // כותרת
    ctx.save(); ctx.shadowColor = 'rgba(45,42,74,.25)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.fillStyle = 'rgba(255,255,255,.16)'; rr(ctx, P - 16, 40, W - (P - 16) * 2, HEADER - 70, 48); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; rr(ctx, P - 16, 40, W - (P - 16) * 2, HEADER - 70, 48); ctx.stroke();

    // איורים צפים בכותרת (צד שמאל)
    var floating = [['tshirt', 90, 72, 120, -.22], ['tzitzit', 200, 150, 110, .14], ['jeans', 84, 210, 104, .2], ['hat', 210, 50, 92, -.1]];
    floating.forEach(function (f) {
      ctx.save(); ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(45,42,74,.25)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
      ctx.translate(f[1] + f[3] / 2, f[2] + f[3] / 2); ctx.rotate(f[4]); rr(ctx, -f[3] / 2 - 10, -f[3] / 2 - 10, f[3] + 20, f[3] + 20, 30); ctx.fill(); ctx.restore();
      drawIcon(f[0], f[1], f[2], f[3], f[4]);
    });

    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    var TX = W - P - 30;
    ctx.fillStyle = '#ffffff'; ctx.font = '700 30px ' + FB;
    ctx.globalAlpha = .9; ctx.fillText('דו״ח ארון', TX, 108); ctx.globalAlpha = 1;
    ctx.save(); ctx.shadowColor = 'rgba(45,42,74,.35)'; ctx.shadowOffsetY = 6; ctx.shadowBlur = 0;
    ctx.font = '700 96px ' + FD; ctx.fillStyle = '#ffffff'; ctx.fillText('מלאי הבגדים', TX, 204); ctx.restore();
    var owner = state.owner.trim();
    ctx.font = '600 50px ' + FD; ctx.fillStyle = '#ffd166';
    ctx.fillText(owner ? 'של ' + owner : 'שלי', TX, 268);

    // תגית תאריך
    var now = new Date();
    var greg = now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
    var heb = hebrewDate(now);
    var dateTxt = heb ? heb + '  •  ' + greg : greg;
    ctx.font = '700 26px ' + FB;
    var dw = ctx.measureText(dateTxt).width + 48;
    ctx.fillStyle = '#2d2a4a'; rr(ctx, TX - dw, 296, dw, 52, 26); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillText(dateTxt, TX - 24, 331);

    // סטטיסטיקה
    var total = items.reduce(function (s2, it) { return s2 + (+it.count || 0); }, 0);
    var top = items.slice().sort(function (a, b) { return (+b.count || 0) - (+a.count || 0); })[0];
    var longest = null, longestDays = 0;
    items.forEach(function (it) { var d = perNum(it) * (+it.count || 0) * UNITS[it.unit][3]; if (d > longestDays) { longestDays = d; longest = it; } });
    var stats = [
      { big: String(total), small: 'פריטים בסך הכול', c: '#7b2ff7' },
      { big: String(items.length), small: 'סוגי בגדים', c: '#f107a3' },
      { big: top ? top.name : '—', small: 'הכי הרבה', c: '#ff8a00', text: true }
    ];
    var SY = HEADER, SW = (W - P * 2 - GAP * 2) / 3;
    stats.forEach(function (st, idx) {
      var x = W - P - SW - idx * (SW + GAP);
      ctx.save(); ctx.shadowColor = 'rgba(45,42,74,.22)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#ffffff'; rr(ctx, x, SY, SW, STATS - 30, 34); ctx.fill(); ctx.restore();
      ctx.fillStyle = st.c; rr(ctx, x + 18, SY + 16, 10, STATS - 62, 5); ctx.fill();
      ctx.textAlign = 'right'; ctx.fillStyle = st.c;
      var bigSize = st.text ? 46 : 72;
      ctx.font = '700 ' + bigSize + 'px ' + FD;
      while (ctx.measureText(st.big).width > SW - 70 && bigSize > 26) { bigSize -= 2; ctx.font = '700 ' + bigSize + 'px ' + FD; }
      ctx.fillText(st.big, x + SW - 28, SY + (st.text ? 82 : 92));
      ctx.font = '500 26px ' + FB; ctx.fillStyle = '#6b6788';
      ctx.fillText(st.small, x + SW - 28, SY + 128);
    });

    // כרטיסי פריטים
    var y = HEADER + STATS + 40;
    if (!rows.length) {
      ctx.fillStyle = 'rgba(255,255,255,.9)'; rr(ctx, P, y, W - P * 2, 150, 34); ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = '#6b6788'; ctx.font = '600 34px ' + FD; ctx.fillText('עוד לא נבחרו בגדים', W / 2, y + 88);
    }
    rows.forEach(function (row) {
      row.cards.forEach(function (c, idx) {
        var it = c.it, col = /^#[0-9a-f]{6}$/i.test(it.color) ? it.color : '#7b2ff7';
        var x = W - P - CW - idx * (CW + GAP), h = row.h;
        ctx.save(); ctx.shadowColor = 'rgba(45,42,74,.25)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
        ctx.fillStyle = '#ffffff'; rr(ctx, x, y, CW, h, 36); ctx.fill(); ctx.restore();
        // פס צבע עליון
        ctx.save(); rr(ctx, x, y, CW, h, 36); ctx.clip();
        var bg = ctx.createLinearGradient(x + CW, 0, x, 0); bg.addColorStop(0, col); bg.addColorStop(1, mix(col, .55));
        ctx.fillStyle = bg; ctx.fillRect(x, y, CW, 12);
        ctx.fillStyle = tint(col, .07); ctx.beginPath(); ctx.arc(x + 40, y + h - 10, 120, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // בועת איור
        var bx = x + CW - 28 - 120, by = y + 36;
        ctx.save(); ctx.translate(bx + 60, by + 60); ctx.rotate(-.07);
        ctx.fillStyle = mix(col, .78); rr(ctx, -60, -60, 120, 120, 38); ctx.fill();
        ctx.strokeStyle = mix(col, .55); ctx.lineWidth = 3; rr(ctx, -60, -60, 120, 120, 38); ctx.stroke();
        ctx.restore();
        drawIcon(it.icon, bx + 12, by + 12, 96, -.07);
        // שם
        ctx.textAlign = 'right'; ctx.fillStyle = '#2d2a4a';
        var nameSize = 40; ctx.font = '700 ' + nameSize + 'px ' + FD;
        var nameMax = CW - 28 - 120 - 24 - 130;
        while (ctx.measureText(it.name).width > nameMax && nameSize > 24) { nameSize -= 2; ctx.font = '700 ' + nameSize + 'px ' + FD; }
        ctx.fillText(it.name, bx - 22, y + 86);
        // משך
        if (c.dur) {
          ctx.font = '500 23px ' + FB;
          var dl = wrapLines(ctx, c.dur, CW - 28 - 120 - 24 - 24, 2);
          ctx.fillStyle = '#5b5778';
          dl.forEach(function (l, li) { ctx.fillText(l, bx - 22, y + 128 + li * 30); });
        } else {
          ctx.font = '500 23px ' + FB; ctx.fillStyle = '#9a96b5'; ctx.fillText(itemsWord(+it.count || 0), bx - 22, y + 128);
        }
        // גלולת כמות
        var cnt = String(+it.count || 0);
        ctx.font = '700 60px ' + FD;
        var pw = Math.max(96, ctx.measureText(cnt).width + 44), ph = 96, px = x + 26, py = y + 36;
        var pg = ctx.createLinearGradient(px, py, px + pw, py + ph); pg.addColorStop(0, col); pg.addColorStop(1, mix(col, .3));
        ctx.save(); ctx.shadowColor = tint(col, .45); ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
        ctx.fillStyle = pg; rr(ctx, px, py, pw, ph, 32); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(cnt, px + pw / 2, py + 70);
        // הערה
        if (c.noteLines.length) {
          var ny = y + 182, nh = 22 + c.noteLines.length * 34;
          ctx.fillStyle = '#fff8e1'; rr(ctx, x + 22, ny, CW - 44, nh, 20); ctx.fill();
          ctx.fillStyle = col; rr(ctx, x + CW - 30, ny + 12, 6, nh - 24, 3); ctx.fill();
          ctx.textAlign = 'right'; ctx.fillStyle = '#4a4668'; ctx.font = '400 25px ' + FB;
          c.noteLines.forEach(function (l, li) { ctx.fillText(l, x + CW - 46, ny + 38 + li * 34); });
        }
      });
      y += row.h + GAP;
    });
    if (!rows.length) y += 180;

    // הערות כלליות
    if (notesLines.length) {
      ctx.save(); ctx.shadowColor = 'rgba(45,42,74,.25)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
      ctx.fillStyle = '#fffdf3'; rr(ctx, P, y, W - P * 2, notesH, 36); ctx.fill(); ctx.restore();
      // קווי מחברת
      ctx.strokeStyle = 'rgba(76,201,240,.35)'; ctx.lineWidth = 2;
      for (var li = 0; li < notesLines.length; li++) { ctx.beginPath(); ctx.moveTo(P + 30, y + 104 + li * 42 + 12); ctx.lineTo(W - P - 30, y + 104 + li * 42 + 12); ctx.stroke(); }
      // נעץ
      ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.arc(W / 2, y + 4, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(W / 2 - 5, y - 1, 5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'right'; ctx.fillStyle = '#ff6a3d'; ctx.font = '700 40px ' + FD;
      ctx.fillText('הערות', W - P - 40, y + 70);
      ctx.fillStyle = '#3b3760'; ctx.font = '400 28px ' + FB;
      notesLines.forEach(function (l, i2) { ctx.fillText(l, W - P - 40, y + 112 + i2 * 42); });
      y += notesH + 20;
    }

    // כותרת תחתונה
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = '600 26px ' + FD;
    ctx.fillText('מלאי בגדים - סופרים, מסדרים ונהנים', W / 2, H - 46);

    return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, 'image/png'); });
  }

  var lastUrl = null, lastBlob = null;
  async function finish() {
    var m = $('resultModal');
    $('resultImg').innerHTML = '<div class="loader"></div>';
    $('downloadBtn').removeAttribute('href');
    m.showModal();
    try {
      var blob = await makeImage();
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastBlob = blob; lastUrl = URL.createObjectURL(blob);
      var name = 'מלאי-בגדים' + (state.owner.trim() ? '-' + state.owner.trim().replace(/[\\/:*?"<>|\s]+/g, '-') : '') + '.png';
      $('downloadBtn').href = lastUrl; $('downloadBtn').download = name;
      $('resultImg').innerHTML = '<img alt="תמונת מלאי הבגדים" src="' + lastUrl + '">';
      var file = new File([blob], name, { type: 'image/png' });
      $('shareBtn').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      $('shareBtn').onclick = function () { navigator.share({ files: [file], title: 'מלאי הבגדים' }).catch(function () {}); };
    } catch (e) {
      $('resultImg').innerHTML = '<p style="padding:20px;text-align:center">משהו השתבש ביצירת התמונה 😕<br>נסו שוב.</p>';
      console.error(e);
    }
  }

  /* ---------- זיהוי מתמונה (נטען רק כשצריך) ---------- */
  var scanner = null, coiReady = false;
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('coi-sw.js').then(function () {
      return navigator.serviceWorker.ready;
    }).then(function () { coiReady = true; }).catch(function () { /* בלי service worker – עובד, רק לאט יותר */ });
  }
  var scanApi = {
    items: function () { return state.items; },
    find: findItem,
    esc: esc,
    icon: iconSvg,
    applyCounts: function (t, mode) {
      var changed = [];
      state.items.forEach(function (it) {
        if (!(it.id in t)) return;
        it.count = Math.min(999, (mode === 'add' ? (+it.count || 0) : 0) + t[it.id]);
        it.on = true; changed.push(it.id);
      });
      render(); save();
      changed.forEach(function (id) { var el = cardEl(id); if (el) el.animate([{ boxShadow: '0 0 0 6px var(--c)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1400 }); });
      var first = changed.length && cardEl(changed[0]); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  function openScan() {
    var btn = $('scanBtn');
    // בפעם הראשונה הדף עוד לא מבודד: טוענים אותו מחדש פעם אחת כדי שהזיהוי ירוץ על כל הליבות
    if (!window.crossOriginIsolated && coiReady) {
      var tried = false;
      try { tried = !!sessionStorage.getItem('mlai-coi-tried'); } catch (e) { /* */ }
      if (!tried) {
        try {
          sessionStorage.setItem('mlai-coi-tried', '1');
          sessionStorage.setItem('mlai-open-scan', '1');
          localStorage.setItem(STORE_KEY, JSON.stringify(state));
          btn.classList.add('loading');
          location.reload();
          return;
        } catch (e) { /* ממשיכים בלי */ }
      }
    }
    if (scanner) { scanner.open(); return; }
    btn.classList.add('loading');
    import('./scan.js').then(function (m) {
      scanner = m.setup(scanApi); scanner.open();
    }).catch(function (e) {
      console.error(e); alert('לא הצלחנו לטעון את הזיהוי. צריך חיבור לאינטרנט בפעם הראשונה.');
    }).then(function () { btn.classList.remove('loading'); });
  }

  /* ---------- הפעלה ---------- */
  function init() {
    $('scanBtn').addEventListener('click', openScan);
    try {
      if (sessionStorage.getItem('mlai-open-scan')) { sessionStorage.removeItem('mlai-open-scan'); setTimeout(openScan, 300); }
    } catch (e) { /* */ }
    heroIcons();
    $('ownerName').value = state.owner || '';
    $('generalNotes').value = state.notes || '';
    render();

    var grid = $('grid');
    grid.addEventListener('click', onGrid);
    grid.addEventListener('input', onGrid);
    grid.addEventListener('change', function (e) { if (e.target.getAttribute('data-act') === 'toggle' || e.target.tagName === 'SELECT') onGrid(e); });
    grid.addEventListener('focusin', function (e) { if (e.target.matches('.stepper input')) e.target.select(); });

    $('ownerName').addEventListener('input', function (e) { state.owner = e.target.value; save(); });
    $('generalNotes').addEventListener('input', function (e) { state.notes = e.target.value; save(); });
    $('finishBtn').addEventListener('click', finish);
    $('resetBtn').addEventListener('click', function () {
      if (!confirm('לאפס הכול ולהתחיל מחדש?')) return;
      state = defaults(); $('ownerName').value = ''; $('generalNotes').value = ''; render(); save();
    });

    document.querySelectorAll('dialog').forEach(function (d) {
      d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    });
    $('iconPick').addEventListener('click', function (e) { var b = e.target.closest('[data-icon]'); if (b) { addSel.icon = b.dataset.icon; paintAdd(); } });
    $('colorPick').addEventListener('click', function (e) { var b = e.target.closest('[data-color]'); if (b) { addSel.color = b.dataset.color; paintAdd(); } });
    $('addForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('addName').value.trim(); if (!name) { $('addName').focus(); return; }
      var it = preset('c' + Date.now().toString(36), name, addSel.icon, addSel.color, true, 1, '', 'd');
      it.custom = true;
      state.items.push(it); render(); save(); $('addModal').close();
      var el = cardEl(it.id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
  }
  init();
})();
