import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyATBoZSc-DyVTfNQGkk4UL13sM-etPgFN8",
  authDomain: "prostrations-c2eae.firebaseapp.com",
  projectId: "prostrations-c2eae",
  storageBucket: "prostrations-c2eae.firebasestorage.app",
  messagingSenderId: "356180677148",
  appId: "1:356180677148:web:e24350a230d74de860c5d9",
  measurementId: "G-7YHV2WVT3X"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
