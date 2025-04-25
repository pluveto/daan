// src/components/ChatHistory.tsx (Optimized)
import { cn } from '@/lib/utils';
import {
  activeChatAtom,
  editingMessageIdAtom,
  regenerateMessageAtom,
  showEstimatedTokensAtom,
  showTimestampsAtom,
  updateMessageContentAtom,
} from '@/store/index';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useCallback, useEffect, useRef } from 'react';
// Import the memoized ChatMessageItem
import { ChatMessageItem } from './ChatMessageItem';

interface ChatHistoryProps {
  className?: string;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ className }) => {
  const [activeChat] = useAtom(activeChatAtom);
  const messages = activeChat?.messages ?? [];
  const [editingId, setEditingId] = useAtom(editingMessageIdAtom);
  // const [editContent, setEditContent] = useState(''); // REMOVED - State moved to child
  const updateMessageContent = useSetAtom(updateMessageContentAtom);
  const showTimestamps = useAtomValue(showTimestampsAtom);
  const showEstimatedTokens = useAtomValue(showEstimatedTokensAtom);
  const regenerateResponse = useSetAtom(regenerateMessageAtom); // Stable setter

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // --- Scrolling Logic (largely unchanged, dependencies are stable) ---
  const checkScrollPosition = useCallback(() => {
    const element = scrollRef.current;
    if (element) {
      const threshold = 50; // User is considered "near bottom" if within 50px
      isNearBottomRef.current =
        element.scrollHeight - element.scrollTop - element.clientHeight <
        threshold;
    }
  }, []); // No dependencies needed

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior });
    }
  }, []); // No dependencies needed

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.addEventListener('scroll', checkScrollPosition, {
        passive: true,
      }); // Use passive listener
      return () => element.removeEventListener('scroll', checkScrollPosition);
    }
  }, [checkScrollPosition]); // Stable dependency

  // Auto-scroll effect
  useEffect(() => {
    const lastMessage = messages.at(-1);
    // Scroll if a new message is added OR the last one is streaming, AND user is near bottom
    const shouldScroll =
      (messages.length > 0 || lastMessage?.isStreaming) &&
      isNearBottomRef.current;

    if (shouldScroll) {
      // RAF ensures scroll happens after paint, smoother experience
      requestAnimationFrame(() => {
        // Small delay helps ensure content (especially streaming) is rendered before scroll
        const delay = lastMessage?.isStreaming ? 50 : 0;
        setTimeout(() => {
          // Double-check if still near bottom after delay, user might have scrolled up
          if (isNearBottomRef.current) {
            // 'auto' is instant, good for streaming updates
            scrollToBottom(lastMessage?.isStreaming ? 'auto' : 'smooth');
          }
        }, delay);
      });
    }
    // Check scroll position immediately when messages change (e.g., initial load)
    // checkScrollPosition(); // Optional: Check immediately if needed
  }, [messages, scrollToBottom]); // Rerun only when messages array ref changes or scrollToBottom changes (it shouldn't)

  // --- Editing Logic ---
  // Effect to load content when editing starts is REMOVED - Handled inside ChatMessageItem

  // useCallback for save handler - ACCEPTS new content from child
  const handleSaveEdit = useCallback(
    (newContent: string) => {
      if (!editingId) {
        console.warn('Save attempted without an editingId');
        return;
      }
      // Content validation (trimming, non-empty) is now inside ChatMessageItem's handleSave

      updateMessageContent({
        messageId: editingId,
        newContent: newContent, // Use the content passed from the child
      });
      setEditingId(null); // Exit edit mode after saving
    },
    [editingId, updateMessageContent, setEditingId], // Dependencies
  );

  // useCallback for cancel handler - Passed to ChatMessageItem
  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, [setEditingId]); // Stable dependency

  // handleEditKeyDown is REMOVED - Logic moved into ChatMessageItem

  // --- Rendering ---
  return (
    <div
      className={cn(
        'relative flex-1 space-y-4 overflow-y-auto p-4 md:p-6', // Reduced default spacing slightly
        className,
      )}
      ref={scrollRef}
      role="log" // Better accessibility
      aria-live="polite" // Announce new messages (assistive tech)
    >
      {/* Empty State */}
      {messages.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-neutral-500 dark:text-neutral-400">
            Send a message to start the conversation.
          </p>
        </div>
      )}

      {/* Map Messages to Memoized Component */}
      {messages.map((message) => {
        // Filter out system messages before mapping
        if (message.role === 'system') {
          return null;
        }

        // Handle Dividers directly (no change needed here)
        if (message.role === 'divider') {
          return (
            <div
              aria-label="Context Cleared"
              className="relative py-3"
              key={message.id}
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 flex items-center"
              >
                <div className="w-full border-t border-dashed border-neutral-300 dark:border-neutral-700"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-2 text-xs text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
                  Context Cleared
                </span>
              </div>
            </div>
          );
        }

        // Render the memoized ChatMessageItem for user/assistant messages
        return (
          <ChatMessageItem
            key={message.id} // Essential for React list updates
            message={message}
            isEditing={message.id === editingId} // Determine if this item is the one being edited
            onSave={handleSaveEdit} // Pass the MODIFIED save handler
            onCancelEdit={handleCancelEdit} // Pass stable cancel handler
            showTimestamps={showTimestamps}
            showEstimatedTokens={showEstimatedTokens}
            onRegenerate={() => regenerateResponse(message.id)} // Pass stable setter
          />
        );
      })}
      {/* Spacer at the bottom helps with scrolling */}
      <div className="h-4 w-full flex-shrink-0"></div>
    </div>
  );
};
