# Firebase - משותף לכל המאגר

פרויקט Firebase אחד (`reembir-b-b65b76`) משרת את כל התיקיות במאגר.

| קובץ | תפקיד |
|---|---|
| `config.js` | אתחול Firebase. כל דף מייבא ממנו: `import { db } from "../firebase/config.js"` |
| `firestore.rules` | חוקי אבטחה: קריאה ציבורית ל-`sites/*`, כתיבה רק ל-rb077858@gmail.com. כולל גם את האוספים `rm_*` של "שותפים לחדר" (ראו `bchira/README.md`) |
| (אוספים `ch_*`) | "תורנויות חדר": חדרים, תורנויות, התראות (ראו `cheder/README.md`) |
| (אוסף `memes`) | הממים שנשלחו מ-`memes/`: כל אחד יוצר, רק אדמין קורא/עורך/מוחק (ראו `memes/README.md`) |
| `rules-test/` | בדיקות לחוקים מול אמולטור |

## מבנה הנתונים
- `sites/<שם-תיקייה>` - ההגדרות של כל פרויקט (למשל `sites/kupa-rashit`)
- `sites/<שם-תיקייה>/history/*` - גרסאות קודמות (אדמין בלבד)

## ניהול
פאנל הניהול של קופה ראשית: `https://reembir.com/b/kupa-rashit/admin/` (כניסה עם Google).
הכתובת הישנה `reembir.com/b/admin/` מעבירה אליו אוטומטית.

## פריסת חוקים מחדש
```
npx firebase-tools deploy --only firestore:rules
```
