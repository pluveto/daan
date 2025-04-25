// src/miniapps/persistence.ts
import { IDBPDatabase, openDB } from 'idb';
import { useAtom } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import { miniappsConfigAtom, miniappsDefinitionAtom } from '../store/miniapp';
import type { MiniappConfig, MiniappDefinition } from '../types';

const DB_NAME = 'SheafyMiniappStore';
const DEFINITIONS_STORE = 'definitions';
const CONFIGS_STORE = 'configs'; // Store configs as { id: string, config: MiniappConfig }
const GENERAL_DATA_STORE = 'miniapp_general_data'; // New store name
const VERSION = 2; // Increment DB version because we are adding a store

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        console.log(`Upgrading DB from ${oldVersion} to ${newVersion}`);
        // Existing stores (check needed if upgrading from version < 1)
        if (!db.objectStoreNames.contains(DEFINITIONS_STORE)) {
          db.createObjectStore(DEFINITIONS_STORE, { keyPath: 'id' });
          console.log(`Created object store: ${DEFINITIONS_STORE}`);
        }
        if (!db.objectStoreNames.contains(CONFIGS_STORE)) {
          db.createObjectStore(CONFIGS_STORE); // Keyed by miniappId (string)
          console.log(`Created object store: ${CONFIGS_STORE}`);
        }
        if (!db.objectStoreNames.contains(GENERAL_DATA_STORE)) {
          // Use compound key: [miniappId, dataKey]
          db.createObjectStore(GENERAL_DATA_STORE, {
            keyPath: ['miniappId', 'key'],
          });
        }
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
    const definitions = await db.getAll(DEFINITIONS_STORE);
    // Load configs - keys are miniapp IDs (strings)
    const configKeys = await db.getAllKeys(CONFIGS_STORE);
    const configValues = await Promise.all(
      configKeys.map((key) => db.get(CONFIGS_STORE, key)),
    );
    const configs: Record<string, MiniappConfig> = {};
    configKeys.forEach((key, index) => {
      if (typeof key === 'string') {
        // Should always be string here
        configs[key] = configValues[index] || {};
      }
    });
    console.log('Persistence: Loaded definitions and configs.');
    return { definitions: definitions || [], configs };
  } catch (error) {
    console.error('Persistence: Failed to load core Miniapp data:', error);
    return { definitions: [], configs: {} }; // Return empty on error
  }
}

// Function to save all definitions (replace all)
export async function saveMiniappsDefinitions(
  definitions: MiniappDefinition[],
) {
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
  }
}

// Function to save a specific config (called by bridge)
export async function saveMiniappConfig(id: string, config: MiniappConfig) {
  try {
    const db = await getDb();
    await db.put(CONFIGS_STORE, config, id); // Use id as the key
    console.log(`Persistence: Saved config for ${id}.`);
  } catch (error) {
    console.error(`Persistence: Failed to save config for ${id}:`, error);
    // Optionally re-throw or handle differently
  }
}

// Set an item for a specific miniapp
export async function setMiniappDataItem(
  miniappId: string,
  key: string,
  value: any,
): Promise<void> {
  try {
    const db = await getDb();
    // Store the value along with the compound key components
    await db.put(GENERAL_DATA_STORE, { miniappId, key, value });
    console.log(`Miniapp Data: Set item '${key}' for ${miniappId}`);
  } catch (error) {
    console.error(
      `Miniapp Data: Failed to set item '${key}' for ${miniappId}:`,
      error,
    );
    throw error; // Rethrow to signal failure
  }
}

// Get an item for a specific miniapp
export async function getMiniappDataItem(
  miniappId: string,
  key: string,
): Promise<any | undefined> {
  try {
    const db = await getDb();
    const result = await db.get(GENERAL_DATA_STORE, [miniappId, key]); // Use compound key
    console.log(
      `Miniapp Data: Get item '${key}' for ${miniappId}:`,
      result?.value,
    );
    return result?.value; // Return only the value part
  } catch (error) {
    console.error(
      `Miniapp Data: Failed to get item '${key}' for ${miniappId}:`,
      error,
    );
    throw error; // Rethrow
  }
}

