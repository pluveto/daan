// src/miniapps/persistence.ts
import { IDBPDatabase, openDB } from 'idb';
import { useAtom } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import { miniappsConfigAtom, miniappsDefinitionAtom } from '../store/miniapp';
import type { MiniappConfig, MiniappDefinition } from '../types';

const DB_NAME = 'SheafyMiniappStore';
const DEFINITIONS_STORE = 'definitions';
const CONFIGS_STORE = 'configs';
const GENERAL_DATA_STORE = 'miniapp_general_data';
const VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        console.log(`Upgrading DB from ${oldVersion} to ${newVersion}`);
        // Existing stores (ensure they are created if upgrading from v0)
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(DEFINITIONS_STORE)) {
            db.createObjectStore(DEFINITIONS_STORE, { keyPath: 'id' });
            console.log(`Created object store: ${DEFINITIONS_STORE}`);
          }
          if (!db.objectStoreNames.contains(CONFIGS_STORE)) {
            db.createObjectStore(CONFIGS_STORE); // Keyed by miniappId (string)
            console.log(`Created object store: ${CONFIGS_STORE}`);
          }
        }
        // === NEW: Create the general data store in version 2 upgrade ===
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(GENERAL_DATA_STORE)) {
            // Use compound key: [miniappId, dataKey]
            db.createObjectStore(GENERAL_DATA_STORE, {
              keyPath: ['miniappId', 'key'],
            });
            console.log(`Created object store: ${GENERAL_DATA_STORE}`);

            // Optional: Create an index on miniappId if needed for efficient fetching of all data for one app
            // transaction.objectStore(GENERAL_DATA_STORE).createIndex('byMiniappId', 'miniappId');
          }
        }
        // Add future upgrades here, e.g., if (oldVersion < 3) { ... }
      },
      blocked() {
        console.error(
          'IndexedDB blocked. Close other tabs using the database?',
        );
        alert(
          'Database schema upgrade blocked. Please close other tabs/windows accessing this application and reload.',
        );
      },
      blocking() {
        console.warn(
          'IndexedDB blocking. Database schema needs upgrade in other tabs.',
        );
        // Optionally attempt to close the DB connection if appropriate
        // dbPromise?.close();
      },
      terminated() {
        console.error('IndexedDB connection terminated unexpectedly.');
        dbPromise = null; // Reset promise so it can be reopened
      },
    });
  }
  return dbPromise;
}

// Function to load all core data (definitions and configs)
async function loadAllMiniappCoreData(): Promise<{
  definitions: MiniappDefinition[];
  configs: Record<string, MiniappConfig>;
}> {
  try {
    const db = await getDb();
    const definitions = (await db.getAll(DEFINITIONS_STORE)) || [];
    const configKeys = (await db.getAllKeys(CONFIGS_STORE)) || [];
    const configValues = await Promise.all(
      configKeys.map((key) => db.get(CONFIGS_STORE, key)),
    );
    const configs: Record<string, MiniappConfig> = {};
    configKeys.forEach((key, index) => {
      if (typeof key === 'string') {
        configs[key] = configValues[index] || {};
      }
    });
    console.log('Persistence: Loaded definitions and configs.');
    return { definitions, configs };
  } catch (error) {
    console.error('Persistence: Failed to load core Miniapp data:', error);
    return { definitions: [], configs: {} }; // Return empty on error
  }
}

// Function to save all definitions (replace all)
export async function saveMiniappsDefinitions(
  definitions: MiniappDefinition[],
): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(DEFINITIONS_STORE, 'readwrite');
    await tx.objectStore(DEFINITIONS_STORE).clear();
    await Promise.all(
      definitions.map((def) => tx.objectStore(DEFINITIONS_STORE).put(def)),
    );
    await tx.done;
    console.log('Persistence: Saved definitions.');
  } catch (error) {
    console.error('Persistence: Failed to save definitions:', error);
    throw error; // Rethrow so caller knows it failed
  }
}

// Function to save a specific config (called by bridge)
export async function saveMiniappConfig(
  definitionId: string, // Use definitionId for consistency
  config: MiniappConfig,
): Promise<void> {
  try {
    const db = await getDb();
    await db.put(CONFIGS_STORE, config, definitionId); // Use definitionId as the key
    console.log(`Persistence: Saved config for ${definitionId}.`);
  } catch (error) {
    console.error(
      `Persistence: Failed to save config for ${definitionId}:`,
      error,
    );
    throw error; // Rethrow
  }
}

