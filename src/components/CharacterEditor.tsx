// src/components/CharacterEditor.tsx
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
} from '@/components/ui/AlertDialog.tsx';
import { Button } from '@/components/ui/Button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu.tsx';
import { Input } from '@/components/ui/Input.tsx';
import { Label } from '@/components/ui/Label.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select.tsx';
// Import DropdownMenu
import { Textarea } from '@/components/ui/Textarea.tsx';
import { downloadJson } from '@/lib/download.ts';
import { readFileAsText } from '@/lib/file.ts';
import { cn } from '@/lib/utils.ts';
import {
  addCharacterAtom,
  availableModelsAtom, // Need available models for select
  customCharactersAtom,
  defaultMaxHistoryAtom, // Need global default for placeholder
  deleteCharacterAtom,
  duplicateCharacterAtom, // Import atom
  importCharactersAtom, // Import atom
  isCharacterEditorOpenAtom,
  moveCharacterAtom, // Import atom
  updateCharacterAtom,
} from '@/store/atoms.ts';
import { CustomCharacter, exampleModels } from '@/types.ts'; // Import types
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
// Import useRef
import {
  LuCheck, // For copy feedback later?
  LuChevronDown,
  LuChevronUp,
  LuCirclePlus,
  LuCopy, // For duplicate
  LuDownload, // For export
  LuEllipsis,
  LuFileJson, // For export type
  LuMinus,
  LuPlus,
  LuTrash2, // For delete in menu
  LuUpload, // For import
} from 'react-icons/lu';
import { toast } from 'sonner';

