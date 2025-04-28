// src/services/SearchService.ts (Rewritten based on provided types)
import { searchIndexStatusAtom } from '@/store/search';
import type { MessageEntity } from '@/types/internal';
import { Setter } from 'jotai'; // Import Jotai atoms/types
import MiniSearch, { type Options, type SearchResult } from 'minisearch';
import { ChatDataService } from './ChatDataService';

// Define the structure of documents stored in the search index
interface SearchDocument {
  id: string; // Message ID (primary key for MiniSearch)
  chatId: string; // Store for context and potential filtering/removal
  content: string; // Text content to search
}

// Options for MiniSearch instance
const miniSearchOptions: Options<SearchDocument> = {
  // Fields to index for searching
  fields: ['content'],
  // Fields to store and return with search results
  storeFields: ['chatId'],
  // Field uniquely identifying a document
  idField: 'id',
  // Search options customization
  searchOptions: {
    prefix: true, // Enable prefix search (e.g., "sea" matches "search")
    fuzzy: 0.2, // Enable fuzzy search (Levenshtein distance tolerance)
    boost: { content: 2 }, // Boost matches in 'content' field
    // Consider adding more specific term processing if needed (e.g., stop words)
    combineWith: 'AND', // important for search chinese
    processTerm: (term) => {
      if (typeof term === 'string') term = term.toLowerCase();
      // @ts-ignore
      const segmenter =
        Intl.Segmenter && new Intl.Segmenter('zh', { granularity: 'word' });
      if (!segmenter) return term;
      const tokens = [];
      for (const seg of segmenter.segment(term)) {
        // @ts-ignore
        tokens.push(seg.segment);
      }
      return tokens;
    },
  },
  tokenize: (term) => {
    if (typeof term === 'string') term = term.toLowerCase();
    // @ts-ignore
    const segmenter =
      Intl.Segmenter && new Intl.Segmenter('zh', { granularity: 'word' });
    if (!segmenter) return [term];
    const tokens = [];
    for (const seg of segmenter.segment(term)) {
      // @ts-ignore
      tokens.push(seg.segment);
    }
    return tokens;
  },
  // processTerm: (term) => term.toLowerCase(), // Example: Default lowercase processing
};

// Define the structure returned by our search service (adapting MiniSearchResult)
export interface AppSearchResult {
  messageId: string; // = result.id
  chatId: string; // = result.chatId (from storeFields)
  score: number; // Relevance score from MiniSearch
  terms: string[]; // Matching terms from the document
  match: { [key: string]: string[] }; // Detailed match info (field -> terms)
}

export class SearchService {
  private miniSearch: MiniSearch<SearchDocument>;
  // Use Jotai atoms for state management directly if preferred, or internal state + public atoms
  // Let's use internal state managed by methods that update external atoms

  constructor() {
    this.miniSearch = new MiniSearch<SearchDocument>(miniSearchOptions);
    console.log(
      '[SearchService] Instance created with options:',
      miniSearchOptions,
    );
  }

  /**
   * Initializes/rebuilds the search index from the database.
   * Requires the ChatDataService instance to be passed in.
   * Updates the status atom via the passed 'set' function.
   */
  async initializeOrRebuildIndex(
    chatService: ChatDataService,
    set: Setter,
  ): Promise<void> {
    // Read status atom via set's internal getter is not standard,
    // It's better to manage internal state or pass current status if needed.
    // For simplicity, let's assume it's only called once via initializeSearchIndexAtom
    // which should handle the "already running" check.
    set(searchIndexStatusAtom, 'initializing');
    console.log('[SearchService] Initializing search index...');

    try {
      // Directly use the passed chatService instance
      const allMetadata = await chatService.getAllChatMetadata();
      const allDocs: SearchDocument[] = [];
      console.log(
        `[SearchService] Fetching messages for ${allMetadata.length} chats to index...`,
      );

      // --- Optimization: Fetch messages in batches ---
      const BATCH_SIZE = 10;
      for (let i = 0; i < allMetadata.length; i += BATCH_SIZE) {
        const batchMetadata = allMetadata.slice(i, i + BATCH_SIZE);
        const messagePromises = batchMetadata.map((meta) =>
          chatService.getMessagesByChatId(meta.id),
        );
        const messageArrays = await Promise.all(messagePromises);

        messageArrays.flat().forEach((msg) => {
          if (
            (msg.role === 'user' || msg.role === 'assistant') &&
            msg.content &&
            !msg.isHidden
          ) {
            const searchableContent = msg.content.replace(
              /<hidden>.*?<\/hidden>/gs,
              '',
            );
            if (searchableContent) {
              allDocs.push({
                id: msg.id,
                chatId: msg.chatId,
                content: searchableContent,
              });
            }
          }
        });
        // Optional: Add progress reporting via set(progressAtom, ...) if needed
        console.log(
          `[SearchService] Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allMetadata.length / BATCH_SIZE)}... (${allDocs.length} docs so far)`,
        );
      }
      // --- End Batching ---

      console.log(`[SearchService] Indexing ${allDocs.length} documents...`);
      this.miniSearch.removeAll(); // Clear existing
      await this.miniSearch.addAllAsync(allDocs, { chunkSize: 200 });

      set(searchIndexStatusAtom, 'ready'); // Update status atom
      console.log('[SearchService] Search index initialization complete.');
    } catch (error) {
      set(searchIndexStatusAtom, 'error'); // Update status atom on error
      console.error(
        '[SearchService] Failed to initialize search index:',
        error,
      );
    }
  }

