import { getDocs, getDoc, setDoc, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { auth, db, getUserCollection, getUserDoc } from '../lib/firebase';
import { recalculateDatabase } from './recalculate';

export interface BackupMetadata {
  version: string;
  format: 'fuel-station-universal-backup-v1';
  exportedAt: string;
  stationName: string;
  userId: string;
  userEmail: string;
  supabaseCompatible: boolean;
  counts: {
    vendors: number;
    purchases: number;
    vendorPayments: number;
    fuelReadings: number;
    expenses: number;
    appSettings: number;
  };
}

export interface FullBackupPayload {
  metadata: BackupMetadata;
  data: {
    userProfile: Record<string, any> | null;
    appSettings: Record<string, Record<string, any>>;
    vendors: Array<Record<string, any>>;
    purchases: Array<Record<string, any>>;
    vendorPayments: Array<Record<string, any>>;
    fuelReadings: Array<Record<string, any>>;
    expenses: Array<Record<string, any>>;
  };
}

/**
 * Recursively converts Firestore Timestamp objects into ISO-8601 strings
 * so the JSON file is 100% compatible with both Supabase (PostgreSQL timestamptz)
 * and Firebase Firestore restoration.
 */
function serializeFirestoreValue(val: any): any {
  if (val === null || val === undefined) return val;

  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }

  if (typeof val === 'object' && typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      // fallthrough
    }
  }

  if (
    typeof val === 'object' &&
    typeof val.seconds === 'number' &&
    typeof val.nanoseconds === 'number'
  ) {
    return new Timestamp(val.seconds, val.nanoseconds).toDate().toISOString();
  }

  if (val instanceof Date) {
    return val.toISOString();
  }

  if (Array.isArray(val)) {
    return val.map(serializeFirestoreValue);
  }

  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestoreValue(v);
    }
    return out;
  }

  return val;
}

const DATE_FIELD_NAMES = new Set([
  'createdAt',
  'updatedAt',
  'date',
  'purchaseDate',
  'paymentDate',
]);

/**
 * Converts ISO-8601 date strings on known date fields back into Firestore Timestamps
 * when restoring into Firebase.
 */
function deserializeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(deserializeForFirestore);
  }

  if (typeof obj === 'object') {
    if (
      typeof obj.seconds === 'number' &&
      typeof obj.nanoseconds === 'number'
    ) {
      return new Timestamp(obj.seconds, obj.nanoseconds);
    }

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (DATE_FIELD_NAMES.has(k) && typeof v === 'string') {
        const parsed = new Date(v);
        if (!isNaN(parsed.getTime())) {
          out[k] = Timestamp.fromDate(parsed);
          continue;
        }
      }
      out[k] = deserializeForFirestore(v);
    }
    return out;
  }

  return obj;
}

/**
 * Fetches live counts of all collections for the current user to display in Settings.
 */
export async function getDatabaseSummaryCounts(): Promise<BackupMetadata['counts']> {
  const user = auth.currentUser;
  if (!user) {
    return {
      vendors: 0,
      purchases: 0,
      vendorPayments: 0,
      fuelReadings: 0,
      expenses: 0,
      appSettings: 0,
    };
  }

  const [
    vendorsSnap,
    purchasesSnap,
    paymentsSnap,
    readingsSnap,
    expensesSnap,
    settingsSnap,
  ] = await Promise.all([
    getDocs(getUserCollection('vendors')),
    getDocs(getUserCollection('purchases')),
    getDocs(getUserCollection('vendorPayments')),
    getDocs(getUserCollection('fuelReadings')),
    getDocs(getUserCollection('expenses')),
    getDocs(getUserCollection('appSettings')),
  ]);

  return {
    vendors: vendorsSnap.size,
    purchases: purchasesSnap.size,
    vendorPayments: paymentsSnap.size,
    fuelReadings: readingsSnap.size,
    expenses: expensesSnap.size,
    appSettings: settingsSnap.size,
  };
}

/**
 * Exports all user data into a structured, Supabase-compatible & Firebase-compatible JSON object
 * and triggers a browser file download to the user's device.
 */
