import { cn } from '@/lib/utils';
import { updateChatAtom } from '@/store/chatActions'; // Keep updateChatAtom for debounced input
import {
  activeChatAtom,
  cancelGenerationAtom,
  focusInputAtom,
  isAssistantLoadingAtom,
  regenerateLastResponseAtom,
  // Import the NEW action atom
  sendMessageActionAtom,
  showEstimatedTokensAtom,
} from '@/store/index';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import _ from 'lodash';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LuChartBar, LuRefreshCw, LuSend, LuSquare } from 'react-icons/lu';
import { approximateTokenSize } from 'tokenx';
import { Button } from './ui/Button';
import { Textarea } from './ui/Textarea';

const debounce = _.debounce;
const DEBOUNCE_DELAY = 400;

export const MessageInput: React.FC = () => {
  // --- Hooks for Jotai Atoms ---
  const [isLoading] = useAtom(isAssistantLoadingAtom); // Keep for UI state
  const [activeChat] = useAtom(activeChatAtom); // Keep for enabling/disabling, placeholder, and debounced save
  const updateChat = useSetAtom(updateChatAtom); // Keep for debounced input saving
  const cancelGeneration = useSetAtom(cancelGenerationAtom); // Keep for stop button
  const regenerateAction = useSetAtom(regenerateLastResponseAtom); // Keep for regenerate button
  const showEstimatedTokens = useAtomValue(showEstimatedTokensAtom); // Keep for display
  const triggerFocus = useAtomValue(focusInputAtom); // Keep for focusing

  // *** Get the setter for the NEW action atom ***
  const sendMessage = useSetAtom(sendMessageActionAtom);

  // REMOVE hooks for: upsertMessage, deleteMessage, appendContent, finalizeStream, setAbortController, apiKey, apiBaseUrl, etc.

  // --- Local State ---
  const [input, setInputRaw] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);

  // --- State Synchronization (Keep) ---
  useEffect(() => {
    setInputRaw(activeChat?.input ?? '');
  }, [activeChat]);

  // --- Debounced Global State Update (Keep) ---
  const debouncedUpdateGlobalInput = useCallback(
    debounce((value: string) => {
      if (activeChat) {
        // console.log('Debounced: Updating global input state with', value);
        updateChat({ id: activeChat.id, input: value });
      }
    }, DEBOUNCE_DELAY),
    [activeChat?.id, updateChat],
  );
  useEffect(() => {
    return () => {
      debouncedUpdateGlobalInput.cancel();
    };
  }, [debouncedUpdateGlobalInput]);

  // --- Effect for focusing input (Keep) ---
  useEffect(() => {
    if (triggerFocus > 0 && textareaRef.current) {
      textareaRef.current?.focus();
    }
  }, [triggerFocus]);

  // --- Input Change Handler (Keep) ---
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setInputRaw(newValue);
      debouncedUpdateGlobalInput(newValue);
    },
    [debouncedUpdateGlobalInput],
  );

  // --- *** SIMPLIFIED Send Message Handler *** ---
  const handleSend = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput || !activeChat || isLoading) {
      return; // Basic checks remain
    }

    // Cancel any pending debounced save of the draft
    debouncedUpdateGlobalInput.cancel();

    // *** Call the action atom ***
    sendMessage(trimmedInput);

    // Clear Local Input & Reset Height & Focus
    setInputRaw('');
    // No need to call debouncedUpdateGlobalInput('') here,
    // the action atom handles clearing the draft in the global state.

    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    // Focus might need slight delay after state updates triggered by sendMessage
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [
    input, // Depends on local input state
    activeChat, // Still needed for checks and draft clearing logic
    isLoading, // Still needed for checks
    sendMessage, // Dependency on the new action atom setter
    debouncedUpdateGlobalInput, // Still needed to cancel debounce
    // No longer depends on apiKey, apiBaseUrl, upsertMessage, etc.
  ]);

  // --- Keyboard Handler (Keep, dependency list simplified) ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !isLoading &&
        !isComposing &&
        input.trim()
      ) {
        e.preventDefault();
        handleSend();
      }
    },
    [isLoading, handleSend, input, isComposing], // Simpler dependencies
  );

  // --- Derived State & Memos (Keep, dependency list potentially simplified) ---
  const canRegenerate = useMemo(
    () =>
      !isLoading &&
      activeChat &&
      activeChat.messages.some((m) => m.role === 'assistant' && !m.isStreaming), // Simplified check for any completed assistant message
    [isLoading, activeChat], // Dependencies unchanged
  );

  const numTokens = useMemo(
    () => (showEstimatedTokens ? approximateTokenSize(input) : 0),
    [showEstimatedTokens, input],
  );

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
          disabled={isLoading ? false : !input.trim() || !activeChat} // Stop button always enabled when loading
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
