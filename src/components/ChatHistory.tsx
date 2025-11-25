import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  activeChatMessagesAtom,
  editingMessageIdAtom,
  isLoadingActiveChatAtom,
  regenerateMessageAtom,
  showEstimatedTokensAtom,
  showTimestampsAtom,
  updateExistingMessageContentAtom,
} from '@/store/index';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { LuArrowDown } from 'react-icons/lu';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { ChatMessageItem } from './ChatMessageItem';

interface ChatHistoryProps {
  className?: string;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ className }) => {
  const allMessages = useAtomValue(activeChatMessagesAtom);
  const isLoading = useAtomValue(isLoadingActiveChatAtom);
  const [editingId, setEditingId] = useAtom(editingMessageIdAtom);
  const showTimestamps = useAtomValue(showTimestampsAtom);
  const showEstimatedTokens = useAtomValue(showEstimatedTokensAtom);

  const updateMessageContent = useSetAtom(updateExistingMessageContentAtom);
  const regenerateResponse = useSetAtom(regenerateMessageAtom);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const visibleMessages = useMemo(() => {
    return allMessages.filter((m) => m.role !== 'system');
  }, [allMessages]);

  const handleSaveEdit = useCallback(
    (messageId: string, newContent: string) => {
      if (!messageId) {
        return;
      }
      updateMessageContent({ messageId, newContent });
      setEditingId(null);
    },
    [updateMessageContent, setEditingId],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, [setEditingId]);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: visibleMessages.length - 1,
      align: 'end',
      behavior: 'smooth',
    });
  }, [visibleMessages.length]);

  const Footer = useCallback(() => {
    return <div className="h-4 w-full flex-shrink-0" />;
  }, []);

  const followOutputBehavior = useCallback((isAtBottom: boolean) => {
    return isAtBottom ? 'auto' : false;
  }, []);

  return (
    <div className={cn('relative flex-1 overflow-hidden', className)}>
      {!isLoading && visibleMessages.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-neutral-500 dark:text-neutral-400">
            Send a message to start the conversation.
          </p>
        </div>
      )}

      <Virtuoso
        ref={virtuosoRef}
        data={visibleMessages}
        initialTopMostItemIndex={visibleMessages.length - 1}
        followOutput={followOutputBehavior}
        atBottomStateChange={(isAtBottom) => {
          setShowScrollButton(!isAtBottom);
        }}
        atBottomThreshold={50}
        itemContent={(index, message) => (
          <div className="px-4 py-2 md:px-6">
            <ChatMessageItem
              message={message}
              isEditing={message.id === editingId}
              onSave={(newContent) => handleSaveEdit(message.id, newContent)}
              onCancelEdit={handleCancelEdit}
              showTimestamps={showTimestamps}
              showEstimatedTokens={showEstimatedTokens}
              onRegenerate={() => regenerateResponse(message.id)}
            />
          </div>
        )}
        components={{
          Footer,
        }}
        className="h-full w-full scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700"
      />

      {showScrollButton && (
        <Button
          size="icon"
          variant="secondary"
          className="absolute bottom-6 right-6 z-20 rounded-full shadow-md opacity-80 hover:opacity-100"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <LuArrowDown className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
};
