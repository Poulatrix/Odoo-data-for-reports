import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  deleteDoc, 
  writeBatch, 
  onSnapshot, 
  getDocFromServer 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimesheetWorkgroup, TimesheetExclusion } from '../types/odoo';

const LOCAL_STORAGE_WORKGROUPS_KEY = 'odoo_timesheet_workgroups';
const LOCAL_STORAGE_FAVORITE_WORKGROUP_KEY = 'odoo_timesheet_favorite_workgroup_id';
const LOCAL_STORAGE_EXCLUSIONS_KEY = 'odoo_timesheet_exclusions';
const EXCLUSIONS_COLLECTION = 'timesheet_exclusions';
const WORKGROUPS_COLLECTION = 'timesheet_workgroups';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

// Test connection on boot
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore: le client semble hors-ligne ou la configuration est en attente.');
    }
  }
}

// Initial connection test
testFirestoreConnection();

// Default sample workgroups if none created yet (empty to avoid phantom IDs)
export const DEFAULT_SAMPLE_WORKGROUPS: TimesheetWorkgroup[] = [];

// --------------------------------------------------------------------------
// WORKGROUPS MANAGEMENT
// --------------------------------------------------------------------------

/**
 * Load all workgroups from Firestore (with localStorage fallback and cache)
 */
export async function loadWorkgroups(): Promise<TimesheetWorkgroup[]> {
  // 1. Fetch from Firestore (central shared company database)
  try {
    const colRef = collection(db, WORKGROUPS_COLLECTION);
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const groups: TimesheetWorkgroup[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data() as TimesheetWorkgroup;
        if (d && d.id && d.name) {
          groups.push(d);
        }
      });

      // Cache in localStorage
      try {
        localStorage.setItem(LOCAL_STORAGE_WORKGROUPS_KEY, JSON.stringify(groups));
      } catch {}
      return groups;
    } else {
      // Check if seeded before
      const hasSeeded = localStorage.getItem('odoo_workgroups_initialized');
      if (!hasSeeded) {
        // First initialization: seed default workgroups into Firestore
        localStorage.setItem('odoo_workgroups_initialized', 'true');
        await saveWorkgroups(DEFAULT_SAMPLE_WORKGROUPS);
        return DEFAULT_SAMPLE_WORKGROUPS;
      }
      return [];
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, WORKGROUPS_COLLECTION);
  }

  // 2. Fallback to local storage if offline / network error
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_WORKGROUPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse local workgroups cache:', e);
  }

  return DEFAULT_SAMPLE_WORKGROUPS;
}

/**
 * Delete a specific workgroup directly from Firestore & localStorage
 */
