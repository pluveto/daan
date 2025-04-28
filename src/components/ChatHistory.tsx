// src/components/ChatHistory.tsx (Updated - Phase 5)
import { cn } from '@/lib/utils';
import {
  activeChatMessagesAtom, // Use new messages atom
  editingMessageIdAtom,
  isLoadingActiveChatAtom, // Use loading state atom
  regenerateMessageAtom,
  showEstimatedTokensAtom,
  showTimestampsAtom,
  updateExistingMessageContentAtom, // Use updated action name
} from '@/store/index';
import type { MessageEntity } from '@/types'; // Use internal type
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useCallback, useEffect, useRef } from 'react';
import { ChatMessageItem } from './ChatMessageItem'; // Expects AppInternalMessage now

interface ChatHistoryProps {
  className?: string;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ className }) => {
  // Read new state atoms
  const messages = useAtomValue(activeChatMessagesAtom);
  const isLoading = useAtomValue(isLoadingActiveChatAtom); // Use loading state if needed for display

  const [editingId, setEditingId] = useAtom(editingMessageIdAtom);
  const updateMessageContent = useSetAtom(updateExistingMessageContentAtom); // Use refactored action
  const showTimestamps = useAtomValue(showTimestampsAtom);
  const showEstimatedTokens = useAtomValue(showEstimatedTokensAtom);
  const regenerateResponse = useSetAtom(regenerateMessageAtom);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // --- Scrolling Logic (largely unchanged) ---
  const checkScrollPosition = useCallback(() => {
    const element = scrollRef.current;
    if (element) {
      const threshold = 50;
      isNearBottomRef.current =
        element.scrollHeight - element.scrollTop - element.clientHeight <
        threshold;
    }
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior });
    }
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.addEventListener('scroll', checkScrollPosition, {
        passive: true,
      });
      return () => element.removeEventListener('scroll', checkScrollPosition);
    }
  }, [checkScrollPosition]);

  // Auto-scroll effect - Re-evaluate based on messages array changes
  useEffect(() => {
    // Only scroll if the user is near the bottom
    if (isNearBottomRef.current) {
      // Use requestAnimationFrame for smoother scrolling after render
      requestAnimationFrame(() => {
        // Optional slight delay can help ensure layout completes, especially for streaming
        setTimeout(() => {
          // Double-check if still near bottom after delay
          if (isNearBottomRef.current) {
            const lastMessage = messages.at(-1);
            // 'auto' is instant, good for rapid streaming updates
            scrollToBottom(lastMessage?.isStreaming ? 'auto' : 'smooth');
          }
        }, 50); // Small delay (adjust as needed)
      });
    }
    // Run when the messages array reference changes (new message added, deleted, etc.)
    // Also run when loading finishes, in case content height changed significantly
  }, [messages, isLoading, scrollToBottom]);

  // --- Editing Logic (Save/Cancel passed down) ---
  const handleSaveEdit = useCallback(
    (messageId: string, newContent: string) => {
      // Accept messageId from child now
      if (!messageId) {
        console.warn('Save attempted without an editingId from child');
        return;
      }
      // Call the refactored action
      updateMessageContent({ messageId, newContent });
      // Clear editing state (can also be done in ChatMessageItem on successful save)
      setEditingId(null);
    },
    [updateMessageContent, setEditingId], // Dependencies
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, [setEditingId]);

  // --- Rendering ---
  return (
    <div
      className={cn(
        'relative flex-1 space-y-4 overflow-y-auto p-4 md:p-6', // Adjusted spacing if needed
        className,
      )}
      ref={scrollRef}
      role="log"
      aria-live="polite"
    >
      {/* Empty State - Show only if NOT loading and no messages */}
      {!isLoading && messages.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-neutral-500 dark:text-neutral-400">
            Send a message to start the conversation.
          </p>
        </div>
      )}

      {/* Map Messages */}
      {messages.map((message: MessageEntity) => {
        // Explicitly type message
        // Skip rendering system messages (if any were accidentally stored/loaded)
        // or other non-displayable internal roles
        if (message.role === 'system') {
          return null;
        }

        // Handle Dividers (If you keep using them - requires specific handling/role)
        // if (message.role === 'divider') { ... return divider JSX ... }

        // Render the ChatMessageItem for user/assistant/tool messages
        return (
          <ChatMessageItem
            key={message.id}
            message={message} // Pass AppInternalMessage
            isEditing={message.id === editingId}
            // Pass handlers, ensuring they use message.id
            onSave={(newContent) => handleSaveEdit(message.id, newContent)}
            onCancelEdit={handleCancelEdit}
            showTimestamps={showTimestamps}
            showEstimatedTokens={showEstimatedTokens} // Pass down relevant display settings
            // Pass regenerate action correctly
            onRegenerate={() => regenerateResponse(message.id)}
          />
        );
      })}
      {/* Spacer at the bottom helps with scrolling */}
      <div className="h-4 w-full flex-shrink-0"></div>
    </div>
  );
};
