// src/store/miniapp.ts
import type {
  MiniappConfig,
  MiniappDefinitionEntity,
  MiniappInstance,
} from '@/types';
import { atom } from 'jotai';
// import { selectAtom } from 'jotai/utils'; // Keep if used elsewhere
import type { MiniappTransport } from '@/lib/MiniappTransport';
import { IndexedDBMiniappService } from '@/services/IndexedDBMiniappService';
import { uniqueId } from 'lodash';
import WinBox from 'react-winbox';

// --- Base Atoms ---

// Atom to hold the mapping from instanceId to active MiniappTransport
export const activeMiniappTransportsAtom = atom<Map<string, MiniappTransport>>(
  new Map(),
);
export const miniappsDefinitionAtom = atom<MiniappDefinitionEntity[]>([]);
export const miniappsConfigAtom = atom<Record<string, MiniappConfig>>({});
// Holds the active instances (now just their IDs)
export const activeMiniappInstancesAtom = atom<MiniappInstance[]>([]); // Type updated
export const activeMiniappInstanceOrderAtom = atom<string[]>([]);
export const isMiniappSearchOpenAtom = atom<boolean>(false);
export const isMiniappMarketplaceOpenAtom = atom<boolean>(false);

// --- WinBox Instance Registry (Not part of Jotai state) ---
// This map holds references to the active WinBox instances, managed outside React state.
const winBoxInstanceRegistry = new Map<string, WinBox>();

export const registerWinBoxInstance = (id: string, instance: WinBox) => {
  console.log(`Registering WinBox instance: ${id}`);
  winBoxInstanceRegistry.set(id, instance);
};

export const unregisterWinBoxInstance = (id: string) => {
  console.log(`Unregistering WinBox instance: ${id}`);
  winBoxInstanceRegistry.delete(id);
};

// --- Derived Atoms ---
export const miniappDefinitionsByIdAtom = atom((get) => {
  const definitions = get(miniappsDefinitionAtom);
  return definitions.reduce(
    (acc, def) => {
      acc[def.id] = def;
      return acc;
    },
    {} as Record<string, MiniappDefinitionEntity>,
  );
});

// Get map of instances by instanceId for quick lookup (type updated)
export const miniappInstancesByIdAtom = atom((get) => {
  const instances = get(activeMiniappInstancesAtom);
  return instances.reduce(
    (acc, instance) => {
      acc[instance.instanceId] = instance;
      return acc;
    },
    {} as Record<string, MiniappInstance>,
  );
});

// Get currently running instances sorted by the order atom (type updated)
export const orderedRunningMiniappsAtom = atom(
  (get): (MiniappInstance & { definition?: MiniappDefinitionEntity })[] => {
    const instancesById = get(miniappInstancesByIdAtom);
    const order = get(activeMiniappInstanceOrderAtom);
    const definitionsById = get(miniappDefinitionsByIdAtom);

    const orderedInstances = order
      .map((instanceId) => instancesById[instanceId])
      .filter(Boolean);

    return orderedInstances.map((instance) => ({
      ...instance,
      definition: definitionsById[instance.definitionId],
    }));
  },
);

export const activeMiniappsDefinitionAtom = atom((get) => {
  const definitions = get(miniappsDefinitionAtom);
  return definitions.filter((def) => def.enabled);
});

// --- Action Atoms ---
const setInstanceMinimizedStateAtom = atom(
  null,
  (
    get,
    set,
    { instanceId, minimized }: { instanceId: string; minimized: boolean },
  ) => {
    set(activeMiniappInstancesAtom, (prev) =>
      prev.map((inst) =>
        inst.instanceId === instanceId
          ? { ...inst, minimized } // Update only minimized flag
          : inst,
      ),
    );
  },
);
// Action to launch a new Miniapp instance
export const launchMiniappAtom = atom(
  null,
  (get, set, definitionId: string) => {
    const definitionsById = get(miniappDefinitionsByIdAtom);
    const definition = definitionsById[definitionId];
    // const activeInstances = get(activeMiniappInstancesAtom); // Needed only for count/check

    if (!definition) {
      console.error(
        `Cannot launch Miniapp: Definition ${definitionId} not found.`,
      );
      return;
    }

    const instanceId = uniqueId('miniapp-instance-');

    // The new instance only needs IDs
    const newInstance: MiniappInstance = {
      instanceId,
      definitionId,
      minimized: false,
    };

    set(activeMiniappInstancesAtom, (prev) => [...prev, newInstance]);
    set(activeMiniappInstanceOrderAtom, (prev) => [...prev, instanceId]); // Add to taskbar order

    console.log(
      `Launched Miniapp: ${definition.name} (Instance ID: ${instanceId})`,
    );
    // The actual <WinBox> component will render based on this instance appearing
    // in the activeMiniappInstancesAtom list.
  },
);

