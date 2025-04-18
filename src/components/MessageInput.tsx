import { cn } from '@/lib/utils.ts';
import {
  abortControllerAtom, // Import abort controller state
  activeChatAtom,
  apiBaseUrlAtom,
  apiKeyAtom,
  appendContentToMessageAtom, // Import setters used by callOpenAIStreamLogic
  callOpenAIStreamLogic,
  cancelGenerationAtom, // Import cancel action
  defaultMaxHistoryAtom,
  finalizeStreamingMessageAtom,
  getHistoryForApi,
  isAssistantLoadingAtom,
  regenerateLastResponseAtom,
  upsertMessageInActiveChatAtom,
} from '@/store/atoms.ts';
import type { Message } from '@/types.ts';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useCallback, useEffect, useRef, useState } from 'react';
// Use a different icon for Stop, e.g., LuSquare or LuX
import { LuLoader, LuRefreshCw, LuSend, LuSquare } from 'react-icons/lu';
import { v4 as uuidv4 } from 'uuid';
import { Button } from './ui/Button.tsx';
import { Textarea } from './ui/Textarea.tsx';

export const MessageInput: React.FC = () => {
  const [input, setInput] = useState('');
  const upsertMessage = useSetAtom(upsertMessageInActiveChatAtom);
  const [isLoading, setIsLoading] = useAtom(isAssistantLoadingAtom); // Global loading state
  const activeChat = useAtomValue(activeChatAtom);
  const apiKey = useAtomValue(apiKeyAtom);
  const apiBaseUrl = useAtomValue(apiBaseUrlAtom);
  const globalDefaultMaxHistory = useAtomValue(defaultMaxHistoryAtom);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get setters/actions needed for API call and cancellation
  const appendContent = useSetAtom(appendContentToMessageAtom);
  const finalizeStream = useSetAtom(finalizeStreamingMessageAtom);
  const setAbortController = useSetAtom(abortControllerAtom);
  const cancelGeneration = useSetAtom(cancelGenerationAtom);
  const regenerateAction = useSetAtom(regenerateLastResponseAtom);

  // Get abort controller state to manage button state correctly
  const abortInfo = useAtomValue(abortControllerAtom);

  const maxHistory = activeChat?.maxHistory ?? globalDefaultMaxHistory;

  const handleSend = useCallback(() => {
    const trimmedInput = input.trim();
    // Prevent sending if already loading, no input, or no active chat
    if (!trimmedInput || !activeChat || isLoading) return;

    // Context Clearing
    if (trimmedInput === '---') {
      const dividerMessage: Message = {
        id: uuidv4(),
        role: 'divider',
        content: '---',
        timestamp: Date.now(),
      };
      upsertMessage(dividerMessage);
      setInput('');
      textareaRef.current?.focus();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now(),
    };
    upsertMessage(userMessage);

    const messagesToSend = getHistoryForApi(
      [...activeChat.messages, userMessage],
      maxHistory,
      activeChat.systemPrompt,
    );

    // Call API logic, passing all required setters/functions
    callOpenAIStreamLogic(
      apiKey,
      apiBaseUrl,
      activeChat.model,
      messagesToSend,
      setIsLoading, // Sets the global loading flag
      upsertMessage, // Adds/updates messages
      appendContent, // Appends streaming content
      finalizeStream, // Finalizes message state (isStreaming=false, sets loading false)
      setAbortController, // Stores the AbortController instance
    );

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [
    input,
    activeChat,
    isLoading, // Dependency: Prevent sending while loading
    maxHistory,
    apiKey,
    apiBaseUrl,
    upsertMessage,
    setIsLoading,
    appendContent,
    finalizeStream,
    setAbortController, // Include setters passed to callOpenAIStreamLogic
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      // Prevent Enter send while loading
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200;
      const borderAndPadding = textarea.offsetHeight - textarea.clientHeight;
      textarea.style.height = `${Math.min(scrollHeight + borderAndPadding, maxHeight)}px`;
    }
  }, [input]);

  // Can regenerate if not loading AND the last message exists and is from the assistant
  const canRegenerate =
    !isLoading &&
    activeChat &&
    activeChat.messages.length > 0 &&
    activeChat.messages[activeChat.messages.length - 1].role === 'assistant' &&
    !activeChat.messages[activeChat.messages.length - 1].isStreaming; // Don't allow regenerate if last message is still streaming

  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-end space-x-2 border-t border-neutral-200 bg-neutral-50 p-3 md:p-4 dark:border-neutral-700 dark:bg-neutral-900/50',
      )}
    >
      {/* Regenerate Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={regenerateAction}
        disabled={!canRegenerate || isLoading} // Also disable if loading
        className={cn(
          'flex-shrink-0 self-end',
          (!canRegenerate || isLoading) && 'cursor-not-allowed opacity-50',
        )}
        aria-label="Regenerate last response"
        title="Regenerate last response"
      >
        {/* Optional: Show loader on regenerate button if regenerate itself takes time? Not implemented here. */}
        <LuRefreshCw className={cn('h-5 w-5')} />
      </Button>

      {/* Message Input Area */}
      <Textarea
        ref={textareaRef}
        rows={1}
        placeholder={
          isLoading
            ? 'Assistant is thinking...'
            : activeChat
              ? "Type message or '---' to clear context..."
              : 'Select or create a chat first'
        }
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn(
          'max-h-[200px] min-h-[40px] flex-1 resize-none overflow-y-auto',
          'rounded-md border px-3 py-2',
          'focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none',
          'bg-white placeholder-neutral-400 dark:bg-neutral-800 dark:placeholder-neutral-500',
        )}
        disabled={!activeChat || isLoading} // Disable input while loading
        aria-label="Chat message input"
      />

      {/* Send / Stop Button */}
      <Button
        onClick={isLoading ? cancelGeneration : handleSend} // Click action depends on loading state
        // Disable Send if no input/chat OR if loading AND no abort controller yet (brief moment)
        // Disable Stop if not loading
        disabled={
          isLoading
            ? !abortInfo // Disable Stop briefly until controller is ready
            : !input.trim() || !activeChat // Disable Send if no input/chat
        }
        size="icon"
        variant={isLoading ? 'destructive' : 'default'} // Style Stop button differently
        className="flex-shrink-0 self-end"
        aria-label={isLoading ? 'Stop generation' : 'Send message'}
        title={isLoading ? 'Stop generation' : 'Send message'}
      >
        {isLoading ? (
          <LuSquare className="h-5 w-5" />
        ) : (
          <LuSend className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
};