export const CharacterEditor: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(isCharacterEditorOpenAtom);
  const [characters, setCharacters] = useAtom(customCharactersAtom); // Use useAtom to get/set
  const availableModels = useAtomValue(availableModelsAtom);
  const globalDefaultMaxHistory = useAtomValue(defaultMaxHistoryAtom);

  // Action setters
  const addCharacter = useSetAtom(addCharacterAtom);
  const updateCharacter = useSetAtom(updateCharacterAtom);
  const deleteCharacter = useSetAtom(deleteCharacterAtom);
  const moveCharacter = useSetAtom(moveCharacterAtom);
  const duplicateCharacter = useSetAtom(duplicateCharacterAtom);
  const importCharacters = useSetAtom(importCharactersAtom);

  // TODO: Add setters for move, duplicate, import, autofill later

  // --- State ---
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null,
  );

  const importCharFileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [maxHistoryStr, setMaxHistoryStr] = useState(''); // Store as string for input

  // --- Derived State ---
  const sortedCharacters = useMemo(() => {
    // Ensure sort property exists and is a number, default to 0 if missing
    return [...characters].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }, [characters]);

  const currentCharacterData = useMemo(() => {
    return characters.find((c) => c.id === selectedCharacterId) || null;
  }, [characters, selectedCharacterId]);

  const isFormChanged = useMemo(() => {
    if (!currentCharacterData) return false; // Or true if you want save enabled for new (unsaved) char? No, handled by selectedId check.
    const currentMaxHistory =
      currentCharacterData.maxHistory === null
        ? ''
        : String(currentCharacterData.maxHistory);
    return (
      name !== currentCharacterData.name ||
      icon !== currentCharacterData.icon ||
      description !== (currentCharacterData.description ?? '') ||
      prompt !== currentCharacterData.prompt ||
      model !== currentCharacterData.model ||
      maxHistoryStr !== currentMaxHistory
    );
  }, [
    name,
    icon,
    description,
    prompt,
    model,
    maxHistoryStr,
    currentCharacterData,
  ]);

  // --- Effects ---
  // Select first character on open or when characters change and none is selected
  useEffect(() => {
    if (isOpen && !selectedCharacterId && sortedCharacters.length > 0) {
      setSelectedCharacterId(sortedCharacters[0].id);
    }
    // If the selected character is deleted, clear selection
    if (isOpen && selectedCharacterId && !currentCharacterData) {
      setSelectedCharacterId(null);
    }
  }, [isOpen, sortedCharacters, selectedCharacterId, currentCharacterData]);

  // Populate form when selected character changes
  const populateForm = useCallback((character: CustomCharacter | null) => {
    setName(character?.name ?? '');
    setIcon(character?.icon ?? '');
    setDescription(character?.description ?? '');
    setPrompt(character?.prompt ?? '');
    setModel(character?.model ?? '');
    setMaxHistoryStr(
      character?.maxHistory === null ? '' : String(character?.maxHistory),
    );
  }, []); // Dependencies are state setters, which are stable

  useEffect(() => {
    populateForm(currentCharacterData);
  }, [currentCharacterData, populateForm]); // Re-populate when data changes

  // --- Handlers ---
  const handleSelectCharacter = (id: string) => {
    setSelectedCharacterId(id);
  };

  const handleAdd = () => {
    const newId = addCharacter(); // Call atom, get new ID
    setSelectedCharacterId(newId); // Select the new character
    // Form will auto-populate via useEffect
  };

  const handleDeleteConfirm = () => {
    if (selectedCharacterId) {
      const deleted = deleteCharacter(selectedCharacterId); // Call atom
      if (deleted) {
        // Clear selection after successful deletion
        setSelectedCharacterId(null);
        // TODO: Implement smarter selection persistence if needed
      }
    }
  };

  const handleReset = () => {
    if (currentCharacterData) {
      populateForm(currentCharacterData); // Repopulate from stored data
      toast.info('Form fields reset.');
    }
  };

  const handleSave = () => {
    if (!selectedCharacterId || !name.trim()) {
      toast.error('Cannot save: Character name is required.');
      return;
    }

    // Parse maxHistory: null if empty/invalid, otherwise number
    const parsedMaxHistory =
      maxHistoryStr.trim() === '' ? null : Number.parseInt(maxHistoryStr, 10);
    const finalMaxHistory =
      parsedMaxHistory === null ||
      isNaN(parsedMaxHistory) ||
      parsedMaxHistory < 0
        ? null
        : parsedMaxHistory;

    updateCharacter({
      id: selectedCharacterId,
      name: name.trim(),
      icon: icon || '👤', // Default icon if empty
      description: description.trim() || undefined, // Store as undefined if empty
      prompt: prompt,
      model: model,
      maxHistory: finalMaxHistory,
      // sort, createdAt, updatedAt are handled by the atom or not changed here
    });
    // No need to manually repopulate, updateCharacter atom changes characters, which triggers useEffect
  };

  // Filter custom models for the "Custom" group
  const customOnlyModels = availableModels.filter(
    (m) => !exampleModels.includes(m),
  );

  const handleMove = (direction: 'up' | 'down') => {
    if (selectedCharacterId) {
      moveCharacter({ id: selectedCharacterId, direction });
      // Note: Selection should remain on the moved item naturally
    }
  };
  const handleDuplicate = () => {
    if (selectedCharacterId) {
      const newId = duplicateCharacter(selectedCharacterId);
      if (newId) {
        setSelectedCharacterId(newId); // Select the newly duplicated character
      }
    }
  };
  const handleTriggerImport = () => {
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
      importCharacters(importedData as unknown[]); // Let the atom handle validation/merging
    } catch (error) {
      console.error('Character Import failed:', error);
      toast.error(
        `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
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
    }
  };
  const handleExportAll = () => {
    if (characters.length > 0) {
      // Export the characters as currently sorted in the editor list
      downloadJson(sortedCharacters, 'all_characters.json');
    }
  };

  // TODO: Implement autofill handler later
  const handleAutoFill = () => console.log('Auto Fill');
  // ...

  // Determine if move buttons should be disabled
  const canMoveUp = useMemo(() => {
    if (!selectedCharacterId) return false;
    const index = sortedCharacters.findIndex(
      (c) => c.id === selectedCharacterId,
    );
    return index > 0;
  }, [selectedCharacterId, sortedCharacters]);
  const canMoveDown = useMemo(() => {
    if (!selectedCharacterId) return false;
    const index = sortedCharacters.findIndex(
      (c) => c.id === selectedCharacterId,
    );
    return index !== -1 && index < sortedCharacters.length - 1;
  }, [selectedCharacterId, sortedCharacters]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/* Hidden File Input for Character Import */}
      <input
        type="file"
        ref={importCharFileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileImport}
      />
      <DialogContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 flex h-[80vh] flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="flex-shrink-0 border-b p-4 pb-4">
          {' '}
          {/* Reduced padding */}
          <DialogTitle>Character Editor</DialogTitle>
          <DialogDescription>
            Create, edit, and manage reusable character profiles.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Character List */}
          <div className="flex w-1/3 flex-col overflow-hidden border-r bg-neutral-50 dark:bg-neutral-950/30">
            <div className="flex flex-shrink-0 items-center justify-between border-b p-2">
              <span className="px-2 text-sm font-medium">Characters</span>
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleAdd}
                  aria-label="Add Character"
                >
                  {' '}
                  <LuPlus />{' '}
                </Button>
                {/* Delete Button with Confirmation */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Delete Character"
                      disabled={!selectedCharacterId}
                    >
                      {' '}
                      <LuMinus />{' '}
                    </Button>
                  </AlertDialogTrigger>
                  {/* Prevent dialog closing if character exists */}
                  {currentCharacterData && (
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Character?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "
                          {currentCharacterData?.name}"? This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={handleDeleteConfirm}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  )}
                </AlertDialog>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleMove('up')}
                  aria-label="Move Up"
                  disabled={!selectedCharacterId || !canMoveUp}
                >
                  {' '}
                  <LuChevronUp />{' '}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleMove('down')}
                  aria-label="Move Down"
                  disabled={!selectedCharacterId || !canMoveDown}
                >
                  {' '}
                  <LuChevronDown />{' '}
                </Button>{' '}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label="More Character Actions"
                    >
                      {' '}
                      <LuEllipsis />{' '}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleAdd}>
                      <LuCirclePlus className="mr-2 h-4 w-4" />
                      Create New Character
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleDuplicate}
                      disabled={!selectedCharacterId}
                    >
                      <LuCopy className="mr-2 h-4 w-4" />
                      Duplicate Current
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {/* Delete needs AlertDialog trigger inside */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={!selectedCharacterId}
                          aria-disabled={!selectedCharacterId}
                          // 阻止 DropdownMenuItem 自身的默认行为
                          onSelect={(e) => e.preventDefault()}
                        >
                          <LuTrash2 className="mr-2 h-4 w-4" /> Delete Current
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      {currentCharacterData && ( // Only render content if deletable
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete Character?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "
                              {currentCharacterData?.name}"?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                    {/* TODO: Import from URL */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        disabled={characters.length === 0}
                      >
                        <LuDownload className="mr-2 h-4 w-4" />
                        Export to JSON...
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem
                          onClick={handleExportCurrent}
                          disabled={!selectedCharacterId}
                        >
                          <LuFileJson className="mr-2 h-4 w-4" /> Export Current
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleExportAll}
                          disabled={characters.length === 0}
                        >
                          <LuFileJson className="mr-2 h-4 w-4" /> Export All
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {sortedCharacters.map((char) => (
                <div
                  key={char.id}
                  onClick={() => handleSelectCharacter(char.id)}
                  className={cn(
                    'hover:bg-accent flex cursor-pointer items-center rounded-md p-2 text-sm dark:hover:bg-neutral-800/80',
                    selectedCharacterId === char.id
                      ? 'bg-accent font-medium dark:bg-neutral-700/70'
                      : '',
                  )}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ')
                      handleSelectCharacter(char.id);
                  }}
                >
                  <span className="mr-2 w-5 flex-shrink-0 text-center text-lg">
                    {char.icon || '👤'}
                  </span>
                  <span className="flex-1 truncate">{char.name}</span>
                </div>
              ))}
              {sortedCharacters.length === 0 && (
                <p className="text-muted-foreground p-4 text-center text-xs">
                  Click '+' to create a character.
                </p>
              )}
            </div>
          </div>

          {/* Right: Editor Form */}
          <div className="flex w-2/3 flex-1 flex-col overflow-hidden p-4">
            {/* Show form only if a character is selected */}
            {!selectedCharacterId ? (
              <div className="text-muted-foreground flex h-full items-center justify-center">
                Select a character to edit or click '+' to create one.
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto px-2">
                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="char-name">Name</Label>
                    <Input
                      id="char-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  {/* Icon */}
                  <div className="space-y-2">
                    <Label htmlFor="char-icon">Icon (Emoji)</Label>
                    <Input
                      id="char-icon"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      maxLength={2}
                      className="w-16 p-1 text-center text-xl"
                    />
                    {/* TODO: Add emoji picker here */}
                  </div>
                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="char-desc">
                      Description{' '}
                      <span className="text-muted-foreground text-xs">
                        (Optional)
                      </span>
                    </Label>
                    <Textarea
                      id="char-desc"
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Briefly describe the character's role or personality."
                    />
                  </div>
                  {/* Prompt */}
                  <div className="space-y-2">
                    <Label htmlFor="char-prompt">System Prompt</Label>
                    <Textarea
                      id="char-prompt"
                      rows={8}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Define the character's behavior, rules, and persona..."
                    />
                  </div>
                  {/* Model */}
                  <div className="space-y-2">
                    <Label htmlFor="char-model">Model</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger id="char-model" className="w-full">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Recommended</SelectLabel>
                          {exampleModels.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        {customOnlyModels.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Custom</SelectLabel>
                            {customOnlyModels.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {/* Ensure current model is selectable even if not in lists */}
                        {!availableModels.includes(model) && model && (
                          <SelectGroup>
                            <SelectLabel>Current (Not in lists)</SelectLabel>
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Max History */}
                  <div className="space-y-2">
                    <Label htmlFor="char-history">Max History (Messages)</Label>
                    <Input
                      id="char-history"
                      type="number"
                      min="0"
                      step="1"
                      value={maxHistoryStr}
                      onChange={(e) => setMaxHistoryStr(e.target.value)}
                      placeholder={`Global Default (${globalDefaultMaxHistory})`}
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Leave blank to use the global default. Overrides
                      chat-specific settings.
                    </p>
                  </div>
                </div>
                {/* Footer Buttons */}
                <div className="mt-auto flex flex-shrink-0 justify-end space-x-2 border-t pt-4">
                  <Button variant="outline" onClick={handleAutoFill} disabled>
                    Auto Fill
                  </Button>{' '}
                  {/* Disabled for now */}
                  <Button
                    variant="ghost"
                    onClick={handleReset}
                    disabled={!isFormChanged}
                  >
                    Reset Changes
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!isFormChanged || !name.trim()}
                  >
                    Save Changes
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
