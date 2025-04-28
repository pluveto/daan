// src/components/ConversationSearchDialog.tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { type AppSearchResult } from '@/services/SearchService'; // Use new search service
import {
  activeChatIdAtom,
  chatListMetadataAtom,
  isConversationSearchOpenAtom,
  isSearchIndexInitializingAtom,
  isSearchIndexReadyAtom,
  searchIndexErrorAtom,
} from '@/store';
import { searchServiceAtom } from '@/store/search';
import { chatDataServiceAtom } from '@/store/service';
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import _ from 'lodash';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LuLoader,
  LuMessageSquare,
  LuSearch,
  LuTriangleAlert,
  LuX,
} from 'react-icons/lu'; // Added LuTriangleAlert
import { Button } from './ui/Button';

// HighlightedText component remains unchanged
const HighlightedText: React.FC<{
  text: string;
  indices: { start: number; end: number }[];
}> = React.memo(({ text, indices }) => {
  if (!indices || indices.length === 0 || !text) {
    // Added check for text
    return <>{text}</>;
  }
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const sortedIndices = [...indices].sort((a, b) => a.start - b.start);
  sortedIndices.forEach((index, i) => {
    if (index.start > lastIndex) {
      parts.push(text.substring(lastIndex, index.start));
    }
    // Ensure indices are within bounds
    const start = Math.max(0, index.start);
    const end = Math.min(text.length, index.end);
    if (start < end) {
      // Only add if valid range
      parts.push(
        <strong key={i} className="bg-yellow-200 dark:bg-yellow-600">
          {text.substring(start, end)}
        </strong>,
      );
    }
    lastIndex = Math.max(lastIndex, end); // Ensure lastIndex progresses
  });
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return <>{parts}</>;
});

const debounce = _.debounce;

// Updated interface: store full content and highlight indices
interface DisplayResult extends AppSearchResult {
  chatName: string;
  fullContent: string; // Store full message content
  highlightIndices: { start: number; end: number }[]; // Indices relative to fullContent
}

// Helper function to find all occurrences of substrings (case-insensitive)
function findAllOccurrences(
  text: string,
  terms: string[],
): { start: number; end: number }[] {
  if (!text || !terms || terms.length === 0) return [];
  const lowerText = text.toLowerCase();
  const indices: { start: number; end: number }[] = [];
  const uniqueTerms = [...new Set(terms)]; // Avoid redundant searches for same term

  for (const term of uniqueTerms) {
    if (!term) continue; // Skip empty terms
    const lowerTerm = term.toLowerCase();
    let startIndex = 0;
    while (startIndex < lowerText.length) {
      const index = lowerText.indexOf(lowerTerm, startIndex);
      if (index === -1) break; // Not found
      indices.push({ start: index, end: index + lowerTerm.length });
      startIndex = index + 1; // Move past the current match to find next
    }
  }
  // Optional: Merge overlapping indices if needed, but usually not necessary for highlighting
  // Sort by start index
  indices.sort((a, b) => a.start - b.start);
  return indices;
}