/**
 * Stores a key-value pair scoped to a specific Miniapp definition.
 * The value should be JSON-serializable.
 * @param definitionId The ID of the Miniapp definition.
 * @param key The data key (string).
 * @param value The data value (any JSON-serializable type).
 */
export async function setMiniappDataItem(
  definitionId: string,
  key: string,
  value: any,
): Promise<void> {
  if (typeof definitionId !== 'string' || !definitionId) {
    throw new Error(
      'setMiniappDataItem: definitionId must be a non-empty string.',
    );
  }
  if (typeof key !== 'string' || !key) {
    throw new Error('setMiniappDataItem: key must be a non-empty string.');
  }
  try {
    const db = await getDb();
    // The object store uses a compound key, so we store an object containing the key parts and the value.
    await db.put(GENERAL_DATA_STORE, { definitionId, key, value });
    console.log(
      `Persistence: Set data item '${key}' for Miniapp ${definitionId}`,
    );
  } catch (error) {
    console.error(
      `Persistence: Failed to set data item '${key}' for ${definitionId}:`,
      error,
    );
    throw error; // Rethrow to signal failure
  }
}

/**
 * Retrieves the value for a specific key scoped to a Miniapp definition.
 * @param definitionId The ID of the Miniapp definition.
 * @param key The data key (string).
 * @returns The stored value, or undefined if the key is not found.
 */
export async function getMiniappDataItem(
  definitionId: string,
  key: string,
): Promise<any | undefined> {
  if (typeof definitionId !== 'string' || !definitionId) {
    throw new Error(
      'getMiniappDataItem: definitionId must be a non-empty string.',
    );
  }
  if (typeof key !== 'string' || !key) {
    throw new Error('getMiniappDataItem: key must be a non-empty string.');
  }
  try {
    const db = await getDb();
    // Use the compound key to retrieve the specific item
    const result = await db.get(GENERAL_DATA_STORE, [definitionId, key]);
    console.log(
      `Persistence: Get data item '${key}' for Miniapp ${definitionId} (found: ${!!result})`,
    );
    return result?.value; // Return only the value part of the stored object
  } catch (error) {
    console.error(
      `Persistence: Failed to get data item '${key}' for ${definitionId}:`,
      error,
    );
    throw error; // Rethrow
  }
}

/**
 * Removes a specific key-value pair scoped to a Miniapp definition.
 * @param definitionId The ID of the Miniapp definition.
 * @param key The data key (string) to remove.
 */
export async function removeMiniappDataItem(
  definitionId: string,
  key: string,
): Promise<void> {
  if (typeof definitionId !== 'string' || !definitionId) {
    throw new Error(
      'removeMiniappDataItem: definitionId must be a non-empty string.',
    );
  }
  if (typeof key !== 'string' || !key) {
    throw new Error('removeMiniappDataItem: key must be a non-empty string.');
  }
  try {
    const db = await getDb();
    // Use the compound key to delete the specific item
    await db.delete(GENERAL_DATA_STORE, [definitionId, key]);
    console.log(
      `Persistence: Removed data item '${key}' for Miniapp ${definitionId}`,
    );
  } catch (error) {
    console.error(
      `Persistence: Failed to remove data item '${key}' for ${definitionId}:`,
      error,
    );
    throw error; // Rethrow
  }
}

/**
 * Retrieves all data keys stored for a specific Miniapp definition.
 * @param definitionId The ID of the Miniapp definition.
 * @returns An array of stored keys (strings).
 */
export async function getAllMiniappDataKeys(
  definitionId: string,
): Promise<string[]> {
  if (typeof definitionId !== 'string' || !definitionId) {
    throw new Error(
      'getAllMiniappDataKeys: definitionId must be a non-empty string.',
    );
  }
  try {
    const db = await getDb();
    // Use IDBKeyRange to efficiently get all keys starting with the miniappId.
    // The range includes [definitionId, lowestPossibleKey] up to [definitionId, highestPossibleKey].
    const range = IDBKeyRange.bound(
      [definitionId, ''],
      [definitionId, '\uffff'],
    );
    // Retrieve all *primary keys* (which are compound keys) within the range.
    const compoundKeys = await db.getAllKeys(GENERAL_DATA_STORE, range);
    // Extract the actual data key (the second part) from each compound key.
    const dataKeys = compoundKeys.map(
      (compoundKey) => (compoundKey as [string, string])[1],
    );
    console.log(
      `Persistence: Got ${dataKeys.length} data keys for Miniapp ${definitionId}`,
    );
    return dataKeys;
  } catch (error) {
    console.error(
      `Persistence: Failed to get data keys for ${definitionId}:`,
      error,
    );
    throw error; // Rethrow
  }
}

