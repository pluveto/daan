import { SearchService } from '@/services/SearchService';
import { atom } from 'jotai';
import { chatDataServiceAtom, isChatServiceReadyAtom } from './service';

// --- Export Singleton Instance ---
export const searchService = new SearchService();

// --- Jotai Atoms for Search State ---
export const searchIndexStatusAtom = atom<
  'idle' | 'initializing' | 'ready' | 'error'
>('idle');
export const isSearchIndexReadyAtom = atom<boolean>(
  (get) => get(searchIndexStatusAtom) === 'ready',
);
export const isSearchIndexInitializingAtom = atom<boolean>(
  (get) => get(searchIndexStatusAtom) === 'initializing',
);
export const searchIndexErrorAtom = atom<boolean>(
  (get) => get(searchIndexStatusAtom) === 'error',
);

// Action atom to trigger index initialization/rebuild
export const initializeSearchIndexAtom = atom(null, async (get, set) => {
  if (!get(isChatServiceReadyAtom)) {
    console.warn(
      '[initializeSearchIndexAtom] Main DB service not ready, delaying search index build.',
    );
    return;
  }
  const chatService = get(chatDataServiceAtom); // Get the service instance
  await searchService.initializeOrRebuildIndex(chatService, set); // Pass instance and set
});

export const searchServiceAtom = atom<SearchService>(searchService);
