// Firebase initialization — shared across all pages.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCKTm3sBP-ksjKYS1N1QlZEEE-ySCXFiAQ",
  authDomain: "oro-appraisalcalib.firebaseapp.com",
  projectId: "oro-appraisalcalib",
  storageBucket: "oro-appraisalcalib.firebasestorage.app",
  messagingSenderId: "434366900777",
  appId: "1:434366900777:web:2783ac531fadcb8ed0ca38",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Deliberately NOT the default persistence (which survives browser
// restarts indefinitely, via storage). Session persistence survives normal
// navigation between pages AND an intentional refresh within the same
// browser tab, but is cleared the moment the tab or browser is closed —
// meaningfully stricter than the default, without breaking the app itself.
//
// NOTE: in-memory persistence was tried first and reverted — it broke
// every internal page navigation, not just refreshes, because this is a
// traditional multi-page site (every navigation is a full page reload,
// indistinguishable from a refresh to the browser). Do not switch back to
// inMemoryPersistence without first converting this to a single-page app.
await setPersistence(auth, browserSessionPersistence);

export {
  db, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove,
  auth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
};
