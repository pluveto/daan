// src/lib/miniappStorage.ts
const STORAGE_PREFIX = 'miniappData::';

function getStorageKey(definitionId: string, key: string): string {
  if (!definitionId || !key) {
    throw new Error('definitionId and key are required for storage');
  }
  return `${STORAGE_PREFIX}${definitionId}::${key}`;
}

/**
 * Stores a value for a specific Miniapp definition.
 * Value is JSON-stringified.
 * @param definitionId - The ID of the Miniapp definition.
 * @param key - The storage key.
 * @param value - The value to store (must be JSON-serializable).
 */
export function setMiniappStorageItem(
  definitionId: string,
  key: string,
  value: any,
): void {
  try {
    const storageKey = getStorageKey(definitionId, key);
    const stringifiedValue = JSON.stringify(value);
    localStorage.setItem(storageKey, stringifiedValue);
    console.debug(`[MiniappStorage] Set item for ${definitionId}: ${key}`);
  } catch (error) {
    console.error(
      `[MiniappStorage] Failed to set item for ${definitionId} (key: ${key}):`,
      error,
    );
    // Optionally re-throw or handle specific errors like quota exceeded
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      // TODO: Maybe notify the user or implement LRU cache
      console.error('Storage quota exceeded!');
      alert('Storage space is full. Cannot save Miniapp data.');
    }
    throw error; // Re-throw for caller to handle if needed
  }
}

/**
 * Retrieves a value for a specific Miniapp definition.
 * Value is JSON-parsed.
 * @param definitionId - The ID of the Miniapp definition.
 * @param key - The storage key.
 * @returns The stored value, or null if not found or parse error.
 */
export function getMiniappStorageItem<T = any>(
  definitionId: string,
  key: string,
): T | null {
  try {
    const storageKey = getStorageKey(definitionId, key);
    const stringifiedValue = localStorage.getItem(storageKey);
    if (stringifiedValue === null) {
      return null;
    }
    return JSON.parse(stringifiedValue) as T;
  } catch (error) {
    console.error(
      `[MiniappStorage] Failed to get or parse item for ${definitionId} (key: ${key}):`,
      error,
    );
    return null; // Return null on parsing errors
  }
}

/**
 * Removes a specific key-value pair for a Miniapp definition.
 * @param definitionId - The ID of the Miniapp definition.
 * @param key - The storage key to remove.
 */
export function removeMiniappStorageItem(
  definitionId: string,
  key: string,
): void {
  try {
    const storageKey = getStorageKey(definitionId, key);
    localStorage.removeItem(storageKey);
    console.debug(`[MiniappStorage] Removed item for ${definitionId}: ${key}`);
  } catch (error) {
    console.error(
      `[MiniappStorage] Failed to remove item for ${definitionId} (key: ${key}):`,
      error,
    );
    throw error;
  }
}

/**
 * Retrieves all storage keys associated with a specific Miniapp definition.
 * @param definitionId - The ID of the Miniapp definition.
 * @returns An array of keys.
 */
export function getMiniappStorageKeys(definitionId: string): string[] {
  const keys: string[] = [];
  const prefix = `${STORAGE_PREFIX}${definitionId}::`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keys.push(key.substring(prefix.length));
    }
  }
  return keys;
}

/**
 * Retrieves all data (key-value pairs) for a specific Miniapp definition.
 * @param definitionId - The ID of the Miniapp definition.
 * @returns A record containing all stored data.
 */
export function getAllMiniappStorageData(
  definitionId: string,
): Record<string, any> {
  const data: Record<string, any> = {};
  const keys = getMiniappStorageKeys(definitionId);
  keys.forEach((key) => {
    const value = getMiniappStorageItem(definitionId, key);
    // We store nulls, so only skip if retrieval truly failed (which getMiniappStorageItem handles by returning null)
    // However, if a key exists but value is null, we should probably include it.
    data[key] = value;
  });
  return data;
}

/**
 * Removes ALL data associated with a specific Miniapp definition. Use with caution!
 * @param definitionId - The ID of the Miniapp definition.
 */
export function clearMiniappStorage(definitionId: string): void {
  try {
    const keys = getMiniappStorageKeys(definitionId);
    keys.forEach((key) => {
      const storageKey = getStorageKey(definitionId, key);
      localStorage.removeItem(storageKey);
    });
    console.log(
      `[MiniappStorage] Cleared all ${keys.length} items for ${definitionId}`,
    );
  } catch (error) {
    console.error(
      `[MiniappStorage] Failed to clear storage for ${definitionId}:`,
      error,
    );
    throw error;
  }
}
