import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { UserSettings } from '../types/auth';
import { OdooConnectionCredentials } from '../types/odoo';

const COLLECTION_NAME = 'user_settings';

/**
 * Fetches user settings for a given Firebase User ID.
 */
export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  if (!userId) return null;
  try {
    const docRef = doc(db, COLLECTION_NAME, userId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as UserSettings;
  } catch (err) {
    console.error('Error fetching user settings from Firestore:', err);
    throw err;
  }
}

/**
 * Saves Odoo connection credentials in Firestore for the given user.
 */
export async function saveOdooCredentials(
  userId: string,
  creds: OdooConnectionCredentials
): Promise<void> {
  if (!userId) throw new Error('Utilisateur non identifié');

  try {
    const docRef = doc(db, COLLECTION_NAME, userId);
    const dataToSave: Partial<UserSettings> = {
      userId,
      url: creds.url,
      db: creds.db,
      username: creds.username,
      apiKey: creds.apiKey,
      isConfigured: true,
      lastConnectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(docRef, dataToSave, { merge: true });
  } catch (err) {
    console.error('Error saving Odoo credentials to Firestore:', err);
    throw err;
  }
}

/**
 * Saves custom column visibility preferences per model into Firestore.
 */
export async function saveUserColumnPreferences(
  userId: string,
  modelName: string,
  columns: string[]
): Promise<void> {
  if (!userId || !modelName) return;

  try {
    const cleanModel = modelName.replace(/\./g, '_');
    const docRef = doc(db, COLLECTION_NAME, userId);
    
    await setDoc(
      docRef,
      {
        userId,
        columnPreferences: {
          [cleanModel]: columns
        },
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Error saving column preferences to Firestore:', err);
  }
}

/**
 * Retrieves custom column visibility preferences for a model from Firestore.
 */
export async function getUserColumnPreferences(
  userId: string,
  modelName: string
): Promise<string[] | null> {
  if (!userId || !modelName) return null;

  try {
    const cleanModel = modelName.replace(/\./g, '_');
    const settings = await getUserSettings(userId);
    if (settings?.columnPreferences && settings.columnPreferences[cleanModel]) {
      return settings.columnPreferences[cleanModel];
    }
  } catch (err) {
    console.warn('Error retrieving column preferences from Firestore:', err);
  }
  return null;
}

/**
 * Clears saved Odoo credentials from Firestore.
 */
export async function clearOdooCredentials(userId: string): Promise<void> {
  if (!userId) return;

  try {
    const docRef = doc(db, COLLECTION_NAME, userId);
    await updateDoc(docRef, {
      url: deleteField(),
      db: deleteField(),
      username: deleteField(),
      apiKey: deleteField(),
      isConfigured: false,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error clearing Odoo credentials in Firestore:', err);
  }
}
