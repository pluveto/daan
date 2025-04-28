// src/components/ConversationItem.tsx (Updated - Phase 5)
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
import { cn } from '@/lib/utils';
import type { ChatMetadata } from '@/services/ChatDataService'; // Import ChatMetadata
import React from 'react';
import { LuPin, LuPinOff, LuTrash2 } from 'react-icons/lu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/Tooltip';

interface ConversationItemProps {
  chat: ChatMetadata; // Use ChatMetadata instead of Chat
  isActive: boolean;
  onSelect: (chatId: string) => void;
  onPinToggle: (e: React.MouseEvent, chatId: string) => void;
  onDelete: (e: React.MouseEvent, chatId: string) => void; // Keep this, confirmation is internal
}

export const ConversationItem: React.FC<ConversationItemProps> = React.memo(
  ({ chat, isActive, onSelect, onPinToggle, onDelete }) => {
    const handleDeleteConfirm = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent selecting chat
      onDelete(e, chat.id); // Call the passed delete handler
    };

    return (
      <TooltipProvider delayDuration={300}>
        <div
          className={cn(
            'group flex cursor-pointer items-center rounded-md px-3 py-2 text-sm transition-colors duration-100 hover:bg-neutral-200 dark:hover:bg-neutral-800',
            isActive
              ? 'bg-neutral-200/60 dark:bg-neutral-800/50'
              : 'text-neutral-700 dark:text-neutral-300',
          )}
          onClick={() => onSelect(chat.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onSelect(chat.id);
          }}
          aria-current={isActive ? 'page' : undefined}
        >
          <span className="mr-2 flex-shrink-0 text-lg">
            {chat.icon || '💬'}
          </span>
          <span className="truncate flex-1" title={chat.name}>
            {chat.name || 'Untitled Chat'}
          </span>
          <div className="ml-2 flex flex-shrink-0 items-center space-x-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus-within:opacity-100">
            {/* Pin Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Stop propagation on button click too */}
                <Button
                  aria-label={chat.isPinned ? 'Unpin chat' : 'Pin chat'}
                  size="xs"
                  variant="ghost"
                  className="h-6 w-6 p-1"
                  onClick={(e) => onPinToggle(e, chat.id)}
                >
                  {chat.isPinned ? (
                    <LuPinOff className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <LuPin className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {chat.isPinned ? 'Unpin' : 'Pin'}
              </TooltipContent>
            </Tooltip>

            {/* Delete Button */}
            <AlertDialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogTrigger asChild>
                    <Button
                      aria-label="Delete chat"
                      size="xs"
                      variant="ghost"
                      className="h-6 w-6 p-1 text-red-500 hover:text-red-600"
                      onClick={(e) => e.stopPropagation()} // Prevent select, trigger dialog
                    >
                      <LuTrash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Delete</TooltipContent>
              </Tooltip>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    the chat "{chat.name || 'Untitled Chat'}" and all its
                    messages.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDeleteConfirm} // Use wrapper to call onDelete
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </TooltipProvider>
    );
  },
);
