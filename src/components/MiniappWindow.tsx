// src/components/MiniappWindow.tsx
import { MiniappRunner } from '@/miniapps/components/MiniappRunner';
import {
  closeMiniappAtom,
  focusMiniappWindowAtom,
  miniappDefinitionsByIdAtom,
  toggleMinimizeMiniappAtom,
  updateMiniappWindowStateAtom,
} from '@/store/miniapp';
import { MiniappDefinition, MiniappInstance } from '@/types';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import React, { memo, useCallback } from 'react'; // Import memo and useCallback
import { LuMinus, LuPackage, LuX } from 'react-icons/lu';
import { DraggableData, ResizableDelta, Rnd } from 'react-rnd';
import { Button } from './ui/Button';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 150; // Includes title bar
const TITLE_BAR_HEIGHT = 32; // Adjust as needed

// --- Helper: Window Content Component ---
// This component renders the actual app content.
// It's memoized to prevent re-renders when only window frame properties (like zIndex or position) change.
interface WindowContentProps {
  definition: MiniappDefinition;
  instanceId: string;
}

const WindowContent: React.FC<WindowContentProps> = memo(
  ({ definition, instanceId }) => {
    console.log(`Rendering WindowContent for ${instanceId}`); // Add log for debugging renders
    return (
      <div className="h-full w-full flex-grow overflow-auto">
        <MiniappRunner
          key={instanceId} // Key remains important for potential definition changes or remount needs
          miniappDefinition={definition}
          instanceId={instanceId}
        />
      </div>
    );
  },
);
WindowContent.displayName = 'WindowContent'; // For better debugging

// --- Main Window Component ---
interface MiniappWindowProps {
  instance: MiniappInstance;
}

