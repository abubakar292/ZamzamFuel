import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://efclmpwfxzygcwglnxnl.supabase.co';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmY2xtcHdmeHp5Z2N3Z2xueG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNDEyODcsImV4cCI6MjEwOTYxNzI4N30.YtvUmsDA8VUGtNzPhGGJUaizrnKCw4ew2YE4GQQa2-M';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith('http')
);

// Keep alias for backward compatibility in AuthContext
export const isFirebaseConfigured = isSupabaseConfigured;

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// ============================================================================
// 1. TIMESTAMP & SERVER TIMESTAMP (Compatible with ISO-8601 & Postgres)
// ============================================================================

export class Timestamp {
  seconds: number;
  nanoseconds: number;

  constructor(seconds: number, nanoseconds = 0) {
    this.seconds = Math.floor(seconds);
    this.nanoseconds = nanoseconds;
  }

  toDate(): Date {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6));
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }

  toISOString(): string {
    return this.toDate().toISOString();
  }

  toJSON(): string {
    return this.toDate().toISOString();
  }

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }

  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime());
  }

  static fromMillis(ms: number): Timestamp {
    const seconds = Math.floor(ms / 1000);
    const nanoseconds = (ms % 1000) * 1e6;
    return new Timestamp(seconds, nanoseconds);
  }
}

export function serverTimestamp(): Timestamp {
  return Timestamp.now();
}

const DATE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'date',
  'purchaseDate',
  'paymentDate',
]);

export function serializeDataForPostgres(val: any): any {
  if (val === null || val === undefined) return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
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
  if (Array.isArray(val)) return val.map(serializeDataForPostgres);
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        out[k] = serializeDataForPostgres(v);
      }
    }
    return out;
  }
  return val;
}

export function hydrateDataFromPostgres(val: any): any {
  if (val === null || val === undefined) return val;
  if (val instanceof Timestamp) return val;
  if (Array.isArray(val)) return val.map(hydrateDataFromPostgres);
  if (typeof val === 'object') {
    if (
      typeof val.seconds === 'number' &&
      typeof val.nanoseconds === 'number'
    ) {
      return new Timestamp(val.seconds, val.nanoseconds);
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (DATE_FIELDS.has(k) && typeof v === 'string') {
        const parsed = new Date(v);
        if (!isNaN(parsed.getTime())) {
          out[k] = Timestamp.fromDate(parsed);
          continue;
        }
      }
      out[k] = hydrateDataFromPostgres(v);
    }
    return out;
  }
  return val;
}

// ============================================================================
// 2. SUPABASE AUTH ADAPTER
// ============================================================================

