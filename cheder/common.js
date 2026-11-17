// =====================================================================
//  תורנויות חדר - עזרים משותפים לאתר ולניהול: התחברות, הודעות, חלוניות
// =====================================================================
import { app, db, SDK, ADMIN_EMAIL, firebaseConfig } from "../firebase/config.js";
const AUTH = await import(`${SDK}/firebase-auth.js`);
export const FS = await import(`${SDK}/firebase-firestore.js`);
const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } = AUTH;

export { app, db, SDK, ADMIN_EMAIL, firebaseConfig };
export const auth = getAuth(app);

// בדיקות מקומיות בלבד: http://localhost:.../cheder/?emu  (אמולטורים של Firebase). לא פעיל באתר האמיתי
const EMU = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (new URLSearchParams(location.search).has("emu") || sessionStorage.getItem("ch-emu"));
if (EMU) {
  sessionStorage.setItem("ch-emu", "1");
  FS.connectFirestoreEmulator(db, "127.0.0.1", 8089);
  AUTH.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  window.__emuLogin = (email, name = "בודק") => AUTH.signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })));
}
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const emailKey = e => String(e || "").trim().toLowerCase();
export const isAdminUser = u => !!u && emailKey(u.email) === ADMIN_EMAIL && u.emailVerified === true;

export function authError(e) {
  const map = {
    "auth/unauthorized-domain": "הדומיין הזה לא מאושר ב-Firebase.",
    "auth/operation-not-allowed": "כניסה עם Google לא הופעלה ב-Firebase.",
    "auth/network-request-failed": "בעיית רשת. נסו שוב.",
    "auth/too-many-requests": "יותר מדי ניסיונות. נסו שוב בעוד רגע.",
    "permission-denied": "אין הרשאה לפעולה הזו.",
    "unavailable": "אין חיבור לאינטרנט. השינוי יישמר כשהחיבור יחזור."
  };
  return map[e && e.code] || `שגיאה: ${(e && (e.code || e.message)) || e}`;
}
export async function signIn(hint) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account", ...(hint ? { login_hint: hint } : {}) });
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return signInWithRedirect(auth, provider);
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    throw e;
  }
}
export function watchAuth(cb, onErr) {
  getRedirectResult(auth).catch(e => onErr && onErr(e));
  return onAuthStateChanged(auth, cb);
}
export const logout = () => signOut(auth);

// ---------- ערכת נושא ----------
export function initTheme(key = "ch-theme") {
  let t = null;
  try { t = localStorage.getItem(key); } catch (e) {}
  document.documentElement.dataset.theme = t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
export function toggleTheme(key = "ch-theme") {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(key, t); } catch (e) {}
}

// ---------- הודעה קופצת ----------
let toastTimer;
export function toast(msg, ms = 2600) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

// ---------- חלונית תחתונה ----------
// html = תוכן; onClick(act, el, root) מקבל כל לחיצה על [data-act]. מחזיר close()
export function sheet(html, onClick) {
  closeSheet();
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grip"></div>${html}</div>`;
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  bg.addEventListener("click", async e => {
    if (e.target === bg) return close();
    const el = e.target.closest("[data-act]");
    if (!el || !bg.contains(el)) return;
    if (el.dataset.act === "close") return close();
    if (onClick) await onClick(el.dataset.act, el, bg.querySelector(".sheet"), close);
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(bg);
  bg._close = close;
  const f = bg.querySelector("[autofocus]");
  if (f) setTimeout(() => f.focus(), 60);
  return { close, root: bg.querySelector(".sheet") };
}
export function closeSheet() { document.querySelectorAll(".sheet-bg").forEach(b => (b._close ? b._close() : b.remove())); }

export function confirmSheet(title, text, okLabel = "אישור", danger = false) {
  return new Promise(res => {
    let done = false;
    const s = sheet(`<h2>${esc(title)}</h2>${text ? `<div class="sub">${esc(text)}</div>` : ""}
      <div class="btns"><button class="btn ${danger ? "danger fill" : "pri"} grow" data-act="ok">${esc(okLabel)}</button><button class="btn" data-act="close">ביטול</button></div>`,
      (act, el, root, close) => { if (act === "ok") { done = true; close(); res(true); } });
    const obs = new MutationObserver(() => { if (!document.body.contains(s.root)) { obs.disconnect(); if (!done) res(false); } });
    obs.observe(document.body, { childList: true });
  });
}

// צבע קבוע לכל שם
const COLORS = ["#2b4b8c", "#a35f00", "#2f6a4a", "#8a3557", "#23707f", "#6b4a2a", "#4a3c8c", "#9c3a24", "#3d5a2a", "#5b5040"];
export function colorOf(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
export const initials = name => String(name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("");

export const GOOGLE_SVG = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
