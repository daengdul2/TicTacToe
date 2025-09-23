// lib/firebase.js
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// Ganti dengan konfigurasi Firebase kamu
const firebaseConfig = {
  apiKey: "REPLACE",
  authDomain: "REPLACE",
  databaseURL: "REPLACE",
  projectId: "REPLACE",
  storageBucket: "REPLACE",
  messagingSenderId: "REPLACE",
  appId: "REPLACE"
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