// Remove an item for a specific miniapp
export async function removeMiniappDataItem(
  miniappId: string,
  key: string,
): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(GENERAL_DATA_STORE, [miniappId, key]); // Use compound key
    console.log(`Miniapp Data: Removed item '${key}' for ${miniappId}`);
  } catch (error) {
    console.error(
      `Miniapp Data: Failed to remove item '${key}' for ${miniappId}:`,
      error,
    );
    throw error; // Rethrow
  }
}

// Get all keys for a specific miniapp
export async function getAllMiniappDataKeys(
  miniappId: string,
): Promise<string[]> {
  try {
    const db = await getDb();
    // Use IDBKeyRange to get all keys starting with the miniappId
    const range = IDBKeyRange.bound([miniappId, ''], [miniappId, '\uffff']);
    const keys = await db.getAllKeys(GENERAL_DATA_STORE, range);
    // Extract the actual data key from the compound key
    const dataKeys = keys.map((compoundKey) => (compoundKey as any[])[1]);
    console.log(`Miniapp Data: Got keys for ${miniappId}:`, dataKeys);
    return dataKeys;
  } catch (error) {
    console.error(`Miniapp Data: Failed to get keys for ${miniappId}:`, error);
    throw error; // Rethrow
  }
}

// Function to load all data
export async function loadAllMiniappData(): Promise<{
  definitions: MiniappDefinition[];
  configs: Record<string, MiniappConfig>;
}> {
  try {
    const db = await getDb();
    const definitions = await db.getAll(DEFINITIONS_STORE);
    const configKeys = await db.getAllKeys(CONFIGS_STORE);
    const configValues = await Promise.all(
      configKeys.map((key) => db.get(CONFIGS_STORE, key)),
    );

    const configs: Record<string, MiniappConfig> = {};
    configKeys.forEach((key, index) => {
      if (typeof key === 'string') {
        // Ensure key is string
        configs[key] = configValues[index] || {};
      }
    });

    console.log('Loaded definitions:', definitions);
    console.log('Loaded configs:', configs);
    return { definitions: definitions || [], configs };
  } catch (error) {
    console.error('Failed to load Miniapp data from IndexedDB:', error);
    return { definitions: [], configs: {} };
  }
}

/**
 * React Hook to manage loading Miniapp definitions and configurations
 * from IndexedDB into Jotai atoms and saving definitions back.
 * Configs are saved granularly via `saveMiniappConfig`.
 * @returns {boolean} isLoaded - True when initial data has been loaded.
 */
export function useMiniappPersistence(): { isLoaded: boolean } {
  const [definitions, setDefinitions] = useAtom(miniappsDefinitionAtom);
  // Config atom is loaded but not saved back automatically by this hook anymore
  const [, setConfigs] = useAtom(miniappsConfigAtom);
  const [isLoaded, setIsLoaded] = useState(false); // Use state for UI feedback
  const initialLoadDone = useRef(false); // Ref to prevent saving on initial mount before load completes

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
          setDefinitions(data.definitions);
          setConfigs(data.configs);
          setIsLoaded(true);
          initialLoadDone.current = true; // Mark load as done
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
        // Still set loaded to true even on error to unblock UI, maybe show error state elsewhere
        if (isMounted) setIsLoaded(true);
      });

    return () => {
      console.log('Persistence Hook: Unmounting.');
      isMounted = false;
    };
    // Ensure setters are stable, run only once on mount
  }, [setDefinitions, setConfigs]);

  // Save definitions whenever they change (after initial load)
  useEffect(() => {
    // Only save if initial load is done AND definitions array isn't the initial empty one implicitly set by Jotai
    if (initialLoadDone.current && definitions.length > 0) {
      console.log('Persistence Hook: Definitions changed, saving...');
      saveMiniappsDefinitions(definitions);
    } else if (initialLoadDone.current && definitions.length === 0) {
      // Handle case where user deletes the last definition
      console.log('Persistence Hook: Definitions empty, saving empty array...');
      saveMiniappsDefinitions([]);
    }
  }, [definitions]);

  // NOTE: No longer saving the entire 'configs' map here.
  // Saving is handled by calls to 'saveMiniappConfig' via the Host Bridge API ('setOwnConfig').

  return { isLoaded }; // Return loading state for UI usage
}
