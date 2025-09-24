// lib/firebase.js
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// Ganti dengan konfigurasi Firebase kamu
const firebaseConfig = {
  apiKey: "AIzaSyB0_TYh5uhvrR2PJTty7z1ltC3oNYlPxEg",
  authDomain: "tictactoe-2d7d5.firebaseapp.com",
  databaseURL: "https://tictactoe-2d7d5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tictactoe-2d7d5",
  storageBucket: "tictactoe-2d7d5.firebasestorage.app",
  messagingSenderId: "397046134889",
  appId: "1:397046134889:web:b19a63163ffd52211acaf8",
  measurementId: "G-YTGSF7PNNH"
};

let app, db, auth;

if (!globalThis._firebaseApp) {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);
  globalThis._firebaseApp = { app, db, auth };
} else {
  ({ app, db, auth } = globalThis._firebaseApp);
}

export { app, db, auth, signInAnonymously, onAuthStateChanged };
