import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/AlertDialog.tsx';
import { cn } from '@/lib/utils.ts';
import {
  activeChatIdAtom,
  clearUnpinnedChatsAtom, // Import clear action
  createNewChatAtom,
  customCharactersAtom,
  deleteChatAtom,
  isCharacterEditorOpenAtom,
  isConversationSearchOpenAtom,
  sortedChatsAtom, // Use sorted chats
  togglePinChatAtom, // Import toggle pin action
} from '@/store/atoms.ts';
import { Chat, CustomCharacter } from '@/types.ts';
import { format, isToday, isYesterday, startOfDay } from 'date-fns'; // Import date-fns functions

import { Provider, useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useMemo } from 'react';
import {
  LuArchiveRestore,
  LuEllipsis,
  LuGithub,
  LuMessageSquare,
  LuPin,
  LuPinOff,
  LuPlus,
  LuSearch,
  LuTrash2,
} from 'react-icons/lu';
import { ConversationActionsMenu } from './ConversationActionsMenu.tsx'; // Import the new component

import { AlertDialogFooter, AlertDialogHeader } from './ui/AlertDialog.tsx';
// Added Pin icons
import { Button } from './ui/Button.tsx';

// Get branding from environment variables or use defaults
const appName = import.meta.env.VITE_APP_NAME || 'Daan';
const slogan = import.meta.env.VITE_APP_SLOGAN || 'Opensource Chat UI';
const logoUrl = import.meta.env.VITE_APP_LOGO_URL || '/logo.png'; // Default logo path
const version = import.meta.env.VITE_APP_TAG || 'unknown'; // Default version
// Placeholder for commit info (requires build-time injection usually)
const commitInfo = import.meta.env.VITE_APP_COMMIT_HASH || 'N/A';