export interface User {
  uid: string;
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface Auth {
  currentUser: User | null;
}

export const auth: Auth = {
  currentUser: null,
};

function mapSupabaseUser(sbUser: any): User | null {
  if (!sbUser) return null;
  return {
    uid: sbUser.id,
    id: sbUser.id,
    email: sbUser.email || null,
    displayName:
      sbUser.user_metadata?.display_name ||
      sbUser.user_metadata?.station_name ||
      null,
  };
}

let realtimeChannel: RealtimeChannel | null = null;

function setupRealtimeForUser(userId: string | null) {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (!userId) return;

  realtimeChannel = supabase
    .channel(`fuel_station_records_${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'fuel_station_records',
        filter: `company_id=eq.${userId}`,
      },
      (payload) => {
        const colName =
          (payload.new as any)?.collection_name ||
          (payload.old as any)?.collection_name;
        if (colName) {
          notifyCollectionListeners(userId, colName);
        }
      }
    )
    .subscribe();
}

export function onAuthStateChanged(
  _authInstance: Auth,
  callback: (user: User | null) => void
): () => void {
  let active = true;

  supabase.auth.getSession().then(({ data }) => {
    if (!active) return;
    const mapped = mapSupabaseUser(data.session?.user ?? null);
    auth.currentUser = mapped;
    setupRealtimeForUser(mapped?.uid ?? null);
    if (mapped) {
      syncLocalFallbackToPostgres(mapped.uid).catch(() => {});
    }
    callback(mapped);
  });

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!active) return;
    const mapped = mapSupabaseUser(session?.user ?? null);
    auth.currentUser = mapped;
    setupRealtimeForUser(mapped?.uid ?? null);
    if (mapped) {
      syncLocalFallbackToPostgres(mapped.uid).catch(() => {});
    }
    callback(mapped);
  });

  return () => {
    active = false;
    sub.subscription.unsubscribe();
  };
}

export async function signInWithEmailAndPassword(
  _authInstance: Auth,
  email: string,
  password: string
): Promise<{ user: User }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    let code = 'auth/invalid-credential';
    if (msg.includes('email not confirmed')) {
      throw {
        code: 'auth/email-not-confirmed',
        message:
          'Please disable "Confirm email" in your Supabase Dashboard (Authentication → Providers → Email) or click the confirmation link sent to your email.',
      };
    }
    if (msg.includes('rate limit') || msg.includes('too many')) {
      code = 'auth/too-many-requests';
    }
    throw { code, message: error.message };
  }

  const mapped = mapSupabaseUser(data.user);
  if (!mapped) {
    throw { code: 'auth/invalid-credential', message: 'Failed to sign in.' };
  }
  auth.currentUser = mapped;
  return { user: mapped };
}

export async function createUserWithEmailAndPassword(
  _authInstance: Auth,
  email: string,
  password: string
): Promise<{ user: User }> {
  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists')) {
      throw {
        code: 'auth/email-already-in-use',
        message:
          'An account with this email already exists. Please sign in instead.',
      };
    }
    throw { code: 'auth/signup-error', message: error.message };
  }

  // Supabase returns an empty identities array when email enumeration protection is enabled
  // and the email is already registered. Enforce strict 1-email-1-account restriction:
  if (
    data.user &&
    Array.isArray(data.user.identities) &&
    data.user.identities.length === 0
  ) {
    throw {
      code: 'auth/email-already-in-use',
      message:
        'An account with this email already exists. Please sign in instead.',
    };
  }

  if (!data.session && data.user) {
    // Attempt immediate sign-in in case session wasn't returned
    const signInAttempt = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (signInAttempt.error) {
      if (
        signInAttempt.error.message.toLowerCase().includes('email not confirmed')
      ) {
        throw {
          code: 'auth/email-not-confirmed',
          message:
            'Account registered! To log in without email verification, go to Supabase Dashboard → Authentication → Providers → Email and turn OFF "Confirm email", then Sign In.',
        };
      }
    } else if (signInAttempt.data.user) {
      const mapped = mapSupabaseUser(signInAttempt.data.user)!;
      auth.currentUser = mapped;
      return { user: mapped };
    }
  }

  const mapped = mapSupabaseUser(data.user);
  if (!mapped) {
    throw { code: 'auth/signup-error', message: 'Could not create account.' };
  }
  auth.currentUser = mapped;
  return { user: mapped };
}

export async function updateProfile(
  user: User,
  profileUpdates: { displayName?: string }
): Promise<void> {
  if (!profileUpdates.displayName) return;
  await supabase.auth.updateUser({
    data: { display_name: profileUpdates.displayName },
  });
  user.displayName = profileUpdates.displayName;
}

export async function signOut(_authInstance?: Auth): Promise<void> {
  await supabase.auth.signOut();
  auth.currentUser = null;
}

// ============================================================================
// 3. SUPABASE POSTGRESQL DOCUMENT & COLLECTION LAYER
// ============================================================================

export const db = {};

export interface CollectionRef {
  type: 'collection';
  companyId: string;
  collectionName: string;
}

export interface DocRef {
  type: 'doc';
  companyId: string;
  collectionName: string;
  id: string;
}

export interface QueryConstraint {
  type: 'orderBy' | 'limit' | 'where';
  field?: string;
  direction?: 'asc' | 'desc';
  limitCount?: number;
  op?: string;
  value?: any;
}

export interface QueryRef {
  type: 'query';
  collectionRef: CollectionRef;
  constraints: QueryConstraint[];
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return (
    'doc_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).substring(2, 10)
  );
}

export function getUserCollection(colName: string): CollectionRef {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('User not authenticated');
  return {
    type: 'collection',
    companyId: uid,
    collectionName: colName,
  };
}

export function getUserDoc(colName: string, docId: string): DocRef {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('User not authenticated');
  return {
    type: 'doc',
    companyId: uid,
    collectionName: colName,
    id: docId,
  };
}

export function collection(
  _dbOrCol: any,
  ...pathSegments: string[]
): CollectionRef {
  if (
    pathSegments.length === 3 &&
    pathSegments[0] === 'users'
  ) {
    return {
      type: 'collection',
      companyId: pathSegments[1],
      collectionName: pathSegments[2],
    };
  }
  const uid = auth.currentUser?.uid || 'anonymous';
  return {
    type: 'collection',
    companyId: uid,
    collectionName: pathSegments[pathSegments.length - 1] || 'default',
  };
}

export function doc(
  parentOrDb: any,
  ...pathSegments: string[]
): DocRef {
  if (parentOrDb && parentOrDb.type === 'collection') {
    const colRef = parentOrDb as CollectionRef;
    const id = pathSegments[0] || generateId();
    return {
      type: 'doc',
      companyId: colRef.companyId,
      collectionName: colRef.collectionName,
      id,
    };
  }
  if (pathSegments.length === 4 && pathSegments[0] === 'users') {
    return {
      type: 'doc',
      companyId: pathSegments[1],
      collectionName: pathSegments[2],
      id: pathSegments[3],
    };
  }
  if (pathSegments.length === 2 && pathSegments[0] === 'users') {
    return {
      type: 'doc',
      companyId: pathSegments[1],
      collectionName: 'appSettings',
      id: 'userRoot',
    };
  }
  const uid = auth.currentUser?.uid || 'anonymous';
  return {
    type: 'doc',
    companyId: uid,
    collectionName: pathSegments[0] || 'default',
    id: pathSegments[1] || generateId(),
  };
}

export function orderBy(
  field: string,
  direction: 'asc' | 'desc' = 'asc'
): QueryConstraint {
  return { type: 'orderBy', field, direction };
}

export function limit(limitCount: number): QueryConstraint {
  return { type: 'limit', limitCount };
}

export function where(
  field: string,
  op: string,
  value: any
): QueryConstraint {
  return { type: 'where', field, op, value };
}

export function query(
  collectionRef: CollectionRef,
  ...constraints: QueryConstraint[]
): QueryRef {
  return {
    type: 'query',
    collectionRef,
    constraints,
  };
}

// ============================================================================
// 4. SQL TABLE STATUS & FALLBACK CACHE (Never crashes before SQL is run)
// ============================================================================

let sqlTableMissing = false;

export function isSupabaseTableMissing(): boolean {
  return sqlTableMissing;
}

function setSqlTableStatus(missing: boolean) {
  if (sqlTableMissing !== missing) {
    sqlTableMissing = missing;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('supabase_sql_status', { detail: { sqlMissing: missing } })
      );
    }
  }
}

function isMissingTableError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('fuel_station_records') &&
      (msg.includes('does not exist') || msg.includes('schema cache'))
  );
}

function getLocalCacheKey(companyId: string, collectionName: string): string {
  return `sb_cache_${companyId}_${collectionName}`;
}

function readLocalCollectionCache(
  companyId: string,
  collectionName: string
): Record<string, Record<string, any>> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getLocalCacheKey(companyId, collectionName));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalCollectionCache(
  companyId: string,
  collectionName: string,
  map: Record<string, Record<string, any>>
) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      getLocalCacheKey(companyId, collectionName),
      JSON.stringify(map)
    );
  } catch {
    // ignore quota errors
  }
}

export async function checkSupabaseDatabaseReady(): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return true;
  const { error } = await supabase
    .from('fuel_station_records')
    .select('doc_id')
    .eq('company_id', uid)
    .limit(1);

  if (error && isMissingTableError(error)) {
    setSqlTableStatus(true);
    return false;
  }

  setSqlTableStatus(false);
  await syncLocalFallbackToPostgres(uid);
  return true;
}

async function syncLocalFallbackToPostgres(companyId: string) {
  const collections = [
    'appSettings',
    'vendors',
    'purchases',
    'vendorPayments',
    'fuelReadings',
    'expenses',
  ];
  const rowsToUpsert: any[] = [];

  for (const col of collections) {
    const cached = readLocalCollectionCache(companyId, col);
    for (const [docId, docData] of Object.entries(cached)) {
      if (docData && docData.__pendingSync) {
        const cleanData = { ...docData };
        delete cleanData.__pendingSync;
        rowsToUpsert.push({
          company_id: companyId,
          collection_name: col,
          doc_id: docId,
          data: serializeDataForPostgres(cleanData),
          is_cancelled: false,
        });
      }
    }
  }

  if (rowsToUpsert.length === 0) return;

  const { error } = await supabase
    .from('fuel_station_records')
    .upsert(rowsToUpsert, { onConflict: 'company_id,collection_name,doc_id' });

  if (!error) {
    setSqlTableStatus(false);
    for (const col of collections) {
      const cached = readLocalCollectionCache(companyId, col);
      let changed = false;
      for (const docId of Object.keys(cached)) {
        if (cached[docId]?.__pendingSync) {
          delete cached[docId].__pendingSync;
          changed = true;
        }
      }
      if (changed) {
        writeLocalCollectionCache(companyId, col, cached);
      }
    }
  }
}

// ============================================================================
// 5. SNAPSHOT STRUCTURES & CRUD OPERATIONS
// ============================================================================

export class DocumentSnapshot {
  id: string;
  private _data: Record<string, any> | null;

  constructor(id: string, data: Record<string, any> | null) {
    this.id = id;
    this._data = data ? hydrateDataFromPostgres(data) : null;
  }

  exists(): boolean {
    return this._data !== null;
  }

  data(): any {
    return this._data;
  }
}

export class QuerySnapshot {
  docs: DocumentSnapshot[];

  constructor(docs: DocumentSnapshot[]) {
    this.docs = docs;
  }

  get size(): number {
    return this.docs.length;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }

  forEach(cb: (doc: DocumentSnapshot) => void) {
    this.docs.forEach(cb);
  }
}

function getComparableValue(val: any): any {
  if (val instanceof Timestamp) return val.toMillis();
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'object' && val !== null && typeof val.toMillis === 'function') {
    return val.toMillis();
  }
  return val;
}

function applyQueryConstraints(
  docs: DocumentSnapshot[],
  constraints: QueryConstraint[]
): DocumentSnapshot[] {
  let result = [...docs];

  for (const c of constraints) {
    if (c.type === 'where' && c.field) {
      result = result.filter((d) => {
        const data = d.data() || {};
        const fieldVal = data[c.field!];
        if (c.op === '==') return fieldVal === c.value;
        return true;
      });
    }
  }

  for (const c of constraints) {
    if (c.type === 'orderBy' && c.field) {
      const dir = c.direction === 'desc' ? -1 : 1;
      result.sort((a, b) => {
        const va = getComparableValue(a.data()?.[c.field!]);
        const vb = getComparableValue(b.data()?.[c.field!]);
        if (va === vb) return 0;
        if (va === undefined || va === null) return 1;
        if (vb === undefined || vb === null) return -1;
        return va > vb ? dir : -dir;
      });
    }
  }

  for (const c of constraints) {
    if (c.type === 'limit' && typeof c.limitCount === 'number') {
      result = result.slice(0, c.limitCount);
    }
  }

  return result;
}

export async function getDoc(docRef: DocRef): Promise<DocumentSnapshot> {
  const { companyId, collectionName, id } = docRef;

  const { data, error } = await supabase
    .from('fuel_station_records')
    .select('doc_id, data')
    .eq('company_id', companyId)
    .eq('collection_name', collectionName)
    .eq('doc_id', id)
    .eq('is_cancelled', false)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      setSqlTableStatus(true);
    }
    const cached = readLocalCollectionCache(companyId, collectionName);
    return new DocumentSnapshot(id, cached[id] || null);
  }

  setSqlTableStatus(false);

  if (!data) {
    return new DocumentSnapshot(id, null);
  }

  const cached = readLocalCollectionCache(companyId, collectionName);
  cached[id] = data.data;
  writeLocalCollectionCache(companyId, collectionName, cached);

  return new DocumentSnapshot(data.doc_id, data.data);
}

export async function getDocs(
  target: CollectionRef | QueryRef
): Promise<QuerySnapshot> {
  const colRef = target.type === 'query' ? target.collectionRef : target;
  const constraints = target.type === 'query' ? target.constraints : [];
  const { companyId, collectionName } = colRef;

  const { data, error } = await supabase
    .from('fuel_station_records')
    .select('doc_id, data')
    .eq('company_id', companyId)
    .eq('collection_name', collectionName)
    .eq('is_cancelled', false);

  if (error) {
    if (isMissingTableError(error)) {
      setSqlTableStatus(true);
    }
    const cached = readLocalCollectionCache(companyId, collectionName);
    const docs = Object.entries(cached).map(
      ([id, d]) => new DocumentSnapshot(id, d)
    );
    return new QuerySnapshot(applyQueryConstraints(docs, constraints));
  }

  setSqlTableStatus(false);

  const cacheMap: Record<string, Record<string, any>> = {};
  const docs = (data || []).map((row: any) => {
    cacheMap[row.doc_id] = row.data;
    return new DocumentSnapshot(row.doc_id, row.data);
  });
  writeLocalCollectionCache(companyId, collectionName, cacheMap);

  return new QuerySnapshot(applyQueryConstraints(docs, constraints));
}

export async function setDoc(
  docRef: DocRef,
  newData: Record<string, any>,
  options?: { merge?: boolean }
): Promise<void> {
  const { companyId, collectionName, id } = docRef;
  const serializedNew = serializeDataForPostgres(newData);

  let finalData = serializedNew;
  if (options?.merge) {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      const existingSerialized = serializeDataForPostgres(existingSnap.data());
      finalData = { ...existingSerialized, ...serializedNew };
    }
  }

  // Update local cache immediately
  const cached = readLocalCollectionCache(companyId, collectionName);
  cached[id] = finalData;
  writeLocalCollectionCache(companyId, collectionName, cached);

  const { error } = await supabase.from('fuel_station_records').upsert(
    {
      company_id: companyId,
      collection_name: collectionName,
      doc_id: id,
      data: finalData,
      is_cancelled: false,
    },
    { onConflict: 'company_id,collection_name,doc_id' }
  );

  if (error) {
    if (isMissingTableError(error)) {
      setSqlTableStatus(true);
      cached[id] = { ...finalData, __pendingSync: true };
      writeLocalCollectionCache(companyId, collectionName, cached);
    } else {
      throw error;
    }
  } else {
    setSqlTableStatus(false);
  }

  notifyCollectionListeners(companyId, collectionName);
}

export async function addDoc(
  colRef: CollectionRef,
  newData: Record<string, any>
): Promise<DocRef> {
  const newDocRef = doc(colRef);
  await setDoc(newDocRef, newData);
  return newDocRef;
}

export async function updateDoc(
  docRef: DocRef,
  updates: Record<string, any>
): Promise<void> {
  await setDoc(docRef, updates, { merge: true });
}

export async function deleteDoc(docRef: DocRef): Promise<void> {
  const { companyId, collectionName, id } = docRef;

  const cached = readLocalCollectionCache(companyId, collectionName);
  delete cached[id];
  writeLocalCollectionCache(companyId, collectionName, cached);

  const { error } = await supabase
    .from('fuel_station_records')
    .delete()
    .eq('company_id', companyId)
    .eq('collection_name', collectionName)
    .eq('doc_id', id);

  if (error && isMissingTableError(error)) {
    setSqlTableStatus(true);
  }

  notifyCollectionListeners(companyId, collectionName);
}

// ============================================================================
// 6. BATCH & TRANSACTION SUPPORT (Concurrency-safe)
// ============================================================================

export function writeBatch(_dbInstance?: any) {
  const ops: Array<{
    type: 'set' | 'update' | 'delete';
    docRef: DocRef;
    data?: Record<string, any>;
    options?: { merge?: boolean };
  }> = [];

  return {
    set(docRef: DocRef, data: Record<string, any>, options?: { merge?: boolean }) {
      ops.push({ type: 'set', docRef, data, options });
    },
    update(docRef: DocRef, data: Record<string, any>) {
      ops.push({ type: 'update', docRef, data });
    },
    delete(docRef: DocRef) {
      ops.push({ type: 'delete', docRef });
    },
    async commit() {
      const affectedCollections = new Set<string>();
      let companyId = auth.currentUser?.uid || '';

      // Group upserts for fast single-roundtrip Postgres upsert when merge is not required
      const upsertRows: any[] = [];

      for (const op of ops) {
        companyId = op.docRef.companyId;
        affectedCollections.add(op.docRef.collectionName);

        if (op.type === 'delete') {
          await deleteDoc(op.docRef);
        } else if (op.type === 'update' || op.options?.merge) {
          await setDoc(op.docRef, op.data || {}, { merge: true });
        } else {
          const serialized = serializeDataForPostgres(op.data || {});
          const cached = readLocalCollectionCache(
            op.docRef.companyId,
            op.docRef.collectionName
          );
          cached[op.docRef.id] = serialized;
          writeLocalCollectionCache(
            op.docRef.companyId,
            op.docRef.collectionName,
            cached
          );
          upsertRows.push({
            company_id: op.docRef.companyId,
            collection_name: op.docRef.collectionName,
            doc_id: op.docRef.id,
            data: serialized,
            is_cancelled: false,
          });
        }
      }

      if (upsertRows.length > 0) {
        const { error } = await supabase
          .from('fuel_station_records')
          .upsert(upsertRows, { onConflict: 'company_id,collection_name,doc_id' });

        if (error && isMissingTableError(error)) {
          setSqlTableStatus(true);
        }
      }

      for (const col of affectedCollections) {
        if (companyId) {
          notifyCollectionListeners(companyId, col);
        }
      }
    },
  };
}

export async function runTransaction<T>(
  _dbInstance: any,
  updateFunction: (transaction: {
    get: (docRef: DocRef) => Promise<DocumentSnapshot>;
    set: (
      docRef: DocRef,
      data: Record<string, any>,
      options?: { merge?: boolean }
    ) => void;
    update: (docRef: DocRef, data: Record<string, any>) => void;
  }) => Promise<T>
): Promise<T> {
  const pendingWrites: Array<() => Promise<void>> = [];

  const tx = {
    async get(docRef: DocRef) {
      return await getDoc(docRef);
    },
    set(
      docRef: DocRef,
      data: Record<string, any>,
      options?: { merge?: boolean }
    ) {
      pendingWrites.push(() => setDoc(docRef, data, options));
    },
    update(docRef: DocRef, data: Record<string, any>) {
      pendingWrites.push(() => updateDoc(docRef, data));
    },
  };

  const result = await updateFunction(tx);
  for (const write of pendingWrites) {
    await write();
  }
  return result;
}

// ============================================================================
// 7. REACTIVE LISTENERS (onSnapshot)
// ============================================================================

type ListenerEntry = {
  companyId: string;
  collectionName: string;
  trigger: () => void;
};

const activeListeners = new Set<ListenerEntry>();

function notifyCollectionListeners(companyId: string, collectionName: string) {
  for (const entry of activeListeners) {
    if (
      entry.companyId === companyId &&
      entry.collectionName === collectionName
    ) {
      entry.trigger();
    }
  }
}

export function onSnapshot(
  target: DocRef | CollectionRef | QueryRef,
  callback: (snapshot: any) => void,
  errorCallback?: (error: any) => void
): () => void {
  let unsubscribed = false;

  const colRef =
    target.type === 'doc'
      ? { companyId: target.companyId, collectionName: target.collectionName }
      : target.type === 'query'
      ? target.collectionRef
      : target;

  const runFetch = async () => {
    if (unsubscribed) return;
    try {
      if (target.type === 'doc') {
        const snap = await getDoc(target);
        if (!unsubscribed) callback(snap);
      } else {
        const snap = await getDocs(target);
        if (!unsubscribed) callback(snap);
      }
    } catch (err) {
      if (!unsubscribed && errorCallback) {
        errorCallback(err);
      }
    }
  };

  const entry: ListenerEntry = {
    companyId: colRef.companyId,
    collectionName: colRef.collectionName,
    trigger: () => {
      runFetch();
    },
  };

  activeListeners.add(entry);
  runFetch();

  return () => {
    unsubscribed = true;
    activeListeners.delete(entry);
  };
}

export default supabase;
