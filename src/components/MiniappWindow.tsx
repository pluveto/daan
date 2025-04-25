// src/components/MiniappWindow.tsx
import { MiniappRunner } from '@/miniapps/components/MiniappRunner';
import {
  closeMiniappAtom,
  focusMiniappWindowAtom,
  miniappDefinitionsByIdAtom, // To get definition
  toggleMinimizeMiniappAtom,
  updateMiniappWindowStateAtom,
} from '@/store/miniapp';
import { MiniappInstance } from '@/types';
import { useAtomValue, useSetAtom } from 'jotai';
import React from 'react';
import { LuMinus, LuPackage, LuX } from 'react-icons/lu';
import { DraggableData, ResizableDelta, Rnd } from 'react-rnd'; // pnpm add react-rnd

import { Button } from './ui/Button';

interface MiniappWindowProps {
  instance: MiniappInstance;
}

const MIN_WIDTH = 200;
const MIN_HEIGHT = 150; // Includes title bar
const TITLE_BAR_HEIGHT = 32; // Adjust as needed

export const MiniappWindow: React.FC<MiniappWindowProps> = ({ instance }) => {
  const { instanceId, definitionId, windowState } = instance;
  const updateWindowState = useSetAtom(updateMiniappWindowStateAtom);
  const focusWindow = useSetAtom(focusMiniappWindowAtom);
  const closeWindow = useSetAtom(closeMiniappAtom);
  const toggleMinimize = useSetAtom(toggleMinimizeMiniappAtom);
  const definitionsById = useAtomValue(miniappDefinitionsByIdAtom);

  const definition = definitionsById[definitionId]; // Get definition details

  if (!definition) {
    console.error(
      `MiniappWindow: Definition ${definitionId} not found for instance ${instanceId}. Closing.`,
    );
    // Optionally close the window automatically if definition disappears
    // React.useEffect(() => { closeWindow(instanceId); }, [closeWindow, instanceId]);
    return null; // Don't render if definition is missing
  }

  const handleDragStop = (_e: any, d: DraggableData) => {
    // Only update if position actually changed
    if (d.x !== windowState.x || d.y !== windowState.y) {
      updateWindowState({ instanceId, state: { x: d.x, y: d.y } });
    }
  };

  const handleResizeStop = (
    _e: any,
    _direction: any,
    ref: HTMLElement,
    _delta: ResizableDelta,
    position: { x: number; y: number },
  ) => {
    updateWindowState({
      instanceId,
      state: {
        width: ref.offsetWidth,
        height: ref.offsetHeight,
        x: position.x, // react-rnd updates position on resize
        y: position.y,
      },
    });
  };

  const handleFocus = () => {
    focusWindow(instanceId);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent focus trigger on close
    closeWindow(instanceId);
  };

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleMinimize(instanceId);
  };

  const appName = definition?.name || 'MiniApp';
  const appIcon = definition?.icon;

  return (
    <Rnd
      size={{
        width: windowState.width,
        height: windowState.minimized ? TITLE_BAR_HEIGHT : windowState.height,
      }}
      position={{ x: windowState.x, y: windowState.y }}
      minWidth={MIN_WIDTH}
      minHeight={windowState.minimized ? TITLE_BAR_HEIGHT : MIN_HEIGHT}
      maxWidth="95vw" // Prevent going too wide
      maxHeight="90vh"
      style={{ zIndex: windowState.zIndex, overflow: 'hidden' }} // Keep overflow hidden on the Rnd container
      bounds="body" // Constrain dragging to the body
      onDragStart={handleFocus}
      onDragStop={handleDragStop}
      onResizeStart={handleFocus}
      onResizeStop={handleResizeStop}
      dragHandleClassName="miniapp-drag-handle" // Class for the title bar
      className="bg-background flex flex-col overflow-hidden rounded-md border border-neutral-300 shadow-lg dark:border-neutral-700"
      onMouseDownCapture={handleFocus} // Capture mouse down to focus
      enableResizing={!windowState.minimized} // Disable resizing when minimized
    >
      {/* Title Bar */}
      <div
        className={`miniapp-drag-handle bg-muted text-muted-foreground flex h-[${TITLE_BAR_HEIGHT}px] cursor-grab items-center justify-between border-b border-neutral-300 px-2 dark:border-neutral-700`}
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
          <span className="flex-1 truncate text-xs font-medium">{appName}</span>
        </div>

        {/* Window Controls */}
        <div className="flex flex-shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Minimize"
            onClick={handleMinimize}
          >
            <LuMinus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-destructive/80 h-6 w-6"
            title="Close"
            onClick={handleClose}
          >
            <LuX className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content Area - Conditional Rendering */}
      {!windowState.minimized && (
        <div className="flex-grow overflow-auto">
          {' '}
          {/* Allow content to scroll */}
          <MiniappRunner
            // Key prop forces remount if instance ID changes (shouldn't happen often for same window)
            // but more importantly if the definition itself somehow changes live
            key={instanceId}
            miniappDefinition={definition}
            instanceId={instanceId} // Pass instanceId to runner for bridge
          />
        </div>
      )}
    </Rnd>
  );
};
