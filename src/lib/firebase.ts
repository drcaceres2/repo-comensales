// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
// Import other Firebase services as needed (e.g., getStorage, getFunctions)

// Your web app's Firebase configuration using environment variables
// IMPORTANT: These NEXT_PUBLIC_ variables should be automatically populated by
// Firebase Hosting or your Vercel/Next.js environment if configured correctly.
// Do NOT hardcode sensitive keys directly in your code.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Initialize Firebase
let app;
if (!getApps().length) {
  // Check if essential config values are present (optional but recommended)
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
     console.error("Firebase config environment variables missing or incomplete (NEXT_PUBLIC_FIREBASE_...)");
     // You might want to throw an error or handle this case differently
     // depending on whether Firebase is strictly required for the app to run.
  }
  app = initializeApp(firebaseConfig);
} else {
  app = getApp(); // If already initialized, use that instance
}

// Initialize Firestore, Auth, etc. and export them
// Use the specific database ID 'comensales-residencia-db'
const db = getFirestore(app, 'comensales-residencia-db');
const auth = getAuth(app);
// const storage = getStorage(app); // Example for Storage

export { app, db, auth }; // Export the initialized app and services
