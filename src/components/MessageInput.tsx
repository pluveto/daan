// src/components/MessageInput.tsx
import { cn } from '@/lib/utils';
import { updateChatAtom } from '@/store/chatActions';
import {
  activeChatAtom,
  cancelGenerationAtom,
  focusInputAtom,
  isAssistantLoadingAtom,
  isSystemSettingsDialogOpenAtom,
  regenerateLastResponseAtom,
  sendMessageActionAtom,
  showEstimatedTokensAtom,
  systemSettingsDialogActiveTabAtom,
} from '@/store/index';
import {
  isMcpToolsPopoverOpenAtom,
  mcpServerStatesAtom,
  selectedMcpServerIdsAtom,
} from '@/store/mcp';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import _ from 'lodash';
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
import { approximateTokenSize } from 'tokenx';
// Import the new Popover content component
import { McpToolsPopover } from './McpToolsPopover';
import { Button } from './ui/Button';
// Import Popover components
import { Popover, PopoverContent, PopoverTrigger } from './ui/Popover';
import { Textarea } from './ui/Textarea';

const debounce = _.debounce;
const DEBOUNCE_DELAY = 400;

export const MessageInput: React.FC = () => {
  const [isLoading] = useAtom(isAssistantLoadingAtom);
  const [activeChat] = useAtom(activeChatAtom);
  const updateChat = useSetAtom(updateChatAtom);
  const cancelGeneration = useSetAtom(cancelGenerationAtom);
  const regenerateAction = useSetAtom(regenerateLastResponseAtom);
  const showEstimatedTokens = useAtomValue(showEstimatedTokensAtom);
  const triggerFocus = useAtomValue(focusInputAtom);
  const sendMessage = useSetAtom(sendMessageActionAtom);

  // MCP State
  const [isMcpPopoverOpen, setIsMcpPopoverOpen] = useAtom(
    isMcpToolsPopoverOpenAtom,
  );
  const serverStates = useAtomValue(mcpServerStatesAtom);
  const selectedServerIds = useAtomValue(selectedMcpServerIdsAtom);

  const [input, setInputRaw] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);

  // --- Check if any MCP servers are connected ---
  const hasConnectedMcpServers = useMemo(() => {
    for (const state of serverStates.values()) {
      if (state.isConnected) {
        return true;
      }
    }
    return false;
  }, [serverStates]);

  // --- State Synchronization ---
  useEffect(() => {
    setInputRaw(activeChat?.input ?? '');
  }, [activeChat]);

  // --- Debounced Global State Update ---
  const debouncedUpdateGlobalInput = useCallback(
    debounce((value: string) => {
      if (activeChat) {
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

  // --- Effect for focusing input ---
  useEffect(() => {
    if (triggerFocus > 0 && textareaRef.current) {
      textareaRef.current?.focus();
    }
  }, [triggerFocus]);

  // --- Input Change Handler ---
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setInputRaw(newValue);
      debouncedUpdateGlobalInput(newValue);
      // Auto-resize textarea height based on content
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'; // Reset height
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`; // Set to scroll height
      }
    },
    [debouncedUpdateGlobalInput],
  );

  // Adjust height on initial load/chat change
  useEffect(() => {
    if (textareaRef.current) {
      setTimeout(() => {
        // Needs timeout to allow rendering
        textareaRef.current!.style.height = 'auto';
        textareaRef.current!.style.height = `${textareaRef.current!.scrollHeight}px`;
      }, 0);
    }
  }, [input, activeChat?.id]);

  // --- Send Message Handler ---
  const handleSend = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput || !activeChat || isLoading) {
      return;
    }
    debouncedUpdateGlobalInput.cancel();
    sendMessage(trimmedInput);
    setInputRaw(''); // Clear local input *immediately*
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [input, activeChat, isLoading, sendMessage, debouncedUpdateGlobalInput]);

  // --- Keyboard Handler ---
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

  // --- Derived State & Memos ---
  const canRegenerate = useMemo(
    () =>
      !isLoading &&
      activeChat &&
      activeChat.messages.some((m) => m.role === 'assistant' && !m.isStreaming),
    [isLoading, activeChat],
  );

  const numTokens = useMemo(
    () => (showEstimatedTokens ? approximateTokenSize(input) : 0),
    [showEstimatedTokens, input],
  );

  const setIsOpen = useSetAtom(isSystemSettingsDialogOpenAtom);
  const setActiveTab = useSetAtom(systemSettingsDialogActiveTabAtom); // Default tab

  const handleOpenMcpSettings = useCallback(() => {
    setIsOpen(true);
    setActiveTab('mcp');
  }, [setIsOpen, setActiveTab]);

  return (
    <div
      className={cn(
        'flex flex-shrink-0 flex-col border-t border-neutral-200 bg-neutral-50 px-4 pt-2 pb-4 dark:border-neutral-700 dark:bg-neutral-900/50',
      )}
    >
      {/* Top Toolbar Area */}
      <div className="flex items-center space-x-1 pb-2">
        {/* Clear History Button */}
        <Button
          aria-label="Clear chat history"
          className={cn(
            'flex-shrink-0',
            activeChat && activeChat.messages.length > 0 && 'text-destructive',
          )}
          disabled={
            !activeChat || isLoading || activeChat.messages.length === 0
          }
          onClick={() => {
            if (activeChat) {
              updateChat({ id: activeChat.id, messages: [] });
            }
          }}
          size="xs"
          variant="ghost"
          title="Clear chat history"
        >
          <LuPaintbrush className="h-4 w-4" />
        </Button>
        {/* Regenerate Button */}
        <Button
          aria-label="Regenerate last response"
          className={cn(
            'flex-shrink-0',
            (!canRegenerate || isLoading) && 'cursor-not-allowed opacity-50',
          )}
          disabled={!canRegenerate || isLoading}
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
          className="flex-1 resize-none overflow-y-hidden" // overflow-y-hidden + JS resize
          rows={1} // Start with 1 row
          disabled={!activeChat || isLoading}
          value={input}
          onChange={handleInputChange}
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
        />
        <Button
          aria-label={isLoading ? 'Stop generation' : 'Send message'}
          className="flex-shrink-0 self-end"
          size="icon"
          title={isLoading ? 'Stop generation' : 'Send message'}
          variant={isLoading ? 'destructive' : 'default'}
          onClick={isLoading ? cancelGeneration : handleSend}
          disabled={isLoading ? false : !input.trim() || !activeChat}
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
