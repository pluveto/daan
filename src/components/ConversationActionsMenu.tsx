// src/components/ConversationActionsMenu.tsx (Updated - Phase 5 + Shortcuts)
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
  activeChatDataAtom,
  chatListMetadataAtom,
  clearUnpinnedChatsAtom,
  createNewChatAtom,
  deleteChatAtom,
  deleteChatsNewerThanAtom,
  deleteChatsOlderThanAtom,
  exportAllChatsAtom,
  exportCurrentChatAtom,
  forkChatAtom,
  importChatsAtom,
  sortedChatsMetadataAtom,
  togglePinChatAtom,
} from '@/store/index';
import { useAtomValue, useSetAtom } from 'jotai';
import React, { useEffect, useMemo, useRef } from 'react'; // Added useEffect
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
  const activeChat = useAtomValue(activeChatDataAtom);
  const chatMetadata = useAtomValue(chatListMetadataAtom);
  const sortedMetadata = useAtomValue(sortedChatsMetadataAtom);

  const createNewChat = useSetAtom(createNewChatAtom);
  const togglePinChat = useSetAtom(togglePinChatAtom);
  const deleteChat = useSetAtom(deleteChatAtom);
  const clearUnpinnedChats = useSetAtom(clearUnpinnedChatsAtom);
  const forkChat = useSetAtom(forkChatAtom);
  const deleteOlder = useSetAtom(deleteChatsOlderThanAtom);
  const deleteNewer = useSetAtom(deleteChatsNewerThanAtom);
  const importChats = useSetAtom(importChatsAtom);
  const exportAll = useSetAtom(exportAllChatsAtom);
  const exportCurrent = useSetAtom(exportCurrentChatAtom);

  const importFileInputRef = useRef<HTMLInputElement>(null);

  const hasChats = useMemo(
    () => chatMetadata !== null && chatMetadata.length > 0,
    [chatMetadata],
  );
  const isChatActive = !!activeChat;
  const isChatPinned = activeChat?.isPinned ?? false;

  const activeChatIndex = useMemo(() => {
    if (!activeChat || !sortedMetadata) return -1;
    return sortedMetadata.findIndex((c) => c.id === activeChat.id);
  }, [activeChat, sortedMetadata]);

  const canDeleteBelow =
    isChatActive &&
    activeChatIndex !== -1 &&
    activeChatIndex < sortedMetadata.length - 1;
  const canDeleteAbove = isChatActive && activeChatIndex > 0;

  const hasUnpinned = useMemo(
    () => chatMetadata?.some((c) => !c.isPinned) ?? false,
    [chatMetadata],
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

  // This handler is for the menu item, which uses confirmation
  const handleDeleteCurrentWithConfirmation = () => {
    if (activeChat) {
      // This function will be called by the AlertDialog's action button
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
      importChats(importedData);
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
    exportAll();
  };
  const handleExportCurrent = () => {
    exportCurrent();
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl (Windows/Linux) or Command (macOS)
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      if (isCtrlOrCmd && (event.key === 'n' || event.key === 'N')) {
        event.preventDefault(); // Prevent browser's default "New Window"
        console.log('Ctrl+N pressed: Creating new chat');
        createNewChat();
        // toast.success('New conversation created'); // Optional: toast for shortcut
      }

      if (isCtrlOrCmd && (event.key === 'w' || event.key === 'W')) {
        if (activeChat) {
          event.preventDefault(); // Prevent browser's default "Close Tab/Window"
          console.log(
            `Ctrl+W pressed: Deleting current chat ID: ${activeChat.id}`,
          );
          deleteChat(activeChat.id); // Directly delete, no confirmation
          toast.success('Conversation deleted');
        } else {
          console.log('Ctrl+W pressed: No active chat to delete');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeChat, createNewChat, deleteChat]); // Add dependencies

  // --- Render ---
  return (
    <>
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
          <DropdownMenuItem onClick={() => createNewChat()}>
            <LuCirclePlus className="mr-2 h-4 w-4" />
            <span>New Conversation</span>
            <span className="ml-auto text-xs tracking-widest text-muted-foreground">
              {navigator.platform.toUpperCase().indexOf('MAC') >= 0
                ? '⌘N'
                : 'Ctrl+N'}
            </span>
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

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
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
                  className="bg-destructive hover:bg-destructive/90" // Added hover style
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
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete all unpinned conversations created after the current
                  one?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90" // Added hover style
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
                onSelect={(e) => e.preventDefault()}
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
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete all conversations that are not pinned?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90" // Added hover style
                  onClick={handleClearUnpinned}
                >
                  Delete Unpinned
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete Current - Menu item still uses confirmation */}
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
                <span className="ml-auto text-xs tracking-widest text-muted-foreground">
                  {navigator.platform.toUpperCase().indexOf('MAC') >= 0
                    ? '⌘W'
                    : 'Ctrl+W'}
                </span>
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
                  className="bg-destructive hover:bg-destructive/90" // Added hover style
                  onClick={handleDeleteCurrentWithConfirmation} // Use the specific handler for confirmation
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