/**
 * Retrieves all key-value pairs stored for a specific Miniapp definition.
 * Useful for the "Export with Data" feature.
 * @param definitionId The ID of the Miniapp definition.
 * @returns A record (object) containing all stored key-value pairs for the Miniapp.
 */
export async function getAllDataForMiniapp(
  definitionId: string,
): Promise<Record<string, any>> {
  if (typeof definitionId !== 'string' || !definitionId) {
    throw new Error(
      'getAllDataForMiniapp: definitionId must be a non-empty string.',
    );
  }
  try {
    const db = await getDb();
    const range = IDBKeyRange.bound(
      [definitionId, ''],
      [definitionId, '\uffff'],
    );
    // Retrieve all *values* (which are { definitionId, key, value } objects) within the range.
    const allStoredItems = await db.getAll(GENERAL_DATA_STORE, range);
    const data: Record<string, any> = {};
    allStoredItems.forEach((item) => {
      data[item.key] = item.value;
    });
    console.log(
      `Persistence: Got ${Object.keys(data).length} data items for Miniapp ${definitionId} export.`,
    );
    return data;
  } catch (error) {
    console.error(
      `Persistence: Failed to get all data for ${definitionId}:`,
      error,
    );
    throw error; // Rethrow
  }
}

// --- Persistence Hook (useMiniappPersistence) ---

/**
 * React Hook to manage loading Miniapp definitions and configurations
 * from IndexedDB into Jotai atoms and saving definitions back.
 * Configs and general data are saved granularly via bridge calls.
 * @returns {boolean} isLoaded - True when initial core data has been loaded.
 */
export function useMiniappPersistence(): { isLoaded: boolean } {
  const [definitions, setDefinitions] = useAtom(miniappsDefinitionAtom);
  // Config atom is loaded but not saved back automatically by this hook anymore
  const [, setConfigs] = useAtom(miniappsConfigAtom);
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);
  const savingPromise = useRef<Promise<void> | null>(null); // Ref to track ongoing save

  // Load initial definitions and configs on mount
  useEffect(() => {
    let isMounted = true;
    console.log('Persistence Hook: Mounting and starting load...');
    loadAllMiniappCoreData()
      .then((data) => {
        if (isMounted) {
          console.log(
            'Persistence Hook: Data loaded from DB, setting atoms...',
          );
          // Set state based on loaded data
          setDefinitions(data.definitions);
          setConfigs(data.configs);
          setIsLoaded(true);
          initialLoadDone.current = true; // Mark load as done AFTER setting state
          console.log('Persistence Hook: Initial load complete.');
        } else {
          console.log('Persistence Hook: Unmounted before load completed.');
        }
      })
      .catch((error) => {
        console.error(
          'Persistence Hook: Error during initial data load:',
          error,
        );
        if (isMounted) {
          setIsLoaded(true); // Still mark as loaded to unblock UI
          initialLoadDone.current = true; // Also mark load done on error
        }
      });

    return () => {
      console.log('Persistence Hook: Unmounting.');
      isMounted = false;
    };
    // Run only once on mount
  }, [setDefinitions, setConfigs]);

  // Save definitions whenever they change (debounced/queued)
  useEffect(() => {
    // Only save if initial load is done.
    // The definitions check might be overly cautious if Jotai guarantees initial state is different ref
    if (initialLoadDone.current) {
      console.log('Persistence Hook: Definitions changed, scheduling save...');
      // Simple queue: ensure previous save finishes before starting next
      savingPromise.current = (savingPromise.current || Promise.resolve()).then(
        async () => {
          try {
            await saveMiniappsDefinitions(definitions);
          } catch (error) {
            console.error('Persistence Hook: Background save failed:', error);
            // Optionally notify user if background save fails repeatedly
          }
        },
      );
    }
  }, [definitions]); // Depend only on definitions

  // No saving logic for configs or general data here - that's handled by bridge calls.

  return { isLoaded };
}
