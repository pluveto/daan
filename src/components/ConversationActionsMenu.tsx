// src/components/ConversationActionsMenu.tsx (Updated - Phase 5)
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
import { readFileAsText } from '@/lib/file';
import {
  activeChatDataAtom, // Use derived atom for active chat data

  // --- Use new atoms/actions ---
  chatListMetadataAtom, // Use sorted metadata list
  clearUnpinnedChatsAtom,
  createNewChatAtom,
  deleteChatAtom,
  deleteChatsNewerThanAtom,
  deleteChatsOlderThanAtom,
  exportAllChatsAtom,
  exportCurrentChatAtom,
  forkChatAtom,
  // --- Import/Export Actions ---
  importChatsAtom, // Use metadata list
  sortedChatsMetadataAtom,
  togglePinChatAtom,
} from '@/store/index';
// --- Remove unused imports ---
// import { Chat } from '@/types'; // No longer needed directly
// import { downloadJson } from '@/lib/download'; // Handled by actions now
// --- End Remove ---
import { useAtomValue, useSetAtom } from 'jotai';
import React, { useMemo, useRef } from 'react';
import {
  LuArchiveRestore,
  LuArrowDownToLine,
  LuArrowUpToLine,
  LuCirclePlus,
  LuCopy,
  LuDownload,
  LuEllipsis,
  LuFileJson,
  LuPin,
  LuPinOff,
  LuTrash2,
  LuUpload,
} from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from './ui/Button';

