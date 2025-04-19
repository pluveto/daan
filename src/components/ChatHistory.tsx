// src/components/ChatHistory.tsx
import { cn } from '@/lib/utils.ts';
import {
  activeChatAtom,
  editingMessageIdAtom,
  regenerateLastResponseAtom, // Import regenerate action
  showEstimatedTokensAtom,
  showTimestampsAtom, // Import showTimestampsAtom
  updateMessageContentAtom,
} from '@/store/atoms.ts';
import type { Message } from '@/types.ts';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { LucideBarChart } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LuBot, LuClock, LuLoader, LuUser } from 'react-icons/lu'; // Added LuClock

import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { approximateTokenSize } from 'tokenx';
import { MessageToolbar } from './MessageToolbar.tsx';
import { Button } from './ui/Button.tsx';
import { CodeBlock } from './ui/CodeBlock.tsx';
import { Textarea } from './ui/Textarea.tsx';

interface ChatHistoryProps {
  className?: string;
}

// Helper function to format timestamp
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  // Example format: 1:30 PM (adjust as needed)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const msgPostProcess = (content: string) => {
  let tmp = content;

  let isThinking = tmp.search(/<\/think>/) === -1;
  let iconThoughts = `<div class="relative w-5 h-5 flex items-center justify-center rounded-full bg-green-200 dark:bg-green-600">
  <svg class="w-4 h-4 text-green-500 dark:text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
  </svg>
</div>`;

  let iconThinking = `<div class="relative w-5 h-5">
            <div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-purple-500"></div>
          </div>`;

  tmp = tmp.replace(
    /<think>/g,
    '<div class="thought">' +
      `<div class="flex gap-2 items-center my-1">
          ${isThinking ? iconThinking : iconThoughts}
          <span class="font-bold text-neutral-500 dark:text-neutral-400">${isThinking ? 'Thinking' : 'Thoughts'}</span>
        </div>`,
  );

  if (isThinking) {
    tmp += '</div>';
  } else {
    tmp = tmp.replace(/<\/think>/g, '</div>');
  }

  return tmp;
};

export const ChatHistory: React.FC<ChatHistoryProps> = ({ className }) => {
  const [activeChat] = useAtom(activeChatAtom);
  const messages = activeChat?.messages ?? [];
  const [editingId, setEditingId] = useAtom(editingMessageIdAtom);
  const [editContent, setEditContent] = useState('');
  const updateMessageContent = useSetAtom(updateMessageContentAtom);
  const showTimestamps = useAtomValue(showTimestampsAtom); // Get timestamp visibility
  const showEstimatedTokens = useAtomValue(showEstimatedTokensAtom); // Get timestamp visibility
  const regenerateLastResponse = useSetAtom(regenerateLastResponseAtom); // Get regenerate action

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

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
      element.scrollTo({ behavior, top: element.scrollHeight });
    }
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.addEventListener('scroll', checkScrollPosition);
      return () => element.removeEventListener('scroll', checkScrollPosition);
    }
  }, [checkScrollPosition]);

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom('smooth');
    }
    const lastMessage = messages.at(-1);
    if (lastMessage?.isStreaming && messages.length > 0) {
      setTimeout(() => {
        if (isNearBottomRef.current) {
          scrollToBottom('auto');
        }
      }, 50);
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (editingId) {
      const messageToEdit = messages.find((m) => m.id === editingId);
      setEditContent(messageToEdit?.content ?? '');
    } else {
      setEditContent('');
    }
  }, [editingId, messages]);

  const handleSaveEdit = () => {
    if (!editingId || !editContent.trim()) {
      return;
    }
    updateMessageContent({
      messageId: editingId,
      newContent: editContent.trim(),
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const getSenderName = (role: Message['role']) => {
    switch (role) {
      case 'user':
        return 'You';
      case 'assistant':
        return 'Assistant';
      case 'system':
        return 'System';
      case 'divider':
        return ''; // No name for divider
      default:
        return 'Unknown';
    }
  };

  const getSenderIcon = (role: Message['role']) => {
    switch (role) {
      case 'user':
        return <LuUser className="h-4 w-4" />;
      case 'assistant':
        return <LuBot className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        'relative flex-1 space-y-6 overflow-y-auto p-4 md:p-6',
        className,
      )}
      ref={scrollRef}
    >
      {messages.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-neutral-500 dark:text-neutral-400">
            Send a message to start the conversation.
          </p>
        </div>
      )}
      {messages.map((message) => {
        const isSystem = message.role === 'system';
        const isDivider = message.role === 'divider'; // Check for divider role
        const isEditing = message.id === editingId;
        const numTokens = approximateTokenSize(message.content);

        // Optionally hide system messages
        if (isSystem) {
          return null;
        }

        // Render divider
        if (isDivider) {
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
        return (
          <div
            className={cn(
              'group message-item relative flex flex-col', // Use flex-col
              { 'message-editing': isEditing },
            )}
            key={message.id}
          >
            {/* Sender Info and Timestamp */}
            <div className="mb-1.5 flex items-center space-x-2 text-sm font-medium text-neutral-900 dark:text-neutral-200">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full">
                {getSenderIcon(message.role)}
              </span>
              <span className="font-semibold">
                {getSenderName(message.role)}
              </span>
              {showTimestamps && (
                <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                  <LuClock className="h-3 w-3" />
                  {formatTimestamp(message.timestamp)}
                </span>
              )}
              {showEstimatedTokens && message.content && (
                <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                  <LucideBarChart className="h-3 w-3" />
                  {numTokens} token{numTokens === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {/* Message Content / Editor */}
            <div className="ml-8 flex-1">
              {' '}
              {/* Ensure content takes remaining space */}
              <div className="prose prose-sm dark:prose-invert prose-p:my-1 prose-pre:my-1 max-w-none">
                {!isEditing ? (
                  <>
                    <ReactMarkdown
                      components={{
                        code: CodeBlock,
                        p: ({ children }) => (
                          <div className="mb-2">{children}</div>
                        ),
                      }}
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
                    >
                      {msgPostProcess(message.content)}
                    </ReactMarkdown>
                    {message.isStreaming && (
                      <LuLoader className="ml-1 inline-block h-4 w-4 animate-spin text-neutral-500 dark:text-neutral-400" />
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      autoFocus
                      className="min-h-[60px] w-full resize-none text-sm"
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      rows={Math.max(3, editContent.split('\n').length)}
                      value={editContent}
                    />
                    <div className="flex justify-end space-x-2">
                      <Button
                        onClick={handleCancelEdit}
                        size="sm"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={!editContent.trim()}
                        onClick={handleSaveEdit}
                        size="sm"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hover Toolbar (only show if not editing and not streaming) */}
            {!isEditing && !message.isStreaming && (
              <MessageToolbar
                message={message}
                onRegenerate={regenerateLastResponse}
              />
            )}
          </div>
        );
      })}
      <div className="h-4"></div> {/* Spacer */}
    </div>
  );
};
