// src/components/MiniappWindow.tsx
import { MiniappRunner } from '@/miniapps/components/MiniappRunner';
import {
  activeMiniappInstancesAtom,
  closeMiniappAtom, // Keep for closing action
  miniappDefinitionsByIdAtom,
  registerWinBoxInstance,
  unregisterWinBoxInstance, // Keep for getting definition
} from '@/store/miniapp';
import { MiniappDefinition, MiniappInstance } from '@/types';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import React, { memo, useCallback, useEffect, useRef } from 'react'; // Removed useState, useEffect
import WinBox, { WinBoxPropType } from 'react-winbox'; // Import WinBox

import '@/winbox.css';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;

// --- Helper: Window Content Component (Memoized - unchanged) ---
interface WindowContentProps {
  definition: MiniappDefinition;
  instanceId: string;
}
const WindowContent: React.FC<WindowContentProps> = memo(
  ({ definition, instanceId }) => {
    console.log(`Rendering WindowContent for ${instanceId}`);
    // Ensure content fills the WinBox body. Add padding if needed inside MiniappRunner.
    return (
      <div className="h-full w-full overflow-auto">
        {/* Let WinBox handle outer flex/border */}
        <MiniappRunner
          key={instanceId} // Still useful if runner needs remounting on definition change
          miniappDefinition={definition}
          instanceId={instanceId}
        />
      </div>
    );
  },
);
WindowContent.displayName = 'WindowContent';

const updateGlobalMinimizedStateAtom = atom(
  null,
  (get, set, payload: { instanceId: string; minimized: boolean }) => {
    // Find the internal setter atom logic if needed, or directly update activeMiniappInstancesAtom
    set(activeMiniappInstancesAtom, (prev) =>
      prev.map((inst) =>
        inst.instanceId === payload.instanceId
          ? { ...inst, minimized: payload.minimized }
          : inst,
      ),
    );
  },
);

// --- Main Window Component (Memoized) ---
interface MiniappWindowProps {
  instance: MiniappInstance; // Instance no longer contains windowState
}

