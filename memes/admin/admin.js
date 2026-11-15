// =====================================================================
//  ניהול ממים - reembir.com/b/memes/admin
//  כניסה עם Google (רק rb077858@gmail.com, נאכף גם בחוקי Firestore).
//  צפייה בכל הממים שנשלחו, עריכה, מחיקה והורדה כתמונה.
// =====================================================================
import { app, db, SDK, ADMIN_EMAIL } from "../../firebase/config.js?v=20261101h";
import { catName, loadFonts, loadImage, drawMeme, clampSize, corsUrl, esc } from "../meme.js?v=20261115c";

const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } =
  await import(`${SDK}/firebase-auth.js`);
const { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, writeBatch } =
  await import(`${SDK}/firebase-firestore.js`);

const $ = id => document.getElementById(id);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ login_hint: ADMIN_EMAIL, prompt: "select_account" });

let memes = [], view = [], filter = "new", unsub = null;
let curId = null, vToken = 0, vImg = null, editing = false;

const show = id => ["boot", "login", "app"].forEach(x => $(x).hidden = x !== id);

// ---------------------------------------------------------------------
//  התחברות
// ---------------------------------------------------------------------
$("loginBtn").onclick = async () => {
  $("loginErr").textContent = "";
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return signInWithRedirect(auth, provider);
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    $("loginErr").textContent = "ההתחברות נכשלה (" + (e.code || e.message) + ")";
  }
};
getRedirectResult(auth).catch(e => { $("loginErr").textContent = "ההתחברות נכשלה (" + (e.code || e.message) + ")"; });
$("logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async user => {
  unsub?.(); unsub = null;
  if (!user) { show("login"); return; }
  if (user.email !== ADMIN_EMAIL || !user.emailVerified) {
    await signOut(auth);
    show("login");
    $("loginErr").innerHTML = `החשבון <b>${esc(user.email)}</b> לא מורשה.<br>רק עורך העיתון יכול להיכנס.`;
    return;
  }
  $("who").textContent = user.email;
  show("app");
  loadFonts();
  listen();
});

// ---------------------------------------------------------------------
//  רשימת הממים (בזמן אמת)
// ---------------------------------------------------------------------
function listen() {
  $("list").innerHTML = Array.from({ length: 8 }, () => `<div class="skel"></div>`).join("");
  unsub = onSnapshot(query(collection(db, "memes"), orderBy("createdAt", "desc")), snap => {
    memes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    for (const id of selected) if (!memes.some(m => m.id === id)) selected.delete(id);
    render();
    if (curId) {
      if (!memes.some(m => m.id === curId)) closeViewer();
      else if (!editing) showMeme(curId, true);
    }
  }, err => {
    console.error(err);
    $("list").innerHTML = `<div class="empty"><span class="big">⛔</span>אין הרשאה לקרוא את הממים (${esc(err.code)})</div>`;
  });
}

