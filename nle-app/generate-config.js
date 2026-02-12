const fs = require('fs');
const path = require('path');

const configContent = `// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- PASTE YOUR CONFIG HERE ---
const firebaseConfig = {
    apiKey: "${process.env.FIREBASE_API_KEY || 'MISSING_API_KEY'}",
    authDomain: "${process.env.FIREBASE_AUTH_DOMAIN || 'MISSING_AUTH_DOMAIN'}",
    projectId: "${process.env.FIREBASE_PROJECT_ID || 'MISSING_PROJECT_ID'}",
    storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET || 'MISSING_STORAGE_BUCKET'}",
    messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID || 'MISSING_SENDER_ID'}",
    appId: "${process.env.FIREBASE_APP_ID || 'MISSING_APP_ID'}"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Export tools for game.js to use
export { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc };
`;

const outputPath = path.join(__dirname, 'js/firebase-config.js');
fs.writeFileSync(outputPath, configContent);
console.log(`Generated firebase-config.js at ${outputPath}`);