  /** Adds or updates a single message. Should be called after DB write succeeds. */
  async indexMessage(message: MessageEntity): Promise<void> {
    // No readiness check here - assume called appropriately by DB service hook or action
    if (
      (message.role === 'user' || message.role === 'assistant') &&
      message.content &&
      !message.isHidden
    ) {
      try {
        const searchableContent = message.content.replace(
          /<hidden>.*?<\/hidden>/gs,
          '',
        );
        if (!searchableContent) {
          await this.removeMessage(message.id);
          return;
        }
        if (this.miniSearch.has(message.id)) {
          this.miniSearch.replace({
            id: message.id,
            chatId: message.chatId,
            content: searchableContent,
          });
        } else {
          this.miniSearch.add({
            id: message.id,
            chatId: message.chatId,
            content: searchableContent,
          });
        }
      } catch (error) {
        console.error(
          `[SearchService] Failed to index message ${message.id}:`,
          error,
        );
      }
    } else {
      await this.removeMessage(message.id);
    }
  }

  /** Removes a single message using discard. Should be called after DB delete succeeds. */
  async removeMessage(messageId: string): Promise<void> {
    try {
      if (this.miniSearch.has(messageId)) {
        this.miniSearch.discard(messageId);
      }
    } catch (error) {
      console.error(
        `[SearchService] Failed to discard message ${messageId}:`,
        error,
      );
    }
  }

  /** Removes multiple messages by their IDs using discard. */
  async removeChatMessagesByIds(messageIds: string[]): Promise<void> {
    if (!messageIds || messageIds.length === 0) return;
    console.log(
      `[SearchService] Discarding ${messageIds.length} messages from index...`,
    );
    try {
      // Filter IDs that actually exist in the index before discarding
      const idsToDiscard = messageIds.filter((id) => this.miniSearch.has(id));
      if (idsToDiscard.length > 0) {
        this.miniSearch.discardAll(idsToDiscard);
        console.log(
          `[SearchService] Discarded ${idsToDiscard.length} messages.`,
        );
      }
    } catch (error) {
      console.error(
        `[SearchService] Failed to discard messages by IDs:`,
        error,
      );
    }
  }

  /** Performs a search. Requires index to be ready. */
  async search(term: string): Promise<AppSearchResult[]> {
    // Check readiness internally or rely on caller checking the atom
    // if (this.status !== 'ready') return []; // Example internal check
    if (!term.trim()) return [];

    console.log(`[SearchService] Searching for: "${term}"`);
    try {
      const results: SearchResult[] = this.miniSearch.search(term);
      const appResults: AppSearchResult[] = results.map((r) => ({
        messageId: r.id,
        chatId: r.chatId, // Assumes chatId is in storeFields
        score: r.score,
        terms: r.terms,
        match: r.match,
        queryTerms: r.queryTerms,
      }));
      console.log(`[SearchService] Search found ${appResults.length} results.`);
      return appResults;
    } catch (error) {
      console.error(`[SearchService] Search failed for term "${term}":`, error);
      return [];
    }
  }
}
