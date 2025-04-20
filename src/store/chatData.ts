import { atomWithSafeStorage } from '@/lib/utils.ts';
import type { Chat } from '@/types.ts';

// --- Type Definition ---
export type ChatsRecord = Record<string, Chat>;

// --- Chat Data Atoms ---

/**
 * Stores all chats as a record (object) where keys are chat IDs.
 * Persisted in storage. Using a Record allows for O(1) access, update, and deletion by ID.
 */
export const chatsAtom = atomWithSafeStorage<ChatsRecord>('chats', {});

/** Stores the ID of the currently active chat, or null if none. Persisted. */
export const activeChatIdAtom = atomWithSafeStorage<string | null>(
  'activeChatId',
  null,
);
