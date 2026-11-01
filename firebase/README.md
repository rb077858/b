# Firebase - משותף לכל המאגר

פרויקט Firebase אחד (`reembir-b-b65b76`) משרת את כל התיקיות במאגר.

| קובץ | תפקיד |
|---|---|
| `config.js` | אתחול Firebase. כל דף מייבא ממנו: `import { db } from "../firebase/config.js"` |
| `firestore.rules` | חוקי אבטחה: קריאה ציבורית ל-`sites/*`, כתיבה רק ל-rb077858@gmail.com |

## מבנה הנתונים
- `sites/<שם-תיקייה>` - ההגדרות של כל פרויקט (למשל `sites/kupa-rashit`)
- `sites/<שם-תיקייה>/history/*` - גרסאות קודמות (אדמין בלבד)

## ניהול
פאנל הניהול: `https://reembir.com/b/admin/` (כניסה עם Google).
להוספת פרויקט חדש לפאנל: מוסיפים שורה ל-`SITES` ב-`admin/admin.js`.

## פריסת חוקים מחדש
```
npx firebase-tools deploy --only firestore:rules
```
