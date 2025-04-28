// src/components/CharacterEditor/index.tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { UpdateCharacterDto } from '@/services/ChatDataService';
import {
  addCharacterAtom,
  apiKeyAtom,
  autoFillCharacterAtom,
  defaultMaxHistoryAtom,
  deleteCharacterAtom,
  duplicateCharacterAtom,
  importCharactersAtom,
  isCharacterAutoFillingAtom,
  isCharacterEditorOpenAtom,
  loadedCharactersAtom,
  moveCharacterAtom,
  updateCharacterAtom,
} from '@/store/index';
import { CustomCharacter } from '@/types';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CharacterForm } from './CharacterForm';
import { CharacterList } from './CharacterList';

type PartialCharacter = Partial<CustomCharacter>;

export const CharacterEditor: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(isCharacterEditorOpenAtom);
  const characters = useAtomValue(loadedCharactersAtom) ?? [];
  const globalDefaultMaxHistory = useAtomValue(defaultMaxHistoryAtom);
  const apiKey = useAtomValue(apiKeyAtom); // For auto-fill check
  const isAutoFilling = useAtomValue(isCharacterAutoFillingAtom);

  // Action setters from Jotai
  const addCharacter = useSetAtom(addCharacterAtom);
  const updateCharacter = useSetAtom(updateCharacterAtom);
  const deleteCharacter = useSetAtom(deleteCharacterAtom);
  const moveCharacter = useSetAtom(moveCharacterAtom);
  const duplicateCharacter = useSetAtom(duplicateCharacterAtom);
  const importCharacters = useSetAtom(importCharactersAtom);
  const triggerAutoFill = useSetAtom(autoFillCharacterAtom);

  // --- Local State ---
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null,
  );

  // --- Derived State ---
  const sortedCharacters = useMemo(() => {
    // Ensure sort property exists and is a number, default to 0 if missing
    return [...characters].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }, [characters]);

  const currentCharacterData = useMemo(() => {
    // Find based on sorted list to ensure consistency if needed, or directly from characters
    return characters.find((c) => c.id === selectedCharacterId) ?? null;
  }, [characters, selectedCharacterId]);

  // --- Effects ---
  // Select first character on open or when characters change and none is selected
  useEffect(() => {
    if (isOpen && !selectedCharacterId && sortedCharacters.length > 0) {
      setSelectedCharacterId(sortedCharacters[0].id);
    }
    // If the selected character is deleted (no longer in characters array), clear selection
    if (
      isOpen &&
      selectedCharacterId &&
      !characters.find((c) => c.id === selectedCharacterId)
    ) {
      // Select the next available character or null if list becomes empty
      const currentIndex = sortedCharacters.findIndex(
        (c) => c.id === selectedCharacterId,
      ); // Find index in OLD sorted list
      if (sortedCharacters.length > 1 && currentIndex !== -1) {
        const nextIndex = Math.min(currentIndex, sortedCharacters.length - 2); // Select previous or the new last item
        setSelectedCharacterId(sortedCharacters[nextIndex]?.id ?? null);
      } else {
        setSelectedCharacterId(sortedCharacters[0]?.id ?? null); // Select first or null
      }
    }
    // Handle case where the list becomes empty
    if (isOpen && characters.length === 0) {
      setSelectedCharacterId(null);
    }
  }, [isOpen, sortedCharacters, characters, selectedCharacterId]); // Add `characters` dependency

  // --- Handlers passed down ---
  const handleSelectCharacter = useCallback((id: string) => {
    // TODO: Consider prompting user to save if form is dirty before switching
    setSelectedCharacterId(id);
  }, []);

  const handleAddCharacter = useCallback(async () => {
    const newId = await addCharacter(); // Call atom, get new ID
    // Selection will be handled by the CharacterList component's click handler
    return newId;
  }, [addCharacter]);

  const handleDeleteCharacter = useCallback(
    async (id: string): Promise<boolean> => {
      const deleted = await deleteCharacter(id); // Call atom
      if (deleted && id === selectedCharacterId) {
        // Let useEffect handle selecting the next/previous item
        // Force re-evaluation of useEffect dependencies if needed immediately
        // This might not be strictly necessary if jotai updates trigger rerender promptly
        setSelectedCharacterId((prevId) => (prevId === id ? null : prevId)); // Trigger state change
      }
      return deleted;
    },
    [deleteCharacter, selectedCharacterId],
  );

  const handleMoveCharacter = useCallback(
    async (id: string, direction: 'up' | 'down') => {
      await moveCharacter({ id, direction });
      // Selection should remain on the moved item naturally as its ID doesn't change
    },
    [moveCharacter],
  );

  const handleDuplicateCharacter = useCallback(
    async (id: string): Promise<string | null> => {
      const newId = await duplicateCharacter(id);
      // Selection will be handled by the CharacterList component's click handler
      return newId;
    },
    [duplicateCharacter],
  );

  const handleImportCharacters = useCallback(
    async (data: unknown[]) => {
      await importCharacters(data); // Let the atom handle validation/merging
    },
    [importCharacters],
  );

  const handleSaveCharacter = useCallback(
    async (data: UpdateCharacterDto) => {
      // data should already be processed by CharacterForm
      if (!data.id) {
        toast.error('Cannot save: Character ID missing.');
        return;
      }
      // No need for name check here, react-hook-form handles it
      await updateCharacter(data);
      toast.success(`Character "${data.name}" saved.`);
      // Form's isDirty state will reset automatically if reset() is called after save,
      // or manually call reset in the form's onSubmit success if needed.
    },
    [updateCharacter],
  );

  const handleTriggerAutoFill = useCallback(
    async (id: string, data: PartialCharacter) => {
      if (apiKey) {
        return await triggerAutoFill(id, data);
      } else {
        toast.error('Cannot Auto-Fill: API Key not set in settings.');
        return null;
      }
    },
    [apiKey, triggerAutoFill],
  );

  // Determine if auto-fill should be enabled (passed to form)
  const canAutoFill = !!selectedCharacterId && !!apiKey;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/* Keep trigger hidden or integrate it appropriately */}
      <DialogTrigger className="hidden">Open Character Editor</DialogTrigger>
      <DialogContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 flex h-[80vh] max-h-[900px] min-h-[400px] w-full max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="flex-shrink-0 border-b p-4">
          <DialogTitle>Character Editor</DialogTitle>
          <DialogDescription>
            Create, edit, and manage reusable character profiles.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
          {/* Left: Character List */}
          <CharacterList
            characters={sortedCharacters}
            selectedId={selectedCharacterId}
            onSelect={handleSelectCharacter}
            onAdd={handleAddCharacter}
            onDelete={handleDeleteCharacter}
            onMove={handleMoveCharacter}
            onDuplicate={handleDuplicateCharacter}
            onImport={handleImportCharacters}
          />

          {/* Right: Editor Form */}
          {selectedCharacterId && currentCharacterData ? ( // Ensure data exists before rendering form
            <CharacterForm
              key={selectedCharacterId} // Re-mount form when ID changes to ensure reset works reliably
              characterData={currentCharacterData}
              globalDefaultMaxHistory={globalDefaultMaxHistory ?? 0} // Pass a default number
              isAutoFilling={isAutoFilling}
              canAutoFill={canAutoFill}
              onSave={handleSaveCharacter}
              onAutoFill={handleTriggerAutoFill}
            />
          ) : (
            // Placeholder when no character is selected
            <div className="text-muted-foreground flex h-full w-full flex-1 items-center justify-center p-4 sm:w-2/3">
              {characters.length > 0
                ? 'Select a character to edit.'
                : "Click '+' to create your first character."}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
