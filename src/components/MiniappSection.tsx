// src/components/MiniappSection.tsx
import { Button } from '@/components/ui/Button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import {
  focusMiniappWindowAtom,
  isMiniappMarketplaceOpenAtom,
  isMiniappSearchOpenAtom,
  orderedRunningMiniappsAtom,
  setMiniappOrderAtom,
  toggleMinimizeMiniappAtom,
} from '@/store/miniapp';
import { MiniappDefinitionEntity, MiniappInstance } from '@/types';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAtomValue, useSetAtom } from 'jotai';
import React from 'react';
import { LuPackage, LuPlus, LuStore } from 'react-icons/lu'; // Default icon

interface SortableMiniappIconProps {
  instance: MiniappInstance & { definition?: MiniappDefinitionEntity };
  onFocus: (instanceId: string) => void;
  onToggleMinimize: (instanceId: string) => void;
}

const SortableMiniappIcon: React.FC<SortableMiniappIconProps> = ({
  instance,
  onFocus,
  onToggleMinimize,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: instance.instanceId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1, // Ensure dragged item is visually above others during drag
    // Add subtle scale effect on minimize?
    scale: instance.minimized ? '0.9' : '1',
    filter: instance.minimized ? 'grayscale(80%)' : 'none',
  };

  const handleClick = () => {
    if (instance.minimized) {
      onToggleMinimize(instance.instanceId); // Unminimize also focuses via atom dependency
    } else {
      onFocus(instance.instanceId);
    }
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      // Middle mouse button
      e.preventDefault();
      onToggleMinimize(instance.instanceId);
    }
  };

  const appName = instance.definition?.name || 'Unknown App';
  const icon = instance.definition?.icon;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            aria-label={`Focus ${appName}`}
            className={`flex h-8 w-8 cursor-grab items-center justify-center rounded p-1 text-xl ${instance.minimized ? 'bg-neutral-300 dark:bg-neutral-700' : 'bg-neutral-200 dark:bg-neutral-800'} text-neutral-800 hover:bg-neutral-300 dark:text-neutral-200 dark:hover:bg-neutral-700`}
            key={instance.instanceId}
            onClick={handleClick}
            onAuxClick={handleMiddleClick} // Handle middle click for minimize/unminimize
            title={appName + (instance.minimized ? ' (Minimized)' : '')}
            size="icon"
            variant="ghost"
          >
            {icon ? (
              <span className="truncate text-center text-[1rem] leading-none">
                {icon}
              </span> // Smaller icon text
            ) : (
              <LuPackage className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          <p>
            {appName}
            {instance.minimized
              ? ' (Minimized - Middle-click to restore)'
              : ' (Middle-click to minimize)'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const MiniappSection: React.FC = () => {
  const runningMiniapps = useAtomValue(orderedRunningMiniappsAtom);
  const setMiniappOrder = useSetAtom(setMiniappOrderAtom);
  const setMiniappSearchOpen = useSetAtom(isMiniappSearchOpenAtom);
  const setMiniappMarketplaceOpen = useSetAtom(isMiniappMarketplaceOpenAtom);
  const focusWindow = useSetAtom(focusMiniappWindowAtom);
  const toggleMinimize = useSetAtom(toggleMinimizeMiniappAtom);

  const instanceIds = React.useMemo(
    () => runningMiniapps.map((app) => app.instanceId),
    [runningMiniapps],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // Require a slight drag movement
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = instanceIds.indexOf(active.id as string);
      const newIndex = instanceIds.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        setMiniappOrder(arrayMove(instanceIds, oldIndex, newIndex));
      }
    }
  };

  const handleAddClick = () => setMiniappSearchOpen(true);
  const onOpenMarketplaceClick = () => setMiniappMarketplaceOpen(true);

  return (
    <>
      <div className="flex items-center px-3 pt-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
        <div className="flex-1 font-medium tracking-wider uppercase">
          MiniApps
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={onOpenMarketplaceClick}
          aria-label="Open Character Marketplace"
        >
          <LuStore className="h-4 w-4" />
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={instanceIds}
          strategy={horizontalListSortingStrategy}
        >
          <div className="mb-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded border-b p-2 dark:border-neutral-700">
            <Button
              aria-label="Launch New MiniApp"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-dashed bg-neutral-100 p-1 text-neutral-600 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800/30 dark:text-neutral-400 dark:hover:bg-neutral-800/50"
              key="add-miniapp"
              onClick={handleAddClick}
              title="Launch New MiniApp"
              size="icon"
              variant="ghost"
            >
              <LuPlus className="h-4 w-4" />
            </Button>
            {runningMiniapps.map((instance) => (
              <SortableMiniappIcon
                key={instance.instanceId}
                instance={instance}
                onFocus={focusWindow}
                onToggleMinimize={toggleMinimize}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
};
