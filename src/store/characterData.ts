// src/store/characterData.ts
import type { CharacterEntity } from '@/types/internal';
import { atom } from 'jotai';
import { toast } from 'sonner';
import { chatDataServiceAtom, isChatServiceReadyAtom } from './service';

// --- Character State ---

/** Holds the list of characters loaded from the DB. Null until loaded. */
export const loadedCharactersAtom = atom<CharacterEntity[] | null>(null);
/** Tracks loading state for the character list. */
export const isLoadingCharactersAtom = atom<boolean>(false);

// --- Character Actions ---

/** Action atom to load/refresh characters from the data service. */
export const loadCharactersAtom = atom(
  null, // No read value needed for the action itself
  async (get, set) => {
    if (!get(isChatServiceReadyAtom)) {
      console.warn(
        '[loadCharactersAtom] Chat service not ready, skipping character load.',
      );
      return;
    }
    if (get(isLoadingCharactersAtom)) {
      console.log('[loadCharactersAtom] Already loading, skipping.');
      return;
    }
    set(isLoadingCharactersAtom, true);
    console.log('[loadCharactersAtom] Loading characters...');
    try {
      const service = get(chatDataServiceAtom);
      const characters = await service.getAllCharacters(); // Assumes service sorts them
      set(loadedCharactersAtom, characters);
      console.log(
        `[loadCharactersAtom] Loaded ${characters.length} characters.`,
      );
    } catch (error) {
      console.error('[loadCharactersAtom] Failed:', error);
      set(loadedCharactersAtom, []); // Set to empty array on error
      toast.error('Failed to load characters.');
    } finally {
      set(isLoadingCharactersAtom, false);
    }
  },
);