$("filters").addEventListener("click", e => {
  const b = e.target.closest(".cat");
  if (!b) return;
  filter = b.dataset.f;
  selected.clear();
  document.querySelectorAll("#filters .cat").forEach(x => x.classList.toggle("on", x === b));
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

const isDl = m => m.status === "downloaded";
function render() {
  $("nNew").textContent = memes.filter(m => !isDl(m)).length;
  $("nDl").textContent = memes.filter(isDl).length;
  $("nAll").textContent = memes.length;
  view = memes.filter(m => filter === "all" || (filter === "new" ? !isDl(m) : isDl(m)));
  if (!view.length) {
    $("list").innerHTML = `<div class="empty"><span class="big">${filter === "new" ? "📭" : "🗂️"}</span>${filter === "new" ? "אין ממים חדשים לבדיקה" : "אין ממים כאן עדיין"}</div>`;
    return;
  }
  // שומרים כרטיסים קיימים כדי לא לצייר מחדש בכל עדכון
  const old = new Map([...$("list").querySelectorAll(".card")].map(c => [c.dataset.id, c]));
  const frag = document.createDocumentFragment();
  view.forEach(m => {
    const key = sig(m);
    let c = old.get(m.id);
    if (!c || c.dataset.sig !== key) c = card(m);
    frag.appendChild(c);
  });
  $("list").replaceChildren(frag);
  paintSelection();
}
const sig = m => JSON.stringify([m.top, m.bottom, m.size, m.status, m.imageUrl]);

function card(m) {
  const c = document.createElement("button");
  c.className = "card";
  c.dataset.id = m.id;
  c.dataset.sig = sig(m);
  c.innerHTML = `
    <div class="pic"><canvas></canvas><span class="check" aria-hidden="true"></span>${isDl(m) ? `<span class="badge dl">הורד ✓</span>` : `<span class="badge">חדש</span>`}</div>
    <div class="meta"><b>${esc(m.top || m.bottom)}</b><span>${esc(when(m.createdAt))}</span></div>`;
  const cv = c.querySelector("canvas");
  Promise.all([loadImage(m.thumbUrl || m.imageUrl), loadFonts()])
    .then(([img]) => drawMeme(cv, img, m, 500))
    .catch(() => loadImage(m.imageUrl).then(img => drawMeme(cv, img, m, 500)).catch(() => {}));
  c.onclick = () => {
    if (suppressClick) { suppressClick = false; return; }
    if (selectMode) toggleSel(m.id); else openViewer(m.id);
  };
  // לחיצה ארוכה = מעבר למצב בחירה
  let lp = null;
  c.addEventListener("pointerdown", e => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    lp = setTimeout(() => {
      lp = null; suppressClick = true;
      if (navigator.vibrate) navigator.vibrate(15);
      if (!selectMode) setSelectMode(true);
      toggleSel(m.id);
    }, 450);
  });
  const cancelLp = () => { if (lp) { clearTimeout(lp); lp = null; } };
  ["pointerup", "pointerleave", "pointercancel", "pointermove"].forEach(ev => c.addEventListener(ev, e => {
    if (ev === "pointermove" && Math.abs(e.movementX) + Math.abs(e.movementY) < 4) return;
    cancelLp();
  }));
  c.addEventListener("contextmenu", e => { if (e.pointerType !== "mouse") e.preventDefault(); });
  return c;
}

// ---------------------------------------------------------------------
//  בחירה מרובה
// ---------------------------------------------------------------------
const selected = new Set();
let selectMode = false, suppressClick = false, bulkBusy = false;

function setSelectMode(on) {
  selectMode = on;
  if (!on) selected.clear();
  document.body.classList.toggle("selecting", on);
  $("selBtn").classList.toggle("on", on);
  paintSelection();
}
function toggleSel(id) {
  selected.has(id) ? selected.delete(id) : selected.add(id);
  paintSelection();
}
function paintSelection() {
  document.querySelectorAll("#list .card").forEach(c => c.classList.toggle("sel", selected.has(c.dataset.id)));
  const n = selected.size;
  $("bulk").hidden = !selectMode;
  $("bCount").textContent = n ? `${n} נבחרו` : "בחרו ממים";
  const all = view.length > 0 && view.every(m => selected.has(m.id));
  $("bAll").textContent = all ? "ניקוי" : "בחירת הכל";
  ["bDl", "bMark", "bDel"].forEach(id => $(id).disabled = !n || bulkBusy);
  const sel = [...selected].map(byId).filter(Boolean);
  const allDl = sel.length > 0 && sel.every(isDl);
  $("bMark").dataset.to = allDl ? "new" : "downloaded";
  $("bMark").querySelector("span").textContent = allDl ? "סימון כחדש" : "סימון כהורד";
}
$("selBtn").onclick = () => setSelectMode(!selectMode);
$("bCancel").onclick = () => setSelectMode(false);
$("bAll").onclick = () => {
  const all = view.every(m => selected.has(m.id));
  view.forEach(m => all ? selected.delete(m.id) : selected.add(m.id));
  paintSelection();
};

async function batchWrite(ids, fn) {
  for (let i = 0; i < ids.length; i += 450) {
    const b = writeBatch(db);
    ids.slice(i, i + 450).forEach(id => fn(b, doc(db, "memes", id)));
    await b.commit();
  }
}
async function bulk(label, work) {
  if (bulkBusy) return;
  bulkBusy = true; paintSelection();
  $("bCount").textContent = label;
  try { await work(); }
  finally { bulkBusy = false; paintSelection(); }
}

$("bDel").onclick = () => {
  const ids = [...selected];
  if (!ids.length || !confirm(`למחוק ${ids.length} ממים לצמיתות?`)) return;
  bulk("מוחק...", async () => {
    try { await batchWrite(ids, (b, r) => b.delete(r)); toast(`${ids.length} ממים נמחקו`); setSelectMode(false); }
    catch (e) { console.error(e); toast("המחיקה נכשלה", true); }
  });
};
$("bMark").onclick = () => {
  const ids = [...selected], to = $("bMark").dataset.to;
  bulk("מעדכן...", async () => {
    try {
      await batchWrite(ids, (b, r) => b.update(r, to === "downloaded" ? { status: to, downloadedAt: serverTimestamp() } : { status: to }));
      toast("עודכן ✓"); setSelectMode(false);
    } catch (e) { console.error(e); toast("העדכון נכשל", true); }
  });
};
$("bDl").onclick = () => {
  const items = [...selected].map(byId).filter(Boolean);
  if (!items.length) return;
  bulk("מכין...", async () => {
    try {
      if (items.length === 1) {
        saveBlob(await renderBlob(items[0]), fileName(items[0]));
      } else {
        const JSZip = await loadZip();
        const zip = new JSZip();
        let done = 0, failed = 0;
        const queue = [...items];
        const worker = async () => {
          for (let m; (m = queue.shift());) {
            try { zip.file(fileName(m), await renderBlob(m)); }
            catch { failed++; }
            $("bCount").textContent = `מכין ${++done}/${items.length}...`;
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        if (failed === items.length) throw new Error("all failed");
        $("bCount").textContent = "יוצר ZIP...";
        const z = await zip.generateAsync({ type: "blob" });
        saveBlob(z, `memes-${new Date().toISOString().slice(0, 10)}-${items.length - failed}.zip`);
        if (failed) toast(`${failed} ממים לא הורדו`, true);
      }
      const ok = items.filter(m => !isDl(m)).map(m => m.id);
      if (ok.length) await batchWrite(ok, (b, r) => b.update(r, { status: "downloaded", downloadedAt: serverTimestamp() }));
      if (items.length === 1) toast("המם הורד ✓"); else toast(`${items.length} ממים הורדו ✓`);
      setSelectMode(false);
    } catch (e) { console.error(e); toast("ההורדה נכשלה, נסו שוב", true); }
  });
};

let zipLib = null;
function loadZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  zipLib ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = () => res(window.JSZip);
    s.onerror = () => { zipLib = null; rej(new Error("zip lib")); };
    document.head.appendChild(s);
  });
  return zipLib;
}

