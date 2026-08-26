/**
 * Storage and management utility for per-user and per-model column customization in Odoo DataTable.
 */

const STORAGE_PREFIX = 'odoo_columns_pref_v2';

/**
 * Normalizes a user identifier to create a consistent storage key.
 */
export function getUserIdentifier(username?: string | null, isDemo?: boolean): string {
  if (isDemo) {
    return 'demo_sandbox_user';
  }
  if (!username || !username.trim()) {
    return 'default_user';
  }
  return username.trim().toLowerCase().replace(/[^a-z0-9_@.-]/gi, '_');
}

/**
 * Builds the composite storage key for a user and model.
 */
export function getColumnStorageKey(userKey: string, modelTechnicalName: string): string {
  const cleanModel = (modelTechnicalName || 'generic_model').replace(/\./g, '_');
  return `${STORAGE_PREFIX}__${userKey}__${cleanModel}`;
}

/**
 * Retrieves saved visible columns for a specific user and model from localStorage.
 * Falls back to defaultFields if no saved configuration exists.
 */
export function getSavedColumnsForModel(
  userKey: string,
  modelTechnicalName: string,
  defaultFields: string[] = ['id', 'name']
): string[] {
  try {
    const key = getColumnStorageKey(userKey, modelTechnicalName);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return defaultFields && defaultFields.length > 0 ? defaultFields : ['id', 'name'];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Validate that all elements are non-empty strings
      const valid = parsed.filter((c: any) => typeof c === 'string' && c.trim().length > 0);
      if (valid.length > 0) {
        return valid;
      }
    }
  } catch (err) {
    console.warn(`Error loading saved columns for ${userKey} / ${modelTechnicalName}:`, err);
  }
  return defaultFields && defaultFields.length > 0 ? defaultFields : ['id', 'name'];
}

/**
 * Saves the visible column configuration for a specific user and model to localStorage.
 */
export function saveColumnsForModel(
  userKey: string,
  modelTechnicalName: string,
  columns: string[]
): void {
  try {
    if (!columns || columns.length === 0) return;
    const key = getColumnStorageKey(userKey, modelTechnicalName);
    localStorage.setItem(key, JSON.stringify(columns));
  } catch (err) {
    console.error(`Error saving columns for ${userKey} / ${modelTechnicalName}:`, err);
  }
}

/**
 * Resets saved column configuration for a specific user and model back to default.
 */
export function resetSavedColumnsForModel(
  userKey: string,
  modelTechnicalName: string
): void {
  try {
    const key = getColumnStorageKey(userKey, modelTechnicalName);
    localStorage.removeItem(key);
  } catch (err) {
    console.error(`Error resetting columns for ${userKey} / ${modelTechnicalName}:`, err);
  }
}

/**
 * Checks if a user has custom column configuration for a given model.
 */
export function hasCustomColumnsForModel(
  userKey: string,
  modelTechnicalName: string
): boolean {
  try {
    const key = getColumnStorageKey(userKey, modelTechnicalName);
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}
