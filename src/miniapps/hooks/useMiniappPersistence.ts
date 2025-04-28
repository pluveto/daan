// src/miniapps/persistence.ts

import {
  miniappDataServiceAtom,
  miniappsConfigAtom,
  miniappsDefinitionAtom,
} from '@/store';
import { MiniappConfig } from '@/types';
import { useAtom, useAtomValue } from 'jotai';
import { useEffect, useRef, useState } from 'react';

// --- Persistence Hook (Refactored) ---

/**
 * React Hook to manage loading Miniapp definitions and configurations
 * from IndexedDB into Jotai atoms using the MiniappDataService.
 * Definitions are saved back when the atom changes.
 * Configs and general data are managed via direct service calls (likely triggered elsewhere).
 * @returns {boolean} isLoaded - True when initial core data has been loaded.
 */
export function useMiniappPersistence(): { isLoaded: boolean } {
  const [definitions, setDefinitions] = useAtom(miniappsDefinitionAtom);
  const [, setConfigsAtom] = useAtom(miniappsConfigAtom); // Use descriptive name
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);
  const isSaving = useRef(false);
  const miniappDataService = useAtomValue(miniappDataServiceAtom);

  // Load initial definitions and configs on mount using the service
  useEffect(() => {
    let isMounted = true;
    console.log('Miniapp Persistence Hook: Mounting and starting load...');

    const loadData = async () => {
      try {
        // Initialize DB (optional here, service methods might handle lazy opening)
        // await miniappDataService.initialize();

        // Fetch definitions and configs concurrently
        const [loadedDefinitions, loadedConfigEntities] = await Promise.all([
          miniappDataService.getAllDefinitions(),
          miniappDataService.getAllConfigs(),
        ]);

        if (isMounted) {
          console.log(
            'Miniapp Persistence Hook: Data loaded from DB, setting atoms...',
          );

          // Reconstruct the configs record (key: definitionId, value: config)
          const configsRecord: Record<string, MiniappConfig> = {};
          loadedConfigEntities.forEach((entity) => {
            configsRecord[entity.definitionId] = entity.config;
          });

          setDefinitions(loadedDefinitions);
          setConfigsAtom(configsRecord); // Update the configs atom

          setIsLoaded(true);
          initialLoadDone.current = true;
          console.log('Miniapp Persistence Hook: Initial load complete.');
        } else {
          console.log(
            'Miniapp Persistence Hook: Unmounted before load completed.',
          );
        }
      } catch (error) {
        console.error(
          'Miniapp Persistence Hook: Error during initial data load:',
          error,
        );
        if (isMounted) {
          setIsLoaded(true); // Mark as loaded even on error to unblock UI
          initialLoadDone.current = true;
        }
      }
    };

    loadData();

    return () => {
      console.log('Miniapp Persistence Hook: Unmounting.');
      isMounted = false;
    };
    // Run only once on mount
  }, [setDefinitions, setConfigsAtom]); // Dependencies are stable Jotai setters

  // Save definitions whenever they change (using the service)
  useEffect(() => {
    // Only save after initial load and if not already saving
    if (initialLoadDone.current && !isSaving.current) {
      console.log(
        'Miniapp Persistence Hook: Definitions changed, attempting bulk replace...',
      );
      isSaving.current = true;
      miniappDataService
        .bulkReplaceDefinitions(definitions) // Use the appropriate service method
        .catch((error) => {
          console.error(
            'Miniapp Persistence Hook: Background save failed:',
            error,
          );
          // Notify user?
        })
        .finally(() => {
          isSaving.current = false;
          console.log('Miniapp Persistence Hook: Save attempt finished.');
        });
    }
  }, [definitions]); // Depend only on definitions atom value

  return { isLoaded };
}