function when(ts) {
  const d = ts?.toDate?.();
  if (!d) return "עכשיו";
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "לפני רגע";
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע׳`;
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "2-digit" }) + " · " +
    d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------
//  צפייה במם
// ---------------------------------------------------------------------
const byId = id => memes.find(m => m.id === id);

function openViewer(id) {
  $("viewer").hidden = false;
  document.body.style.overflow = "hidden";
  if (!history.state?.v) history.pushState({ v: 1 }, "");
  showMeme(id);
}
function closeViewer() {
  curId = null; vToken++; setEditing(false);
  $("viewer").hidden = true;
  document.body.style.overflow = "";
}
$("vClose").onclick = () => history.state?.v ? history.back() : closeViewer();
window.addEventListener("popstate", () => { if (!$("viewer").hidden) closeViewer(); });

async function showMeme(id, refresh = false) {
  const m = byId(id);
  if (!m) return;
  const changed = curId !== id;
  curId = id;
  if (changed) setEditing(false);
  const i = view.findIndex(x => x.id === id);
  $("vPos").textContent = i >= 0 ? `${i + 1} / ${view.length}` : "";
  $("vPrev").disabled = i <= 0;
  $("vNext").disabled = i < 0 || i >= view.length - 1;
  $("vTitle").textContent = "מם" + (i >= 0 ? ` #${view.length - i}` : "");
  $("vMeta").textContent = when(m.createdAt);
  $("vInfo").innerHTML = `
    ${m.top ? `<dt>למעלה</dt><dd>${esc(m.top)}</dd>` : ""}
    ${m.bottom ? `<dt>למטה</dt><dd>${esc(m.bottom)}</dd>` : ""}
    <dt>קטגוריה</dt><dd class="mt">${esc(catName(m.category))}</dd>
    ${m.sourceDesc ? `<dt>תמונה</dt><dd class="mt">${esc(m.sourceDesc)}</dd>` : ""}
    <dt>סטטוס</dt><dd>${isDl(m) ? "✅ הורד" : "🆕 חדש"}</dd>`;
  $("aStatus").textContent = isDl(m) ? "סימון כחדש" : "סימון כהורד (בלי להוריד)";

  if (!refresh || changed || !vImg) {
    const token = ++vToken;
    vImg = null;
    $("vLoad").hidden = false;
    $("vCv").style.visibility = "hidden";
    try {
      const [img] = await Promise.all([loadImage(m.imageUrl), loadFonts()]);
      if (token !== vToken) return;
      vImg = img;
    } catch {
      if (token === vToken) { $("vLoad").hidden = true; toast("התמונה לא נטענה", true); }
      return;
    }
    $("vLoad").hidden = true;
    $("vCv").style.visibility = "";
  }
  drawMeme($("vCv"), vImg, editing ? editVals() : m, 1400);
}