// Memoize MiniappWindow itself
export const MiniappWindow: React.FC<MiniappWindowProps> = memo(
  ({ instance }) => {
    const { instanceId, definitionId, windowState } = instance;

    // Use atoms
    const updateWindowState = useSetAtom(updateMiniappWindowStateAtom);
    const focusWindow = useSetAtom(focusMiniappWindowAtom);
    const closeWindow = useSetAtom(closeMiniappAtom);
    const toggleMinimize = useSetAtom(toggleMinimizeMiniappAtom);
    const definition = useAtomValue(
      // Select only the needed definition to avoid re-renders if other definitions change
      atom((get) => get(miniappDefinitionsByIdAtom)[definitionId]),
    );

    console.log(
      `Rendering MiniappWindow ${instanceId}, zIndex: ${windowState.zIndex}, minimized: ${windowState.minimized}`,
    ); // Debug log

    // Fetch definition details (already derived above)
    if (!definition) {
      console.error(
        `MiniappWindow: Definition ${definitionId} not found for instance ${instanceId}.`,
      );
      // Consider closing it automatically from here might be complex due to hook rules.
      // A useEffect in the parent component rendering the list might be better.
      return null;
    }

    // --- Memoized Callbacks ---
    const handleDragStop = useCallback(
      (_e: any, d: DraggableData) => {
        // Update global state only on drag stop
        // Check if position actually changed to potentially avoid redundant updates
        if (d.x !== windowState.x || d.y !== windowState.y) {
          console.log(`DragStop ${instanceId}: Updating global state`);
          updateWindowState({ instanceId, state: { x: d.x, y: d.y } });
        } else {
          console.log(`DragStop ${instanceId}: Position did not change`);
        }
      },
      [instanceId, updateWindowState, windowState.x, windowState.y],
    ); // Include dependencies

    const handleResizeStop = useCallback(
      (
        _e: any,
        _direction: any,
        ref: HTMLElement,
        _delta: ResizableDelta,
        position: { x: number; y: number },
      ) => {
        // Update global state only on resize stop
        console.log(`ResizeStop ${instanceId}: Updating global state`);
        updateWindowState({
          instanceId,
          state: {
            width: ref.offsetWidth,
            height: ref.offsetHeight,
            x: position.x, // react-rnd updates position on resize
            y: position.y,
          },
        });
      },
      [instanceId, updateWindowState],
    ); // Include dependencies

    // Focus should only update zIndex, triggering minimal re-renders due to memoization elsewhere
    const handleFocus = useCallback(() => {
      console.log(`Focus ${instanceId}`);
      focusWindow(instanceId);
    }, [instanceId, focusWindow]); // Include dependencies

    const handleClose = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent focus trigger on close
        console.log(`Close ${instanceId}`);
        closeWindow(instanceId);
      },
      [instanceId, closeWindow],
    ); // Include dependencies

    const handleMinimize = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        console.log(`Minimize ${instanceId}`);
        toggleMinimize(instanceId);
      },
      [instanceId, toggleMinimize],
    ); // Include dependencies

    // --- Component Logic ---
    const appName = definition?.name || 'MiniApp';
    const appIcon = definition?.icon;

    // Style for Rnd component - extracted for clarity
    const rndStyle: React.CSSProperties = {
      zIndex: windowState.zIndex,
      willChange: 'transform',
      // overflow: 'hidden' // Moved overflow handling inside
    };

    return (
      <Rnd
        size={{
          width: windowState.width,
          // Set height directly for minimized state
          height: windowState.minimized ? TITLE_BAR_HEIGHT : windowState.height,
        }}
        position={{ x: windowState.x, y: windowState.y }}
        minWidth={MIN_WIDTH}
        // Adjust minHeight based on minimized state
        minHeight={windowState.minimized ? TITLE_BAR_HEIGHT : MIN_HEIGHT}
        maxWidth="95vw"
        maxHeight="90vh"
        style={rndStyle}
        bounds="body"
        // --- Event Handlers ---
        // Focus only on mouse down capture on the whole component
        onMouseDownCapture={handleFocus}
        // Drag/Resize handlers update global state only on stop
        onDragStop={handleDragStop}
        onResizeStop={handleResizeStop}
        // --- Configuration ---
        dragHandleClassName="miniapp-drag-handle" // Class for the title bar handle
        className="bg-background flex flex-col overflow-hidden rounded-md border border-neutral-300 shadow-lg dark:border-neutral-700" // Apply overflow hidden here
        enableResizing={!windowState.minimized} // Disable resizing when minimized
        // Disable dragging when minimized? Optional, might be desired.
        // disableDragging={windowState.minimized}
      >
        {/* Title Bar */}
        <div
          className={`miniapp-drag-handle bg-muted text-muted-foreground flex h-[${TITLE_BAR_HEIGHT}px] flex-shrink-0 cursor-grab items-center justify-between border-b border-neutral-300 px-2 dark:border-neutral-700`}
        >
          <div className="flex items-center space-x-1 overflow-hidden">
            {/* Icon */}
            <span className="flex-shrink-0 text-sm">
              {appIcon ? (
                <span className="text-base">{appIcon}</span>
              ) : (
                <LuPackage className="h-4 w-4" />
              )}
            </span>
            {/* Title */}
            <span className="flex-1 truncate text-xs font-medium">
              {appName}
            </span>
          </div>

          {/* Window Controls */}
          <div className="flex flex-shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Minimize"
              onClick={handleMinimize} // Use memoized handler
              // Prevent focus when clicking button
              onMouseDown={(e) => e.stopPropagation()}
            >
              <LuMinus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-destructive/80 h-6 w-6"
              title="Close"
              onClick={handleClose} // Use memoized handler
              // Prevent focus when clicking button
              onMouseDown={(e) => e.stopPropagation()}
            >
              <LuX className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content Area - Render only if not minimized */}
        {/* Use the memoized WindowContent component */}
        {!windowState.minimized && (
          <WindowContent definition={definition} instanceId={instanceId} />
        )}
      </Rnd>
    );
    // Custom comparison function for React.memo on MiniappWindow
  },
  (prevProps, nextProps) => {
    // Only re-render if these specific props change. Deep comparison for windowState is tricky,
    // so we compare individual relevant properties.
    return (
      prevProps.instance.instanceId === nextProps.instance.instanceId &&
      prevProps.instance.definitionId === nextProps.instance.definitionId &&
      prevProps.instance.windowState.x === nextProps.instance.windowState.x &&
      prevProps.instance.windowState.y === nextProps.instance.windowState.y &&
      prevProps.instance.windowState.width ===
        nextProps.instance.windowState.width &&
      prevProps.instance.windowState.height ===
        nextProps.instance.windowState.height &&
      prevProps.instance.windowState.zIndex ===
        nextProps.instance.windowState.zIndex &&
      prevProps.instance.windowState.minimized ===
        nextProps.instance.windowState.minimized
    );
    // Add other windowState properties if they directly affect MiniappWindow rendering
  },
);

MiniappWindow.displayName = 'MiniappWindow'; // For better debugging
