// src/components/ChatMessageItem.tsx (Optimized)
import { cn } from '@/lib/utils.ts';
import type { Message } from '@/types.ts';
// Use specific icons from lucide-react directly
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
// Use specific imports if LucideBarChart is the only one needed from lucide-react
import { LuBot, LuChartBar, LuClock, LuLoader, LuUser } from 'react-icons/lu';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { approximateTokenSize } from 'tokenx'; // Assuming this library exists
import { MessageToolbar } from './MessageToolbar.tsx';
import { Button } from './ui/Button.tsx';
import { CodeBlock } from './ui/CodeBlock.tsx';
import { Textarea } from './ui/Textarea.tsx'; // Assuming this is your Textarea component

// Helper function to format timestamp
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  // Consider locale options if needed
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// msgPostProcess (unchanged)
const msgPostProcess = (content: string) => {
  let tmp = content;
  let isThinking = tmp.search(/<\/think>/) === -1;
  let iconThoughts = `<div class="relative w-5 h-5 flex items-center justify-center rounded-full bg-green-200 dark:bg-green-600"><svg class="w-4 h-4 text-green-500 dark:text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div>`;
  let iconThinking = `<div class="relative w-5 h-5"><div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-purple-500"></div></div>`;
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

interface ChatMessageItemProps {
  message: Message;
  isEditing: boolean;
  // editContent: string; // REMOVED - Handled internally
  // onEditContentChange: (value: string) => void; // REMOVED
  onSave: (newContent: string) => void; // MODIFIED: Prop to call when saving with new content
  onCancelEdit: () => void;
  // onEditKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; // REMOVED - Handled internally
  showTimestamps: boolean;
  showEstimatedTokens: boolean;
  onRegenerate: () => void;
  // Add setEditingId if the edit button is *inside* this component and not in MessageToolbar
  // setEditingId: (id: string | null) => void;
}

const _ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  isEditing,
  onSave, // Use the new onSave prop
  onCancelEdit,
  showTimestamps,
  showEstimatedTokens,
  onRegenerate,
  // setEditingId // Destructure if needed
}) => {
  // --- Internal State for Editing ---
  const [internalEditContent, setInternalEditContent] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Memoized Calculations (Good practice) ---
  const numTokens = useMemo(() => {
    return showEstimatedTokens ? approximateTokenSize(message.content) : 0;
  }, [message.content, showEstimatedTokens]);

  const processedContent = useMemo(() => {
    // Only process if not editing, avoid processing during typing
    return !isEditing ? msgPostProcess(message.content) : '';
  }, [message.content, isEditing]); // Depend on isEditing too

  // --- Effect to Initialize and Focus Editor ---
  useEffect(() => {
    if (isEditing) {
      setInternalEditContent(message.content);
      // Defer focus until after DOM update & state is set
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        // Optional: Select text for easier editing
        // textareaRef.current?.select();
      });
    }
    // No cleanup needed to clear state, it's tied to isEditing
  }, [isEditing, message.content]);

  // --- Internal Event Handlers ---
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInternalEditContent(e.target.value); // Update internal state only
    },
    [],
  ); // Stable callback

  const handleSave = useCallback(() => {
    const trimmedContent = internalEditContent.trim();
    // Only call save if content is not empty and actually changed
    if (trimmedContent && trimmedContent !== message.content.trim()) {
      onSave(trimmedContent); // Pass the internal state value UP to the parent
    } else {
      onCancelEdit(); // If no change or empty, just cancel
    }
  }, [internalEditContent, message.content, onSave, onCancelEdit]); // Dependencies

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSave(); // Use internal save handler
      } else if (e.key === 'Escape') {
        e.preventDefault(); // Prevent potential browser/modal escape behavior
        onCancelEdit(); // Use prop directly
      }
    },
    [handleSave, onCancelEdit], // Stable dependencies
  );

  // --- Helper Functions for Rendering ---
  const getSenderName = (role: Message['role']) => {
    switch (role) {
      case 'user':
        return 'You';
      case 'assistant':
        return 'Assistant';
      case 'system':
        return 'System'; // Should be filtered by parent, but safe default
      case 'divider':
        return ''; // Should be filtered by parent
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

  // --- Component Rendering ---
  return (
    <div
      className={cn(
        'group message-item relative flex flex-col',
        // Add specific styling for editing mode if needed
        {
          'message-editing -m-2 rounded-md bg-blue-50 p-2 dark:bg-slate-700/20':
            isEditing,
        },
      )}
    >
      {/* Sender Info and Timestamp (Common for both views) */}
      <div className="mb-1.5 flex items-end space-x-2 text-sm font-medium text-neutral-900 dark:text-neutral-200">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full">
          {getSenderIcon(message.role)}
        </span>
        <span className="font-semibold">{getSenderName(message.role)}</span>
        {showTimestamps && (
          <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
            <LuClock className="h-3 w-3" />
            {formatTimestamp(message.timestamp)}
          </span>
        )}
        {/* Show tokens only when NOT editing */}
        {!isEditing &&
          showEstimatedTokens &&
          message.content &&
          numTokens > 0 && (
            <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
              <LuChartBar className="h-3 w-3" />
              {numTokens} token{numTokens === 1 ? '' : 's'}
            </span>
          )}
      </div>

      {/* Message Content / Editor */}
      <div className={cn('mx-4 mb-2 flex-1', !isEditing && 'ml-8')}>
        {' '}
        {/* Indent only if not editing */}
        {!isEditing ? (
          // --- Display View ---
          <>
            <div className="prose prose-sm dark:prose-invert prose-p:my-1 prose-pre:my-1 max-w-none">
              <ReactMarkdown
                components={{
                  code: CodeBlock,
                  // Ensure p doesn't add excessive margins if prose styles handle it
                  p: ({ children }) => (
                    <div className="mb-2 last:mb-0">{children}</div>
                  ),
                }}
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeKatex]}
              >
                {processedContent}
              </ReactMarkdown>
            </div>
            {/* Streaming indicator */}
            {message.isStreaming && (
              <LuLoader className="ml-1 inline-block h-4 w-4 animate-spin text-neutral-500 dark:text-neutral-400" />
            )}
          </>
        ) : (
          // --- Editor View ---
          <div className="space-y-2">
            <Textarea
              ref={textareaRef} // Assign ref
              autoFocus // Keep autoFocus
              className="min-h-[80px] w-full resize-y border-neutral-300 bg-white text-sm focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800" // Added more specific styling
              onChange={handleInputChange} // Use internal handler
              onKeyDown={handleKeyDown} // Use internal handler
              value={internalEditContent} // Use internal state
              // Consider adding rows prop or using react-textarea-autosize
              rows={3} // Start with a reasonable number of rows
            />
            <div className="mt-4 flex justify-end space-x-2">
              <Button onClick={onCancelEdit} size="sm" variant="ghost">
                {' '}
                {/* Use prop */}
                Cancel
              </Button>
              <Button
                // Disable save if content is empty or unchanged
                disabled={
                  !internalEditContent.trim() ||
                  internalEditContent.trim() === message.content.trim()
                }
                onClick={handleSave} // Use internal handler
                size="sm"
                variant="default" // Use default variant for primary action
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Hover Toolbar (only show if not editing and not streaming) */}
      {/* Assume MessageToolbar contains the "Edit" button which calls setEditingId(message.id) */}
      {!isEditing && !message.isStreaming && (
        <MessageToolbar
          message={message}
          onRegenerate={onRegenerate} /* Pass setEditingId if needed */
        />
      )}
    </div>
  );
};

_ChatMessageItem.displayName = 'ChatMessageItem'; // For DevTools clarity

// Export the memoized component
export const ChatMessageItem = React.memo(_ChatMessageItem);
