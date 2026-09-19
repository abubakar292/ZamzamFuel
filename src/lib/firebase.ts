import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, Firestore, collection, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCjnWrtrP7m1ChTFCZxpdT5CsOUvQMJ_Uc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "zamzam-fuel.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "zamzam-fuel",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "zamzam-fuel.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "843215717924",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:843215717924:web:6894ee0d520d785ecfbab1",
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.apiKey.length > 0);

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  // Enable offline persistence (same as Android)
  enableIndexedDbPersistence(db).catch(() => {});
} else {
  // Dummy instances to prevent import errors before the check in AuthContext
  app = {} as FirebaseApp;
  auth = {} as Auth;
  db = {} as Firestore;
}

export { auth, db };

export function getUserCollection(colName: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('User not authenticated');
  return collection(db, 'users', uid, colName);
}

export function getUserDoc(colName: string, docId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('User not authenticated');
  return doc(db, 'users', uid, colName, docId);
}

export default app;
