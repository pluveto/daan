// src/miniapps/components/MiniappManager/MiniappList.tsx
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
// Removed DialogTrigger temporarily, handle open state manually
import { Switch } from '@/components/ui/Switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { activeMiniappIdsAtom, miniappsDefinitionAtom } from '@/store/miniapp';
import { useAtom } from 'jotai';
import React, { useState } from 'react';
import { toast } from 'sonner'; // Ensure sonner is installed: pnpm add sonner
import { MiniappEditor } from './MiniappEditor';

export function MiniappList() {
  const [definitions, setDefinitions] = useAtom(miniappsDefinitionAtom);
  const [activeIds, setActiveIds] = useAtom(activeMiniappIdsAtom);
  const [editingMiniappId, setEditingMiniappId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const handleDelete = (id: string) => {
    setActiveIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
        console.log(`Deactivating Miniapp ${id} before deletion.`);
      }
      return newSet;
    });
    setDefinitions((prev) => prev.filter((d) => d.id !== id));
    toast.success('Miniapp deleted.');
  };

  const handleToggleActive = (idToToggle: string) => {
    const isActive = activeIds.has(idToToggle);
    const definitionToToggle = definitions.find((d) => d.id === idToToggle);

    if (!definitionToToggle) {
      toast.error('Failed to toggle Miniapp: Definition not found.');
      return;
    }

    if (isActive) {
      // Deactivation
      setActiveIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(idToToggle);
        return newSet;
      });
      toast.info(`Miniapp "${definitionToToggle.name}" deactivated.`);
    } else {
      // --- Activation: Dependency Check ---
      const dependencies = definitionToToggle.dependencies || [];
      let canActivate = true;
      const missingDeps: string[] = [];
      const inactiveDeps: string[] = [];
      const disabledDeps: string[] = []; // Check the definition's enabled flag

      for (const depId of dependencies) {
        const depDef = definitions.find((d) => d.id === depId);
        if (!depDef) {
          canActivate = false;
          missingDeps.push(depId.substring(0, 6)); // Show partial ID
        } else if (!depDef.enabled) {
          // Check the definition's enabled flag
          canActivate = false;
          disabledDeps.push(depDef.name || depId.substring(0, 6));
        } else if (!activeIds.has(depId)) {
          // Check if currently running
          canActivate = false;
          inactiveDeps.push(depDef.name || depId.substring(0, 6));
        }
      }

      if (canActivate) {
        setActiveIds((prev) => new Set(prev).add(idToToggle));
        toast.success(`Miniapp "${definitionToToggle.name}" activated.`);
      } else {
        let errorMsg = `Cannot activate "${definitionToToggle.name}". Issues:`;
        if (missingDeps.length > 0)
          errorMsg += `\n- Missing definitions for: ${missingDeps.join(', ')}`;
        if (disabledDeps.length > 0)
          errorMsg += `\n- Required dependencies are disabled: ${disabledDeps.join(', ')}`;
        if (inactiveDeps.length > 0)
          errorMsg += `\n- Required dependencies are not active: ${inactiveDeps.join(', ')}`;
        console.error(errorMsg);
        toast.error('Activation Failed', {
          description: (
            <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
              <code className="text-white">{errorMsg}</code>
            </pre>
          ), // Show details in description using preformatted text
          duration: 10000,
        });
      }
      // --- End Dependency Check ---
    }
  };

  const handleEdit = (id: string) => {
    setEditingMiniappId(id);
    setIsEditorOpen(true);
  };

  const handleAddNew = () => {
    setEditingMiniappId(null); // Signal creation mode
    setIsEditorOpen(true);
  };

  const handleEditorClose = (success?: boolean) => {
    setIsEditorOpen(false);
    setEditingMiniappId(null); // Reset editing state
    if (success) {
      toast.success(
        editingMiniappId
          ? 'Miniapp updated successfully.'
          : 'Miniapp created successfully.',
      );
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-end">
        <Button onClick={handleAddNew}>Add New Miniapp</Button>
      </div>

      {/* Dialog for Editor */}
      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => !open && handleEditorClose()}
      >
        <DialogContent className="sm:max-w-[80vw] lg:max-w-[70vw] xl:max-w-[60vw]">
          {' '}
          {/* Responsive Width */}
          <DialogHeader>
            <DialogTitle>
              {editingMiniappId ? 'Edit Miniapp' : 'Create New Miniapp'}
            </DialogTitle>
          </DialogHeader>
          {/* Render editor only when dialog is open and key forces remount if ID changes */}
          {isEditorOpen && (
            <MiniappEditor
              key={editingMiniappId || 'new'}
              miniappId={editingMiniappId}
              onSaveSuccess={() => handleEditorClose(true)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Miniapp List Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[25%]">Name</TableHead>
              <TableHead className="w-[40%]">Description</TableHead>
              <TableHead className="w-[10%] text-center">Active</TableHead>
              <TableHead className="w-[25%] pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {definitions.length > 0 ? (
              definitions.map((def) => (
                <TableRow key={def.id}>
                  <TableCell className="font-medium">{def.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {def.description || '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      aria-label={`Activate ${def.name}`}
                      checked={activeIds.has(def.id)}
                      onCheckedChange={() => handleToggleActive(def.id)}
                      // Optionally: Prevent activation if the definition itself is disabled
                      // disabled={!def.enabled}
                    />
                    {/* Optional: Show if definition disabled */}
                    {/* {!def.enabled && <span className="text-xs text-muted-foreground ml-2">(Disabled)</span>} */}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(def.id)}
                      className="mr-2"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(def.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground h-24 text-center"
                >
                  No Miniapps defined yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
