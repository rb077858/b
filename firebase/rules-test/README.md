# בדיקות לחוקי Firestore של "שותפים לחדר"

בודקות את האוספים `rm_*` מול אמולטור (הרשמה עם קוד הזמנה, חסימה, טענות, הכרעות, והבטחה שהחוקים הקיימים לא נשברו).
דורש Java ו-Node.

```
cd firebase/rules-test
npm install
npm test
```

`test-cheder.mjs` בודק את האוספים `ch_*` של "תורנויות חדר". אם `npm install` נכשל על תלויות: `npm install --legacy-peer-deps`.
