// =====================================================================
//  מחולל הממים - reembir.com/b/memes
//  בוחרים קטגוריה -> תמונה -> עד שני טקסטים -> שליחה לבדיקה.
//  ל-Firestore (אוסף memes) נשמרים רק הקישור לתמונה המקורית והטקסטים.
// =====================================================================
import { db } from "../firebase/config.js?v=20261101h";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { CATEGORIES, catName, fetchCategory, loadFonts, loadImage, drawMeme, clampSize, esc } from "./meme.js?v=20261115b";

const $ = id => document.getElementById(id);
const PAGE = 48;

let cat = null, list = [], shown = 0, filter = "";
let cur = null, curImg = null, loadToken = 0;
let sending = false;

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

// ---------------------------------------------------------------------
//  קטגוריות
// ---------------------------------------------------------------------
$("cats").innerHTML = CATEGORIES.map(c =>
  `<button class="cat" data-id="${c.id}"><span class="ic">${c.ic}</span><span>${esc(c.name)}</span><span class="n" data-n="${c.id}"></span></button>`
).join("");
$("cats").addEventListener("click", e => {
  const b = e.target.closest(".cat");
  if (b) selectCat(b.dataset.id);
});

function selectCat(id) {
  if (!CATEGORIES.some(c => c.id === id)) id = CATEGORIES[0].id;
  cat = id;
  store.set("memes-cat", id);
  if (location.hash.slice(1) !== id) history.replaceState(history.state, "", "#" + id);
  document.querySelectorAll(".cat").forEach(b => b.classList.toggle("on", b.dataset.id === id));
  const on = document.querySelector(".cat.on");
  if (on && matchMedia("(max-width: 899px)").matches) on.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  $("search").value = ""; filter = "";
  $("catTitle").textContent = catName(id);
  window.scrollTo({ top: 0, behavior: "smooth" });
  loadCat(id);
}

async function loadCat(id) {
  $("grid").innerHTML = Array.from({ length: 12 }, () => `<div class="skel"></div>`).join("");
  try {
    const memes = await fetchCategory(id);
    if (cat !== id) return;
    list = memes;
    const n = document.querySelector(`[data-n="${id}"]`);
    if (n) n.textContent = memes.length;
    $("catTitle").innerHTML = `${esc(catName(id))}<small>${memes.length} תמונות</small>`;
    renderGrid(true);
  } catch {
    if (cat !== id) return;
    $("grid").innerHTML = `<div class="empty"><span class="big">😵</span>לא הצלחנו לטעון את הממים.<br><br><button class="ghost" id="retry">לנסות שוב</button></div>`;
    $("retry").onclick = () => loadCat(id);
  }
}

const filtered = () => filter ? list.filter(m => m.desc.includes(filter)) : list;

function renderGrid(reset) {
  const items = filtered();
  if (reset) { shown = 0; $("grid").innerHTML = ""; }
  if (!items.length) {
    $("grid").innerHTML = `<div class="empty"><span class="big">🔍</span>${filter ? "לא נמצאו תמונות לחיפוש הזה" : "אין תמונות בקטגוריה"}</div>`;
    return;
  }
  $("grid").querySelector(".more")?.remove();
  const html = items.slice(shown, shown + PAGE).map((m, i) =>
    `<button class="tile" data-i="${list.indexOf(m)}" style="animation-delay:${Math.min(i, 20) * 18}ms" aria-label="${esc(m.desc || "מם")}">
      <img src="${esc(m.thumb)}" alt="" loading="lazy" decoding="async" onload="this.classList.add('ld')" onerror="this.closest('.tile').remove()">
      ${m.desc ? `<span class="cap">${esc(m.desc)}</span>` : ""}
    </button>`).join("");
  $("grid").insertAdjacentHTML("beforeend", html);
  shown = Math.min(items.length, shown + PAGE);
  if (shown < items.length) {
    $("grid").insertAdjacentHTML("beforeend", `<div class="more"><div class="spin"></div></div>`);
    moreObs.observe($("grid").querySelector(".more"));
  }
}
const moreObs = new IntersectionObserver(es => {
  if (es.some(e => e.isIntersecting)) { moreObs.disconnect(); renderGrid(false); }
}, { rootMargin: "600px" });

$("grid").addEventListener("click", e => {
  const t = e.target.closest(".tile");
  if (t) openEditor(list[+t.dataset.i]);
});

let searchT;
$("search").addEventListener("input", e => {
  clearTimeout(searchT);
  searchT = setTimeout(() => { filter = e.target.value.trim(); renderGrid(true); }, 150);
});

// ---------------------------------------------------------------------
//  עורך
// ---------------------------------------------------------------------
const cv = $("cv");
const texts = () => ({ top: $("tTop").value, bottom: $("tBot").value, size: clampSize(+$("tSize").value / 100) });

let raf = 0;
function redraw() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (curImg) drawMeme(cv, curImg, texts(), 1000);
  });
}
["tTop", "tBot", "tSize"].forEach(id => $(id).addEventListener("input", redraw));
document.querySelectorAll(".sz").forEach(b => b.onclick = () => {
  const r = $("tSize");
  r.value = Math.min(+r.max, Math.max(+r.min, +r.value + (+b.dataset.d) * 10));
  redraw();
});
$("tTop").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("tBot").focus(); } });

