import { atomWithSafeStorage } from '@/lib/utils';
import type { CustomCharacter } from '@/types';

// --- Character Data Atom ---

/** Stores the list of custom characters created by the user. Persisted. */
export const customCharactersAtom = atomWithSafeStorage<CustomCharacter[]>(
  'globalSettings_customCharacters', // Keep original storage key for compatibility
  [],
);