// Helper function for human-friendly date formatting
const formatDateLabel = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const dateStartOfDay = startOfDay(date);
  const nowStartOfDay = startOfDay(now);

  if (isToday(date)) {
    return 'Today';
  }
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  // Check if it was within the last week (e.g., show day name)
  const diffDays = Math.round(
    (nowStartOfDay.getTime() - dateStartOfDay.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (diffDays < 7) {
    return format(date, 'EEEE'); // e.g., "Monday"
  }
  // Check if it's in the current year
  if (date.getFullYear() === now.getFullYear()) {
    return format(date, 'MMMM d'); // e.g., "April 19"
  }
  // Otherwise, show full date
  return format(date, 'MMM d, yyyy'); // e.g., "Apr 19, 2024"
};

interface GroupedChats {
  label: string;
  chats: Chat[];
  isPinnedGroup: boolean;
}

export const LeftSidebar: React.FC = () => {
  const sortedChats = useAtomValue(sortedChatsAtom); // Use the derived sorted atom
  const setIsCharacterEditorOpen = useSetAtom(isCharacterEditorOpenAtom); // Setter for editor

  const characters = useAtomValue(customCharactersAtom);
  const [activeChatId, setActiveChatId] = useAtom(activeChatIdAtom);
  const createNewChat = useSetAtom(createNewChatAtom);
  const deleteChat = useSetAtom(deleteChatAtom);
  const togglePinChat = useSetAtom(togglePinChatAtom);
  const clearUnpinnedChats = useSetAtom(clearUnpinnedChatsAtom);
  const setConversationSearchOpen = useSetAtom(isConversationSearchOpenAtom); // Setter for dialog

  const handleDelete = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    deleteChat(chatId);
  };

  const handlePinToggle = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    togglePinChat(chatId);
  };

  const handleClearUnpinned = () => {
    if (
      window.confirm(
        'Are you sure you want to delete all unpinned chats? This cannot be undone.',
      )
    ) {
      clearUnpinnedChats();
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    chatId: string,
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActiveChatId(chatId);
    }
  };

  const handleCreateCharacter = () => {
    setIsCharacterEditorOpen(true);
    // Optional: Could trigger an action to add a new default character
    // and select it within the editor component itself upon opening.
  };
  const handleInstantiateCharacter = (character: CustomCharacter) => {
    console.log('Instantiating character:', character.name);
    createNewChat({
      // Call the modified action atom
      name: character.name,
      icon: character.icon,
      systemPrompt: character.prompt,
      model: character.model,
      maxHistory: character.maxHistory,
      characterId: character.id,
    });
  };

  // Group chats by date using useMemo
  const groupedChats = useMemo(() => {
    const groups: GroupedChats[] = [];
    if (!sortedChats || sortedChats.length === 0) {
      return groups;
    }

    const pinnedChats: Chat[] = [];
    const unpinnedChats: Chat[] = [];

    // Separate pinned and unpinned chats
    for (const chat of sortedChats) {
      if (chat.isPinned) {
        pinnedChats.push(chat);
      } else {
        unpinnedChats.push(chat);
      }
    }

    // Add pinned chats group first if any exist
    if (pinnedChats.length > 0) {
      groups.push({ label: 'Pinned', chats: pinnedChats, isPinnedGroup: true });
    }

    // Group unpinned chats by date
    let currentGroup: GroupedChats | null = null;

    for (const chat of unpinnedChats) {
      const dateLabel = formatDateLabel(chat.updatedAt); // Group by update time for recency

      if (
        !currentGroup ||
        currentGroup.label !== dateLabel ||
        currentGroup.isPinnedGroup
      ) {
        // Start a new group for date grouping
        currentGroup = {
          label: dateLabel,
          chats: [chat],
          isPinnedGroup: false,
        };
        groups.push(currentGroup);
      } else {
        // Add to the current date group
        currentGroup.chats.push(chat);
      }
    }

    return groups;
  }, [sortedChats]);

  return (
    <div className="flex h-full flex-col border-r border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900">
      {/* Header with Branding */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
        <div className="flex items-center gap-3 leading-none">
          <img
            alt={`${appName} Logo`}
            className="h-10 w-10 flex-shrink-0 rounded-md object-contain"
            src={logoUrl}
          />
          <div className="flex flex-col items-start justify-center overflow-hidden">
            <h1 className="truncate text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {appName}
            </h1>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
              {slogan}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      {/* Stack vertically on small screens, row on sm and up */}
      <div className="flex flex-col gap-2 p-3 sm:flex-row">
        <Button className="flex-1" onClick={() => createNewChat()}>
          <LuPlus className="mr-2 h-4 w-4" /> New Chat
        </Button>
        <Button
          aria-label="Clear Unpinned Chats"
          onClick={handleClearUnpinned}
          size="icon" // Consider making full width on mobile? or keep icon
          title="Clear Unpinned Chats"
          variant="outline"
          // Example: className="w-full sm:w-auto" if making it full width below sm
        >
          <LuArchiveRestore className="h-4 w-4" />
          {/* Optionally add text for smaller screens: <span className="sm:hidden ml-2">Clear</span> */}
        </Button>
      </div>
      {/* Characters Header */}
      <div className="flex items-center px-3 pt-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
        <div className="flex-1 font-medium tracking-wider uppercase">
          Characters
        </div>
        {/* Trigger for Character Editor */}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setIsCharacterEditorOpen(true)} // Open editor on click
          aria-label="Open Character Editor"
        >
          <LuEllipsis className="h-4 w-4" />
        </Button>
      </div>
      {/* Character List */}
      <div className="mb-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded border-b p-2 dark:border-neutral-700">
        {' '}
        {/* Slightly taller, add bottom border */}
        {/* Add New Character Button */}
        <Button
          aria-label="Create New Character"
          className="flex h-8 w-8 items-center justify-center rounded border border-dashed bg-neutral-100 p-1 text-neutral-600 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800/30 dark:text-neutral-400 dark:hover:bg-neutral-800/50"
          key="add-character"
          onClick={handleCreateCharacter} // Use handler to open editor
          title="Create New Character"
          size="icon"
          variant="ghost"
        >
          <LuPlus className="h-4 w-4" />
        </Button>
        {/* Map actual characters */}
        {characters.map((item) => (
          <Button
            aria-label={`Select ${item.name}`}
            className="flex h-8 w-8 items-center justify-center rounded bg-neutral-200 p-1 text-xl text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200"
            key={item.id} // Use ID for key
            onClick={() => handleInstantiateCharacter(item)} // Instantiate on click
            title={`Instantiate ${item.name}`}
            size="icon"
            variant="ghost"
          >
            {item.icon}
          </Button>
        ))}
      </div>

      {/* Conversations Header */}
      <div className="flex items-center px-3 pt-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
        <div className="flex-1 font-medium tracking-wider uppercase">
          Conversations
        </div>
        <div>
          <ConversationActionsMenu />
        </div>
      </div>

      {/* Search Trigger Button */}
      <div className="px-2 py-1">
        <Button
          variant="outline"
          className="text-muted-foreground hover:text-foreground h-8 w-full cursor-pointer justify-start px-3 text-sm font-normal"
          onClick={() => setConversationSearchOpen(true)}
        >
          <LuSearch className="mr-2 h-4 w-4 flex-shrink-0" />
          Search in conversations...
        </Button>
      </div>
      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2">
        {groupedChats.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No chats yet. Start a new one!
          </p>
        )}
        {groupedChats.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex > 0 ? 'mt-3' : ''}>
            {' '}
            {/* Add margin between groups */}
            <div className="sticky top-0 z-10 bg-neutral-100/90 px-3 py-1 text-xs font-semibold text-neutral-600 backdrop-blur-sm dark:bg-neutral-900/90 dark:text-neutral-400">
              {' '}
              {/* Sticky Header */}
              {group.label}
            </div>
            <div className="mt-1 space-y-1">
              {' '}
              {/* Space between items within a group */}
              {group.chats.map((chat) => (
                <div
                  aria-current={activeChatId === chat.id ? 'page' : undefined}
                  className={cn(
                    'group relative flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400',
                    'hover:bg-neutral-200 dark:hover:bg-neutral-800',
                    activeChatId === chat.id
                      ? 'bg-neutral-200 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                      : 'text-neutral-700 dark:text-neutral-300',
                  )}
                  key={chat.id} // Keep key on the chat item itself
                  onClick={() => setActiveChatId(chat.id)}
                  onKeyDown={(e) => handleKeyDown(e, chat.id)}
                  role="button"
                  tabIndex={0}
                >
                  {/* Icon and Name */}
                  <div className="mr-1 flex flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className="text-md mr-2 w-4">
                      {chat.icon || (
                        <LuMessageSquare className="h-4 w-4 text-neutral-500" />
                      )}
                    </span>
                    <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {chat.name}
                    </span>
                  </div>
                  {/* Action Buttons (Appear on Hover/Focus) */}
                  <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center bg-inherit opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      aria-label={
                        chat.isPinned
                          ? `Unpin chat ${chat.name}`
                          : `Pin chat ${chat.name}`
                      }
                      className="h-6 w-6 p-1 text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
                      onClick={(e) => handlePinToggle(e, chat.id)}
                      size="xs"
                      tabIndex={0} // Make focusable when visible
                      title={chat.isPinned ? 'Unpin' : 'Pin'}
                      variant="ghost"
                    >
                      {chat.isPinned ? (
                        <LuPinOff className="h-4 w-4" />
                      ) : (
                        <LuPin className="h-4 w-4" />
                      )}
                    </Button>
                    {/* Use AlertDialog Trigger for Delete */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          aria-label={`Delete chat ${chat.name}`}
                          className="h-6 w-6 p-1 text-neutral-500 hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-500"
                          // onClick={(e) => handleDelete(e, chat.id)} // Handled by AlertDialog Action now
                          size="xs"
                          tabIndex={0} // Make focusable when visible
                          title="Delete"
                          variant="ghost"
                          onClick={(e) => e.stopPropagation()} // Prevent triggering chat selection
                        >
                          <LuTrash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Delete chat "{chat.name}"? This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            onClick={(e) => e.stopPropagation()}
                          >
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(e, chat.id);
                            }} // Pass event here if needed by handler
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer with Version Info */}
      <div className="flex items-center justify-center gap-2 border-t border-neutral-200 p-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        <a
          href="https://github.com/pluveto/daan"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          <LuGithub className="h-4 w-4" />
          <div>
            Daan {version}{' '}
            {commitInfo !== 'N/A' ? `(${commitInfo.slice(0, 7)})` : ''}
          </div>
        </a>
      </div>
    </div>
  );
};
