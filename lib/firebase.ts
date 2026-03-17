import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCSHHmpp6iCyTNO-PmLzroqTb6Xsxkb2y0",
  authDomain: "moodin-fcc52.firebaseapp.com",
  projectId: "moodin-fcc52",
  storageBucket: "moodin-fcc52.firebasestorage.app",
  messagingSenderId: "433841065267",
  appId: "1:433841065267:web:22ec8f61424672ec46c246"
};

// Prevents Firebase from initializing multiple times in Next.js
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

export async function ensureAnonymousAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}