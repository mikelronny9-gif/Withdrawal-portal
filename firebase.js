import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyA7fO3S951BcN38nkiC0RSXDs-pv66RB4s",
  authDomain: "withdrawal-app-46485.firebaseapp.com",
  databaseURL: "https://withdrawal-app-46485-default-rtdb.firebaseio.com",
  projectId: "withdrawal-app-46485",
  storageBucket: "withdrawal-app-46485.firebasestorage.app",
  messagingSenderId: "303976514013",
  appId: "1:303976514013:web:2d79b7c346c67da6e73634",
  measurementId: "G-NFZ0ERGCPY"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