export async function exportFullDatabaseToJson(): Promise<{
  filename: string;
  payload: FullBackupPayload;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to export a backup.');
  }

  // Ensure all ledger totals and stock averages are up-to-date before exporting
  try {
    await recalculateDatabase();
  } catch (err) {
    console.warn('Pre-export recalculate warning:', err);
  }

  const [
    userDocSnap,
    settingsSnap,
    vendorsSnap,
    purchasesSnap,
    paymentsSnap,
    readingsSnap,
    expensesSnap,
  ] = await Promise.all([
    getDoc(doc(db, 'users', user.uid)),
    getDocs(getUserCollection('appSettings')),
    getDocs(getUserCollection('vendors')),
    getDocs(getUserCollection('purchases')),
    getDocs(getUserCollection('vendorPayments')),
    getDocs(getUserCollection('fuelReadings')),
    getDocs(getUserCollection('expenses')),
  ]);

  const appSettings: Record<string, Record<string, any>> = {};
  settingsSnap.forEach((d) => {
    appSettings[d.id] = serializeFirestoreValue(d.data());
  });

  const vendors = vendorsSnap.docs.map((d) => ({
    id: d.id,
    ...serializeFirestoreValue(d.data()),
  }));

  const purchases = purchasesSnap.docs.map((d) => ({
    id: d.id,
    ...serializeFirestoreValue(d.data()),
  }));

  const vendorPayments = paymentsSnap.docs.map((d) => ({
    id: d.id,
    ...serializeFirestoreValue(d.data()),
  }));

  const fuelReadings = readingsSnap.docs.map((d) => ({
    id: d.id,
    ...serializeFirestoreValue(d.data()),
  }));

  const expenses = expensesSnap.docs.map((d) => ({
    id: d.id,
    ...serializeFirestoreValue(d.data()),
  }));

  const stationName =
    appSettings.profile?.stationName ||
    localStorage.getItem('station_name') ||
    'ZAMZAM';

  const payload: FullBackupPayload = {
    metadata: {
      version: '1.0.0',
      format: 'fuel-station-universal-backup-v1',
      exportedAt: new Date().toISOString(),
      stationName,
      userId: user.uid,
      userEmail: user.email || '',
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
      userProfile: userDocSnap.exists()
        ? serializeFirestoreValue(userDocSnap.data())
        : {
            email: user.email || '',
            stationName,
          },
      appSettings,
      vendors,
      purchases,
      vendorPayments,
      fuelReadings,
      expenses,
    },
  };

  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const safeStationSlug = stationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'station';
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `${safeStationSlug}-backup-${datePart}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);

  return { filename, payload };
}

/**
 * Validates and restores a previously exported .json backup file.
 * Works seamlessly now and preserves all IDs, relationships, and timestamps.
 */
export async function restoreFullDatabaseFromJson(
  rawJsonText: string
): Promise<BackupMetadata['counts']> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to restore a backup.');
  }

  let parsed: FullBackupPayload;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    throw new Error('Invalid JSON file. Please select a valid .json backup file.');
  }

  if (!parsed || typeof parsed !== 'object' || !parsed.data) {
    throw new Error(
      'Invalid backup structure: missing "data" section in JSON file.'
    );
  }

  const {
    appSettings = {},
    vendors = [],
    purchases = [],
    vendorPayments = [],
    fuelReadings = [],
    expenses = [],
  } = parsed.data;

  // Helper to commit operations in safe chunks of 400 (Firestore batch limit is 500)
  const operations: Array<{ ref: any; data: Record<string, any> }> = [];

  for (const [docId, docData] of Object.entries(appSettings)) {
    if (docData && typeof docData === 'object') {
      operations.push({
        ref: getUserDoc('appSettings', docId),
        data: deserializeForFirestore(docData),
      });
    }
  }

  const enqueueCollection = (colName: string, items: Array<Record<string, any>>) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const { id, ...rest } = item;
      const docRef = id
        ? getUserDoc(colName, String(id))
        : doc(getUserCollection(colName));
      operations.push({
        ref: docRef,
        data: deserializeForFirestore(rest),
      });
    }
  };

  enqueueCollection('vendors', vendors);
  enqueueCollection('purchases', purchases);
  enqueueCollection('vendorPayments', vendorPayments);
  enqueueCollection('fuelReadings', fuelReadings);
  enqueueCollection('expenses', expenses);

  const CHUNK_SIZE = 400;
  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
  }

  // Recalculate database after restore to guarantee stock and vendor Qarz consistency
  await recalculateDatabase();

  return {
    vendors: Array.isArray(vendors) ? vendors.length : 0,
    purchases: Array.isArray(purchases) ? purchases.length : 0,
    vendorPayments: Array.isArray(vendorPayments) ? vendorPayments.length : 0,
    fuelReadings: Array.isArray(fuelReadings) ? fuelReadings.length : 0,
    expenses: Array.isArray(expenses) ? expenses.length : 0,
    appSettings: Object.keys(appSettings || {}).length,
  };
}
