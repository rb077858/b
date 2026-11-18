# web — שער סינון מול NextDNS

`https://web.reembir.com/?url=example.com/page` בודק את הדומיין מול פרופיל ה-NextDNS ומפנה אליו אם הוא מותר.
טקסט שאינו כתובת נשלח לחיפוש ב-DuckDuckGo (אחרי בדיקה).

## חיבור ל-GitHub
1. Cloudflare ← Workers & Pages ← Create ← Import a repository ← `rb077858/b`.
2. Root directory: `web`. Deploy command: `npx wrangler deploy`.
3. Settings ← Variables and Secrets: `NEXTDNS_ID` = מזהה הפרופיל (6 תווים).
