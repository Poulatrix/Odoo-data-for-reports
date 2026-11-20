import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ClockEmployeeProfile,
  ClockEmployeeStatus,
  ClockJustification,
  ClockImportedRecord,
  ClockLunchDeduction,
  ClockContractType
} from '../types/clockAudit';
import { TimesheetAuditEmployeeItem } from '../types/odoo';

const CLOCK_PROFILES_COLLECTION = 'clock_profiles';
const CLOCK_JUSTIFICATIONS_COLLECTION = 'clock_justifications';
const CLOCK_IMPORTED_RECORDS_COLLECTION = 'clock_imported_records';
const LOCAL_STORAGE_PROFILES_KEY = 'odoo_clock_employee_profiles';
const LOCAL_STORAGE_JUSTIFICATIONS_KEY = 'odoo_clock_justifications';
const LOCAL_STORAGE_IMPORTED_RECORDS_KEY = 'odoo_clock_imported_records';

/**
 * Convert lunch deduction code to numeric hours
 */
export function lunchDeductionToHours(deduction: ClockLunchDeduction): number {
  switch (deduction) {
    case '30m':
      return 0.5;
    case '45m':
      return 0.75;
    case '60m':
      return 1.0;
    case 'none':
    default:
      return 0.0;
  }
}

/**
 * Format minutes into readable string (e.g. 45 min, +1h 15m)
 */
