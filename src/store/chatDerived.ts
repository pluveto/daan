import { exampleModels, type Chat, type SupportedModels } from '@/types';
import { atom } from 'jotai';
import { activeChatIdAtom, chatsAtom } from './chatData';
import { customModelsAtom } from './settings';

// --- Derived Atoms ---

/** Derives the currently active chat object based on activeChatIdAtom. O(1) lookup. */
export const activeChatAtom = atom<Chat | null>((get) => {
  const chats = get(chatsAtom);
  const activeId = get(activeChatIdAtom);
  // Directly access by ID; returns null if activeId is null or chat doesn't exist.
  return activeId ? (chats[activeId] ?? null) : null;
});

/** Derives the list of available models, combining predefined and custom models. */
export const availableModelsAtom = atom<SupportedModels[]>((get) => {
  const custom = get(customModelsAtom);
  // Use Set for efficient deduplication.
  return [...new Set([...exampleModels, ...custom])];
});

/** Derives a sorted list of chats for display purposes (e.g., in the sidebar). */
export const sortedChatsAtom = atom<Chat[]>((get) => {
  const chats = get(chatsAtom);
  // Get all chat objects from the record.
  const chatList = Object.values(chats);
  // Sort: Pinned chats first, then by last updated time (descending).
  return chatList.sort((a, b) => {
    // Pinned chats come first.
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    // Otherwise, sort by updatedAt descending (newest first).
    return b.updatedAt - a.updatedAt;
  });
});