export const ConversationActionsMenu: React.FC = () => {
  // --- Get state values using new atoms ---
  const activeChat = useAtomValue(activeChatDataAtom); // Reads activeChatDataAtom indirectly
  const chatMetadata = useAtomValue(chatListMetadataAtom); // Read metadata list
  const sortedMetadata = useAtomValue(sortedChatsMetadataAtom); // Read sorted metadata list
  // --- End new atoms ---

  // --- Action setters (remain mostly the same, point to refactored actions) ---
  const createNewChat = useSetAtom(createNewChatAtom);
  const togglePinChat = useSetAtom(togglePinChatAtom);
  const deleteChat = useSetAtom(deleteChatAtom);
  const clearUnpinnedChats = useSetAtom(clearUnpinnedChatsAtom);
  const forkChat = useSetAtom(forkChatAtom);
  const deleteOlder = useSetAtom(deleteChatsOlderThanAtom);
  const deleteNewer = useSetAtom(deleteChatsNewerThanAtom);
  const importChats = useSetAtom(importChatsAtom); // Use refactored import action
  const exportAll = useSetAtom(exportAllChatsAtom); // Use refactored export action
  const exportCurrent = useSetAtom(exportCurrentChatAtom); // Use refactored export action
  // --- End Action setters ---

  const importFileInputRef = useRef<HTMLInputElement>(null);

  // --- Calculate dynamic states based on new atoms ---
  const hasChats = useMemo(
    () => chatMetadata !== null && chatMetadata.length > 0,
    [chatMetadata],
  );
  const isChatActive = !!activeChat;
  // isChatPinned can now directly use the loaded active chat data
  const isChatPinned = activeChat?.isPinned ?? false;

  // Calculate index based on sorted metadata
  const activeChatIndex = useMemo(() => {
    if (!activeChat || !sortedMetadata) return -1;
    return sortedMetadata.findIndex((c) => c.id === activeChat.id);
  }, [activeChat, sortedMetadata]);

  // Logic for enabling delete above/below remains the same, but uses recalculated index
  const canDeleteBelow =
    isChatActive &&
    activeChatIndex !== -1 &&
    activeChatIndex < sortedMetadata.length - 1; // Corrected logic: can delete if not last
  const canDeleteAbove = isChatActive && activeChatIndex > 0; // Corrected logic: can delete if not first

  // Calculate hasUnpinned based on metadata
  const hasUnpinned = useMemo(
    () => chatMetadata?.some((c) => !c.isPinned) ?? false,
    [chatMetadata],
  );
  // --- End dynamic state calculation ---

  // --- Action Handlers (Simplified: just call the action atom) ---
  const handlePinToggle = () => {
    if (activeChat) {
      togglePinChat(activeChat.id);
      toast.success(
        isChatPinned ? 'Conversation unpinned' : 'Conversation pinned',
      );
    }
  };
  const handleDeleteCurrent = () => {
    if (activeChat) {
      deleteChat(activeChat.id);
      toast.success('Conversation deleted');
    }
  };

  const handleClearUnpinned = () => {
    clearUnpinnedChats();
    toast.success('Unpinned conversations deleted');
  };
  const handleFork = () => {
    if (activeChat) {
      forkChat(activeChat.id);
      toast.success('Conversation forked');
    }
  };

  const handleDeleteBelow = () => {
    if (activeChat) {
      deleteOlder(activeChat.id);
      toast.success('Older conversations deleted');
    }
  };

  const handleDeleteAbove = () => {
    if (activeChat) {
      deleteNewer(activeChat.id);
      toast.success('Newer conversations deleted');
    }
  };
  // --- End Action Handlers ---

  // --- Import/Export Handlers ---
  const handleTriggerImport = () => {
    importFileInputRef.current?.click();
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
      // Call the refactored importChats atom action
      importChats(importedData); // Action handles validation, processing, toasts
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(
        `Import failed: ${error instanceof Error ? error.message : 'Could not read file'}`,
      );
    } finally {
      if (importFileInputRef.current) {
        importFileInputRef.current.value = '';
      }
    }
  };
  const handleExportAll = () => {
    exportAll(); // Call the refactored export action
  };
  const handleExportCurrent = () => {
    exportCurrent(); // Call the refactored export action
  };
  // --- End Import/Export Handlers ---

  // --- Render ---
  return (
    <>
      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={importFileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileImport}
      />

      <DropdownMenu>
        {/* Trigger (unchanged) */}
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs">
            <LuEllipsis className="h-4 w-4" />
            <span className="sr-only">Conversation Actions</span>
          </Button>
        </DropdownMenuTrigger>

        {/* Content (use updated variables/handlers) */}
        <DropdownMenuContent align="end" className="w-56">
          {/* --- Menu Items --- */}
          <DropdownMenuItem onClick={() => createNewChat()}>
            <LuCirclePlus className="mr-2 h-4 w-4" />
            <span>New Conversation</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePinToggle} disabled={!isChatActive}>
            {isChatPinned ? (
              <LuPinOff className="mr-2 h-4 w-4" />
            ) : (
              <LuPin className="mr-2 h-4 w-4" />
            )}
            <span>{isChatPinned ? 'Unpin Current' : 'Pin Current'}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleFork} disabled={!isChatActive}>
            <LuCopy className="mr-2 h-4 w-4" />
            <span>Fork Current</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Import / Export */}
          <DropdownMenuItem onClick={handleTriggerImport}>
            <LuUpload className="mr-2 h-4 w-4" />
            <span>Import Conversation(s)...</span>
          </DropdownMenuItem>
          <DropdownMenuSub>
            {/* Disable Export sub-menu if no chats exist */}
            <DropdownMenuSubTrigger disabled={!hasChats}>
              <LuDownload className="mr-2 h-4 w-4" />
              <span>Export...</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {/* Disable items based on state */}
              <DropdownMenuItem onClick={handleExportAll} disabled={!hasChats}>
                <LuFileJson className="mr-2 h-4 w-4" />
                <span>All conversations (JSON)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportCurrent}
                disabled={!isChatActive}
              >
                <LuFileJson className="mr-2 h-4 w-4" />
                <span>Current conversation (JSON)</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* Destructive Actions with Confirmation Dialogs */}
          {/* Delete Below */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()} // Prevent closing menu
                disabled={!isChatActive || !canDeleteBelow}
                variant="destructive"
                aria-disabled={!isChatActive || !canDeleteBelow}
                className={
                  !isChatActive || !canDeleteBelow
                    ? 'text-muted-foreground/50 cursor-not-allowed hover:bg-transparent'
                    : ''
                }
              >
                <LuArrowDownToLine className="mr-2 h-4 w-4" />
                <span>Delete Below</span>
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete all unpinned conversations created before the current
                  one?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive..."
                  onClick={handleDeleteBelow}
                >
                  Delete Below
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete Above */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                disabled={!isChatActive || !canDeleteAbove}
                variant="destructive"
                aria-disabled={!isChatActive || !canDeleteAbove}
                className={
                  !isChatActive || !canDeleteAbove
                    ? 'text-muted-foreground/50 cursor-not-allowed hover:bg-transparent'
                    : ''
                }
              >
                <LuArrowUpToLine className="mr-2 h-4 w-4" />
                <span>Delete Above</span>
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete all unpinned conversations created after the current
                  one?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive..."
                  onClick={handleDeleteAbove}
                >
                  Delete Above
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete Unpinned */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                disabled={!hasUnpinned} // Disable if no unpinned chats
                variant="destructive"
                aria-disabled={!hasUnpinned}
                className={
                  !hasUnpinned
                    ? 'text-muted-foreground/50 cursor-not-allowed hover:bg-transparent'
                    : ''
                }
              >
                <LuArchiveRestore className="mr-2 h-4 w-4" />
                <span>Delete Unpinned</span>
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete all conversations that are not pinned?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive"
                  onClick={handleClearUnpinned}
                >
                  Delete Unpinned
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete Current */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                disabled={!isChatActive}
                variant="destructive"
                aria-disabled={!isChatActive}
                className={
                  !isChatActive
                    ? 'text-muted-foreground/50 cursor-not-allowed hover:bg-transparent'
                    : ''
                }
              >
                <LuTrash2 className="mr-2 h-4 w-4" />
                <span>Delete Current</span>
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  Permanently delete the current conversation "
                  {activeChat?.name || 'this chat'}"?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive..."
                  onClick={handleDeleteCurrent}
                >
                  Delete Current
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
