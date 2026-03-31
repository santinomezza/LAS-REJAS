import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAgM6t2s0wnk3u4TPAfSJK8Jcs5NUW-95w",
  authDomain: "las-rejas-club.firebaseapp.com",
  projectId: "las-rejas-club",
  storageBucket: "las-rejas-club.firebasestorage.app",
  messagingSenderId: "531188386987",
  appId: "1:531188386987:web:d73753bffb84cb42d2bbee",
  measurementId: "G-8EDBFCTLY0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
