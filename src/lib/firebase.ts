// src/lib/firebase.ts

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// --- Configuration ---
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.projectId) {
  console.error("Firebase Project ID is missing in environment variables!");
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
const storage = getStorage(app);

// --- Emulator Connection ---
// Use forwarded URLs from env variables if available (for web preview), otherwise use direct IP.

// Use environment variables for emulator hosts if defined, otherwise fallback to 127.0.0.1
const authEmulatorHost = process.env.NEXT_PUBLIC_AUTH_EMULATOR_HOST; // Expected format: http://hostname:port or https://hostname:port
const firestoreEmulatorHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST; // Expected format: hostname or hostname:port or http://hostname:port or https://hostname:port

const useEmulators = true; // Keep forcing emulator connection for now

if (useEmulators) {
    console.log("Attempting to connect to Firebase Emulators...");

    // --- Auth Emulator ---
    // @ts-ignore Property '_emulatorConfig' is private but accessible for this check
    if (!auth.emulatorConfig) {
        try {
            let authUrl = `http://127.0.0.1:9099`; // Default
            if (authEmulatorHost) {
                console.log(`Using Auth Emulator Host from env: ${authEmulatorHost}`);
                // Ensure the URL starts with http:// or https:// for connectAuthEmulator
                 if (!authEmulatorHost.startsWith('http://') && !authEmulatorHost.startsWith('https://')) {
                     // Default to http if no protocol is specified
                     authUrl = `http://${authEmulatorHost}`;
                     // Basic check if it contains the port already
                     if (!authEmulatorHost.includes(':')) {
                         authUrl = `${authUrl}:9099`; // Append default port if missing
                     }
                 } else {
                     authUrl = authEmulatorHost;
                 }
                 // The connectAuthEmulator function expects the full URL
            }
            console.log(`Connecting Auth Emulator to ${authUrl}`);
            connectAuthEmulator(auth, authUrl, { disableWarnings: true });
        } catch (error) {
            console.error("Failed to connect Auth emulator:", error);
        }
    }

    // --- Firestore Emulator ---
    // @ts-ignore
    if (!db._settings.host || !db._settings.host.includes('127.0.0.1') || (firestoreEmulatorHost && !db._settings.host.includes(firestoreEmulatorHost.split(':')[0]))) {
         try {
            let host = "127.0.0.1";
            let port = 8080;

            if (firestoreEmulatorHost) {
                 console.log(`Using Firestore Emulator Host from env: ${firestoreEmulatorHost}`);
                 // Firestore emulator needs host and port separately
                 // Remove protocol if present
                 let hostAndPort = firestoreEmulatorHost.replace(/^https?:\/\//, '');
                 const parts = hostAndPort.split(':');
                 host = parts[0];
                 if (parts.length > 1) {
                     port = parseInt(parts[1], 10);
                 }
                 // If port wasn't in the env variable string, keep the default 8080
            }

            console.log(`Connecting Firestore Emulator to ${host}:${port}`);
            connectFirestoreEmulator(db, host, port);
        } catch (error) {
            console.error("Failed to connect Firestore emulator:", error);
        }
    }

    // Add similar logic for Functions and Storage emulators if you use them
    // ... (Functions/Storage emulator connection code using env variables) ...
}


setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("Error setting auth persistence: ", error);
  });

export { app, auth, db, functions, storage };