// Action to close a Miniapp instance (logic remains the same)
export const closeMiniappAtom = atom(null, (get, set, instanceId: string) => {
  const instance = get(miniappInstancesByIdAtom)[instanceId];
  if (!instance) return;

  set(activeMiniappInstancesAtom, (prev) =>
    prev.filter((inst) => inst.instanceId !== instanceId),
  );
  set(activeMiniappInstanceOrderAtom, (prev) =>
    prev.filter((id) => id !== instanceId),
  );
  console.log(`Closed Miniapp Instance: ${instanceId}`);
  // When the instance is removed from the atom list, the corresponding
  // <MiniappWindow> component will unmount, and <WinBox> should clean itself up.
});

// Action to update the order of MiniApps in the sidebar (logic remains the same)
export const setMiniappOrderAtom = atom(
  null,
  (get, set, newInstanceOrder: string[]) => {
    set(activeMiniappInstanceOrderAtom, newInstanceOrder);
  },
);
//  Action to bring a Miniapp window to the front (focus)
export const focusMiniappWindowAtom = atom(
  null,
  (get, set, instanceId: string) => {
    console.log(`Requesting focus for WinBox instance: ${instanceId}`);
    const winBoxInstance = winBoxInstanceRegistry.get(instanceId);
    if (winBoxInstance) {
      console.log(`Found WinBox instance, calling focus() for ${instanceId}`);
      winBoxInstance.focus(); // Also ensure the global state reflects it's not minimized (if it was)
      const instance = get(miniappInstancesByIdAtom)[instanceId];
      if (instance?.minimized) {
        // If focus implies un-minimizing, update global state and tell WinBox
        // However, WinBox focus() might implicitly restore, let's test first.
        // If focus() doesn't restore, we might need winBoxInstance.restore() here too.
        // Let's assume focus() is enough for now or WinBox handles restore on focus.
        // Update: Winbox focus() brings to front but doesn't restore. Need explicit restore.
        if (winBoxInstance.winBoxObj.min) {
          winBoxInstance.restore(); // Explicitly restore if minimized
        }
        // Update global state AFTER commanding winbox if needed
        set(setInstanceMinimizedStateAtom, { instanceId, minimized: false });
      }
    } else {
      console.warn(
        `focusMiniappWindowAtom: WinBox instance ${instanceId} not found in registry.`,
      );
    }
  },
);

//  Action to toggle the minimized state of a Miniapp window
export const toggleMinimizeMiniappAtom = atom(
  null,
  (get, set, instanceId: string) => {
    const targetInstance = get(miniappInstancesByIdAtom)[instanceId];
    if (!targetInstance) return;

    const winBoxInstance = winBoxInstanceRegistry.get(instanceId);
    if (!winBoxInstance) {
      console.warn(
        `toggleMinimizeMiniappAtom: WinBox instance ${instanceId} not found in registry.`,
      );
      return;
    }

    const shouldMinimize = !targetInstance.minimized; // Calculate the target state
    // 1. Command the WinBox instance

    console.log(
      `Requesting ${shouldMinimize ? 'minimize' : 'restore'} for WinBox instance: ${instanceId}`,
    );
    if (shouldMinimize) {
      winBoxInstance.minimize();
    } else {
      winBoxInstance.restore();
      winBoxInstance.focus(); // Also focus when restoring from taskbar toggle
    } // 2. Update the global state AFTER commanding WinBox (or rely on callbacks?)
    // It's safer to update global state based on WinBox callbacks (onminimize, onrestore)
    // to ensure sync. Let's rely on the callbacks in MiniappWindow.tsx.
    // So, this atom *only* commands the WinBox instance.
    // set(setInstanceMinimizedStateAtom, { instanceId, minimized: shouldMinimize }); // REMOVED - Rely on callbacks
  },
);

export const miniappDataServiceAtom = atom(new IndexedDBMiniappService());
