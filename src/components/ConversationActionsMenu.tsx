// src/components/ConversationActionsMenu.tsx
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
// Import AlertDialog
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
import { downloadJson } from '@/lib/download.ts'; // Assuming download helper exists
import { readFileAsText } from '@/lib/file.ts'; // Assuming file reader helper exists
import {
  activeChatAtom,
  chatsAtom,
  clearUnpinnedChatsAtom, // Use clear action
  createNewChatAtom,
  deleteChatAtom,
  deleteChatsNewerThanAtom, // Import new atom
  deleteChatsOlderThanAtom, // Import new atom
  forkChatAtom, // Import new atom
  importChatsAtom, // Import new atom
  sortedChatsAtom, // Need sorted chats for above/below logic
  togglePinChatAtom,
} from '@/store/index.ts';
import { Chat } from '@/types.ts';
// Import necessary atoms
import { useAtomValue, useSetAtom } from 'jotai'; // Import jotai hooks
import React, { useMemo, useRef } from 'react'; // Import useRef
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
import { toast } from 'sonner'; // For feedback
import { Button } from './ui/Button.tsx';

export const ConversationActionsMenu: React.FC = () => {
  // Get state values
  const activeChat = useAtomValue(activeChatAtom);
  const chats = useAtomValue(chatsAtom);
  const sortedChats = useAtomValue(sortedChatsAtom); // Get sorted chats

  // Get action setters
  const createNewChat = useSetAtom(createNewChatAtom);
  const togglePinChat = useSetAtom(togglePinChatAtom);
  const deleteChat = useSetAtom(deleteChatAtom);
  const clearUnpinnedChats = useSetAtom(clearUnpinnedChatsAtom);
  const forkChat = useSetAtom(forkChatAtom);
  const deleteOlder = useSetAtom(deleteChatsOlderThanAtom);
  const deleteNewer = useSetAtom(deleteChatsNewerThanAtom);
  const importChats = useSetAtom(importChatsAtom);

  // Ref for hidden file input
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Calculate dynamic disabled states and values
  const chatList = useMemo(() => Object.values(chats), [chats]); // UseMemo for efficiency
  const hasChats = chatList.length > 0;
  const isChatActive = !!activeChat;
  const isChatPinned = activeChat?.isPinned ?? false;

  const activeChatIndex = useMemo(() => {
    if (!activeChat) return -1;
    return sortedChats.findIndex((c) => c.id === activeChat.id);
  }, [activeChat, sortedChats]);

  // Can delete if not the first chat in the sorted list (ignoring pins for simplicity here, adjust if needed)
  const canDeleteAbove = isChatActive && activeChatIndex > 0;
  // Can delete if not the last chat in the sorted list
  const canDeleteBelow =
    isChatActive &&
    activeChatIndex < sortedChats.length - 1 &&
    activeChatIndex !== -1;

  const hasUnpinned = useMemo(
    () => chatList.some((c) => !c.isPinned),
    [chatList],
  );

  // --- Action Handlers ---

  const handlePinToggle = () => {
    if (activeChat) {
      togglePinChat(activeChat.id);
      toast.success(
        isChatPinned ? 'Conversation unpinned' : 'Conversation pinned',
      );
    }
  };

  // Use AlertDialog for destructive actions
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

  // TODO: Implement handlers using new atoms
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
      const fileContent = await readFileAsText(file); // Use helper
      const importedData = JSON.parse(fileContent);

      // Basic validation (check if it's an array)
      if (!Array.isArray(importedData)) {
        throw new Error(
          'Invalid JSON format: Expected an array of conversations.',
        );
      }
      // TODO: Add more robust validation for the Chat structure within the array

      importChats(importedData as Chat[]); // Call the import atom action
      toast.success(
        `${importedData.length} conversation(s) imported successfully!`,
      );
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(
        `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      // Reset file input value to allow importing the same file again
      if (importFileInputRef.current) {
        importFileInputRef.current.value = '';
      }
    }
  };

  const handleExportAll = () => {
    if (!hasChats) return;
    const allChats = Object.values(chats); // Get all chat objects
    downloadJson(allChats, 'all_conversations.json'); // Use helper
    toast.success('All conversations exported.');
  };

  const handleExportCurrent = () => {
    if (!activeChat) return;
    downloadJson(
      [activeChat],
      `conversation_${activeChat.name.replace(/\s+/g, '_')}.json`,
    ); // Use helper
    toast.success('Current conversation exported.');
  };

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
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs">
            <LuEllipsis className="h-4 w-4" />
            <span className="sr-only">Conversation Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Actions related to creating/modifying */}
          <DropdownMenuItem onClick={() => createNewChat()}>
            {' '}
            {/* Direct call */}
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
            <DropdownMenuSubTrigger disabled={!hasChats}>
              <LuDownload className="mr-2 h-4 w-4" />
              <span>Export...</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
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

          {/* Destructive Actions - Wrap with AlertDialog Trigger */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                // Prevent default dropdown closing
                onSelect={(e) => {
                  e.preventDefault();
                }}
                disabled={!isChatActive || !canDeleteBelow}
                variant="destructive"
                // Add aria-disabled for accessibility
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
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete all
                  conversations created before the current one (excluding pinned
                  conversations).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDeleteBelow}
                >
                  Delete Below
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete all
                  conversations created after the current one (excluding pinned
                  conversations).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDeleteAbove}
                >
                  Delete Above
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                }}
                disabled={!hasUnpinned}
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
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete all
                  conversations that are not pinned.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleClearUnpinned}
                >
                  Delete Unpinned
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  current conversation and all its messages.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
