// src/components/MessageInput.tsx
import { cn } from '@/lib/utils';
import {
  _activeChatIdAtom,
  activeChatMessagesAtom,
  cancelGenerationAtom,
  clearActiveChatMessagesAtom,
  isAssistantLoadingAtom,
  isSystemSettingsDialogOpenAtom,
  regenerateLastResponseAtom,
  showEstimatedTokensAtom,
  systemSettingsDialogActiveTabAtom,
  triggerChatCompletionAtom,
} from '@/store/index';
import {
  isMcpToolsPopoverOpenAtom,
  mcpServerStatesAtom,
  selectedMcpServerIdsAtom,
} from '@/store/mcp';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LuChartBar,
  LuPaintbrush,
  LuPlug,
  LuRefreshCw,
  LuSend,
  LuSquare,
} from 'react-icons/lu';
import { McpToolsPopover } from './McpToolsPopover';
import { Button } from './ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/Popover';
import { Textarea } from './ui/Textarea';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/AlertDialog';
import { approximateTokenSize } from 'tokenx';

export const MessageInput: React.FC = () => {
  const isLoading = useAtomValue(isAssistantLoadingAtom);
  const activeChatId = useAtomValue(_activeChatIdAtom); // Read ID for actions
  const activeMessages = useAtomValue(activeChatMessagesAtom); // Read messages for checks
  const cancelGeneration = useSetAtom(cancelGenerationAtom);
  const regenerateAction = useSetAtom(regenerateLastResponseAtom);
  const triggerCompletion = useSetAtom(triggerChatCompletionAtom); // Use new action
  const clearMessagesAction = useSetAtom(clearActiveChatMessagesAtom); // Use new action
  const showEstimatedTokens = useAtomValue(showEstimatedTokensAtom);

  const [isMcpPopoverOpen, setIsMcpPopoverOpen] = useAtom(
    isMcpToolsPopoverOpenAtom,
  );
  const serverStates = useAtomValue(mcpServerStatesAtom);
  const selectedServerIds = useAtomValue(selectedMcpServerIdsAtom);

  // Local input state
  const [input, setInputRaw] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const hasConnectedMcpServers = useMemo(() => {
    for (const state of serverStates.values()) {
      if (state.isConnected) {
        return true;
      }
    }
    return false;
  }, [serverStates]);

  useEffect(() => {
    setInputRaw('');
    // Auto-resize on chat change too
    requestAnimationFrame(() => adjustTextareaHeight(textareaRef.current));
  }, [activeChatId]);

  const adjustTextareaHeight = useCallback(
    (element: HTMLTextAreaElement | null) => {
      if (element) {
        element.style.height = 'auto';
        element.style.height = `${element.scrollHeight}px`;
      }
    },
    [],
  );

  // --- Input Change Handler ---
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setInputRaw(newValue);
      // debouncedUpdateGlobalInput(newValue); // Save draft if implemented
      adjustTextareaHeight(e.target);
    },
    [adjustTextareaHeight], // Remove debouncedUpdateGlobalInput if not used
  );

  // --- Send Message Handler ---
  const handleSend = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput || !activeChatId || isLoading) {
      return;
    }
    // Call the new trigger action, passing chat ID and content
    triggerCompletion(activeChatId, trimmedInput);
    setInputRaw(''); // Clear local input immediately
    requestAnimationFrame(() => {
      // Ensure textarea height resets after clearing
      adjustTextareaHeight(textareaRef.current);
      textareaRef.current?.focus(); // Refocus after sending
    });
  }, [input, activeChatId, isLoading, triggerCompletion, adjustTextareaHeight]);

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
    [isLoading, handleSend, input, isComposing],
  );

  // --- Clear History Handler ---
  const handleClearHistory = useCallback(() => {
    // Confirmation is inside the AlertDialog trigger
    clearMessagesAction(); // Call the refactored action
  }, [clearMessagesAction]);

  // --- Derived State & Memos ---
  const canRegenerate = useMemo(
    () =>
      !isLoading &&
      activeMessages.some((m) => m.role === 'assistant' && !m.isStreaming),
    [isLoading, activeMessages],
  );
  const hasHistory = useMemo(() => activeMessages.length > 0, [activeMessages]);
  const numTokens = useMemo(
    () => (showEstimatedTokens ? approximateTokenSize(input) : 0),
    [showEstimatedTokens, input],
  );

  // --- MCP Settings Opener ---
  const setIsOpen = useSetAtom(isSystemSettingsDialogOpenAtom);
  const setActiveTab = useSetAtom(systemSettingsDialogActiveTabAtom);
  const handleOpenMcpSettings = useCallback(() => {
    setIsOpen(true);
    setActiveTab('mcp');
  }, [setIsOpen, setActiveTab]);

  // --- Render ---
  return (
    <div
      className={cn(
        'flex flex-shrink-0 flex-col border-t border-neutral-200 bg-neutral-50 px-4 pt-2 pb-4 dark:border-neutral-700 dark:bg-neutral-900/50',
      )}
    >
      {/* Main container class */}
      {/* Top Toolbar Area */}
      <div className="flex items-center space-x-1 pb-2">
        {/* Clear History Button with Confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              aria-label="Clear chat history"
              className={cn(
                'flex-shrink-0',
                hasHistory && 'text-destructive hover:bg-destructive/10', // Style when history exists
                (!hasHistory || isLoading || !activeChatId) &&
                  'cursor-not-allowed opacity-50',
              )}
              disabled={!hasHistory || isLoading || !activeChatId}
              size="xs"
              variant="ghost"
              title="Clear chat history"
            >
              <LuPaintbrush className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Chat History?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all messages in the current chat.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleClearHistory} // Call clear action on confirm
              >
                Clear History
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Regenerate Button (logic unchanged) */}
        <Button
          aria-label="Regenerate last response"
          className={cn(
            'flex-shrink-0',
            (!canRegenerate || isLoading || !activeChatId) &&
              'cursor-not-allowed opacity-50',
          )}
          disabled={!canRegenerate || isLoading || !activeChatId}
          onClick={regenerateAction}
          size="xs"
          variant="ghost"
          title="Regenerate last response"
        >
          <LuRefreshCw className="h-4 w-4" />
        </Button>

        {/* MCP Tools Popover Trigger */}
        {!hasConnectedMcpServers && (
          <Button
            aria-label="Open MCP Settings"
            size="xs"
            variant="ghost"
            title="Open MCP Settings"
            className="flex-shrink-0"
            onClick={handleOpenMcpSettings}
          >
            <LuPlug className="h-4 w-4" />
          </Button>
        )}
        {hasConnectedMcpServers && ( // Only show if servers are connected
          <Popover open={isMcpPopoverOpen} onOpenChange={setIsMcpPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                aria-label="Select MCP Tools"
                size="xs"
                variant="ghost"
                title="Select MCP Tools"
                className={cn(
                  'flex-shrink-0',
                  selectedServerIds.length > 0 &&
                    'text-blue-600 dark:text-blue-400',
                )} // Indicate selection
              >
                <LuPlug className="h-4 w-4" />
                {/* Optional: Show count of selected servers */}
                {selectedServerIds.length > 0 && (
                  <span className="ml-1 text-xs">
                    ({selectedServerIds.length})
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              {/* Render the popover content component */}
              <McpToolsPopover />
            </PopoverContent>
          </Popover>
        )}

        {/* Spacer */}
        <div className="flex-1" />
        {/* Token Counter */}
        {showEstimatedTokens && numTokens > 0 && (
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
          className="flex-1 resize-none overflow-y-hidden"
          rows={1}
          disabled={!activeChatId || isLoading} // Disable if no active chat or loading
          value={input}
          onChange={handleInputChange}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
          placeholder={
            isLoading
              ? 'Assistant is thinking...'
              : activeChatId
                ? 'Type message...' // Simpler placeholder
                : 'Select or create a chat first'
          }
        />
        <Button
          aria-label={isLoading ? 'Stop generation' : 'Send message'}
          className="flex-shrink-0 self-end" // Ensure button aligns correctly
          size="icon"
          title={isLoading ? 'Stop generation' : 'Send message'}
          variant={isLoading ? 'destructive' : 'default'}
          onClick={isLoading ? cancelGeneration : handleSend}
          // Disable send if no input, no active chat, OR if assistant is loading
          disabled={isLoading ? false : !input.trim() || !activeChatId}
        >
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
