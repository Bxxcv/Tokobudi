const firebaseConfig = {
  apiKey: "AIzaSyA8ilmyaTqUyGqwtvqJml5PuNAwBcl8784",
  authDomain: "toko-budi-81421.firebaseapp.com",
  projectId: "toko-budi-81421",
  storageBucket: "toko-budi-81421.firebasestorage.app",
  messagingSenderId: "83251261024",
  appId: "1:83251261024:web:366c25cb16758dff829d05"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);