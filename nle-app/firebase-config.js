// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- PASTE YOUR CONFIG HERE ---
const firebaseConfig = {
    apiKey: "AIzaSyBAJBsRZymDV5NttmQZbH5DXTw5TXzXxOQ",
    authDomain: "nle-quiz-fa27d.firebaseapp.com",
    projectId: "nle-quiz-fa27d",
    storageBucket: "nle-quiz-fa27d.firebasestorage.app",
    messagingSenderId: "633822308205",
    appId: "1:633822308205:web:8b8054a998f97cce9fdc64"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Export tools for game.js to use
export { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc };