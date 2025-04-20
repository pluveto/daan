import { atomWithSafeStorage } from '@/lib/utils.ts';
import type { CustomCharacter } from '@/types.ts';

// --- Character Data Atom ---

/** Stores the list of custom characters created by the user. Persisted. */
export const customCharactersAtom = atomWithSafeStorage<CustomCharacter[]>(
  'globalSettings_customCharacters', // Keep original storage key for compatibility
  [],
);
