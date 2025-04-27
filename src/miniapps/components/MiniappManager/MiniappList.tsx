// src/miniapps/components/MiniappManager/MiniappList.tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/AlertDialog';
// Import AlertDialog
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'; // Import Dropdown
import { Switch } from '@/components/ui/Switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import {
  exportMiniappDefinition,
  exportMiniappWithData,
} from '@/lib/miniappImportExport'; // Import export functions

import {
  activeMiniappInstancesAtom, // To check for running instances
  closeMiniappAtom, // To close running instances if needed
  miniappsDefinitionAtom,
} from '@/store/miniapp';
import { MiniappDefinition } from '@/types';
import { formatDateLabel } from '@/utils/dateUtils'; // Assuming you have a date formatter
import { useAtom, useAtomValue, useSetAtom } from 'jotai'; // Import Getter
import React, { useState } from 'react';
import {
  LuDownload,
  LuEllipsis,
  LuFileJson,
  LuInfo,
  LuPackage,
  LuPackagePlus,
  LuPencil,
  LuTrash2,
} from 'react-icons/lu'; // Add/adjust icons
import { toast } from 'sonner';
import { MiniappEditor } from './MiniappEditor';

export function MiniappList() {
  const [definitions, setDefinitions] = useAtom(miniappsDefinitionAtom);
  const activeInstances = useAtomValue(activeMiniappInstancesAtom); // Get running instances
  const closeInstance = useSetAtom(closeMiniappAtom); // Get atom to close instances

  const [editingMiniappId, setEditingMiniappId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  // State for controlling the delete confirmation dialog if needed outside trigger
  // const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  // const [deletingMiniappId, setDeletingMiniappId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    // Confirmation is now handled by the AlertDialog directly.
    // This function will be called *after* confirmation.

    // Find running instances of this definition
    const runningInstances = activeInstances.filter(
      (inst) => inst.definitionId === id,
    );

    // Close running instances first
    if (runningInstances.length > 0) {
      toast.info(
        `Closing ${runningInstances.length} running instance(s) before deleting definition...`,
      );
      runningInstances.forEach((instance) => {
        closeInstance(instance.instanceId);
      });
    }

    // Remove the definition
    setDefinitions((prev) => prev.filter((d) => d.id !== id));
    toast.success('Miniapp definition deleted successfully.');
  };

  const handleToggleEnabled = (
    idToToggle: string,
    currentEnabledState: boolean,
  ) => {
    const definitionToToggle = definitions.find((d) => d.id === idToToggle);

    if (!definitionToToggle) {
      toast.error('Failed to toggle Miniapp: Definition not found.');
      return;
    }

    // If disabling, check if any active instances depend on it? (Complex - skip for now)
    // Basic toggle: Update the 'enabled' flag in the definitions atom
    setDefinitions((prev) =>
      prev.map((def) =>
        def.id === idToToggle
          ? { ...def, enabled: !currentEnabledState, updatedAt: Date.now() } // Toggle and update timestamp
          : def,
      ),
    );

    toast.info(
      `Miniapp "${definitionToToggle.name}" ${!currentEnabledState ? 'enabled' : 'disabled'}.`,
      {
        description: !currentEnabledState
          ? 'It will now appear in the launch list.'
          : 'It will no longer appear in the launch list.',
      },
    );
  };

  const handleEdit = (id: string) => {
    setEditingMiniappId(id);
    setIsEditorOpen(true);
  };

  const handleAddNew = () => {
    setEditingMiniappId(null);
    setIsEditorOpen(true);
  };

  const handleEditorClose = (success?: boolean) => {
    setIsEditorOpen(false);
    setEditingMiniappId(null);
    if (success) {
      toast.success(
        editingMiniappId
          ? 'Miniapp updated successfully.'
          : 'Miniapp created successfully.',
      );
    }
  };

  // Add handleExport functions
  const handleExportDef = (def: MiniappDefinition) => {
    exportMiniappDefinition(def as any);
  };

  const handleExportData = (def: MiniappDefinition) => {
    exportMiniappWithData(def as any);
  };

  // Sort definitions, e.g., by name
  const sortedDefinitions = React.useMemo(() => {
    return [...definitions].sort((a, b) => a.name.localeCompare(b.name));
  }, [definitions]);

  return (
    <TooltipProvider>
      {/* Wrap with TooltipProvider */}
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Miniapps</h3>
          <Button onClick={handleAddNew} size="sm" variant="outline">
            <LuPackagePlus className="mr-2 h-4 w-4" /> Add New Miniapp
          </Button>
        </div>

        {/* Dialog for Editor */}
        <Dialog
          open={isEditorOpen}
          onOpenChange={(open) => !open && handleEditorClose()}
        >
          <DialogContent className="sm:max-w-[80vw] lg:max-w-[70vw] xl:max-w-[60vw]">
            <DialogHeader>
              <DialogTitle>
                {editingMiniappId ? 'Edit Miniapp' : 'Create New Miniapp'}
              </DialogTitle>
            </DialogHeader>
            {isEditorOpen && (
              <MiniappEditor
                key={editingMiniappId || 'new'}
                miniappId={editingMiniappId}
                onSaveSuccess={() => handleEditorClose(true)}
                onCancel={() => handleEditorClose(false)}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Miniapp List Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] pl-4 text-center">
                  Icon
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">
                  Description
                </TableHead>
                {/* Hide on small screens */}
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                {/* Hide on med screens */}
                <TableHead className="w-[100px] text-center">Enabled</TableHead>
                <TableHead className="w-[120px] pr-4 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDefinitions.length > 0 ? (
                sortedDefinitions.map((def) => {
                  const runningInstanceCount = activeInstances.filter(
                    (inst) => inst.definitionId === def.id,
                  ).length;
                  const isRunning = runningInstanceCount > 0;

                  return (
                    <TableRow
                      key={def.id}
                      className={!def.enabled ? 'opacity-60' : ''}
                    >
                      <TableCell className="pl-4 text-center">
                        <span className="text-xl">
                          {def.icon || <LuPackage className="inline h-5 w-5" />}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{def.name}</TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-xs truncate text-sm md:table-cell">
                        {def.description || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                        {formatDateLabel(def.updatedAt)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          id={`enable-${def.id}`}
                          aria-label={`Enable ${def.name}`}
                          checked={def.enabled}
                          onCheckedChange={() =>
                            handleToggleEnabled(def.id, def.enabled)
                          }
                          className="cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {/* Info Tooltip for Running Status */}
                          {isRunning && (
                            <Tooltip delayDuration={200}>
                              <TooltipTrigger asChild>
                                <span className="flex items-center text-blue-500 dark:text-blue-400">
                                  <LuInfo className="h-4 w-4" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {runningInstanceCount} instance(s) currently
                                  running.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {/* Actions Dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                              >
                                <LuEllipsis className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleEdit(def.id)}
                              >
                                <LuPencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleExportDef(def)}
                              >
                                <LuFileJson className="mr-2 h-4 w-4" /> Export
                                Definition
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleExportData(def)}
                              >
                                <LuDownload className="mr-2 h-4 w-4" /> Export
                                with Data
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {/* Delete Confirmation remains inside AlertDialog */}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  {/* Must be focusable element for trigger */}
                                  <DropdownMenuItem
                                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                    onSelect={(e) => e.preventDefault()} // Prevent closing dropdown immediately
                                  >
                                    <LuTrash2 className="mr-2 h-4 w-4" />{' '}
                                    Delete...
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  {/* ... AlertDialog Header, Desc, Footer ... */}
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Are you sure?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete the{' '}
                                      <strong className="px-1">
                                        {def.name}
                                      </strong>{' '}
                                      Miniapp definition.
                                      {isRunning && (
                                        <span className="text-destructive block pt-2 font-semibold">
                                          Warning: {runningInstanceCount}{' '}
                                          instance(s) running and will be
                                          closed.
                                        </span>
                                      )}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(def.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Yes, Delete Definition
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6} // Adjusted colspan
                    className="text-muted-foreground h-24 text-center"
                  >
                    No Miniapps defined yet. Click "Add New Miniapp" to create
                    one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}
