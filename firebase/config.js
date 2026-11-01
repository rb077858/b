// =====================================================================
//  Firebase משותף לכל המאגר (reembir.com/b/...)
//  כל תיקייה במאגר יכולה לייבא מכאן:  import { db, auth } from "../firebase/config.js";
//  ההגדרות של כל פרויקט נשמרות ב-Firestore תחת  sites/<שם-התיקייה>
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

export const SDK = "https://www.gstatic.com/firebasejs/11.0.2";

export const firebaseConfig = {
  apiKey: "AIzaSyAGqrChtKaMGBROJs2iLfzG_9aFklBe3cc",
  authDomain: "reembir-b-b65b76.firebaseapp.com",
  projectId: "reembir-b-b65b76",
  storageBucket: "reembir-b-b65b76.firebasestorage.app",
  messagingSenderId: "1096260635193",
  appId: "1:1096260635193:web:e6e9d4939d2f163222dbe8"
};

// כתובת המייל היחידה שמורשית לנהל (נאכף גם בחוקי Firestore)
export const ADMIN_EMAIL = "rb077858@gmail.com";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