export const ConversationSearchDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(isConversationSearchOpenAtom);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [displayResults, setDisplayResults] = useState<DisplayResult[]>([]);

  const searchService = useAtomValue(searchServiceAtom);
  const setActiveChatId = useSetAtom(activeChatIdAtom);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const store = useStore();

  // Search index status
  const isIndexReady = useAtomValue(isSearchIndexReadyAtom);
  const isIndexInitializing = useAtomValue(isSearchIndexInitializingAtom);
  const searchError = useAtomValue(searchIndexErrorAtom);

  // Chat metadata for names
  const allMetadata = useAtomValue(chatListMetadataAtom);
  const chatNameMap = useMemo(() => {
    if (!allMetadata) return new Map();
    return new Map(allMetadata.map((m) => [m.id, m.name]));
  }, [allMetadata]);

  // Debounced search function
  const performSearch = useCallback(
    debounce(async (term: string) => {
      if (!term.trim() || !isIndexReady) {
        setDisplayResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        // 1. Get raw search results
        const rawResults = await searchService.search(term);

        // 2. Fetch full messages and calculate highlight indices
        const chatService = store.get(chatDataServiceAtom);
        const enrichedResults: DisplayResult[] = [];
        const MAX_CONCURRENT_FETCHES = 5;
        const fetchQueue = [...rawResults];

        while (fetchQueue.length > 0) {
          const batch = fetchQueue.splice(0, MAX_CONCURRENT_FETCHES);
          const snippetPromises = batch.map(
            async (result): Promise<DisplayResult | null> => {
              const message = await chatService.getMessageById(
                result.messageId,
              );
              if (!message || !message.content) return null;

              // Calculate highlight indices based on matched terms in full content
              const highlightIndices = findAllOccurrences(
                message.content,
                result.terms,
              );

              return {
                ...result,
                chatName: chatNameMap.get(result.chatId) ?? 'Unknown Chat',
                fullContent: message.content, // Store full content
                highlightIndices: highlightIndices, // Store calculated indices
              };
            },
          );
          const fetchedSnippets = (await Promise.all(snippetPromises)).filter(
            Boolean,
          ) as DisplayResult[];
          enrichedResults.push(...fetchedSnippets);
        }

        enrichedResults.sort((a, b) => b.score - a.score);
        setDisplayResults(enrichedResults);
      } catch (error) {
        /* ... unchanged error handling ... */
      } finally {
        setIsSearching(false);
      }
    }, 500),
    [isIndexReady, chatNameMap, store],
  );

  // --- Effects ---
  useEffect(() => {
    if (searchTerm.length >= 2 && isIndexReady) {
      performSearch(searchTerm);
    } else {
      setDisplayResults([]);
    }
    return () => performSearch.cancel();
  }, [searchTerm, performSearch, isIndexReady]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    } else {
      setSearchTerm('');
      setDisplayResults([]);
    }
  }, [isOpen]);

  const handleResultClick = (chatId: string) => {
    setActiveChatId(chatId);
    setIsOpen(false);
  };

  // Determine placeholder text
  const placeholderText = isIndexInitializing
    ? 'Initializing search index...'
    : searchError
      ? 'Search unavailable (error)'
      : !isIndexReady
        ? 'Search not ready...'
        : 'Search messages...';

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search Conversations</DialogTitle>
          <DialogDescription>
            Find conversations by message content or title.
          </DialogDescription>
        </DialogHeader>
        {/* Search Input */}
        <div className="relative flex-shrink-0">
          <LuSearch className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            ref={inputRef}
            type="text"
            placeholder={placeholderText}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-10"
            disabled={!isIndexReady || isIndexInitializing} // Disable if not ready or init
          />
          {/* Loading/Clear Icons */}
          {isSearching && (
            <LuLoader className="absolute top-1/2 right-10 h-4 w-4 -translate-y-1/2 animate-spin" />
          )}
          {searchTerm && !isSearching && (
            <Button
              variant="ghost"
              size="icon"
              /* ... */ onClick={() => setSearchTerm('')}
              className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
              aria-label="Clear search"
            >
              <LuX className="h-4 w-4" />
            </Button>
          )}
          {isIndexInitializing && !isSearching && (
            <LuLoader className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-amber-500" />
          )}
          {searchError && !isIndexInitializing && (
            <LuTriangleAlert className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-destructive" />
          )}
        </div>

        {/* Results Area */}
        <ScrollArea className="mt-4 flex-1 pr-2">
          <div className="space-y-2">
            {/* Display Results */}
            {displayResults.map((result) => (
              <div
                key={result.messageId}
                className="hover:bg-accent dark:hover:bg-accent/50 cursor-pointer rounded-md p-3"
                onClick={() => handleResultClick(result.chatId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ')
                    handleResultClick(result.chatId);
                }}
              >
                {/* Display Chat Name */}
                <div className="truncate text-sm font-medium text-blue-600 dark:text-blue-400">
                  {result.chatName}
                </div>
                {/* Display Full Message Content with Highlighting and Truncation */}
                <div className="text-muted-foreground mt-1 text-xs flex items-start gap-1.5">
                  <LuMessageSquare className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  {/* Apply line-clamp to the container */}
                  <div className="line-clamp-2">
                    <HighlightedText
                      text={result.fullContent}
                      indices={result.highlightIndices}
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Status Messages */}
            {!isSearching &&
              searchTerm.length >= 2 &&
              displayResults.length === 0 &&
              isIndexReady && <p /* No results */ />}
            {!isSearching && searchTerm.length < 2 && isIndexReady && (
              <p /* Enter more chars */ />
            )}
            {isIndexInitializing && <p /* Initializing */ />}
            {searchError && <p /* Error */ />}
            {!isIndexReady && !isIndexInitializing && !searchError && (
              <p /* Not ready */ />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
