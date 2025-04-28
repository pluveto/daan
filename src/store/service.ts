import type { ChatDataService } from '@/services/ChatDataService';
import { IndexedDBChatDataService } from '@/services/IndexedDBChatDataService';
import { atom } from 'jotai';
import { loadCharactersAtom } from './characterData'; // Import load actions
import { loadChatListMetadataAtom } from './chatActions';
import { initializeSearchIndexAtom } from './search';

// --- Service Layer ---

export const chatDataServiceAtom = atom<ChatDataService>(
  new IndexedDBChatDataService(),
);

export const isChatServiceReadyAtom = atom<boolean>(false);
export const chatServiceErrorAtom = atom<Error | null>(null);

export const initializeChatServiceAtom = atom(null, async (get, set) => {
  const service = get(chatDataServiceAtom);
  if (get(isChatServiceReadyAtom)) {
    console.log('[initializeChatServiceAtom] Service already initialized.');
    return;
  }
  set(chatServiceErrorAtom, null);
  console.log('[initializeChatServiceAtom] Initializing Chat Data Service...');

  try {
    await service.initialize();
    set(isChatServiceReadyAtom, true);
    console.log(
      '[initializeChatServiceAtom] Chat Data Service Initialized successfully.',
    );

    // Trigger initial data loads AFTER service is ready
    console.log('[initializeChatServiceAtom] Triggering initial data load...');
    // Use Promise.allSettled to load concurrently and log individual results/errors
    const dataLoadResults = await Promise.allSettled([
      set(loadChatListMetadataAtom),
      set(loadCharactersAtom),
    ]);
    console.log(
      '[initializeChatServiceAtom] Initial data load results:',
      dataLoadResults,
    );
    dataLoadResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          `Initial load failed for ${index === 0 ? 'metadata' : 'characters'}:`,
          result.reason,
        );
        // Optionally show specific error toasts here
      }
    });
    // Now trigger search index build (runs async in background)
    set(initializeSearchIndexAtom); // Fire and forget for now
  } catch (error: any) {
    console.error('[initializeChatServiceAtom] Failed:', error);
    set(isChatServiceReadyAtom, false);
    set(
      chatServiceErrorAtom,
      error instanceof Error ? error : new Error(String(error)),
    );
  } finally {
    console.log('[initializeChatServiceAtom] Done.');
  }
});
