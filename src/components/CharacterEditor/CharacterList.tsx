// src/components/CharacterEditor/CharacterList.tsx
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
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { downloadJson } from '@/lib/download';
import { readFileAsText } from '@/lib/file';
import { cn } from '@/lib/utils';
import { loadedCharactersAtom } from '@/store';
import { CustomCharacter } from '@/types';
import { useAtomValue } from 'jotai';
import { isNull } from 'lodash';
import React, { useRef } from 'react';
import {
  LuChevronDown,
  LuChevronUp,
  LuCirclePlus,
  LuCopy,
  LuDownload,
  LuEllipsis,
  LuFileJson,
  LuMinus,
  LuPlus,
  LuTrash2,
  LuUpload,
} from 'react-icons/lu';
import { toast } from 'sonner';

interface CharacterListProps {
  characters: CustomCharacter[]; // Use sorted characters passed from parent
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => Promise<string | null>; // Returns the new ID or null
  onDelete: (id: string) => Promise<boolean>;
  onMove: (id: string, direction: 'up' | 'down') => Promise<void>;
  onDuplicate: (id: string) => Promise<string | null>; // Returns new ID or null
  onImport: (data: unknown[]) => void;
}

export const CharacterList: React.FC<CharacterListProps> = ({
  characters,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
  onMove,
  onDuplicate,
  onImport,
}) => {
  const allCharactersUnsorted = useAtomValue(loadedCharactersAtom); // Needed for export all
  const importCharFileInputRef = useRef<HTMLInputElement>(null);

  const currentCharacterData = characters.find((c) => c.id === selectedId);

  const handleAddClick = async () => {
    const newId = await onAdd();
    newId && onSelect(newId); // Select the newly added character
  };

  const handleDeleteConfirm = async () => {
    if (selectedId) {
      const deleted = await onDelete(selectedId);
      if (deleted) {
        // Parent will handle clearing selection if necessary
        toast.success(`Character "${currentCharacterData?.name}" deleted.`);
      } else {
        toast.error('Failed to delete character.');
      }
    }
  };

  const handleMoveClick = async (direction: 'up' | 'down') => {
    if (selectedId) {
      onMove(selectedId, direction);
    }
  };

  const handleDuplicateClick = async () => {
    if (selectedId) {
      const newId = await onDuplicate(selectedId);
      if (newId) {
        onSelect(newId); // Select the duplicate
        toast.success(`Character "${currentCharacterData?.name}" duplicated.`);
      } else {
        toast.error('Failed to duplicate character.');
      }
    }
  };

  const handleTriggerImport = async () => {
    importCharFileInputRef.current?.click();
  };

  const handleFileImport = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/json') {
      toast.error('Invalid file type. Please select a JSON file.');
      return;
    }

    try {
      const fileContent = await readFileAsText(file);
      const importedData = JSON.parse(fileContent);
      onImport(importedData as unknown[]); // Let the parent/atom handle validation
      toast.success('Characters imported successfully!');
    } catch (error) {
      console.error('Character Import failed:', error);
      toast.error(
        `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      // Reset file input value to allow importing the same file again
      if (importCharFileInputRef.current) {
        importCharFileInputRef.current.value = '';
      }
    }
  };

  const handleExportCurrent = () => {
    if (currentCharacterData) {
      downloadJson(
        [currentCharacterData],
        `character_${currentCharacterData.name.replace(/\s+/g, '_')}.json`,
      );
      toast.success(`Exported "${currentCharacterData.name}".`);
    }
  };

  const handleExportAll = () => {
    if (isNull(allCharactersUnsorted)) {
      toast.error('Still loading characters. Please wait.');
      return;
    }
    // Export the characters as currently sorted in the editor list
    if (characters.length > 0) {
      downloadJson(characters, 'all_characters_sorted.json');
      toast.success(`Exported all ${characters.length} characters.`);
    } else if (allCharactersUnsorted.length > 0) {
      // Fallback if sorted list is somehow empty but unsorted exists
      downloadJson(allCharactersUnsorted, 'all_characters_unsorted.json');
      toast.success(
        `Exported all ${allCharactersUnsorted.length} characters (unsorted).`,
      );
    } else {
      toast.info('No characters to export.');
    }
  };

  const selectedIndex = characters.findIndex((c) => c.id === selectedId);
  const canMoveUp = selectedIndex > 0;
  const canMoveDown =
    selectedIndex !== -1 && selectedIndex < characters.length - 1;

  return (
    <div className="flex w-full flex-col overflow-hidden bg-neutral-50 sm:w-1/3 sm:border-r dark:bg-neutral-950/30">
      {/* Hidden File Input for Character Import */}
      <input
        type="file"
        ref={importCharFileInputRef}
        accept=".json"
        className="hidden" // Use className instead of style
        onChange={handleFileImport}
      />

      {/* Header with Actions */}
      <div className="flex flex-shrink-0 items-center justify-between border-b p-2">
        <span className="px-2 text-sm font-medium">Characters</span>
        <div className="flex items-center space-x-1">
          {/* Add */}
          <Button
            variant="ghost"
            size="xs"
            onClick={handleAddClick}
            aria-label="Add New Character"
          >
            <LuPlus />
          </Button>

          {/* Delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                aria-label="Delete Selected Character"
                disabled={!selectedId}
              >
                <LuMinus />
              </Button>
            </AlertDialogTrigger>
            {currentCharacterData && ( // Only show dialog if a character is selected
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Character?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "
                    {currentCharacterData?.name || 'this character'}"? This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive" // Use variant for styling
                    onClick={handleDeleteConfirm}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            )}
          </AlertDialog>

          {/* Move Up */}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleMoveClick('up')}
            aria-label="Move Character Up"
            disabled={!selectedId || !canMoveUp}
          >
            <LuChevronUp />
          </Button>

          {/* Move Down */}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleMoveClick('down')}
            aria-label="Move Character Down"
            disabled={!selectedId || !canMoveDown}
          >
            <LuChevronDown />
          </Button>

          {/* More Options Dropdown */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                aria-label="More Character Actions"
              >
                <LuEllipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleAddClick}>
                <LuCirclePlus className="mr-2 h-4 w-4" />
                Create New Character
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDuplicateClick}
                disabled={!selectedId}
              >
                <LuCopy className="mr-2 h-4 w-4" />
                Duplicate Current
              </DropdownMenuItem>
              {/* Separator before destructive action */}
              <DropdownMenuSeparator />
              {/* Delete needs AlertDialog trigger inside */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    variant="destructive" // Use variant here too
                    disabled={!selectedId}
                    aria-disabled={!selectedId}
                    // Prevent DropdownMenu from closing when clicking delete
                    onSelect={(e) => e.preventDefault()}
                  >
                    <LuTrash2 className="mr-2 h-4 w-4" /> Delete Current
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                {currentCharacterData && ( // Only render content if deletable
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Character?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "
                        {currentCharacterData?.name || 'this character'}"?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={handleDeleteConfirm}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                )}
              </AlertDialog>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleTriggerImport}>
                <LuUpload className="mr-2 h-4 w-4" /> Import from JSON...
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  disabled={allCharactersUnsorted?.length === 0}
                >
                  <LuDownload className="mr-2 h-4 w-4" />
                  Export to JSON...
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={handleExportCurrent}
                    disabled={!selectedId}
                  >
                    <LuFileJson className="mr-2 h-4 w-4" /> Export Current
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleExportAll}
                    disabled={allCharactersUnsorted?.length === 0}
                  >
                    <LuFileJson className="mr-2 h-4 w-4" /> Export All (
                    {characters.length})
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Small spacer if needed */}
          {/* <div className="h-2 w-2" /> */}
        </div>
      </div>

      {/* Character List Area */}
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {characters.map((char) => (
          <div
            key={char.id}
            onClick={() => onSelect(char.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); // Prevent space bar scrolling
                onSelect(char.id);
              }
            }}
            className={cn(
              'focus-visible:ring-ring flex cursor-pointer items-center rounded-md p-2 text-sm transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1', // Added focus styles
              'hover:bg-accent dark:hover:bg-neutral-800/80',
              selectedId === char.id
                ? 'bg-accent font-medium dark:bg-neutral-700/70'
                : 'text-neutral-700 dark:text-neutral-300', // Adjust non-selected text color if needed
            )}
            role="button"
            tabIndex={0} // Make it focusable
            aria-selected={selectedId === char.id}
          >
            <span
              className="mr-2 w-5 flex-shrink-0 text-center text-lg"
              aria-hidden="true"
            >
              {char.icon || '👤'}
            </span>
            <span className="flex-1 truncate">
              {char.name || 'Untitled Character'}
            </span>
          </div>
        ))}
        {characters.length === 0 && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            Click '+' to create a character.
          </p>
        )}
      </div>
    </div>
  );
};
