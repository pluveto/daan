import { cn } from '@/lib/utils.ts';
import {
  abortControllerAtom,
  activeChatAtom,
  apiBaseUrlAtom,
  apiKeyAtom,
  appendContentToMessageAtom,
  callOpenAIStreamLogic,
  cancelGenerationAtom,
  defaultMaxHistoryAtom,
  defaultSummaryModelAtom,
  deleteMessageFromActiveChatAtom,
  finalizeStreamingMessageAtom,
  focusInputAtom,
  generateChatTitle,
  generateSummaryAtom,
  getHistoryForApi,
  isAssistantLoadingAtom,
  regenerateLastResponseAtom,
  showEstimatedTokensAtom,
  updateChatAtom,
  upsertMessageInActiveChatAtom,
} from '@/store/atoms.ts';
import type { Message } from '@/types.ts';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import _ from 'lodash'; // Import lodash debounce

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LuChartBar, LuRefreshCw, LuSend, LuSquare } from 'react-icons/lu';
import { approximateTokenSize } from 'tokenx';
import { v4 as uuidv4 } from 'uuid';
import { Button } from './ui/Button.tsx';
import { Textarea } from './ui/Textarea.tsx';

const debounce = _.debounce;

const DEBOUNCE_DELAY = 400; // Delay in milliseconds for debouncing global state update