export function formatMinutesDiff(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  const sign = minutes > 0 ? '+' : minutes < 0 ? '-' : '';

  if (h === 0) {
    return `${sign}${m} min`;
  }
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m < 10 ? '0' + m : m}m`;
}

/**
 * Normalize profile for backwards compatibility
 */
export function normalizeClockProfile(p: any): ClockEmployeeProfile {
  const status: ClockEmployeeStatus = p.status || (p.contractType === 'contractor' ? 'contractor' : 'standard');
  const deductLunch = typeof p.deductLunch === 'boolean' 
    ? p.deductLunch 
    : (p.lunchDeduction ? p.lunchDeduction !== 'none' : true);
  const requireValidationAlert = typeof p.requireValidationAlert === 'boolean'
    ? p.requireValidationAlert
    : (p.alertOnContractorEqual ?? (status === 'contractor'));

  return {
    employeeId: Number(p.employeeId),
    employeeName: p.employeeName || '',
    status,
    contractType: status,
    deductLunch,
    lunchDeduction: deductLunch ? '30m' : 'none',
    requireValidationAlert,
    alertOnContractorEqual: requireValidationAlert,
    toleranceMinutes: typeof p.toleranceMinutes === 'number' ? p.toleranceMinutes : 15,
    customNotes: p.customNotes || '',
    updatedAt: p.updatedAt || new Date().toISOString()
  };
}

/**
 * Default profile factory
 */
export function createDefaultProfile(employeeId: number, employeeName: string): ClockEmployeeProfile {
  return {
    employeeId,
    employeeName,
    status: 'standard',
    contractType: 'standard',
    deductLunch: true, // Fixe 30 min coché par défaut
    lunchDeduction: '30m',
    requireValidationAlert: false,
    alertOnContractorEqual: false,
    toleranceMinutes: 15,
    customNotes: '',
    updatedAt: new Date().toISOString()
  };
}

// --------------------------------------------------------------------------
// PROFILES PERSISTENCE
// --------------------------------------------------------------------------

/**
 * Load all employee clock profiles from Firestore (with localStorage fallback)
 */
export async function loadClockProfiles(): Promise<Record<number, ClockEmployeeProfile>> {
  const result: Record<number, ClockEmployeeProfile> = {};

  try {
    const colRef = collection(db, CLOCK_PROFILES_COLLECTION);
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      snap.forEach(docSnap => {
        const p = docSnap.data();
        if (p && p.employeeId) {
          result[p.employeeId] = normalizeClockProfile(p);
        }
      });

      try {
        localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(result));
      } catch {}
      return result;
    }
  } catch (err) {
    console.warn('Firestore loadClockProfiles fallback to local:', err);
  }

  // Local storage fallback
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PROFILES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.entries(parsed).forEach(([k, v]) => {
          result[Number(k)] = normalizeClockProfile(v);
        });
        return result;
      }
    }
  } catch (e) {
    console.warn('Failed to parse local clock profiles:', e);
  }

  return result;
}

/**
 * Save a single employee clock profile
 */
export async function saveClockProfile(profile: ClockEmployeeProfile): Promise<void> {
  // Update local cache
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PROFILES_KEY);
    const current = raw ? JSON.parse(raw) : {};
    current[profile.employeeId] = profile;
    localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('Failed to update local cache for clock profile:', e);
  }

  // Persist to Firestore
  try {
    const docRef = doc(db, CLOCK_PROFILES_COLLECTION, String(profile.employeeId));
    await setDoc(docRef, {
      ...profile,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore saveClockProfile error:', err);
  }
}

/**
 * Save multiple employee clock profiles in batch
 */
export async function saveBulkClockProfiles(profiles: ClockEmployeeProfile[]): Promise<void> {
  // Update local cache
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PROFILES_KEY);
    const current = raw ? JSON.parse(raw) : {};
    profiles.forEach(p => {
      current[p.employeeId] = p;
    });
    localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('Failed to update local cache for bulk clock profiles:', e);
  }

  // Persist to Firestore in batches of 500
  try {
    for (let i = 0; i < profiles.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = profiles.slice(i, i + 500);
      const now = new Date().toISOString();
      chunk.forEach(p => {
        const ref = doc(db, CLOCK_PROFILES_COLLECTION, String(p.employeeId));
        batch.set(ref, { ...p, updatedAt: now }, { merge: true });
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('Firestore saveBulkClockProfiles error:', err);
  }
}

/**
 * Subscribe to realtime clock profiles
 */
export function subscribeToClockProfiles(callback: (profiles: Record<number, ClockEmployeeProfile>) => void) {
  try {
    const colRef = collection(db, CLOCK_PROFILES_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const result: Record<number, ClockEmployeeProfile> = {};
      snapshot.forEach(docSnap => {
        const p = docSnap.data();
        if (p && p.employeeId) {
          result[p.employeeId] = normalizeClockProfile(p);
        }
      });
      try {
        localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(result));
      } catch {}
      callback(result);
    }, (error) => {
      console.warn('Clock profiles realtime subscription error:', error);
    });
  } catch (err) {
    console.warn('Failed to setup clock profiles realtime subscription:', err);
    return () => {};
  }
}

// --------------------------------------------------------------------------
// JUSTIFICATIONS PERSISTENCE
// --------------------------------------------------------------------------

/**
 * Load all clock justifications from Firestore
 */
export async function loadClockJustifications(): Promise<Record<string, ClockJustification>> {
  const result: Record<string, ClockJustification> = {};

  try {
    const colRef = collection(db, CLOCK_JUSTIFICATIONS_COLLECTION);
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      snap.forEach(docSnap => {
        const j = docSnap.data() as ClockJustification;
        if (j && j.id) {
          result[j.id] = j;
        }
      });

      try {
        localStorage.setItem(LOCAL_STORAGE_JUSTIFICATIONS_KEY, JSON.stringify(result));
      } catch {}
      return result;
    }
  } catch (err) {
    console.warn('Firestore loadClockJustifications fallback to local:', err);
  }

  // Local storage fallback
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_JUSTIFICATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, ClockJustification>;
      }
    }
  } catch (e) {
    console.warn('Failed to parse local clock justifications:', e);
  }

  return result;
}

/**
 * Save or update a clock discrepancy justification
 */
export async function saveClockJustification(justification: ClockJustification): Promise<void> {
  // Update local cache
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_JUSTIFICATIONS_KEY);
    const current = raw ? JSON.parse(raw) : {};
    current[justification.id] = justification;
    localStorage.setItem(LOCAL_STORAGE_JUSTIFICATIONS_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('Failed to update local cache for clock justification:', e);
  }

  // Persist to Firestore
  try {
    const docRef = doc(db, CLOCK_JUSTIFICATIONS_COLLECTION, justification.id);
    await setDoc(docRef, {
      ...justification,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore saveClockJustification error:', err);
  }
}

/**
 * Delete a clock discrepancy justification
 */
export async function deleteClockJustification(justificationId: string): Promise<void> {
  // Update local cache
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_JUSTIFICATIONS_KEY);
    if (raw) {
      const current = JSON.parse(raw);
      delete current[justificationId];
      localStorage.setItem(LOCAL_STORAGE_JUSTIFICATIONS_KEY, JSON.stringify(current));
    }
  } catch (e) {
    console.warn('Failed to delete local clock justification:', e);
  }

  // Delete from Firestore
  try {
    const docRef = doc(db, CLOCK_JUSTIFICATIONS_COLLECTION, justificationId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore deleteClockJustification error:', err);
  }
}

/**
 * Realtime subscription for justifications
 */
export function subscribeToClockJustifications(callback: (justifications: Record<string, ClockJustification>) => void) {
  try {
    const colRef = collection(db, CLOCK_JUSTIFICATIONS_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const result: Record<string, ClockJustification> = {};
      snapshot.forEach(docSnap => {
        const j = docSnap.data() as ClockJustification;
        if (j && j.id) {
          result[j.id] = j;
        }
      });
      try {
        localStorage.setItem(LOCAL_STORAGE_JUSTIFICATIONS_KEY, JSON.stringify(result));
      } catch {}
      callback(result);
    }, (error) => {
      console.warn('Clock justifications realtime subscription error:', error);
    });
  } catch (err) {
    console.warn('Failed to setup clock justifications realtime subscription:', err);
    return () => {};
  }
}

// --------------------------------------------------------------------------
// IMPORTED CLOCK RECORDS PERSISTENCE (FIRESTORE & LOCAL STORAGE)
// --------------------------------------------------------------------------

/**
 * Strips all undefined and null values so Firestore WriteBatch NEVER rejects with:
 * "Unsupported field value: undefined"
 */
export function sanitizeClockRecordForFirestore(r: ClockImportedRecord, docId: string): Record<string, any> {
  const result: Record<string, any> = {
    id: docId,
    employeeNameRaw: (r.employeeNameRaw || '').trim(),
    date: (r.date || '').trim(),
    rawHours: Number(r.rawHours) || 0,
    updatedAt: new Date().toISOString()
  };

  // Optional string / number / boolean fields - only attach if defined and not empty
  if (r.matchedEmployeeId !== undefined && r.matchedEmployeeId !== null) {
    result.matchedEmployeeId = Number(r.matchedEmployeeId);
  }
  if (r.matchedEmployeeName) result.matchedEmployeeName = String(r.matchedEmployeeName).trim();
  if (r.startTime) result.startTime = String(r.startTime).trim();
  if (r.endTime) result.endTime = String(r.endTime).trim();
  if (r.entree1) result.entree1 = String(r.entree1).trim();
  if (r.sortie1) result.sortie1 = String(r.sortie1).trim();
  if (r.entree2) result.entree2 = String(r.entree2).trim();
  if (r.sortie2) result.sortie2 = String(r.sortie2).trim();
  if (r.entree3) result.entree3 = String(r.entree3).trim();
  if (r.sortie3) result.sortie3 = String(r.sortie3).trim();
  if (r.tempsPresentEff) result.tempsPresentEff = String(r.tempsPresentEff).trim();
  if (r.calculationMethod) result.calculationMethod = String(r.calculationMethod);
  if (r.isNonWorkingDay !== undefined) result.isNonWorkingDay = Boolean(r.isNonWorkingDay);
  if (r.sourceRow !== undefined) result.sourceRow = Number(r.sourceRow);
  if (r.badgeNumber) result.badgeNumber = String(r.badgeNumber).trim();

  return result;
}

/**
 * Generate a deterministic, sanitized document ID for an imported clock record.
 * Uniquely identifies an employee for a specific date regardless of whether Odoo matched them yet.
 */
export function getClockRecordDocId(r: ClockImportedRecord): string {
  const cleanName = (r.employeeNameRaw || 'unknown')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);

  const cleanDate = (r.date || 'unknown').replace(/[^a-z0-9\-]/gi, '_').slice(0, 20);
  return `clk_${cleanName || 'emp'}_${cleanDate}`;
}

/**
 * Load imported clock records from localStorage cache (immediate sync)
 */
export function loadImportedClockRecords(): ClockImportedRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_IMPORTED_RECORDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse cached imported clock records:', e);
  }
  return [];
}

/**
 * Load all imported clock records from Firestore and refresh local cache
 */
export async function loadImportedClockRecordsFromFirestore(): Promise<ClockImportedRecord[]> {
  const list: ClockImportedRecord[] = [];
  try {
    const colRef = collection(db, CLOCK_IMPORTED_RECORDS_COLLECTION);
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      snap.forEach(docSnap => {
        const data = docSnap.data() as ClockImportedRecord;
        if (data && data.date && data.employeeNameRaw) {
          list.push({
            ...data,
            id: docSnap.id
          });
        }
      });
      // Sort chronologically by date ascending, then employee name
      list.sort((a, b) => {
        const d = (a.date || '').localeCompare(b.date || '');
        if (d !== 0) return d;
        return (a.employeeNameRaw || '').localeCompare(b.employeeNameRaw || '');
      });

      // Update local cache
      try {
        localStorage.setItem(LOCAL_STORAGE_IMPORTED_RECORDS_KEY, JSON.stringify(list));
      } catch (e) {
        console.warn('Failed to cache imported records locally:', e);
      }
      return list;
    } else {
      // If Firestore is empty, check if we have cached local records from an earlier session
      const cached = loadImportedClockRecords();
      if (cached && cached.length > 0) {
        console.info('Migrating local cached clock records to Firestore...', cached.length);
        await saveImportedClockRecords(cached);
        return cached;
      }
    }
  } catch (err) {
    console.warn('Firestore loadImportedClockRecordsFromFirestore error, falling back to local cache:', err);
  }

  // Fallback to local storage if Firestore is empty or throws error
  return loadImportedClockRecords();
}

/**
 * Save full set of imported clock records into localStorage and Firestore
 */
export async function saveImportedClockRecords(records: ClockImportedRecord[]): Promise<void> {
  // 1. Update local cache immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_IMPORTED_RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    console.warn('Failed to save imported clock records locally:', e);
  }

  // 2. Persist to Firestore in chunks of 400
  try {
    for (let i = 0; i < records.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = records.slice(i, i + 400);
      chunk.forEach(r => {
        const docId = getClockRecordDocId(r);
        const ref = doc(db, CLOCK_IMPORTED_RECORDS_COLLECTION, docId);
        const cleanData = sanitizeClockRecordForFirestore(r, docId);
        batch.set(ref, cleanData, { merge: true });
      });
      await batch.commit();
    }
  } catch (err) {
    console.error('Firestore saveImportedClockRecords error:', err);
  }
}

/**
 * MERGE newly imported clock records with existing historical records!
 * Preserves all previous days so daily imports simply accumulate.
 */
export async function saveNewImportedClockRecords(
  incomingRecords: ClockImportedRecord[],
  currentRecords?: ClockImportedRecord[]
): Promise<ClockImportedRecord[]> {
  // If currentRecords not provided, read existing from cache or Firestore
  const existingList = currentRecords && currentRecords.length > 0 
    ? currentRecords 
    : loadImportedClockRecords();

  const recordsMap = new Map<string, ClockImportedRecord>();

  // Populate map with existing records
  existingList.forEach(r => {
    const key = getClockRecordDocId(r);
    recordsMap.set(key, { ...r, id: key });
  });

  // Merge/upsert incoming records
  incomingRecords.forEach(r => {
    const key = getClockRecordDocId(r);
    recordsMap.set(key, { ...r, id: key });
  });

  const mergedList = Array.from(recordsMap.values()).sort((a, b) => {
    const d = (a.date || '').localeCompare(b.date || '');
    if (d !== 0) return d;
    return (a.employeeNameRaw || '').localeCompare(b.employeeNameRaw || '');
  });

  // Save to local cache immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_IMPORTED_RECORDS_KEY, JSON.stringify(mergedList));
  } catch (e) {
    console.warn('Failed to cache merged clock records:', e);
  }

  // Persist only incoming records to Firestore in chunks of 400
  try {
    for (let i = 0; i < incomingRecords.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = incomingRecords.slice(i, i + 400);
      chunk.forEach(r => {
        const docId = getClockRecordDocId(r);
        const ref = doc(db, CLOCK_IMPORTED_RECORDS_COLLECTION, docId);
        const cleanData = sanitizeClockRecordForFirestore(r, docId);
        batch.set(ref, cleanData, { merge: true });
      });
      await batch.commit();
    }
  } catch (err) {
    console.error('Firestore saveNewImportedClockRecords error:', err);
  }

  return mergedList;
}

/**
 * Delete specific imported clock records by IDs
 */
export async function deleteImportedClockRecords(recordIds: string[]): Promise<ClockImportedRecord[]> {
  const current = loadImportedClockRecords();
  const idSet = new Set(recordIds);
  const updated = current.filter(r => !idSet.has(r.id) && !idSet.has(getClockRecordDocId(r)));

  try {
    localStorage.setItem(LOCAL_STORAGE_IMPORTED_RECORDS_KEY, JSON.stringify(updated));
  } catch {}

  try {
    for (let i = 0; i < recordIds.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = recordIds.slice(i, i + 400);
      chunk.forEach(id => {
        const ref = doc(db, CLOCK_IMPORTED_RECORDS_COLLECTION, id);
        batch.delete(ref);
      });
      await batch.commit();
    }
  } catch (err) {
    console.error('Firestore deleteImportedClockRecords error:', err);
  }

  return updated;
}

/**
 * Clear all imported clock records from both localStorage and Firestore
 */
export async function clearImportedClockRecords(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_IMPORTED_RECORDS_KEY);
  } catch (e) {
    console.warn('Failed to clear local imported clock records:', e);
  }

  try {
    const colRef = collection(db, CLOCK_IMPORTED_RECORDS_COLLECTION);
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + 400);
        chunk.forEach(d => {
          batch.delete(d.ref);
        });
        await batch.commit();
      }
    }
  } catch (err) {
    console.error('Firestore clearImportedClockRecords error:', err);
  }
}

/**
 * Subscribe to realtime imported clock records updates across sessions
 */
export function subscribeToImportedClockRecords(callback: (records: ClockImportedRecord[]) => void) {
  try {
    const colRef = collection(db, CLOCK_IMPORTED_RECORDS_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const list: ClockImportedRecord[] = [];
      snapshot.forEach(docSnap => {
        const r = docSnap.data() as ClockImportedRecord;
        if (r && r.date && r.employeeNameRaw) {
          list.push({
            ...r,
            id: docSnap.id
          });
        }
      });

      list.sort((a, b) => {
        const d = (a.date || '').localeCompare(b.date || '');
        if (d !== 0) return d;
        return (a.employeeNameRaw || '').localeCompare(b.employeeNameRaw || '');
      });

      // Update local storage only if we received data or if explicitly cleared
      if (list.length > 0) {
        try {
          localStorage.setItem(LOCAL_STORAGE_IMPORTED_RECORDS_KEY, JSON.stringify(list));
        } catch {}
      }

      callback(list);
    }, (error) => {
      console.warn('Imported clock records realtime subscription error:', error);
    });
  } catch (err) {
    console.warn('Failed to setup imported clock records realtime subscription:', err);
    return () => {};
  }
}

// --------------------------------------------------------------------------
// SAMPLE CSV DATA GENERATOR (FOR IMMEDIATE USER TESTING)
// --------------------------------------------------------------------------

/**
 * Generates realistic sample CSV text based on the active Odoo employees and period
 */
export function generateSampleClockCsv(employees: TimesheetAuditEmployeeItem[], startDate: string, endDate: string): string {
  const activeEmps = employees.length > 0 
    ? employees.slice(0, 6)
    : [
        { id: 1, name: 'Devoldere Nicolas' },
        { id: 2, name: 'Deck Joris' },
        { id: 3, name: 'Alexandre Bantuelle' },
        { id: 4, name: 'Errera Giancarlo' },
        { id: 5, name: 'Maria Domenico' }
      ];

  const lines: string[] = ['Collaborateur;Date;Heures_Presence_Brute;Entree;Sortie'];

  // Parse start and end date
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Limit sample to at most 7 days
  const current = new Date(start);
  let dayCount = 0;

  while (current <= end && dayCount < 7) {
    const dow = current.getDay();
    const dateStr = current.toISOString().slice(0, 10);

    // Skip weekends or include occasionally
    if (dow !== 0 && dow !== 6) {
      activeEmps.forEach((emp, idx) => {
        // Vary presence hours slightly around 8.00 - 8.75 hours (so with 45 min pause = 7.25h - 8.00h)
        let hours = 8.25;
        let inTime = '07:30';
        let outTime = '16:15';

        if (idx === 0) {
          // Normal standard employee: 8.25h gross (with 45 min lunch = 7.50h net)
          hours = 8.25;
          inTime = '07:30';
          outTime = '16:15';
        } else if (idx === 1) {
          // Employee with positive discrepancy (present 8.75h gross = 8.00h net, but only 6.5h in Odoo)
          hours = 8.75;
          inTime = '07:15';
          outTime = '16:30';
        } else if (idx === 2) {
          // Contractor / Indépendant: exact hours matching
          hours = 8.00;
          inTime = '08:00';
          outTime = '16:30';
        } else if (idx === 3) {
          // Slight difference within tolerance
          hours = 8.35;
          inTime = '07:45';
          outTime = '16:36';
        } else {
          hours = 8.00;
          inTime = '08:00';
          outTime = '16:30';
        }

        lines.push(`${emp.name};${dateStr};${hours.toFixed(2)};${inTime};${outTime}`);
      });
    }

    current.setDate(current.getDate() + 1);
    dayCount++;
  }

  return lines.join('\n');
}