export async function deleteWorkgroup(groupId: string): Promise<void> {
  // 1. Update local cache
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_WORKGROUPS_KEY);
    if (raw) {
      const current = JSON.parse(raw);
      if (Array.isArray(current)) {
        const filtered = current.filter((g: TimesheetWorkgroup) => g.id !== groupId);
        localStorage.setItem(LOCAL_STORAGE_WORKGROUPS_KEY, JSON.stringify(filtered));
      }
    }
  } catch (e) {
    console.warn('Failed to update local cache during workgroup deletion:', e);
  }

  // 2. Delete from Firestore
  try {
    const docRef = doc(db, WORKGROUPS_COLLECTION, groupId);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${WORKGROUPS_COLLECTION}/${groupId}`);
  }
}

/**
 * Save workgroups to Firestore & localStorage, deleting removed groups
 */
export async function saveWorkgroups(workgroups: TimesheetWorkgroup[]): Promise<void> {
  localStorage.setItem('odoo_workgroups_initialized', 'true');

  // 1. Cache locally
  try {
    localStorage.setItem(LOCAL_STORAGE_WORKGROUPS_KEY, JSON.stringify(workgroups));
  } catch (e) {
    console.warn('Failed to cache workgroups in localStorage:', e);
  }

  // 2. Save directly to Firestore collection & remove deleted documents
  try {
    const existingSnap = await getDocs(collection(db, WORKGROUPS_COLLECTION));
    const existingIds = new Set<string>();
    existingSnap.forEach(d => existingIds.add(d.id));

    const newIds = new Set(workgroups.map(w => w.id).filter(Boolean));
    const batch = writeBatch(db);

    // Delete removed groups from Firestore
    for (const oldId of existingIds) {
      if (!newIds.has(oldId)) {
        const docRef = doc(db, WORKGROUPS_COLLECTION, oldId);
        batch.delete(docRef);
      }
    }

    // Set / update active groups
    for (const wg of workgroups) {
      if (!wg.id) continue;
      const docRef = doc(db, WORKGROUPS_COLLECTION, wg.id);
      batch.set(docRef, {
        ...wg,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, WORKGROUPS_COLLECTION);
  }
}

/**
 * Real-time listener for workgroups across all browsers & devices
 */
export function subscribeToWorkgroups(callback: (workgroups: TimesheetWorkgroup[]) => void): () => void {
  try {
    const colRef = collection(db, WORKGROUPS_COLLECTION);
    const unsub = onSnapshot(
      colRef,
      (snapshot) => {
        const groups: TimesheetWorkgroup[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as TimesheetWorkgroup;
          if (data && data.id && data.name) {
            groups.push(data);
          }
        });
        try {
          localStorage.setItem(LOCAL_STORAGE_WORKGROUPS_KEY, JSON.stringify(groups));
        } catch {}
        callback(groups);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, WORKGROUPS_COLLECTION);
      }
    );
    return unsub;
  } catch (err) {
    console.warn('subscribeToWorkgroups initialization error:', err);
    return () => {};
  }
}

/**
 * Get the saved favorite/pinned workgroup ID (or null if none)
 */
export function getFavoriteWorkgroupId(): string | null {
  try {
    return localStorage.getItem(LOCAL_STORAGE_FAVORITE_WORKGROUP_KEY);
  } catch {
    return null;
  }
}

/**
 * Set or remove the favorite/pinned workgroup ID
 */
export function setFavoriteWorkgroupId(groupId: string | null): void {
  try {
    if (groupId) {
      localStorage.setItem(LOCAL_STORAGE_FAVORITE_WORKGROUP_KEY, groupId);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_FAVORITE_WORKGROUP_KEY);
    }
  } catch (e) {
    console.warn('Failed to save favorite workgroup to localStorage:', e);
  }
}

// --------------------------------------------------------------------------
// EXCLUSIONS & VALIDATIONS MANAGEMENT
// --------------------------------------------------------------------------

/**
 * Load all day exclusions & validations from Firestore & local cache
 */
export async function loadExclusions(): Promise<Record<string, TimesheetExclusion>> {
  let result: Record<string, TimesheetExclusion> = {};

  // 1. Check local cache first for instant initial display
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_EXCLUSIONS_KEY);
    if (raw) {
      result = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to parse local exclusions cache:', e);
  }

  // 2. Fetch latest shared source of truth from Firestore
  try {
    const colRef = collection(db, EXCLUSIONS_COLLECTION);
    const snapshot = await getDocs(colRef);
    const firestoreExclusions: Record<string, TimesheetExclusion> = {};
    
    snapshot.forEach(docSnap => {
      const item = docSnap.data() as TimesheetExclusion;
      if (item && item.id && item.date) {
        firestoreExclusions[item.id] = item;
      }
    });

    if (snapshot.size > 0 || Object.keys(firestoreExclusions).length > 0) {
      result = firestoreExclusions;
      try {
        localStorage.setItem(LOCAL_STORAGE_EXCLUSIONS_KEY, JSON.stringify(result));
      } catch {}
      return result;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, EXCLUSIONS_COLLECTION);
  }

  return result;
}

/**
 * Save day exclusions / validations to Firestore & local cache
 */
export async function saveExclusions(exclusions: Record<string, TimesheetExclusion>): Promise<void> {
  // 1. Update local storage immediately for instant UI feedback
  try {
    localStorage.setItem(LOCAL_STORAGE_EXCLUSIONS_KEY, JSON.stringify(exclusions));
  } catch (e) {
    console.warn('Failed to write local exclusions:', e);
  }

  // 2. Persist in Firestore
  try {
    const existingSnap = await getDocs(collection(db, EXCLUSIONS_COLLECTION));
    const existingIds = new Set<string>();
    existingSnap.forEach(d => existingIds.add(d.id));

    const currentKeys = Object.keys(exclusions);
    const keysSet = new Set(currentKeys);

    // Save/update in batches (up to 400 docs per batch)
    const BATCH_SIZE = 400;
    let batch = writeBatch(db);
    let opCount = 0;

    // Delete records that are no longer in the map
    for (const oldId of existingIds) {
      if (!keysSet.has(oldId)) {
        const docRef = doc(db, EXCLUSIONS_COLLECTION, oldId);
        batch.delete(docRef);
        opCount++;
        if (opCount >= BATCH_SIZE) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }
    }

    // Set/update all active records
    for (const key of currentKeys) {
      const item = exclusions[key];
      if (!item || !item.id) continue;
      const docRef = doc(db, EXCLUSIONS_COLLECTION, item.id);
      batch.set(docRef, {
        ...item,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      opCount++;
      if (opCount >= BATCH_SIZE) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, EXCLUSIONS_COLLECTION);
  }
}

/**
 * Real-time listener for day exclusions / validations across all browsers & devices
 */
export function subscribeToExclusions(
  callback: (exclusions: Record<string, TimesheetExclusion>) => void
): () => void {
  try {
    const colRef = collection(db, EXCLUSIONS_COLLECTION);
    const unsub = onSnapshot(
      colRef,
      (snapshot) => {
        const map: Record<string, TimesheetExclusion> = {};
        snapshot.forEach(docSnap => {
          const item = docSnap.data() as TimesheetExclusion;
          if (item && item.id && item.date) {
            map[item.id] = item;
          }
        });
        try {
          localStorage.setItem(LOCAL_STORAGE_EXCLUSIONS_KEY, JSON.stringify(map));
        } catch {}
        callback(map);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, EXCLUSIONS_COLLECTION);
      }
    );
    return unsub;
  } catch (err) {
    console.warn('subscribeToExclusions initialization error:', err);
    return () => {};
  }
}
