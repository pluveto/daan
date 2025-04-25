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
import { cn } from '@/lib/utils';
import { Chat } from '@/types';
import React from 'react';
import { LuMessageSquare, LuPin, LuPinOff, LuTrash2 } from 'react-icons/lu';
import { Button } from './ui/Button';

interface ConversationItemProps {
  chat: Chat;
  isActive: boolean;
  onSelect: (chatId: string) => void;
  onPinToggle: (e: React.MouseEvent, chatId: string) => void;
  onDelete: (e: React.MouseEvent, chatId: string) => void;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  chat,
  isActive,
  onSelect,
  onPinToggle,
  onDelete,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(chat.id);
    }
  };

  return (
    <div
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400',
        'hover:bg-neutral-200 dark:hover:bg-neutral-800',
        isActive
          ? 'bg-neutral-200 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
          : 'text-neutral-700 dark:text-neutral-300',
      )}
      key={chat.id}
      onClick={() => onSelect(chat.id)}
      onKeyDown={handleKeyDown}
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
            chat.isPinned ? `Unpin chat ${chat.name}` : `Pin chat ${chat.name}`
          }
          className="h-6 w-6 p-1 text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
          onClick={(e) => onPinToggle(e, chat.id)}
          size="xs"
          tabIndex={0}
          title={chat.isPinned ? 'Unpin' : 'Pin'}
          variant="ghost"
        >
          {chat.isPinned ? (
            <LuPinOff className="h-4 w-4" />
          ) : (
            <LuPin className="h-4 w-4" />
          )}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              aria-label={`Delete chat ${chat.name}`}
              className="h-6 w-6 p-1 text-neutral-500 hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-500"
              size="xs"
              tabIndex={0}
              title="Delete"
              variant="ghost"
              onClick={(e) => e.stopPropagation()} // Prevent triggering chat selection
            >
              <LuTrash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                Delete chat "{chat.name}"? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => onDelete(e, chat.id)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};
