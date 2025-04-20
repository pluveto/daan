// src/components/ConversationSearchDialog.tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog.tsx';
import { Input } from '@/components/ui/Input.tsx';
import {
  activeChatIdAtom,
  chatsAtom,
  isConversationSearchOpenAtom,
} from '@/store/index.ts';
import { Chat, Message } from '@/types.ts';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import _ from 'lodash'; // For debouncing

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LuSearch, LuX } from 'react-icons/lu';
import { Button } from './ui/Button.tsx';

interface SearchResult {
  chatId: string;
  chatName: string;
  messageId?: string; // Optional: if match is in message
  snippet: string; // Can be chat name or message content snippet
  matchIndices: { start: number; end: number }[]; // For highlighting
  timestamp: number; // For potential sorting later
}

// Helper to create highlighted snippet
const HighlightedText: React.FC<{
  text: string;
  indices: { start: number; end: number }[];
}> = React.memo(({ text, indices }) => {
  if (!indices || indices.length === 0) {
    return <>{text}</>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // Sort indices just in case
  const sortedIndices = [...indices].sort((a, b) => a.start - b.start);

  sortedIndices.forEach((index, i) => {
    // Add text before the match
    if (index.start > lastIndex) {
      parts.push(text.substring(lastIndex, index.start));
    }
    // Add the highlighted match
    parts.push(
      <strong key={i} className="bg-yellow-200 dark:bg-yellow-600">
        {text.substring(index.start, index.end)}
      </strong>,
    );
    lastIndex = index.end;
  });

  // Add any remaining text after the last match
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <>{parts}</>;
});

// Debounce function
const debounce = _.debounce;

export const ConversationSearchDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(isConversationSearchOpenAtom);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const chats = useAtomValue(chatsAtom);
  const setActiveChatId = useSetAtom(activeChatIdAtom);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const chatList = useMemo(() => Object.values(chats), [chats]);

  // Debounced search function
  const performSearch = useCallback(
    debounce((term: string) => {
      if (!term.trim()) {
        setSearchResults([]);
        return;
      }

      const lowerCaseTerm = term.toLowerCase();
      const results: SearchResult[] = [];
      const maxResults = 40; // Limit results
      const snippetLength = 50; // Chars before/after match

      for (const chat of chatList) {
        if (results.length >= maxResults) break;

        // Check chat name
        const nameMatchIndex = chat.name.toLowerCase().indexOf(lowerCaseTerm);
        if (nameMatchIndex !== -1) {
          results.push({
            chatId: chat.id,
            chatName: chat.name,
            snippet: chat.name, // Use full name as snippet
            matchIndices: [
              {
                start: nameMatchIndex,
                end: nameMatchIndex + lowerCaseTerm.length,
              },
            ],
            timestamp: chat.updatedAt,
          });
        }

        if (results.length >= maxResults) break;

        // Check messages (iterate backwards for recent messages first)
        for (let i = chat.messages.length - 1; i >= 0; i--) {
          if (results.length >= maxResults) break;
          const message = chat.messages[i];
          if (message.role === 'divider' || !message.content) continue;

          const contentLower = message.content.toLowerCase();
          let lastIndex = -1;
          let matchIndex = contentLower.indexOf(lowerCaseTerm, lastIndex + 1);

          while (matchIndex !== -1 && results.length < maxResults) {
            const start = Math.max(0, matchIndex - snippetLength);
            const end = Math.min(
              message.content.length,
              matchIndex + lowerCaseTerm.length + snippetLength,
            );
            const snippet = `${start > 0 ? '...' : ''}${message.content.substring(start, end)}${end < message.content.length ? '...' : ''}`;

            // Adjust indices for snippet context
            const highlightStart = (start > 0 ? 3 : 0) + (matchIndex - start);
            const highlightEnd = highlightStart + lowerCaseTerm.length;

            results.push({
              chatId: chat.id,
              chatName: chat.name,
              messageId: message.id,
              snippet: snippet,
              matchIndices: [{ start: highlightStart, end: highlightEnd }],
              timestamp: message.timestamp,
            });

            lastIndex = matchIndex; // Continue searching from after this match
            // Optimization: If we only want one result per message, uncomment break
            // break;
            matchIndex = contentLower.indexOf(lowerCaseTerm, lastIndex + 1); // Find next match
          }
        }
      }
      // Optional: Sort results by timestamp descending?
      // results.sort((a, b) => b.timestamp - a.timestamp);
      setSearchResults(results);
    }, 300), // 300ms debounce delay
    [chatList], // Recreate debounce if chatList changes
  );

  useEffect(() => {
    if (searchTerm.length >= 3) {
      performSearch(searchTerm);
    }
    // Cleanup debounce on unmount or when searchTerm changes before debounce triggers
    return () => {
      performSearch.cancel();
    };
  }, [searchTerm, performSearch]);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      // Timeout needed because of dialog animation
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // Reset search term when closing
      setSearchTerm('');
      setSearchResults([]);
    }
  }, [isOpen]);

  const handleResultClick = (chatId: string) => {
    setActiveChatId(chatId);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search Conversations</DialogTitle>
          <DialogDescription>
            Find conversations by title or message content.
          </DialogDescription>
        </DialogHeader>
        <div className="relative flex-shrink-0">
          <LuSearch className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search by name or content..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10 pl-10" // Padding for icons
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              <LuX className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-2">
          {searchResults.length > 0
            ? searchResults.map((result, index) => (
                <div
                  key={`${result.chatId}-${result.messageId || 'name'}-${index}`}
                  className="hover:bg-accent dark:hover:bg-accent/50 cursor-pointer rounded-md p-3"
                  onClick={() => handleResultClick(result.chatId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ')
                      handleResultClick(result.chatId);
                  }}
                >
                  <div className="truncate text-sm font-medium">
                    {result.messageId ? (
                      <HighlightedText text={result.chatName} indices={[]} /> // Show chat name plainly if match is in message
                    ) : (
                      <HighlightedText
                        text={result.chatName}
                        indices={result.matchIndices}
                      /> // Highlight name if match is in name
                    )}
                  </div>
                  <div className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                    <HighlightedText
                      text={result.snippet}
                      indices={result.matchIndices}
                    />
                  </div>
                </div>
              ))
            : searchTerm && (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No results found for "{searchTerm}".
                </p>
              )}
          {!searchTerm && (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Start typing to search...
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