export const MiniappWindow: React.FC<MiniappWindowProps> = memo(
  ({ instance }) => {
    const { instanceId, definitionId, minimized } = instance; // Destructure updated instance
    const winboxRef = useRef<WinBox | null>(null); // Ref to hold the WinBox instance

    useEffect(() => {
      // Register the WinBox instance with the global registry
      const winboxInstance = winboxRef.current;
      if (winboxInstance) {
        registerWinBoxInstance(instanceId, winboxInstance);
      }
      return () => {
        // Unregister the WinBox instance on unmount
        unregisterWinBoxInstance(instanceId);
      };
    }, [instanceId]);

    // --- Global State Atoms ---
    const closeWindow = useSetAtom(closeMiniappAtom);
    const definition = useAtomValue(miniappDefinitionsByIdAtom)[definitionId];
    const setGlobalMinimized = useSetAtom(updateGlobalMinimizedStateAtom); // Use the setter

    // --- Remove Local State for Interaction ---
    // const [isDragging, setIsDragging] = useState(false); // REMOVED
    // const [interactionState, setInteractionState] = useState({...}); // REMOVED
    // const sync useEffect = REMOVED

    // --- Definition Check ---
    if (!definition) {
      console.error(
        `MiniappWindow: Definition ${definitionId} not found for instance ${instanceId}.`,
      );
      // Important: Return null here. If definition isn't ready, don't render WinBox.
      return null;
    }

    // const handleCreate = useCallback((params: WindowContentProps) => {
    //     winboxRef.current = winboxInstance;
    //     registerWinBoxInstance(instanceId, winboxInstance);

    //     // Ensure initial minimized state matches global state when created
    //     if (minimized && !winboxInstance.minimized) {
    //         console.log(`Initial sync: Minimizing WinBox ${instanceId} based on global state.`);
    //         winboxInstance.minimize(true); // true = silent / no animation
    //     } else if (!minimized && winboxInstance.minimized) {
    //         console.log(`Initial sync: Restoring WinBox ${instanceId} based on global state.`);
    //         winboxInstance.restore(true);
    //     }
    // }, [instanceId, minimized]); // Include minimized in dep array for initial sync

    // Cleanup ref on unmount
    // useEffect(() => {
    //     return () => {
    //         unregisterWinBoxInstance(instanceId);
    //         winboxRef.current = null; // Clear the ref
    //     };
    // }, [instanceId]);

    // Called when user clicks the close button in WinBox
    const handleWinBoxClose = useCallback(() => {
      console.log(`WinBox Close requested for ${instanceId}`);
      closeWindow(instanceId); // Trigger global state update to remove this instance
      return false; // Tell WinBox to allow the close operation
    }, [instanceId, closeWindow]);

    // Called when the window gains focus (WinBox handles z-index)
    const handleWinBoxFocus = useCallback(() => {
      console.log(`WinBox Focus ${instanceId}`);
      // No need to update global zIndex state anymore.
      // If needed, update taskbar highlight or other UI elements here.
    }, [instanceId]);

    const handleWinBoxMinimize = useCallback(() => {
      console.log(`WinBox Minimize ${instanceId} (via control)`);
      setGlobalMinimized({ instanceId, minimized: true }); // Update global state
    }, [instanceId, setGlobalMinimized]);

    // Sync global state WHEN user restores using WinBox controls
    const handleWinBoxRestore = useCallback(() => {
      console.log(`WinBox Restore ${instanceId} (via control)`);
      setGlobalMinimized({ instanceId, minimized: false }); // Update global state
    }, [instanceId, setGlobalMinimized]);

    // Called when window stops moving (x, y available in WinBox instance)
    const handleWinBoxMove = useCallback(
      (x: number, y: number) => {
        // winbox instance is passed
        console.log(`WinBox Move end ${instanceId}`);
        // Persist position *if desired*, but not to the main global state atom
        // Could save to localStorage associated with instanceId, for example.
      },
      [instanceId],
    );

    // Called when window stops resizing (width, height available in WinBox instance)
    const handleWinBoxResize = useCallback(
      (width: number, height: number) => {
        // winbox instance is passed
        console.log(`WinBox Resize end ${instanceId}`);
        // Persist size *if desired*, similar to position.
      },
      [instanceId],
    );

    // --- Component Logic & WinBox Options ---
    const appName = definition?.name || 'MiniApp';
    // WinBox icon handling is simpler (URL or class). Let's omit the React icon for now.
    // const appIcon = definition?.icon;

    // Define options for the WinBox instance
    const winBoxOptions: WinBoxPropType = {
      id: instanceId, // Use instanceId for the DOM element ID
      title: definition?.icon + ' ' + appName,
      // icon: appIcon, // If appIcon is a URL or CSS class name supported by WinBox theme
      // Initial position/size (WinBox has good defaults like 'center')
      x: 'center',
      y: 'center',
      width: definition?.defaultWindowSize?.width || MIN_WIDTH,
      height: definition?.defaultWindowSize?.height || MIN_HEIGHT,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      // Restrict dragging/resizing within the body
      // bounds: [0, 0, window.innerWidth, window.innerHeight], // Example using array
      // Or use 'parent' if wrapped in a specific container, but body is common
      // Using WinBox defaults for bounds is usually sufficient unless specific constraints are needed.

      // --- Event Handlers ---
      // onCreate: handleCreate,
      onClose: handleWinBoxClose, // Hook up the close handler
      onFocus: handleWinBoxFocus,
      onMinimize: handleWinBoxMinimize,
      onRestore: handleWinBoxRestore,
      onMove: handleWinBoxMove, // Called at end of move
      onResize: handleWinBoxResize, // Called at end of resize
      noFull: true,
      // Custom styling (optional)
      className: ['miniapp-winbox', 'no-overflow'].join(' '), // Add custom classes if needed. 'no-overflow' prevents WinBox scrollbars if content handles it.
      // background: '#fff', // Set background if needed, often handled by content CSS
    };

    console.log(`Rendering WinBox for instance ${instanceId}`);

    return (
      <WinBox ref={winboxRef} {...winBoxOptions}>
        {/* Render the actual application content inside WinBox */}
        <WindowContent definition={definition} instanceId={instanceId} />
      </WinBox>
    );

    // Custom comparison function for React.memo - simplified
  },
  (prevProps, nextProps) => {
    // Re-render if instanceId, definitionId, or minimized state changes from global store
    return (
      prevProps.instance.instanceId === nextProps.instance.instanceId &&
      prevProps.instance.definitionId === nextProps.instance.definitionId &&
      prevProps.instance.minimized === nextProps.instance.minimized
    ); // Add check
  },
);

MiniappWindow.displayName = 'MiniappWindow';
