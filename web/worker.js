// Cloudflare Worker: web.reembir.com
// בודק מול NextDNS (הפרופיל שלך) אם הדומיין מותר, ואם כן מפנה אליו.
// שימוש: https://web.reembir.com/?url=example.com/page
// ללא url: מוצג דף עם תיבת כתובת/חיפוש.

const SEARCH_URL = "https://html.duckduckgo.com/html/?q="; // מנוע חיפוש לטקסט שאינו כתובת

const page = (body, status = 200) =>
  new Response(
    `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>web</title></head><body>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );

const esc = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const form = `<form method="get" action="/">
<input name="url" size="30" autofocus placeholder="כתובת או חיפוש">
<button type="submit">לך</button></form>`;

function looksLikeUrl(s) {
  return /^https?:\/\//i.test(s) || (!/\s/.test(s) && /^[^\s/]+\.[a-z]{2,}(\/|$|\?|:)/i.test(s));
}

async function isAllowed(hostname, id) {
  // שואלים את NextDNS; חסימה מחזירה NXDOMAIN או 0.0.0.0
  for (const type of ["A", "AAAA"]) {
    const r = await fetch(
      `https://dns.nextdns.io/${id}?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: "application/dns-json" } }
    );
    if (!r.ok) throw new Error("nextdns " + r.status);
    const d = await r.json();
    if (d.Status === 3) return false; // NXDOMAIN
    const ips = (d.Answer || []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
    if (ips.length && !ips.every((ip) => ip === "0.0.0.0" || ip === "::")) return true;
  }
  return false;
}

export default {
  async fetch(req, env) {
    const id = env.NEXTDNS_ID;
    if (!id) return page("שגיאה: חסר משתנה NEXTDNS_ID", 500);

    const input = (new URL(req.url).searchParams.get("url") || "").trim();
    if (!input) return page(form);

    let target;
    try {
      target = new URL(looksLikeUrl(input) ? (/^https?:\/\//i.test(input) ? input : "https://" + input) : SEARCH_URL + encodeURIComponent(input));
    } catch {
      return page(`כתובת לא תקינה${form}`, 400);
    }
    if (!/^https?:$/.test(target.protocol)) return page(`כתובת לא תקינה${form}`, 400);

    let ok;
    try {
      ok = await isAllowed(target.hostname, id);
    } catch {
      return page(`שגיאה בבדיקה מול NextDNS${form}`, 502);
    }
    if (!ok) return page(`האתר ${esc(target.hostname)} חסום${form}`, 403);

    return Response.redirect(target.href, 302);
  },
};
