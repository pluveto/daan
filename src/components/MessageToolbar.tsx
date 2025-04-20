// src/components/MessageToolbar.tsx
import { cn } from '@/lib/utils.ts';
import {
  deleteMessageFromActiveChatAtom,
  isAssistantLoadingAtom, // Check loading state
  setEditingMessageIdAtom,
} from '@/store/index.ts';
import type { Message } from '@/types.ts';
import copy from 'copy-to-clipboard';
import { useAtomValue, useSetAtom } from 'jotai'; // Added useAtomValue
import React from 'react';
import { LuCopy, LuPencil, LuRefreshCw, LuTrash2 } from 'react-icons/lu';
import { Button } from './ui/Button.tsx';

interface MessageToolbarProps {
  message: Message;
  // onRegenerate is now passed directly for the assistant message case
  onRegenerate?: () => void;
}

export const MessageToolbar: React.FC<MessageToolbarProps> = ({
  message,
  onRegenerate,
}) => {
  const deleteMessage = useSetAtom(deleteMessageFromActiveChatAtom);
  const setEditingId = useSetAtom(setEditingMessageIdAtom);
  const isLoading = useAtomValue(isAssistantLoadingAtom); // Check global loading state

  const handleCopy = () => {
    copy(message.content);
    // TODO: Add visual feedback (e.g., tooltip "Copied!")
  };

  const handleDelete = () => {
    // Add confirmation maybe based on message length? Or always confirm.
    if (window.confirm('Are you sure you want to delete this message?')) {
      deleteMessage(message.id);
    }
  };

  const handleEdit = () => {
    setEditingId(message.id);
  };

  // Disable regenerate button if loading or not an assistant message
  const canRegenerate = !!onRegenerate && !isLoading;

  return (
    // Position slightly adjusted, ensure z-index is high enough
    <div className="absolute top-0 right-1 z-10 flex items-center space-x-0.5 rounded-md border border-neutral-200 bg-white p-0.5 opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 md:right-2 dark:border-neutral-700 dark:bg-neutral-900">
      {/* Copy Button */}
      <Button
        aria-label="Copy message"
        onClick={handleCopy}
        size="xs"
        title="Copy"
        variant="ghost"
      >
        <LuCopy className="h-3.5 w-3.5" />
      </Button>

      {/* Regenerate Button */}
      {onRegenerate && (
        <Button
          aria-label="Regenerate response"
          className={cn(!canRegenerate && 'cursor-not-allowed opacity-50')}
          disabled={!canRegenerate} // Disable if loading
          onClick={onRegenerate}
          size="xs"
          title="Regenerate response"
          variant="ghost"
        >
          <LuRefreshCw
            className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')}
          />
        </Button>
      )}

      {/* Edit Button*/}
      {
        <Button
          aria-label="Edit message"
          onClick={handleEdit}
          size="xs"
          title="Edit"
          variant="ghost"
        >
          <LuPencil className="h-3.5 w-3.5" />
        </Button>
      }

      {/* Delete Button */}
      <Button
        aria-label="Delete message"
        className="text-red-500 hover:text-red-600"
        onClick={handleDelete}
        size="xs"
        title="Delete"
        variant="ghost"
      >
        <LuTrash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
