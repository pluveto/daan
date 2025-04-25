// src/store/miniapp.ts
import type {
  MiniappConfig,
  MiniappDefinition,
  MiniappInstance,
  MiniappWindowState,
} from '@/types';
import { atom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { uniqueId } from 'lodash';

// --- Base Atoms ---

// Holds all defined Miniapps (loaded from persistence)
export const miniappsDefinitionAtom = atom<MiniappDefinition[]>([]);

// Holds the configurations for all Miniapps, keyed by their definition ID
export const miniappsConfigAtom = atom<Record<string, MiniappConfig>>({});

// Holds the state of all currently running MiniApp instances
export const activeMiniappInstancesAtom = atom<MiniappInstance[]>([]);

// Holds the display order of running instances in the sidebar taskbar
export const activeMiniappInstanceOrderAtom = atom<string[]>([]); // Array of instanceIds

// Controls the visibility of the Miniapp search dialog
export const isMiniappSearchOpenAtom = atom<boolean>(false);

// --- Derived Atoms ---

// Get map of definitions by ID for quick lookup
export const miniappDefinitionsByIdAtom = atom((get) => {
  const definitions = get(miniappsDefinitionAtom);
  return definitions.reduce(
    (acc, def) => {
      acc[def.id] = def;
      return acc;
    },
    {} as Record<string, MiniappDefinition>,
  );
});

// Get map of instances by instanceId for quick lookup
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

// Get currently running instances sorted by the order atom
export const orderedRunningMiniappsAtom = atom(
  (get): (MiniappInstance & { definition?: MiniappDefinition })[] => {
    const instancesById = get(miniappInstancesByIdAtom);
    const order = get(activeMiniappInstanceOrderAtom);
    const definitionsById = get(miniappDefinitionsByIdAtom);

    // Filter out instances that might be in the order but no longer exist
    const orderedInstances = order
      .map((instanceId) => instancesById[instanceId])
      .filter(Boolean); // Remove undefined/null if any instance got removed unexpectedly

    // Add definition info
    return orderedInstances.map((instance) => ({
      ...instance,
      definition: definitionsById[instance.definitionId],
    }));
  },
);

// Get only the *active* (enabled) definitions
export const activeMiniappsDefinitionAtom = atom((get) => {
  const definitions = get(miniappsDefinitionAtom);
  return definitions.filter((def) => def.enabled);
});

// Atom to get the highest current z-index
const maxZIndexAtom = atom((get) => {
  const instances = get(activeMiniappInstancesAtom);
  if (instances.length === 0) return 100; // Base z-index
  return Math.max(100, ...instances.map((inst) => inst.windowState.zIndex));
});

// --- Action Atoms ---

// Action to launch a new Miniapp instance
export const launchMiniappAtom = atom(
  null,
  (get, set, definitionId: string) => {
    const definitionsById = get(miniappDefinitionsByIdAtom);
    const definition = definitionsById[definitionId];
    const activeInstances = get(activeMiniappInstancesAtom);

    if (!definition) {
      console.error(
        `Cannot launch Miniapp: Definition ${definitionId} not found.`,
      );
      // Optionally show a toast notification to the user
      return;
    }

    // Basic check if already running (optional, maybe allow multiple instances?)
    // const isAlreadyRunning = activeInstances.some(inst => inst.definitionId === definitionId);
    // if (isAlreadyRunning) {
    //   console.log(`Miniapp ${definition.name} is already running. Focusing.`);
    //   const instanceToFocus = activeInstances.find(inst => inst.definitionId === definitionId);
    //   if (instanceToFocus) set(focusMiniappWindowAtom, instanceToFocus.instanceId);
    //   return;
    // }

    const instanceId = uniqueId('miniapp-instance-'); // Create unique ID
    const currentMaxZ = get(maxZIndexAtom);

    // Basic placement logic (cascade or center)
    const initialWidth = 400;
    const initialHeight = 300;
    const cascadeOffset = activeInstances.length * 20; // Simple cascade
    const initialX = Math.max(
      0,
      window.innerWidth / 2 - initialWidth / 2 + cascadeOffset - 150,
    ); // Adjust centering for sidebar
    const initialY = Math.max(
      0,
      window.innerHeight / 2 - initialHeight / 2 + cascadeOffset - 100,
    ); // Adjust centering

    const initialWindowState: MiniappWindowState = {
      x: initialX,
      y: initialY,
      width: initialWidth,
      height: initialHeight,
      zIndex: currentMaxZ + 1, // Ensure it's on top
      minimized: false,
    };

    const newInstance: MiniappInstance = {
      instanceId,
      definitionId,
      windowState: initialWindowState,
    };

    set(activeMiniappInstancesAtom, (prev) => [...prev, newInstance]);
    set(activeMiniappInstanceOrderAtom, (prev) => [...prev, instanceId]); // Add to end of taskbar

    console.log(
      `Launched Miniapp: ${definition.name} (Instance ID: ${instanceId})`,
    );
  },
);

// Action to close a Miniapp instance
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
  // Potential cleanup: Call unregisterSendMessage if the bridge is managed via atoms too
});

// Action to update a Miniapp instance's window state
export const updateMiniappWindowStateAtom = atom(
  null,
  (
    get,
    set,
    update: { instanceId: string; state: Partial<MiniappWindowState> },
  ) => {
    set(activeMiniappInstancesAtom, (prev) =>
      prev.map((inst) =>
        inst.instanceId === update.instanceId
          ? {
              ...inst,
              windowState: { ...inst.windowState, ...update.state },
            }
          : inst,
      ),
    );
  },
);

// Action to bring a Miniapp window to the front (focus)
export const focusMiniappWindowAtom = atom(
  null,
  (get, set, instanceId: string) => {
    const currentMaxZ = get(maxZIndexAtom);
    const targetInstance = get(miniappInstancesByIdAtom)[instanceId];

    if (!targetInstance || targetInstance.windowState.zIndex === currentMaxZ) {
      // Already focused or doesn't exist
      return;
    }

    const newZIndex = currentMaxZ + 1;

    set(activeMiniappInstancesAtom, (prev) =>
      prev.map((inst) => {
        if (inst.instanceId === instanceId) {
          // Bring the target window to the front
          return {
            ...inst,
            windowState: { ...inst.windowState, zIndex: newZIndex },
          };
        }
        // Optional: Slightly lower z-index of others? Might not be necessary.
        // return {
        //   ...inst,
        //   windowState: { ...inst.windowState, zIndex: Math.max(100, inst.windowState.zIndex -1) } // Or just leave them
        // };
        return inst;
      }),
    );
  },
);

// Action to toggle the minimized state of a Miniapp window
export const toggleMinimizeMiniappAtom = atom(
  null,
  (get, set, instanceId: string) => {
    const targetInstance = get(miniappInstancesByIdAtom)[instanceId];
    if (!targetInstance) return;

    const isMinimized = targetInstance.windowState.minimized;

    set(updateMiniappWindowStateAtom, {
      instanceId,
      state: { minimized: !isMinimized },
    });

    // If un-minimizing, also bring to front
    if (isMinimized) {
      set(focusMiniappWindowAtom, instanceId);
    }
  },
);

// Action to update the order of MiniApps in the sidebar
export const setMiniappOrderAtom = atom(
  null,
  (get, set, newInstanceOrder: string[]) => {
    set(activeMiniappInstanceOrderAtom, newInstanceOrder);
  },
);
