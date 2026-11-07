import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword as fbSignIn, signOut as fbSignOut } from 'firebase/auth';
import { getFirestore, collection as fbCollection, getDocs as fbGetDocs, doc as fbDoc, getDoc as fbGetDoc } from 'firebase/firestore';

const legacyFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCjnWrtrP7m1ChTFCZxpdT5CsOUvQMJ_Uc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "zamzam-fuel.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "zamzam-fuel",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "zamzam-fuel.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "843215717924",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:843215717924:web:6894ee0d520d785ecfbab1",
};

/**
 * Connects to the legacy Firebase project with the user's old credentials,
 * reads all their collections, and returns a JSON string in the universal backup format
 * so it can be restored directly into Supabase.
 */
export async function fetchLegacyFirebaseBackupJson(
  email: string,
  password: string
): Promise<string> {
  const appName = 'legacy-firebase-migrator';
  const existing = getApps().find((a) => a.name === appName);
  const fbApp = existing || initializeApp(legacyFirebaseConfig, appName);
  const fbAuth = getAuth(fbApp);
  const fbDb = getFirestore(fbApp);

  const cred = await fbSignIn(fbAuth, email.trim().toLowerCase(), password);
  const uid = cred.user.uid;

  const serializeVal = (val: any): any => {
    if (val === null || val === undefined) return val;
    if (typeof val === 'object' && typeof val.toDate === 'function') {
      return val.toDate().toISOString();
    }
    if (Array.isArray(val)) return val.map(serializeVal);
    if (typeof val === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        out[k] = serializeVal(v);
      }
      return out;
    }
    return val;
  };

  const [
    userDocSnap,
    settingsSnap,
    vendorsSnap,
    purchasesSnap,
    paymentsSnap,
    readingsSnap,
    expensesSnap,
  ] = await Promise.all([
    fbGetDoc(fbDoc(fbDb, 'users', uid)),
    fbGetDocs(fbCollection(fbDb, 'users', uid, 'appSettings')),
    fbGetDocs(fbCollection(fbDb, 'users', uid, 'vendors')),
    fbGetDocs(fbCollection(fbDb, 'users', uid, 'purchases')),
    fbGetDocs(fbCollection(fbDb, 'users', uid, 'vendorPayments')),
    fbGetDocs(fbCollection(fbDb, 'users', uid, 'fuelReadings')),
    fbGetDocs(fbCollection(fbDb, 'users', uid, 'expenses')),
  ]);

  const appSettings: Record<string, any> = {};
  settingsSnap.forEach((d) => {
    appSettings[d.id] = serializeVal(d.data());
  });

  const vendors = vendorsSnap.docs.map((d) => ({
    id: d.id,
    ...serializeVal(d.data()),
  }));
  const purchases = purchasesSnap.docs.map((d) => ({
    id: d.id,
    ...serializeVal(d.data()),
  }));
  const vendorPayments = paymentsSnap.docs.map((d) => ({
    id: d.id,
    ...serializeVal(d.data()),
  }));
  const fuelReadings = readingsSnap.docs.map((d) => ({
    id: d.id,
    ...serializeVal(d.data()),
  }));
  const expenses = expensesSnap.docs.map((d) => ({
    id: d.id,
    ...serializeVal(d.data()),
  }));

  await fbSignOut(fbAuth).catch(() => {});

  const stationName = appSettings.profile?.stationName || 'ZAMZAM';

  const payload = {
    metadata: {
      version: '1.0.0',
      format: 'fuel-station-universal-backup-v1',
      exportedAt: new Date().toISOString(),
      stationName,
      userId: uid,
      userEmail: email,
      supabaseCompatible: true,
      counts: {
        vendors: vendors.length,
        purchases: purchases.length,
        vendorPayments: vendorPayments.length,
        fuelReadings: fuelReadings.length,
        expenses: expenses.length,
        appSettings: Object.keys(appSettings).length,
      },
    },
    data: {
      userProfile: userDocSnap.exists() ? serializeVal(userDocSnap.data()) : { email, stationName },
      appSettings,
      vendors,
      purchases,
      vendorPayments,
      fuelReadings,
      expenses,
    },
  };

  return JSON.stringify(payload, null, 2);
}