export const MessageInput: React.FC = () => {
  // --- Hooks for Jotai Atoms ---
  const [isLoading, setIsLoading] = useAtom(isAssistantLoadingAtom);
  const [activeChat] = useAtom(activeChatAtom); // Get the whole chat object to access id and input
  const updateChat = useSetAtom(updateChatAtom);
  const upsertMessage = useSetAtom(upsertMessageInActiveChatAtom);
  const deleteMessage = useSetAtom(deleteMessageFromActiveChatAtom);
  const appendContent = useSetAtom(appendContentToMessageAtom);
  const finalizeStream = useSetAtom(finalizeStreamingMessageAtom);
  const setAbortController = useSetAtom(abortControllerAtom);
  const cancelGeneration = useSetAtom(cancelGenerationAtom);
  const regenerateAction = useSetAtom(regenerateLastResponseAtom);
  const abortInfo = useAtomValue(abortControllerAtom);
  const apiKey = useAtomValue(apiKeyAtom);
  const apiBaseUrl = useAtomValue(apiBaseUrlAtom);
  const generateSummary = useAtomValue(generateSummaryAtom);
  const summaryModel = useAtomValue(defaultSummaryModelAtom);
  const showEstimatedTokens = useAtomValue(showEstimatedTokensAtom);
  const globalDefaultMaxHistory = useAtomValue(defaultMaxHistoryAtom);
  const triggerFocus = useAtomValue(focusInputAtom); // Get focus trigger value

  // --- Local State ---
  // Local state for the textarea, updated immediately on change
  const [input, setInputRaw] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false); // State for IME composition

  // --- State Synchronization ---
  // Effect to sync local state when activeChat changes (e.g., switching chats)
  useEffect(() => {
    // Set the local input to the value stored in the newly selected chat
    setInputRaw(activeChat?.input ?? '');

    // When the chat changes, we assume any previously typed input for the *old* chat
    // shouldn't be saved anymore. We can cancel any pending debounced updates.
    // Note: `debouncedUpdateGlobalInput` is recreated by useCallback when activeChat.id changes,
    // effectively cancelling for the old ID, but explicit cancellation is safer.
    // We need to ensure the debounced function reference is stable or managed correctly.
    // The useCallback below handles recreation, so explicit cancel might not be strictly necessary
    // unless the component unmounts. Let's rely on useCallback recreation for simplicity here.
  }, [activeChat]); // Re-run when the activeChat object reference changes

  // --- Debounced Global State Update ---
  // Create a debounced function to update the global Jotai state
  const debouncedUpdateGlobalInput = useCallback(
    debounce((value: string) => {
      if (activeChat) {
        console.log('Debounced: Updating global input state with', value);
        updateChat({ id: activeChat.id, input: value });
      }
    }, DEBOUNCE_DELAY),
    [activeChat?.id, updateChat], // Dependencies: Recreate debounce if chat ID or update function changes
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedUpdateGlobalInput.cancel();
    };
  }, [debouncedUpdateGlobalInput]);

  // --- Effect for focusing input ---
  useEffect(() => {
    // Check triggerFocus > 0 to avoid focus on initial load if atom default is 0
    if (triggerFocus > 0 && textareaRef.current) {
      console.log('Focusing input triggered');
      // Small delay might sometimes help ensure element is fully ready after state updates
      // setTimeout(() => textareaRef.current?.focus(), 0);
      textareaRef.current?.focus();
    }
  }, [triggerFocus]); // Depend only on the trigger value

  // --- Input Change Handler ---
  // Updates local state instantly and triggers the debounced global update
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setInputRaw(newValue); // Update local state immediately for responsive typing
      debouncedUpdateGlobalInput(newValue); // Schedule global state update
    },
    [debouncedUpdateGlobalInput], // Dependency on the debounced function
  );

  // --- Send Message Logic ---
  const maxHistory = activeChat?.maxHistory ?? globalDefaultMaxHistory;
  const handleSend = useCallback(() => {
    const trimmedInput = input.trim(); // Read from local state
    if (!trimmedInput || !activeChat || isLoading) {
      return;
    }

    // Immediately clear the debounced global update since we are sending
    debouncedUpdateGlobalInput.cancel();
    // Optionally update global state to empty string immediately on send
    // updateChat({ id: activeChat.id, input: '' }); // Uncomment if you want draft cleared instantly

    // Context Clearing ('---')
    if (trimmedInput === '---') {
      const lastMessage = activeChat.messages.at(-1);
      if (lastMessage?.content === '---') {
        deleteMessage(lastMessage.id);
      } else {
        const dividerMessage: Message = {
          content: '---',
          id: uuidv4(),
          role: 'divider',
          timestamp: Date.now(),
        };
        upsertMessage(dividerMessage);
      }
      setInputRaw(''); // Clear local input
      debouncedUpdateGlobalInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      textareaRef.current?.focus();
      return;
    }

    // Standard Message Sending
    const userMessage: Message = {
      content: trimmedInput,
      id: uuidv4(),
      role: 'user',
      timestamp: Date.now(),
    };
    upsertMessage(userMessage);

    const messagesToSend = getHistoryForApi(
      [...activeChat.messages, userMessage], // Use updated messages list
      maxHistory,
      activeChat.systemPrompt?.trim(), // Use optional chaining for safety
    );

    // Generate Title (Async)
    if (
      !activeChat.characterId &&
      generateSummary &&
      messagesToSend.filter((msg) => msg.role !== 'system').length === 1
    ) {
      const lastMsgContent = messagesToSend.at(-1)?.content;
      if (lastMsgContent) {
        generateChatTitle(
          apiKey,
          apiBaseUrl,
          summaryModel,
          lastMsgContent.toString(),
          activeChat.id,
          updateChat,
        ).catch((err) => console.error('Failed to generate title:', err)); // Add error handling
      }
    }

    // Call API Stream Logic
    callOpenAIStreamLogic(
      apiKey,
      apiBaseUrl,
      activeChat.model,
      messagesToSend,
      setIsLoading,
      upsertMessage,
      appendContent,
      finalizeStream,
      setAbortController,
    );

    // Clear Input & Reset Height & Focus
    setInputRaw(''); // Clear local input state
    debouncedUpdateGlobalInput('');

    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [
    input, // Depends on local input state
    activeChat,
    isLoading,
    maxHistory,
    apiKey,
    apiBaseUrl,
    summaryModel,
    generateSummary,
    upsertMessage,
    deleteMessage,
    setIsLoading,
    appendContent,
    finalizeStream,
    setAbortController,
    updateChat,
    debouncedUpdateGlobalInput, // Include debounced function to cancel it
    // getHistoryForApi and generateChatTitle are stable functions if imported correctly
  ]);

  // --- Keyboard Handler ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Check if Enter is pressed without Shift, not loading, AND not composing
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !isLoading &&
        !isComposing &&
        input.trim()
      ) {
        e.preventDefault(); // Prevent newline
        handleSend();
      }
    },
    [isLoading, handleSend, input, isComposing], // Add isComposing dependency
  ); // Depends on loading state and handleSend callback, and input for the trim check

  // --- Derived State & Memos ---
  const canRegenerate = useMemo(
    () =>
      !isLoading &&
      activeChat &&
      activeChat.messages.length > 0 &&
      activeChat.messages.at(-1)?.role === 'assistant' &&
      !activeChat.messages.at(-1)?.isStreaming,
    [isLoading, activeChat],
  );

  const numTokens = useMemo(
    () => (showEstimatedTokens ? approximateTokenSize(input) : 0), // Calculate based on local input
    [showEstimatedTokens, input],
  ); // Depends on local input

  // --- Render ---
  return (
    <div
      className={cn(
        'flex flex-shrink-0 flex-col border-t border-neutral-200 bg-neutral-50 px-4 pt-2 pb-4 dark:border-neutral-700 dark:bg-neutral-900/50',
      )}
    >
      {/* Top Toolbar Area */}
      <div className="flex items-center space-x-2 pb-2">
        <Button
          aria-label="Regenerate last response"
          className={cn(
            'flex-shrink-0',
            (!canRegenerate || isLoading) && 'cursor-not-allowed opacity-50',
          )}
          disabled={!canRegenerate || isLoading}
          onClick={regenerateAction} // regenerateAction is a stable atom setter
          size="xs"
          variant="ghost"
          title="Regenerate last response"
        >
          <LuRefreshCw className="h-4 w-4" />
        </Button>
        {/* Spacer */}
        <div className="flex-1" />
        {/* Token Counter */}
        {showEstimatedTokens && (
          <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
            <LuChartBar className="h-3 w-3" />
            {numTokens} token{numTokens === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Bottom Section: Input Area + Send Button */}
      <div className="flex items-end space-x-2">
        <Textarea
          ref={textareaRef}
          aria-label="Chat message input"
          className="flex-1 resize-none overflow-y-auto" // Removed min-h-[calc(theme(spacing.12))] if height adjusted by JS
          rows={1} // Start with 1 row, let JS handle expansion
          disabled={!activeChat || isLoading}
          value={input} // Controlled by local state
          onChange={handleInputChange} // Use the combined handler
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
          placeholder={
            isLoading
              ? 'Assistant is thinking...'
              : activeChat
                ? "Type message or '---' to clear context..."
                : 'Select or create a chat first'
          }
          variant="flat"
        />
        <Button
          aria-label={isLoading ? 'Stop generation' : 'Send message'}
          className="flex-shrink-0 self-end"
          size="icon"
          title={isLoading ? 'Stop generation' : 'Send message'}
          variant={isLoading ? 'destructive' : 'default'}
          onClick={isLoading ? cancelGeneration : handleSend} // cancelGeneration is stable setter
          // Disable send if no input, no active chat, OR if loading (unless it's the stop button)
          disabled={isLoading ? !abortInfo : !input.trim() || !activeChat}
        >
          {isLoading ? (
            <LuSquare className="h-5 w-5" /> // Stop Icon
          ) : (
            <LuSend className="h-5 w-5" /> // Send Icon
          )}
        </Button>
      </div>
    </div>
  );
};