async function openEditor(m, keepText = false) {
  if (!m) return;
  cur = m; curImg = null;
  const token = ++loadToken;
  if (!keepText) { $("tTop").value = ""; $("tBot").value = ""; $("tSize").value = 100; }
  $("edDesc").textContent = m.desc || catName(m.category);
  $("cvLoad").hidden = false;
  cv.style.visibility = "hidden";
  $("editor").hidden = false;
  document.body.style.overflow = "hidden";
  setSteps(2);
  if (!history.state?.ed) history.pushState({ ed: 1 }, "", location.hash);
  $("send").disabled = false;
  try {
    const [img] = await Promise.all([loadImage(m.url), loadFonts()]);
    if (token !== loadToken) return;
    curImg = img;
    drawMeme(cv, img, texts(), 1000);
    cv.style.visibility = "";
  } catch {
    if (token !== loadToken) return;
    toast("התמונה לא נטענה, נסו תמונה אחרת", true);
  } finally {
    if (token === loadToken) $("cvLoad").hidden = true;
  }
  if (!keepText && matchMedia("(min-width: 900px)").matches) $("tTop").focus();
}

function closeEditor() {
  loadToken++;
  $("editor").hidden = true;
  document.body.style.overflow = "";
  setSteps(1);
}
$("edBack").onclick = () => history.state?.ed ? history.back() : closeEditor();
window.addEventListener("popstate", () => { if (!$("editor").hidden) closeEditor(); $("done").hidden = true; });

function setSteps(n) {
  document.querySelectorAll(".step").forEach((s, i) => s.classList.toggle("on", i === n - 1));
}

// ---------------------------------------------------------------------
//  שליחה ל-Firestore
// ---------------------------------------------------------------------
$("edForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (sending || !cur) return;
  const t = texts();
  t.top = t.top.trim().slice(0, 150);
  t.bottom = t.bottom.trim().slice(0, 150);
  if (!t.top && !t.bottom) { toast("צריך לכתוב לפחות טקסט אחד ✍️", true); $("tTop").focus(); return; }
  if (!curImg) { toast("התמונה עוד נטענת...", true); return; }
  sending = true;
  $("send").disabled = true;
  $("send").querySelector("span").textContent = "שולח...";
  try {
    await addDoc(collection(db, "memes"), {
      imageUrl: cur.url,
      thumbUrl: cur.thumb,
      sourceId: cur.id.slice(0, 60),
      category: cur.category.slice(0, 40),
      sourceDesc: cur.desc.slice(0, 300),
      top: t.top,
      bottom: t.bottom,
      size: Math.round(t.size * 100) / 100,
      status: "new",
      createdAt: serverTimestamp()
    });
    document.activeElement?.blur();
    const c = $("donePrev");
    drawMeme(c, curImg, t, 700);
    try { sessionStorage.removeItem("memes-reloaded"); } catch {}
    $("done").hidden = false;
    setSteps(3);
  } catch (err) {
    console.error(err);
    const code = String(err?.code || "");
    let reloaded = false;
    try { reloaded = sessionStorage.getItem("memes-reloaded") === "1"; } catch {}
    if (code === "permission-denied" && reloaded) {
      toast("המם הזה לא נשלח (נדחה על ידי השרת). נסו תמונה אחרת", true, 5000);
    } else if (code === "permission-denied") {
      // בדרך כלל: הדף ישן (נפתח לפני עדכון באתר). רענון מביא את הגרסה החדשה
      toast("האתר התעדכן - מרעננים את הדף, ואז שולחים שוב 🔄", true, 5000);
      try { sessionStorage.setItem("memes-reloaded", "1"); sessionStorage.setItem("memes-draft", JSON.stringify({ id: cur.id, cat, top: t.top, bottom: t.bottom, size: t.size })); } catch {}
      setTimeout(() => location.reload(), 2200);
    } else if (!navigator.onLine || code === "unavailable") {
      toast("אין חיבור לאינטרנט. בדקו את החיבור ונסו שוב", true, 4000);
    } else {
      toast("השליחה נכשלה (" + (code || err?.message || "שגיאה") + "). נסו שוב", true, 5000);
    }
  } finally {
    sending = false;
    $("send").disabled = false;
    $("send").querySelector("span").textContent = "שליחה לבדיקה";
  }
});

$("doneSame").onclick = () => { $("done").hidden = true; setSteps(2); $("tTop").value = ""; $("tBot").value = ""; redraw(); $("tTop").focus(); };
$("doneNew").onclick = () => { $("done").hidden = true; history.state?.ed ? history.back() : closeEditor(); };

// ---------------------------------------------------------------------
//  עזרה, הודעות, התחלה
// ---------------------------------------------------------------------
$("helpBtn").onclick = () => { $("help").hidden = false; };
$("helpClose").onclick = () => { $("help").hidden = true; store.set("memes-help", "1"); };
$("help").addEventListener("click", e => { if (e.target === $("help")) $("helpClose").click(); });

let toastT;
function toast(msg, err = false, ms = 2800) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("err", err);
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), ms);
}

window.addEventListener("hashchange", () => {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h && h !== cat && CATEGORIES.some(c => c.id === h)) selectCat(h);
});

loadFonts();
selectCat(decodeURIComponent(location.hash.slice(1)) || store.get("memes-cat", CATEGORIES[0].id));
if (!store.get("memes-help", "")) $("help").hidden = false;

// שחזור טיוטה אחרי רענון אוטומטי
(async () => {
  let d = null;
  try { d = JSON.parse(sessionStorage.getItem("memes-draft") || "null"); sessionStorage.removeItem("memes-draft"); } catch {}
  if (!d) return;
  $("help").hidden = true;
  try {
    const m = (await fetchCategory(d.cat)).find(x => x.id === d.id);
    if (!m) return;
    $("tTop").value = d.top || ""; $("tBot").value = d.bottom || ""; $("tSize").value = Math.round((d.size || 1) * 100);
    openEditor(m, true);
    toast("הטקסט נשמר - אפשר לשלוח שוב 🚀", false, 3500);
  } catch {}
})();
