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
  defaultSummaryModelAtom,
  deleteMessageFromActiveChatAtom,
  finalizeStreamingMessageAtom,
  generateChatTitle,
  generateSummaryAtom,
  getHistoryForApi,
  isAssistantLoadingAtom,
  regenerateLastResponseAtom,
  updateChatAtom,
  upsertMessageInActiveChatAtom,
} from '@/store/atoms.ts';
import type { Message } from '@/types.ts';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useCallback, useEffect, useRef, useState } from 'react';
// Use a different icon for Stop, e.g., LuSquare or LuX
import { LuRefreshCw, LuSend, LuSquare } from 'react-icons/lu';
import { v4 as uuidv4 } from 'uuid';
import { Button } from './ui/Button.tsx';
import { Textarea } from './ui/Textarea.tsx';

export const MessageInput: React.FC = () => {
  const upsertMessage = useSetAtom(upsertMessageInActiveChatAtom);
  const deleteMessage = useSetAtom(deleteMessageFromActiveChatAtom);
  const [isLoading, setIsLoading] = useAtom(isAssistantLoadingAtom); // Global loading state
  const activeChat = useAtomValue(activeChatAtom);
  const [input, setInputRaw] = useState(activeChat?.input);

  const generateSummary = useAtomValue(generateSummaryAtom);

  const apiKey = useAtomValue(apiKeyAtom);
  const apiBaseUrl = useAtomValue(apiBaseUrlAtom);
  const summaryModel = useAtomValue(defaultSummaryModelAtom);
  const globalDefaultMaxHistory = useAtomValue(defaultMaxHistoryAtom);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get setters/actions needed for API call and cancellation
  const appendContent = useSetAtom(appendContentToMessageAtom);
  const finalizeStream = useSetAtom(finalizeStreamingMessageAtom);
  const setAbortController = useSetAtom(abortControllerAtom);
  const cancelGeneration = useSetAtom(cancelGenerationAtom);
  const regenerateAction = useSetAtom(regenerateLastResponseAtom);
  const updateChat = useSetAtom(updateChatAtom);

  const setInput = useCallback(
    (value: string) => {
      if (!activeChat) {
        return;
      }
      setInputRaw(value);
      updateChat({ id: activeChat.id, input: value });
    },
    [activeChat],
  );

  // Get abort controller state to manage button state correctly
  const abortInfo = useAtomValue(abortControllerAtom);

  const maxHistory = activeChat?.maxHistory ?? globalDefaultMaxHistory;

  const handleSend = useCallback(() => {
    const trimmedInput = input.trim();
    // Prevent sending if already loading, no input, or no active chat
    if (!trimmedInput || !activeChat || isLoading) {
      return;
    }

    // Context Clearing
    if (trimmedInput === '---') {
      const lastMessage = activeChat.messages.at(-1);
      if (lastMessage?.content === '---') {
        // revoke last message if it's a divider
        deleteMessage(lastMessage.id);
      } else {
        // add new divider message if there's no divider yet
        const dividerMessage: Message = {
          content: '---',
          id: uuidv4(),
          role: 'divider',
          timestamp: Date.now(),
        };
        upsertMessage(dividerMessage);
      }
      setInput('');
      textareaRef.current?.focus();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

    const userMessage: Message = {
      content: trimmedInput,
      id: uuidv4(),
      role: 'user',
      timestamp: Date.now(),
    };
    upsertMessage(userMessage);

    const messagesToSend = getHistoryForApi(
      [...activeChat.messages, userMessage],
      maxHistory,
      activeChat.systemPrompt.trim(),
    );

    if (
      generateSummary &&
      messagesToSend.filter((msg) => msg.role != 'system').length === 1
    ) {
      let lastMessageToSend = messagesToSend.at(-1);
      if (lastMessageToSend && lastMessageToSend.content) {
        generateChatTitle(
          apiKey,
          apiBaseUrl,
          summaryModel,
          lastMessageToSend.content.toString(),
          activeChat.id,
          updateChat,
        ).then(() => {
          console.log('Generated chat title:', activeChat.name);
        });
      }
    }

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
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
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
    activeChat.messages.at(-1)?.role === 'assistant' &&
    !activeChat.messages.at(-1)?.isStreaming; // Don't allow regenerate if last message is still streaming

  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-end space-x-2 border-t border-neutral-200 bg-neutral-50 p-3 md:p-4 dark:border-neutral-700 dark:bg-neutral-900/50',
      )}
    >
      {/* Regenerate Button */}
      <Button
        aria-label="Regenerate last response"
        className={cn(
          'flex-shrink-0 self-end',
          (!canRegenerate || isLoading) && 'cursor-not-allowed opacity-50',
        )}
        disabled={!canRegenerate || isLoading} // Also disable if loading
        onClick={regenerateAction}
        size="icon"
        title="Regenerate last response"
        variant="outline"
      >
        {/* Optional: Show loader on regenerate button if regenerate itself takes time? Not implemented here. */}
        <LuRefreshCw className={cn('h-5 w-5')} />
      </Button>

      {/* Message Input Area */}
      <Textarea
        aria-label="Chat message input"
        className={cn(
          'max-h-[200px] min-h-[40px] flex-1 resize-none overflow-y-auto',
        )}
        disabled={!activeChat || isLoading} // Disable input while loading
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          isLoading
            ? 'Assistant is thinking...'
            : activeChat
              ? "Type message or '---' to clear context..."
              : 'Select or create a chat first'
        }
        ref={textareaRef}
        rows={1}
        value={input}
        variant="flat"
      />

      {/* Send / Stop Button */}
      <Button
        aria-label={isLoading ? 'Stop generation' : 'Send message'}
        className="flex-shrink-0 self-end"
        size="icon"
        title={isLoading ? 'Stop generation' : 'Send message'}
        variant={isLoading ? 'destructive' : 'default'} // Style Stop button differently
        onClick={isLoading ? cancelGeneration : handleSend} // Click action depends on loading state
        // Disable Send if no input/chat OR if loading AND no abort controller yet (brief moment)
        // Disable Stop if not loading
        disabled={
          isLoading
            ? !abortInfo // Disable Stop briefly until controller is ready
            : !input.trim() || !activeChat // Disable Send if no input/chat
        }
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
