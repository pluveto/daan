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
  const [input, setInputRaw] = useState(activeChat?.input ?? '');

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
        // Changed to flex-col for vertical layout
        'flex flex-shrink-0 flex-col border-t border-neutral-200 bg-neutral-50 px-4 pt-2 pb-4 dark:border-neutral-700 dark:bg-neutral-900/50',
        // Removed items-end and space-x-2 from the main container
      )}
    >
      {/* Top Toolbar Area */}
      <div className="flex items-center space-x-2 pb-2">
        {' '}
        {/* Added padding-bottom */}
        {/* Regenerate Button - Moved to Toolbar */}
        <Button
          aria-label="Regenerate last response"
          className={cn(
            'flex-shrink-0', // Removed self-end
            (!canRegenerate || isLoading) && 'cursor-not-allowed opacity-50',
          )}
          disabled={!canRegenerate || isLoading}
          onClick={regenerateAction}
          size="xs"
          variant="ghost"
          title="Regenerate last response"
        >
          {/* Made icon slightly smaller for toolbar */}
          <LuRefreshCw className={cn('h-4 w-4')} />
        </Button>
        {/* Add other toolbar buttons here later, e.g.: */}
        {/* <Button size="icon" variant="ghost"><LuPaperclip className="h-4 w-4" /></Button> */}
        {/* <Button size="icon" variant="ghost"><LuMic className="h-4 w-4" /></Button> */}
      </div>

      {/* Bottom Section: Input Area + Send Button */}
      <div className="flex items-end space-x-2">
        {' '}
        {/* Wrapper for Textarea + Send */}
        {/* Message Input Area */}
        <Textarea
          aria-label="Chat message input"
          className={cn(
            'flex-1 resize-none overflow-y-auto', // flex-1 makes it take available space
          )}
          disabled={!activeChat || isLoading}
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
          rows={4}
          value={input}
          variant="flat" // Assuming this variant exists and is desired
        />
        {/* Send / Stop Button - Stays on the right */}
        <Button
          aria-label={isLoading ? 'Stop generation' : 'Send message'}
          className="flex-shrink-0 self-end" // Aligns button to bottom if textarea grows
          size="icon"
          title={isLoading ? 'Stop generation' : 'Send message'}
          variant={isLoading ? 'destructive' : 'default'}
          onClick={isLoading ? cancelGeneration : handleSend}
          disabled={isLoading ? !abortInfo : !input.trim() || !activeChat}
        >
          {/* Icon size kept same as original for send button */}
          {isLoading ? (
            <LuSquare className="h-5 w-5" />
          ) : (
            <LuSend className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
};
