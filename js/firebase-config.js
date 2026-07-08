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
  updateDoc,
  arrayUnion,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCKTm3sBP-ksjKYS1N1QlZEEE-ySCXFiAQ",
  authDomain: "oro-appraisalcalib.firebaseapp.com",
  projectId: "oro-appraisalcalib",
  storageBucket: "oro-appraisalcalib.firebasestorage.app",
  messagingSenderId: "434366900777",
  appId: "1:434366900777:web:2783ac531fadcb8ed0ca38",
  measurementId: "G-RS0QGN3P7K",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
  db, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, doc, getDoc, updateDoc, arrayUnion, Timestamp,
  auth, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut,
};
