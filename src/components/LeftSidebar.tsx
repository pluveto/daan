import { cn } from '@/lib/utils.ts';
import {
  activeChatIdAtom,
  clearUnpinnedChatsAtom, // Import clear action
  createNewChatAtom,
  deleteChatAtom,
  sortedChatsAtom, // Use sorted chats
  togglePinChatAtom, // Import toggle pin action
} from '@/store/atoms.ts';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React from 'react';
import {
  LuArchiveRestore,
  LuMessageSquare,
  LuPin,
  LuPinOff,
  LuPlus,
  LuTrash2,
} from 'react-icons/lu';
// Added Pin icons
import { Button } from './ui/Button.tsx';

// Get branding from environment variables or use defaults
const appName = import.meta.env.VITE_APP_NAME || 'Daan';
const slogan = import.meta.env.VITE_APP_SLOGAN || 'Opensource Chat UI';
const logoUrl = import.meta.env.VITE_APP_LOGO_URL || '/logo.png'; // Default logo path
const version = import.meta.env.VITE_APP_TAG || 'unknown'; // Default version
// Placeholder for commit info (requires build-time injection usually)
const commitInfo = import.meta.env.VITE_APP_COMMIT_HASH || 'N/A';

export const LeftSidebar: React.FC = () => {
  const chats = useAtomValue(sortedChatsAtom); // Use the derived sorted atom
  const [activeChatId, setActiveChatId] = useAtom(activeChatIdAtom);
  const createNewChat = useSetAtom(createNewChatAtom);
  const deleteChat = useSetAtom(deleteChatAtom);
  const togglePinChat = useSetAtom(togglePinChatAtom);
  const clearUnpinnedChats = useSetAtom(clearUnpinnedChatsAtom);

  const handleDelete = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete this chat?`)) {
      deleteChat(chatId);
    }
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

  return (
    <div className="flex h-full flex-col border-r border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900">
      {/* Header with Branding */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
        <div className="flex items-center gap-3 leading-none">
          <img
            src={logoUrl}
            alt={`${appName} Logo`}
            className="h-10 w-10 flex-shrink-0 rounded-md object-contain"
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
      <div className="flex gap-2 p-3">
        <Button onClick={createNewChat} className="flex-1">
          <LuPlus className="mr-2 h-4 w-4" /> New Chat
        </Button>
        <Button
          onClick={handleClearUnpinned}
          variant="outline"
          size="icon"
          aria-label="Clear Unpinned Chats"
          title="Clear Unpinned Chats"
        >
          <LuArchiveRestore className="h-4 w-4" />
        </Button>
      </div>

      {/* Conversations Header */}
      <div className="px-3 pt-2 pb-1 text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
        Conversations
      </div>

      {/* Chat List */}
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {chats.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No chats yet. Start a new one!
          </p>
        )}
        {chats.map((chat) => (
          <div
            key={chat.id}
            role="button"
            tabIndex={0}
            onClick={() => setActiveChatId(chat.id)}
            onKeyDown={(e) => handleKeyDown(e, chat.id)}
            className={cn(
              'group relative flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400',
              'hover:bg-neutral-200 dark:hover:bg-neutral-800',
              activeChatId === chat.id
                ? 'bg-neutral-200 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                : 'text-neutral-700 dark:text-neutral-300',
            )}
            aria-current={activeChatId === chat.id ? 'page' : undefined}
          >
            {/* Pin Indicator */}
            {chat.isPinned && (
              <LuPin
                className="mr-2 h-3.5 w-3.5 flex-shrink-0 text-blue-500 dark:text-blue-400"
                aria-label="Pinned"
              />
            )}
            {!chat.isPinned && (
              <div className="mr-2 w-3.5 flex-shrink-0"></div> // Placeholder for alignment
            )}
            {/* Icon and Name */}
            <div className="mr-1 flex flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap">
              <span className="mr-2 flex-shrink-0 text-lg">
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
                variant="ghost"
                size="xs" // Use smaller size if available or adjust padding
                className="h-6 w-6 p-1 text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
                onClick={(e) => handlePinToggle(e, chat.id)}
                aria-label={
                  chat.isPinned
                    ? `Unpin chat ${chat.name}`
                    : `Pin chat ${chat.name}`
                }
                title={chat.isPinned ? 'Unpin' : 'Pin'}
                tabIndex={0}
              >
                {chat.isPinned ? (
                  <LuPinOff className="h-4 w-4" />
                ) : (
                  <LuPin className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="xs" // Use smaller size
                className="h-6 w-6 p-1 text-neutral-500 hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-500"
                onClick={(e) => handleDelete(e, chat.id)}
                aria-label={`Delete chat ${chat.name}`}
                title="Delete"
                tabIndex={0}
              >
                <LuTrash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer with Version Info */}
      <div className="border-t border-neutral-200 p-3 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        Version: {version}{' '}
        {commitInfo !== 'N/A' ? `(${commitInfo.substring(0, 7)})` : ''}
      </div>
    </div>
  );
};