function step(d) {
  const i = view.findIndex(x => x.id === curId);
  const n = view[i + d];
  if (n && !editing) showMeme(n.id);
}
$("vPrev").onclick = () => step(-1);
$("vNext").onclick = () => step(1);
document.addEventListener("keydown", e => {
  if ($("viewer").hidden && selectMode && e.key === "Escape") return setSelectMode(false);
  if ($("viewer").hidden || editing) return;
  if (e.key === "ArrowRight") step(-1);
  else if (e.key === "ArrowLeft") step(1);
  else if (e.key === "Escape") $("vClose").click();
});
// החלקה בטלפון: ימינה = הקודם, שמאלה = הבא (RTL)
let tx = null, ty = null;
$("vStage").addEventListener("touchstart", e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
$("vStage").addEventListener("touchend", e => {
  if (tx == null) return;
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  tx = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx > 0 ? 1 : -1);
});

// ---------------------------------------------------------------------
//  הורדה
// ---------------------------------------------------------------------
$("aDl").onclick = async () => {
  const m = byId(curId);
  if (!m) return;
  const b = $("aDl");
  b.disabled = true;
  b.querySelector("span").textContent = "מכין...";
  try {
    saveBlob(await renderBlob(m), fileName(m));
    if (!isDl(m)) await updateDoc(doc(db, "memes", m.id), { status: "downloaded", downloadedAt: serverTimestamp() });
    toast("המם הורד ✓");
  } catch (e) {
    console.error(e);
    toast("ההורדה נכשלה, נסו שוב", true);
  } finally {
    b.disabled = false;
    b.querySelector("span").textContent = "הורדה";
  }
};
// מצייר את המם ברזולוציה מלאה ומחזיר JPG
async function renderBlob(m) {
  await loadFonts();
  let img;
  // התמונות של memeking בלי CORS - טוענים דרך wsrv.nl כדי שאפשר יהיה לשמור
  try { img = await loadImage(corsUrl(m.imageUrl), true); }
  catch { img = await loadImage(m.imageUrl + (m.imageUrl.includes("?") ? "&" : "?") + "cors=1", true); }
  const c = document.createElement("canvas");
  drawMeme(c, img, m, 2400);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("blob")), "image/jpeg", 0.95));
}
function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function fileName(m) {
  const d = m.createdAt?.toDate?.() || new Date();
  return `meme-${d.toISOString().slice(0, 10)}-${m.id.slice(0, 6)}.jpg`;
}

$("aStatus").onclick = async () => {
  const m = byId(curId);
  if (!m) return;
  try { await updateDoc(doc(db, "memes", m.id), { status: isDl(m) ? "new" : "downloaded" }); }
  catch { toast("העדכון נכשל", true); }
};

// ---------------------------------------------------------------------
//  מחיקה
// ---------------------------------------------------------------------
$("aDel").onclick = async () => {
  const m = byId(curId);
  if (!m || !confirm("למחוק את המם לצמיתות?")) return;
  const i = view.findIndex(x => x.id === m.id);
  const next = view[i + 1] || view[i - 1];
  try {
    await deleteDoc(doc(db, "memes", m.id));
    toast("המם נמחק");
    if (next) showMeme(next.id); else $("vClose").click();
  } catch { toast("המחיקה נכשלה", true); }
};

// ---------------------------------------------------------------------
//  עריכה
// ---------------------------------------------------------------------
const editVals = () => ({ top: $("eTop").value, bottom: $("eBot").value, size: clampSize(+$("eSize").value / 100) });
function setEditing(on) {
  editing = on;
  $("vView").hidden = on;
  $("vEdit").hidden = !on;
  $("vPrev").hidden = $("vNext").hidden = on;
}
$("aEdit").onclick = () => {
  const m = byId(curId);
  if (!m) return;
  $("eTop").value = m.top || "";
  $("eBot").value = m.bottom || "";
  $("eSize").value = Math.round(clampSize(m.size) * 100);
  setEditing(true);
};
["eTop", "eBot", "eSize"].forEach(id => $(id).addEventListener("input", () => { if (vImg) drawMeme($("vCv"), vImg, editVals(), 1400); }));
$("eCancel").onclick = () => { setEditing(false); showMeme(curId, true); };
$("vEdit").addEventListener("submit", async e => {
  e.preventDefault();
  const v = editVals();
  try {
    await updateDoc(doc(db, "memes", curId), {
      top: v.top.trim().slice(0, 150),
      bottom: v.bottom.trim().slice(0, 150),
      size: Math.round(v.size * 100) / 100,
      editedAt: serverTimestamp()
    });
    setEditing(false);
    showMeme(curId, true);
    toast("נשמר ✓");
  } catch { toast("השמירה נכשלה", true); }
});

// ---------------------------------------------------------------------
let toastT;
function toast(msg, err = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("err", err);
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2600);
}
