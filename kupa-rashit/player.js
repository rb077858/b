// =====================================================================
//  נגן השידור החי של "קופה ראשית" (HLS)
//  • השהיה אוטומטית: כל מכשיר מזהה כמה הוא נתקע ומגדיל/מקטין את ההשהיה בעצמו
//  • חזרה אחורה (DVR), "מתחילת התוכנית", שמירת מיקום והמשך צפייה
//  • איכות, מהירות, תמונה-בתוך-תמונה, מסך מלא, מקשי קיצור, נתונים טכניים
// =====================================================================

const HLS_URL = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
const PREFS_KEY = "kr-player-prefs";
const POS_KEY = "kr-player-pos";
const DELAY_KEY = "kr-auto-delay";
const MAX_DVR_MS = 8 * 3600e3;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

let hlsPromise = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  return hlsPromise ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = HLS_URL; s.onload = () => res(window.Hls); s.onerror = rej;
    document.head.appendChild(s);
  });
}

const clockFmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const clock = ms => clockFmt.format(new Date(ms));
const pad = n => String(n).padStart(2, "0");
const dur = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ":" + pad(m) : m) + ":" + pad(s % 60); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const I = {
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
  back: '<path d="M12.5 8V4L7 9l5.5 5v-4a5 5 0 1 1-5 5H5.5a7 7 0 1 0 7-7z"/><text x="12.5" y="17.5" font-size="6.5" text-anchor="middle" font-family="sans-serif" font-weight="700">STEP</text>',
  fwd: '<path d="M11.5 8V4L17 9l-5.5 5v-4a5 5 0 1 0 5 5h2a7 7 0 1 1-7-7z"/><text x="11.5" y="17.5" font-size="6.5" text-anchor="middle" font-family="sans-serif" font-weight="700">STEP</text>',
  vol: '<path d="M4 9v6h4l5 4V5L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9zm15.6 3 2.1-2.1-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4z"/>',
  gear: '<path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/>',
  pip: '<path d="M19 7h-8v6h8zm2-4H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H3V5h18z"/>',
  fs: '<path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z"/>',
  fsx: '<path d="M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z"/>',
  restart: '<path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>'
};
const svg = (k, step) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k].replace("STEP", step || "")}</svg>`;

function injectCss() {
  if (document.getElementById("kp-css")) return;
  const st = document.createElement("style");
  st.id = "kp-css";
  st.textContent = `
  .kp{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:var(--kp-radius,14px);overflow:hidden;color:#fff;font-family:inherit;user-select:none;-webkit-user-select:none;outline:none;direction:ltr;--kp-a:var(--accent,#3fa9f5)}
  .kp:fullscreen,.kp:-webkit-full-screen{border-radius:0;aspect-ratio:auto;width:100%;height:100%}
  .kp video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000}
  .kp svg{width:24px;height:24px;fill:currentColor}
  .kp button{background:none;border:0;color:inherit;cursor:pointer;padding:6px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font:inherit}
  .kp button:hover{background:#ffffff1f}
  .kp button:focus-visible{outline:2px solid var(--kp-a)}
  .kp-shade{position:absolute;inset:auto 0 0 0;height:45%;background:linear-gradient(transparent,#000c);pointer-events:none;transition:opacity .25s}
  .kp-bar{position:absolute;left:0;right:0;bottom:0;padding:0 10px 6px;transition:opacity .25s,transform .25s}
  .kp.idle .kp-bar,.kp.idle .kp-shade,.kp.idle .kp-top{opacity:0;pointer-events:none}
  .kp.idle{cursor:none}
  .kp-row{display:flex;align-items:center;gap:2px}
  .kp-row .sp{flex:1}
  .kp-time{font-size:13px;font-variant-numeric:tabular-nums;padding:0 8px;white-space:nowrap;opacity:.95}
  .kp-live{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;letter-spacing:.3px;padding:4px 10px!important;border-radius:999px!important;background:#ffffff22!important;white-space:nowrap}
  .kp-live i{width:8px;height:8px;border-radius:50%;background:#aaa}
  .kp-live.on i{background:#ff3b3b;box-shadow:0 0 0 0 #ff3b3b;animation:kpPulse 1.6s infinite}
  .kp-live.on{background:#ff3b3b33!important}
  @keyframes kpPulse{0%{box-shadow:0 0 0 0 #ff3b3baa}70%{box-shadow:0 0 0 7px #ff3b3b00}100%{box-shadow:0 0 0 0 #ff3b3b00}}
  .kp-seek{position:relative;height:18px;cursor:pointer;touch-action:none;display:flex;align-items:center}
  .kp-track{position:relative;width:100%;height:4px;border-radius:4px;background:#ffffff40;transition:height .15s}
  .kp-seek:hover .kp-track,.kp-seek.drag .kp-track{height:6px}
  .kp-buf,.kp-prog{position:absolute;left:0;top:0;bottom:0;border-radius:4px}
  .kp-buf{background:#ffffff59}.kp-prog{background:var(--kp-a)}
  .kp-thumb{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:var(--kp-a);transform:scale(0);transition:transform .15s}
  .kp-seek:hover .kp-thumb,.kp-seek.drag .kp-thumb{transform:scale(1)}
  .kp-mark{position:absolute;top:-3px;bottom:-3px;width:3px;margin-left:-1px;background:#fff;border-radius:2px;opacity:.9}
  .kp-tip{position:absolute;bottom:22px;transform:translateX(-50%);background:#000d;padding:3px 8px;border-radius:6px;font-size:12px;white-space:nowrap;pointer-events:none;display:none;font-variant-numeric:tabular-nums}
  .kp-seek:hover .kp-tip,.kp-seek.drag .kp-tip{display:block}
  .kp-vol{display:flex;align-items:center}
  .kp-vol input{width:0;opacity:0;transition:width .2s,opacity .2s;accent-color:#fff}
  .kp-vol:hover input,.kp-vol input:focus{width:70px;opacity:1;margin-inline:4px}
  .kp-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
  .kp-big{pointer-events:auto;width:76px;height:76px;border-radius:50%!important;background:#000a!important;backdrop-filter:blur(6px)}
  .kp-big svg{width:40px;height:40px}
  .kp-spin{width:46px;height:46px;border-radius:50%;border:4px solid #ffffff33;border-top-color:#fff;animation:kpSpin .9s linear infinite}
  @keyframes kpSpin{to{transform:rotate(360deg)}}
  .kp-toast{position:absolute;top:14px;left:50%;transform:translateX(-50%);background:#000c;padding:7px 14px;border-radius:999px;font-size:13px;opacity:0;transition:opacity .25s;pointer-events:none;direction:rtl;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
  .kp-toast.show{opacity:1}
  .kp-tap{position:absolute;top:50%;transform:translateY(-50%);background:#0008;border-radius:999px;padding:12px 18px;font-weight:700;opacity:0;transition:opacity .3s;pointer-events:none}
  .kp-tap.l{left:12%}.kp-tap.r{right:12%}.kp-tap.show{opacity:1}
  .kp-banner{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);direction:rtl;background:#000d;backdrop-filter:blur(8px);padding:10px 12px 10px 14px;border-radius:14px;display:flex;gap:8px;align-items:center;font-size:14px;max-width:calc(100% - 24px);flex-wrap:wrap;justify-content:center;box-shadow:0 8px 30px #0008}
  .kp-banner b{font-weight:600}
  .kp-banner button{background:#ffffff1f;padding:7px 12px;font-size:13px;font-weight:600}
  .kp-banner button.pri{background:var(--kp-a)}
  .kp-unmute{position:absolute;top:12px;left:12px;direction:rtl;background:#000c!important;padding:8px 12px!important;font-size:13px;gap:6px}
  .kp-unmute svg{width:18px;height:18px}
  .kp-menu{position:absolute;right:10px;bottom:62px;width:290px;max-width:calc(100% - 20px);max-height:calc(100% - 76px);overflow-y:auto;background:#141414f2;backdrop-filter:blur(10px);border-radius:14px;padding:6px;direction:rtl;font-size:14px;box-shadow:0 10px 40px #000a}
  .kp-menu .mi{display:flex!important;width:100%;justify-content:space-between!important;gap:12px;padding:10px 12px!important;text-align:right}
  .kp-menu .mi span:last-child{opacity:.7;font-size:13px}
  .kp-menu .mh{display:flex;align-items:center;gap:6px;padding:8px 8px 6px;font-weight:600;border-bottom:1px solid #ffffff1a;margin-bottom:4px}
  .kp-menu .mi.sel span:first-child::after{content:" ✓";color:var(--kp-a)}
  .kp-menu .sw{width:34px;height:20px;border-radius:999px;background:#ffffff40;position:relative;flex:none;opacity:1!important}
  .kp-menu .sw::after{content:"";position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s}
  .kp-menu .sw.on{background:var(--kp-a)}.kp-menu .sw.on::after{right:16px}
  .kp-menu .note{padding:4px 12px 8px;font-size:12px;opacity:.65;line-height:1.5}
  .kp-stats{position:absolute;top:10px;right:10px;background:#000c;border-radius:10px;padding:8px 12px;font:12px/1.6 ui-monospace,Menlo,monospace;direction:ltr;pointer-events:none;white-space:pre}
  .kp-err{position:absolute;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;background:#000d;direction:rtl;text-align:center;padding:20px;font-size:15px}
  .kp-err a{color:var(--kp-a);font-weight:600}
  .kp .hide{display:none!important}
  @media (max-width:560px){.kp-time{font-size:11px;padding:0 4px}.kp-hide-sm{display:none!important}.kp svg{width:22px;height:22px}.kp-bar{padding:0 4px 2px}.kp-banner{bottom:60px;font-size:13px}}
  `;
  document.head.appendChild(st);
}

export class Player {
  /**
   * @param {HTMLElement} root
   * @param {object} opts { cfg: player-config, texts, fallbackUrl, onEnd(), onState(s) }
   */
  constructor(root, opts) {
    injectCss();
    this.root = root;
    this.o = opts;
    this.cfg = opts.cfg;
    this.prefs = Object.assign({ quality: null, speed: 1, volume: 1, muted: false, savePos: true, stats: false, delayMode: null, delay: null }, store.get(PREFS_KEY, {}));
    this.hls = null;
    this.offset = null;     // pos = absSec + offset
    this.following = true; // צמוד לשידור החי
    this.stalls = 0;
    this.lastStallAt = 0;
    this.lastAdjustAt = Date.now();
    this.stallStart = 0;
    this.played = false;
    this.retries = 0;
    this.timers = [];
    this.build();
    this.initDelay();
  }

  // ---------- השהיה ----------
  initDelay() {
    const c = this.cfg;
    this.dMin = Math.max(2, +c.delayMin || 6);
    this.dMax = Math.max(this.dMin, +c.delayMax || 40);
    if (c.viewerDelay && this.prefs.delayMode === "fixed" && this.prefs.delay) {
      this.mode = "fixed"; this.delay = clamp(+this.prefs.delay, 2, 120);
    } else if (c.delayMode === "fixed" && !(c.viewerDelay && this.prefs.delayMode === "auto")) {
      this.mode = "fixed"; this.delay = clamp(+c.delay || 12, 2, 120);
    } else {
      this.mode = "auto";
      const saved = store.get(DELAY_KEY, null);
      const fresh = saved && Date.now() - saved.at < 7 * 864e5;
      this.delay = clamp(fresh ? saved.d : (+c.delay || 12), this.dMin, this.dMax);
    }
  }
  setDelay(d, why) {
    d = Math.round(d);
    if (d === this.delay) return;
    this.delay = d;
    if (this.mode === "auto") store.set(DELAY_KEY, { d, at: Date.now() });
    if (why) this.toast(why);
  }

  savePrefs() { store.set(PREFS_KEY, this.prefs); }

  // ---------- בניית הממשק ----------
  build() {
    const step = +this.cfg.seekStep || 10;
    this.root.innerHTML = `
      <div class="kp" tabindex="0">
        <video playsinline webkit-playsinline preload="auto"></video>
        <div class="kp-center"><div class="kp-spin"></div><button class="kp-big hide" aria-label="ניגון">${svg("play")}</button></div>
        <div class="kp-tap l"></div><div class="kp-tap r"></div>
        <div class="kp-shade"></div>
        <button class="kp-unmute hide">${svg("mute")} הקישו להפעלת הקול</button>
        <div class="kp-stats hide"></div>
        <div class="kp-toast"></div>
        <div class="kp-banner hide"></div>
        <div class="kp-menu hide"></div>
        <div class="kp-bar">
          <div class="kp-seek"><div class="kp-track"><div class="kp-buf"></div><div class="kp-prog"></div><div class="kp-mark hide" title="תחילת התוכנית"></div><div class="kp-thumb"></div></div><div class="kp-tip"></div></div>
          <div class="kp-row">
            <button data-a="play" aria-label="ניגון/השהיה">${svg("play")}</button>
            <button data-a="back" aria-label="אחורה ${step} שניות">${svg("back", step)}</button>
            <button data-a="fwd" aria-label="קדימה ${step} שניות">${svg("fwd", step)}</button>
            <div class="kp-vol"><button data-a="mute" aria-label="השתקה">${svg("vol")}</button><input type="range" min="0" max="1" step="0.05" aria-label="עוצמה"></div>
            <span class="kp-time"></span>
            <button data-a="live" class="kp-live"><i></i><span></span></button>
            <span class="sp"></span>
            <button data-a="restart" class="kp-hide-sm hide" aria-label="מתחילת התוכנית" title="מתחילת התוכנית">${svg("restart")}</button>
            <button data-a="menu" aria-label="הגדרות" title="הגדרות">${svg("gear")}</button>
            <button data-a="pip" class="kp-hide-sm" aria-label="תמונה בתוך תמונה" title="תמונה בתוך תמונה">${svg("pip")}</button>
            <button data-a="fs" aria-label="מסך מלא" title="מסך מלא">${svg("fs")}</button>
          </div>
        </div>
      </div>`;
    const q = s => this.root.querySelector(s);
    this.el = {
      box: q(".kp"), video: q("video"), spin: q(".kp-spin"), big: q(".kp-big"), toast: q(".kp-toast"),
      banner: q(".kp-banner"), menu: q(".kp-menu"), stats: q(".kp-stats"), unmute: q(".kp-unmute"),
      seek: q(".kp-seek"), buf: q(".kp-buf"), prog: q(".kp-prog"), thumb: q(".kp-thumb"), tip: q(".kp-tip"), mark: q(".kp-mark"),
      time: q(".kp-time"), live: q(".kp-live"), liveTxt: q(".kp-live span"), vol: q(".kp-vol input"),
      play: q('[data-a="play"]'), mute: q('[data-a="mute"]'), fs: q('[data-a="fs"]'), pip: q('[data-a="pip"]'), restart: q('[data-a="restart"]'),
      tapL: q(".kp-tap.l"), tapR: q(".kp-tap.r")
    };
    const v = this.el.video;
    v.volume = this.prefs.volume; v.muted = this.prefs.muted;
    this.el.vol.value = this.prefs.muted ? 0 : this.prefs.volume;
    if (!(document.pictureInPictureEnabled || v.webkitSupportsPresentationMode)) this.el.pip.classList.add("hide");

    this.root.querySelector(".kp-row").addEventListener("click", e => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      e.stopPropagation();
      ({ play: () => this.toggle(), back: () => this.skip(-step), fwd: () => this.skip(step), mute: () => this.toggleMute(),
         live: () => this.goLive(true), restart: () => this.fromStart(), menu: () => this.toggleMenu(), pip: () => this.togglePip(), fs: () => this.toggleFs() })[b.dataset.a]?.();
      this.poke();
    });
    this.el.big.onclick = e => { e.stopPropagation(); this.play(true); };
    this.el.unmute.onclick = e => { e.stopPropagation(); v.muted = false; this.prefs.muted = false; if (v.volume === 0) v.volume = 1; this.savePrefs(); this.el.unmute.classList.add("hide"); this.syncUi(); };
    this.el.vol.oninput = () => { v.volume = +this.el.vol.value; v.muted = v.volume === 0; this.prefs.volume = v.volume || this.prefs.volume; this.prefs.muted = v.muted; this.savePrefs(); this.syncUi(); };

    // אירועי וידאו
    v.addEventListener("play", () => this.syncUi());
    v.addEventListener("pause", () => { this.syncUi(); this.releaseWake(); this.savePos(); });
    v.addEventListener("playing", () => {
      this.el.spin.classList.add("hide"); this.el.big.classList.add("hide");
      if (this.stallStart) { const d = Date.now() - this.stallStart; this.stallStart = 0; if (d > 400) this.onStall(d); }
      this.played = true; this.retries = 0; this.wake(); this.syncUi();
    });
    v.addEventListener("waiting", () => {
      this.el.spin.classList.remove("hide");
      if (this.played && !v.seeking && !v.paused) this.stallStart = Date.now();
    });
    v.addEventListener("seeking", () => { this.stallStart = 0; });
    v.addEventListener("volumechange", () => this.syncUi());
    v.addEventListener("timeupdate", () => this.onTime());
    for (const ev of ["loadedmetadata", "canplay", "progress"]) v.addEventListener(ev, () => { if (!this.readyDone) this.onReady(); });

    // לחיצות על הווידאו: לחיצה = הצג/הסתר, לחיצה כפולה = דילוג (מגע) / מסך מלא (עכבר)
    let lastTap = 0, tapTimer = null;
    this.el.box.addEventListener("click", e => {
      if (e.target.closest(".kp-bar,.kp-menu,.kp-banner,button")) return;
      if (!this.el.menu.classList.contains("hide")) { this.toggleMenu(false); return; }
      const now = Date.now();
      const rect = this.el.box.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const touch = e.pointerType === "touch" || matchMedia("(pointer:coarse)").matches;
      if (now - lastTap < 300) {
        clearTimeout(tapTimer); lastTap = 0;
        if (touch && x < 0.38) this.skip(-step, true);
        else if (touch && x > 0.62) this.skip(step, true);
        else this.toggleFs();
        return;
      }
      lastTap = now;
      tapTimer = setTimeout(() => {
        if (touch) { wasIdle ? this.poke() : this.hideControls(); }
        else this.toggle();
      }, 260);
    });
    // זוכרים אם הכפתורים היו מוסתרים *לפני* הנגיעה, כדי שהקשה תציג אותם ולא תסתיר מיד
    let wasIdle = false;
    this.el.box.addEventListener("pointerdown", e => {
      wasIdle = this.el.box.classList.contains("idle");
      if (e.pointerType !== "mouse" && e.target.closest(".kp-bar,.kp-menu,.kp-banner,button")) this.poke();
    }, true);
    this.el.box.addEventListener("pointermove", e => { if (e.pointerType === "mouse") this.poke(); });
    this.el.box.addEventListener("keydown", e => this.onKey(e));
    document.addEventListener("fullscreenchange", () => this.syncUi());
    document.addEventListener("webkitfullscreenchange", () => this.syncUi());

    this.setupSeek();
    this.timers.push(setInterval(() => this.everySecond(), 1000));
    this.timers.push(setInterval(() => this.savePos(), 5000));
    addEventListener("pagehide", () => this.savePos());
    this.poke();
  }

  // ---------- טעינת מקור ----------
  /**
   * @param {object} p { src, win: {start,end,key,name,label}|null, startAt: "live"|"start"|"ask"|absMs, endAt: absMs|null, title, dvrMs }
   */
  async load(p) {
    this.p = p;
    this.following = true;
    this.offset = null;
    this.readyDone = false;
    this.played = false;
    this.el.spin.classList.remove("hide");
    this.hideBanner();
    const src = this.buildSrc(p.src, p.dvrMs);
    this.mediaSession();
    const v = this.el.video;
    const canNative = v.canPlayType("application/vnd.apple.mpegurl");
    let Hls = null;
    try { Hls = await loadHls(); } catch (e) {}
    if (Hls && Hls.isSupported()) {
      this.destroyHls();
      const hls = this.hls = new Hls({
        liveSyncDuration: this.delay,
        liveMaxLatencyDuration: 1e7,       // לא לקפוץ קדימה אוטומטית (מאפשר חזרה אחורה)
        maxLiveSyncPlaybackRate: 1,
        backBufferLength: 60,
        maxBufferLength: 30,
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        startLevel: -1,
        manifestLoadingMaxRetry: 6, levelLoadingMaxRetry: 6, fragLoadingMaxRetry: 6
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => this.applyQuality());
      hls.on(Hls.Events.LEVEL_LOADED, () => { if (!this.readyDone) this.onReady(); });
      hls.on(Hls.Events.LEVEL_SWITCHED, () => this.menuOpen && this.renderMenu(this.menuPage));
      hls.on(Hls.Events.ERROR, (e, d) => this.onHlsError(Hls, d));
      hls.loadSource(src);
      hls.attachMedia(v);
    } else if (canNative) {
      this.destroyHls();
      v.src = src;
    } else {
      this.showError("הדפדפן הזה לא תומך בניגון השידור.");
      return;
    }
    if (this.cfg.autoplay !== false) this.play(false);
    else { this.el.spin.classList.add("hide"); this.el.big.classList.remove("hide"); }
  }

  buildSrc(src, dvrMs) {
    const param = (this.cfg.dvrParam || "").trim();
    if (!param || !dvrMs || dvrMs <= 0) return src;
    return src + (src.includes("?") ? "&" : "?") + encodeURIComponent(param) + "=" + Math.round(Math.min(MAX_DVR_MS, dvrMs));
  }

  onHlsError(Hls, d) {
    if (!d.fatal) return;
    this.retries++;
    if (this.retries > 8) { this.showError(); return; }
    if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
      this.toast("בעיית חיבור, מנסה שוב...");
      setTimeout(() => this.hls && this.hls.startLoad(), Math.min(15000, 1000 * 2 ** this.retries));
    } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
      this.hls.recoverMediaError();
    } else {
      setTimeout(() => this.load(this.p), 3000);
    }
  }

  showError(msg) {
    this.el.spin.classList.add("hide");
    const old = this.root.querySelector(".kp-err"); if (old) old.remove();
    const d = document.createElement("div");
    d.className = "kp-err";
    const t = this.o.texts || {};
    d.innerHTML = `<div>${msg || "לא מצליחים להתחבר לשידור כרגע."}</div><button class="kp-retry" style="background:#ffffff26;padding:8px 18px">נסו שוב</button>${this.o.fallbackUrl ? `<a target="_blank" rel="noopener"></a>` : ""}`;
    const a = d.querySelector("a"); if (a) { a.href = this.o.fallbackUrl; a.textContent = t.fallbackLink || "לצפייה באתר"; }
    d.querySelector(".kp-retry").onclick = () => { d.remove(); this.retries = 0; this.load(this.p); };
    this.el.box.appendChild(d);
  }

  // ---------- מיפוי זמן אמיתי <-> מיקום בנגן ----------
  calcOffset() {
    if (this.hls) {
      const lv = this.hls.levels?.[this.hls.currentLevel >= 0 ? this.hls.currentLevel : Math.max(0, this.hls.loadLevel)];
      const fr = lv?.details?.fragments?.find(f => f.programDateTime);
      if (fr) return fr.start - fr.programDateTime / 1000;
      return null;
    }
    const d = this.el.video.getStartDate?.();
    if (d && !isNaN(d.getTime()) && d.getTime() > 0) return -d.getTime() / 1000;
    return null;
  }
  posOf(absMs) { return this.offset == null ? null : absMs / 1000 + this.offset; }
  absOf(pos) { return this.offset == null ? null : (pos - this.offset) * 1000; }
  range() {
    const s = this.el.video.seekable;
    if (s && s.length) return [s.start(0), s.end(s.length - 1)];
    const det = this.hls?.levels?.[Math.max(0, this.hls.currentLevel)]?.details;
    if (det) return [det.fragments[0]?.start || 0, det.edge];
    return [0, 0];
  }
  edge() { return this.range()[1]; }
  latency() { return this.edge() - this.el.video.currentTime; }

  onReady() {
    const off = this.calcOffset();
    if (off != null) this.offset = off;
    const [s, e] = this.range();
    if (this.readyDone || e <= 0 || this.el.video.readyState < 1) return;
    this.readyDone = true;
    const p = this.p, v = this.el.video, now = Date.now();
    const win = p.win;

    // המשך מאיפה שעצרו
    let target = null, resumeAsk = null;
    const saved = store.get(POS_KEY, null);
    const rmode = this.cfg.resume || "ask";
    if (rmode !== "off" && this.prefs.savePos && saved && win && saved.key === win.key && !saved.live && now - saved.at < 12 * 3600e3 && this.offset != null) {
      const pos = this.posOf(saved.abs);
      if (pos != null && pos > s + 1 && pos < e - this.delay - 15) {
        if (rmode === "auto") { target = pos; this.toast(`ממשיכים מ-${clock(saved.abs).slice(0, 5)}`); }
        else resumeAsk = saved.abs;
      }
    }

    if (target == null) {
      if (typeof p.startAt === "number" && this.offset != null) target = this.posOf(p.startAt);
      else if (p.startAt === "start" && win && this.offset != null) target = this.posOf(win.start);
    }
    if (target != null) {
      target = clamp(target, s + 0.5, e - 2);
      this.following = e - target < this.delay + 8;
      v.currentTime = target;
    } else {
      this.following = true;
      v.currentTime = Math.max(s, e - this.delay);
    }

    if (win && this.offset != null) {
      const startPos = this.posOf(win.start);
      if (startPos > s + 1) this.el.restart.classList.remove("hide");
      const sinceMin = (now - win.start) / 60000;
      if (resumeAsk) {
        this.banner(`<b>להמשיך מאיפה שעצרתם (${clock(resumeAsk).slice(0, 5)})?</b>`,
          [["המשך", () => this.seekAbs(resumeAsk), true], ["לשידור החי", () => this.goLive()]]);
      } else if (p.startAt === "ask" && sinceMin > 2 && startPos > s + 1 && !p.replay) {
        this.banner(`<b>התוכנית התחילה לפני ${Math.round(sinceMin)} דקות</b>`,
          [["מההתחלה", () => this.fromStart(), true], ["המשך בשידור החי", () => {}]]);
      }
    }
    this.syncUi();
  }

  // ---------- פעולות ----------
  async play(user) {
    const v = this.el.video;
    if (!user && this.cfg.startMuted) v.muted = true;
    try {
      await v.play();
    } catch (e) {
      if (!v.muted) {
        v.muted = true;
        try { await v.play(); this.el.unmute.classList.remove("hide"); return; } catch (e2) {}
      }
      this.el.spin.classList.add("hide");
      this.el.big.classList.remove("hide");
    }
    if (v.muted && !this.prefs.muted) this.el.unmute.classList.remove("hide");
  }
  toggle() { const v = this.el.video; if (v.paused) { if (this.following && this.latency() > this.delay + 20) this.following = false; this.play(true); } else v.pause(); }
  toggleMute() { const v = this.el.video; v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 1; this.prefs.muted = v.muted; this.savePrefs(); this.el.unmute.classList.add("hide"); }
  skip(sec, tap) {
    const v = this.el.video, [s, e] = this.range();
    const t = clamp(v.currentTime + sec, s + 0.5, e - Math.min(this.delay, 4));
    v.currentTime = t;
    this.following = sec < 0 ? false : e - t < this.delay + 6;
    if (this.following) v.playbackRate = 1;
    if (tap) { const el = sec < 0 ? this.el.tapL : this.el.tapR; el.textContent = (sec < 0 ? "−" : "+") + Math.abs(sec); el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 600); }
    this.syncUi();
  }
  seekAbs(abs) { const p = this.posOf(abs); if (p == null) return; const [s, e] = this.range(); this.el.video.currentTime = clamp(p, s + 0.5, e - 2); this.following = e - p < this.delay + 6; this.play(true); this.syncUi(); }
  goLive(user) {
    const v = this.el.video;
    this.following = true;
    v.currentTime = Math.max(this.range()[0], this.edge() - this.delay);
    v.playbackRate = 1;
    if (v.paused) this.play(true);
    if (user) this.toast("חזרה לשידור החי");
    this.syncUi();
  }
  fromStart() {
    if (!this.p?.win) return;
    this.seekAbs(this.p.win.start);
    this.toast("מתחילת התוכנית");
  }
  async togglePip() {
    const v = this.el.video;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
      else if (v.webkitSetPresentationMode) v.webkitSetPresentationMode(v.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture");
    } catch (e) { this.toast("לא נתמך במכשיר הזה"); }
  }
  async toggleFs() {
    const box = this.el.box, v = this.el.video;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (fsEl) { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      if (box.requestFullscreen) { await box.requestFullscreen(); screen.orientation?.lock?.("landscape").catch(() => {}); }
      else if (box.webkitRequestFullscreen) box.webkitRequestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    } catch (e) { if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); }
  }

  onKey(e) {
    if (e.target.tagName === "INPUT") return;
    const step = +this.cfg.seekStep || 10;
    const k = e.key.toLowerCase();
    const map = {
      " ": () => this.toggle(), k: () => this.toggle(), "ה": () => this.toggle(),
      arrowleft: () => this.skip(-step), arrowright: () => this.skip(step), j: () => this.skip(-step), l: () => this.goLive(true),
      f: () => this.toggleFs(), "כ": () => this.toggleFs(), m: () => this.toggleMute(), "צ": () => this.toggleMute(),
      arrowup: () => { const v = this.el.video; v.muted = false; v.volume = clamp(v.volume + .1, 0, 1); this.toast(`עוצמה ${Math.round(v.volume * 100)}%`); },
      arrowdown: () => { const v = this.el.video; v.volume = clamp(v.volume - .1, 0, 1); this.toast(`עוצמה ${Math.round(v.volume * 100)}%`); },
      escape: () => this.toggleMenu(false)
    };
    if (map[k]) { e.preventDefault(); map[k](); this.poke(); }
  }

  // ---------- השהיה אוטומטית ----------
  onStall(ms) {
    this.stalls++;
    this.lastStallAt = Date.now();
    if (this.mode !== "auto") return;
    const add = Math.max(2, Math.ceil(ms / 1000) + 1);
    const nd = clamp(this.delay + add, this.dMin, this.dMax);
    if (nd > this.delay) { this.setDelay(nd); this.lastAdjustAt = Date.now(); }
  }

  everySecond() {
    const v = this.el.video;
    if (!this.readyDone) return;
    // יציבות: אם לא היו תקיעות 4 דקות, מקטינים בהדרגה את ההשהיה
    if (this.mode === "auto" && !v.paused && Date.now() - this.lastStallAt > 240e3 && Date.now() - this.lastAdjustAt > 240e3 && this.delay > this.dMin) {
      this.setDelay(Math.max(this.dMin, this.delay - 2)); this.lastAdjustAt = Date.now();
    }
    // שמירה על ההשהיה בזמן צפייה בשידור החי (שינוי מהירות עדין במקום קפיצות)
    if (this.following && !v.paused && !v.seeking && this.prefs.speed === 1) {
      const lat = this.latency();
      let rate = 1;
      if (lat > this.delay + 30) { this.goLive(); return; }
      if (lat > this.delay + 3 && this.bufferAhead() > 4) rate = 1.08;
      else if (lat < this.delay - 3) rate = 0.94;
      if (Math.abs(v.playbackRate - rate) > 0.001) v.playbackRate = rate;
    }
    if (!this.following && this.prefs.speed !== 1 && v.playbackRate !== this.prefs.speed) v.playbackRate = this.prefs.speed;
    if (this.prefs.speed > 1 && this.latency() < this.delay) { this.prefs.speed = 1; v.playbackRate = 1; this.following = true; this.toast("הגעתם לשידור החי"); }
    if (this.prefs.stats) this.renderStats();
    this.syncUi();
  }

  bufferAhead() {
    const v = this.el.video, b = v.buffered;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 0.3 && b.end(i) > v.currentTime) return b.end(i) - v.currentTime;
    return 0;
  }

  onTime() {
    if (this.offset == null) { const off = this.calcOffset(); if (off != null) this.offset = off; }
    const abs = this.absOf(this.el.video.currentTime);
    if (this.p?.endAt && abs != null && abs >= this.p.endAt) {
      this.el.video.pause();
      this.savePos(true);
      this.o.onEnd?.();
      return;
    }
    this.syncUi(true);
  }

  savePos(clear) {
    if (!this.p?.win || this.offset == null || !this.played) return;
    if (!this.prefs.savePos || clear) { store.set(POS_KEY, null); return; }
    const abs = this.absOf(this.el.video.currentTime);
    if (abs == null) return;
    store.set(POS_KEY, { key: this.p.win.key, abs, at: Date.now(), live: this.following });
  }

  // ---------- ממשק ----------
  syncUi(light) {
    const v = this.el.video;
    this.el.play.innerHTML = svg(v.paused ? "play" : "pause");
    this.el.mute.innerHTML = svg(v.muted || v.volume === 0 ? "mute" : "vol");
    if (!this.dragging) this.el.vol.value = v.muted ? 0 : v.volume;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    this.el.fs.innerHTML = svg(fsEl ? "fsx" : "fs");
    const [s, e] = this.range();
    const span = Math.max(1, e - s);
    const cur = v.currentTime;
    if (!this.dragging) {
      const pct = clamp((cur - s) / span, 0, 1) * 100;
      this.el.prog.style.width = pct + "%";
      this.el.thumb.style.left = pct + "%";
    }
    const ba = this.bufferAhead();
    this.el.buf.style.width = clamp((cur + ba - s) / span, 0, 1) * 100 + "%";
    const lat = e - cur;
    const atLive = this.following && lat < this.delay + 8;
    this.el.live.classList.toggle("on", atLive);
    const t = this.o.texts || {};
    this.el.liveTxt.textContent = atLive ? (t.liveBadge || "שידור חי") : "לשידור החי ›";
    const abs = this.absOf(cur);
    this.el.time.textContent = abs != null ? clock(abs) + (atLive ? "" : `  (−${dur(lat - this.delay > 0 ? lat - this.delay : lat)})`) : "";
    if (this.p?.win && this.offset != null) {
      const sp = this.posOf(this.p.win.start);
      if (sp > s && sp < e) { this.el.mark.classList.remove("hide"); this.el.mark.style.left = ((sp - s) / span) * 100 + "%"; }
      else this.el.mark.classList.add("hide");
    }
  }

  setupSeek() {
    const sk = this.el.seek;
    const at = ev => { const r = sk.getBoundingClientRect(); return clamp((ev.clientX - r.left) / r.width, 0, 1); };
    const show = f => {
      const [s, e] = this.range();
      const pos = s + f * (e - s);
      const abs = this.absOf(pos);
      this.el.tip.style.left = f * 100 + "%";
      this.el.tip.textContent = abs != null ? clock(abs) + (e - pos > this.delay + 8 ? `  −${dur(e - pos - this.delay)}` : "") : dur(pos - s);
      return pos;
    };
    sk.addEventListener("pointermove", ev => { const f = at(ev); show(f); if (this.dragging) { this.el.prog.style.width = f * 100 + "%"; this.el.thumb.style.left = f * 100 + "%"; } });
    sk.addEventListener("pointerdown", ev => { this.dragging = true; sk.classList.add("drag"); sk.setPointerCapture(ev.pointerId); const f = at(ev); show(f); this.el.prog.style.width = f * 100 + "%"; this.el.thumb.style.left = f * 100 + "%"; });
    const end = ev => {
      if (!this.dragging) return;
      this.dragging = false; sk.classList.remove("drag");
      const pos = show(at(ev));
      const e = this.edge();
      if (e - pos < this.delay + 6) this.goLive();
      else { this.following = false; this.el.video.currentTime = pos; }
      this.syncUi();
    };
    sk.addEventListener("pointerup", end);
    sk.addEventListener("pointercancel", end);
  }

  poke() {
    this.el.box.classList.remove("idle");
    clearTimeout(this.idleT);
    const touch = matchMedia("(pointer:coarse)").matches;
    this.idleT = setTimeout(() => {
      if (!this.el.video.paused && this.el.menu.classList.contains("hide") && !this.dragging) this.el.box.classList.add("idle");
    }, touch ? 4500 : 3000);
  }
  hideControls() {
    clearTimeout(this.idleT);
    if (!this.el.video.paused && this.el.menu.classList.contains("hide")) this.el.box.classList.add("idle");
  }

  toast(msg) {
    const t = this.el.toast;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  banner(html, buttons, autoHide = 15000) {
    const b = this.el.banner;
    b.innerHTML = `<span>${html}</span>`;
    for (const [label, fn, pri] of buttons) {
      const btn = document.createElement("button");
      btn.textContent = label; if (pri) btn.className = "pri";
      btn.onclick = e => { e.stopPropagation(); this.hideBanner(); fn(); };
      b.appendChild(btn);
    }
    b.classList.remove("hide");
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => this.hideBanner(), autoHide);
  }
  hideBanner() { this.el.banner.classList.add("hide"); }

  // ---------- תפריט הגדרות ----------
  toggleMenu(force) {
    this.menuOpen = force ?? this.el.menu.classList.contains("hide");
    this.el.menu.classList.toggle("hide", !this.menuOpen);
    if (this.menuOpen) this.renderMenu("main");
  }

  levels() {
    if (!this.hls) return [];
    const seen = new Map();
    this.hls.levels.forEach((l, i) => { const h = l.height; if (!seen.has(h) || l.bitrate > this.hls.levels[seen.get(h)].bitrate) seen.set(h, i); });
    return [...seen.entries()].sort((a, b) => b[0] - a[0]).map(([h, i]) => ({ h, i }));
  }
  applyQuality() {
    if (!this.hls) return;
    const want = this.prefs.quality ?? this.cfg.defaultQuality ?? "auto";
    if (want === "auto") { this.hls.currentLevel = -1; return; }
    const lv = this.levels().find(l => l.h <= +want) || this.levels().slice(-1)[0];
    if (lv) this.hls.currentLevel = lv.i;
  }
  qualityLabel() {
    if (!this.hls) return "אוטומטי";
    const auto = this.hls.autoLevelEnabled;
    const cur = this.hls.levels[this.hls.currentLevel >= 0 ? this.hls.currentLevel : this.hls.loadLevel];
    return auto ? `אוטומטי${cur ? ` (${cur.height}p)` : ""}` : `${cur?.height || ""}p`;
  }

  renderMenu(page) {
    this.menuPage = page;
    const m = this.el.menu;
    const sw = on => `<span class="sw ${on ? "on" : ""}"></span>`;
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const delays = [4, 6, 8, 10, 15, 20, 30, 45];
    const head = t => `<div class="mh"><button data-m="main" aria-label="חזרה">›</button>${t}</div>`;
    let h = "";
    if (page === "main") {
      h += this.hls ? `<button class="mi" data-m="quality"><span>איכות</span><span>${this.qualityLabel()} ‹</span></button>` : "";
      h += `<button class="mi" data-m="speed"><span>מהירות</span><span>${this.prefs.speed === 1 ? "רגילה" : this.prefs.speed + "x"} ‹</span></button>`;
      if (this.cfg.viewerDelay) h += `<button class="mi" data-m="delay"><span>השהיה מהשידור</span><span>${this.mode === "auto" ? "אוטומטית" : "קבועה"} · ${this.delay} שנ׳ ‹</span></button>`;
      h += `<button class="mi" data-t="savePos"><span>שמירת מיקום צפייה</span>${sw(this.prefs.savePos)}</button>`;
      if (this.cfg.showStatsOption !== false) h += `<button class="mi" data-t="stats"><span>נתונים טכניים</span>${sw(this.prefs.stats)}</button>`;
      if (this.p?.win && !this.el.restart.classList.contains("hide")) h += `<button class="mi" data-x="restart"><span>⏮ מתחילת התוכנית</span><span></span></button>`;
      h += `<button class="mi" data-x="live"><span>● לשידור החי</span><span></span></button>`;
      h += `<button class="mi" data-m="keys"><span>מקשי קיצור</span><span>‹</span></button>`;
    } else if (page === "quality") {
      h += head("איכות");
      const cur = this.hls.autoLevelEnabled ? "auto" : String(this.hls.levels[this.hls.currentLevel]?.height);
      h += `<button class="mi ${cur === "auto" ? "sel" : ""}" data-q="auto"><span>אוטומטית (מומלץ)</span><span></span></button>`;
      for (const l of this.levels()) h += `<button class="mi ${cur === String(l.h) ? "sel" : ""}" data-q="${l.h}"><span>${l.h}p${l.h >= 720 ? " HD" : ""}</span><span>${(this.hls.levels[l.i].bitrate / 1e6).toFixed(1)} Mbps</span></button>`;
    } else if (page === "speed") {
      h += head("מהירות");
      for (const s of speeds) h += `<button class="mi ${this.prefs.speed === s ? "sel" : ""}" data-s="${s}"><span>${s === 1 ? "רגילה" : s + "x"}</span><span></span></button>`;
      h += `<div class="note">מהירות מעל רגילה פועלת רק כשאתם מאחורי השידור החי.</div>`;
    } else if (page === "delay") {
      h += head("השהיה מהשידור החי");
      h += `<button class="mi ${this.mode === "auto" ? "sel" : ""}" data-d="auto"><span>אוטומטית (מומלץ)</span><span>${this.mode === "auto" ? this.delay + " שנ׳" : ""}</span></button>`;
      for (const d of delays) h += `<button class="mi ${this.mode === "fixed" && this.delay === d ? "sel" : ""}" data-d="${d}"><span>${d} שניות</span><span></span></button>`;
      h += `<div class="note">באוטומטי, הנגן מגדיל את ההשהיה בכל פעם שהשידור נתקע אצלכם, ומקטין אותה בהדרגה כשהחיבור יציב. השהיה גדולה = פחות תקיעות.</div>`;
    } else if (page === "keys") {
      h += head("מקשי קיצור");
      h += [["רווח / K", "ניגון / השהיה"], ["← / →", "אחורה / קדימה"], ["L", "לשידור החי"], ["F", "מסך מלא"], ["M", "השתקה"], ["↑ / ↓", "עוצמה"], ["הקשה כפולה בצד", "דילוג (בטלפון)"]]
        .map(([k, d]) => `<div class="mi"><span>${d}</span><span>${k}</span></div>`).join("");
    }
    m.innerHTML = h;
    m.onclick = e => {
      e.stopPropagation();
      const b = e.target.closest("button"); if (!b) return;
      const d = b.dataset;
      if (d.m) return this.renderMenu(d.m);
      if (d.t === "savePos") { this.prefs.savePos = !this.prefs.savePos; if (!this.prefs.savePos) store.set(POS_KEY, null); }
      if (d.t === "stats") { this.prefs.stats = !this.prefs.stats; this.el.stats.classList.toggle("hide", !this.prefs.stats); this.renderStats(); }
      if (d.q) { this.prefs.quality = d.q; this.applyQuality(); }
      if (d.s) { this.prefs.speed = +d.s; this.el.video.playbackRate = +d.s; if (+d.s > 1 && this.following && this.latency() < this.delay + 8) { this.toast("אתם כבר בשידור החי"); } }
      if (d.d) {
        if (d.d === "auto") { this.prefs.delayMode = "auto"; this.prefs.delay = null; this.mode = "auto"; this.initDelay(); }
        else { this.prefs.delayMode = "fixed"; this.prefs.delay = +d.d; this.mode = "fixed"; this.delay = +d.d; }
        if (this.following) this.goLive();
      }
      if (d.x === "restart") { this.toggleMenu(false); return this.fromStart(); }
      if (d.x === "live") { this.toggleMenu(false); return this.goLive(true); }
      this.savePrefs();
      this.renderMenu(d.q || d.s || d.d ? "main" : page);
    };
  }

  renderStats() {
    if (!this.prefs.stats) { this.el.stats.classList.add("hide"); return; }
    const v = this.el.video, h = this.hls;
    const lv = h ? h.levels[h.currentLevel >= 0 ? h.currentLevel : h.loadLevel] : null;
    const q = v.getVideoPlaybackQuality?.();
    const [s, e] = this.range();
    this.el.stats.classList.remove("hide");
    this.el.stats.textContent = [
      `latency   ${this.latency().toFixed(1)}s (target ${this.delay}s, ${this.mode})`,
      `buffer    ${this.bufferAhead().toFixed(1)}s`,
      `stalls    ${this.stalls}`,
      lv ? `level     ${lv.width}x${lv.height} @ ${(lv.bitrate / 1e6).toFixed(2)} Mbps` : `size      ${v.videoWidth}x${v.videoHeight}`,
      h ? `bandwidth ${(h.bandwidthEstimate / 1e6).toFixed(2)} Mbps` : "",
      `dvr       ${dur(e - s)}`,
      q ? `dropped   ${q.droppedVideoFrames}/${q.totalVideoFrames}` : "",
      `rate      ${v.playbackRate.toFixed(2)}x`,
      `engine    ${h ? "hls.js" : "native"}`
    ].filter(Boolean).join("\n");
  }

  // ---------- מסך דולק ומדיה ----------
  async wake() { try { if ("wakeLock" in navigator && !this.lock) { this.lock = await navigator.wakeLock.request("screen"); this.lock.addEventListener("release", () => { this.lock = null; }); } } catch (e) {} }
  releaseWake() { try { this.lock?.release(); } catch (e) {} this.lock = null; }
  mediaSession() {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: this.p?.title || "שידור חי", artist: "שידור חי" });
      const step = +this.cfg.seekStep || 10;
      navigator.mediaSession.setActionHandler("play", () => this.play(true));
      navigator.mediaSession.setActionHandler("pause", () => this.el.video.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => this.skip(-step));
      navigator.mediaSession.setActionHandler("seekforward", () => this.skip(step));
    } catch (e) {}
  }

  destroyHls() { if (this.hls) { this.hls.destroy(); this.hls = null; } }
  destroy() {
    this.savePos();
    this.destroyHls();
    this.timers.forEach(clearInterval);
    this.releaseWake();
    const v = this.el.video; v.removeAttribute("src"); v.load();
    this.root.innerHTML = "";
  }
}
