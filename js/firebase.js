import { APP_CONFIG } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export const app = initializeApp(APP_CONFIG.firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const CONFIG = APP_CONFIG; // Export config supaya bisa dipakai file lain
