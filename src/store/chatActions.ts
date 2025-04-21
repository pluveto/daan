import type { Chat } from '@/types';
import { atom } from 'jotai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { abortControllerAtom, isAssistantLoadingAtom } from './apiState';
import { activeChatIdAtom, chatsAtom, type ChatsRecord } from './chatData';
import { activeChatAtom, sortedChatsAtom } from './chatDerived';
import {
  defaultMaxHistoryAtom,
  defaultModelAtom,
  defaultPromptAtom,
} from './settings';
import { editingMessageIdAtom, focusInputAtom } from './uiState';

// --- Helper Type ---
type NewChatOptions = Partial<
  Omit<
    Chat,
    'id' | 'messages' | 'createdAt' | 'updatedAt' | 'isPinned' | 'input'
  >
>;

// --- Action Atoms (Write-only atoms for chat management) ---

/** Creates a new chat, adds it to the state, and makes it active. */
export const createNewChatAtom = atom(
  null,
  (get, set, options?: NewChatOptions) => {
    const newId = uuidv4();
    const now = Date.now();
    const globalDefaults = {
      icon: '💬',
      name: `New Chat`, // Default initial name
      model: get(defaultModelAtom),
      systemPrompt: get(defaultPromptAtom),
      maxHistory: null, // Default uses global setting implicitly
    };

    const newChat: Chat = {
      // Internal properties
      id: newId,
      characterId: options?.characterId || null,
      messages: [],
      createdAt: now,
      updatedAt: now,
      isPinned: false,
      input: '', // Always start with empty input draft
      // Merge global defaults and specific options
      icon: options?.icon ?? globalDefaults.icon,
      name: options?.name ?? globalDefaults.name,
      model: options?.model ?? globalDefaults.model,
      systemPrompt: options?.systemPrompt ?? globalDefaults.systemPrompt,
      maxHistory:
        options?.maxHistory !== undefined
          ? options?.maxHistory
          : globalDefaults.maxHistory, // Allow explicit null from options
    };

    // O(1) addition using Record
    set(chatsAtom, (prevChats) => ({
      ...prevChats,
      [newId]: newChat,
    }));

    // Set the new chat as active
    set(activeChatIdAtom, newId);
    set(focusInputAtom, (c) => c + 1); // Trigger input focus

    // Reset potentially conflicting states
    set(editingMessageIdAtom, null);
    set(isAssistantLoadingAtom, false);
    set(abortControllerAtom, null); // Cancel any ongoing generation

    toast.success(`Chat "${newChat.name}" created.`);
  },
);

/** Updates properties of an existing chat. */
export const updateChatAtom = atom(
  null,
  (_get, set, update: Partial<Omit<Chat, 'id'>> & { id: string }) => {
    const chatId = update.id;
    // O(1) update using Record
    set(chatsAtom, (prevChats) => {
      const chatToUpdate = prevChats[chatId];
      if (!chatToUpdate) {
        console.warn(`Chat with ID ${chatId} not found for update.`);
        return prevChats; // Return previous state if chat not found
      }
      // Create a new chat object with updated properties
      const updatedChat = {
        ...chatToUpdate,
        ...update,
        updatedAt: Date.now(), // Update timestamp
      };
      // Return the new state object with the updated chat
      return {
        ...prevChats,
        [chatId]: updatedChat,
      };
    });
  },
);

/** Deletes a chat and selects the next appropriate active chat. */
export const deleteChatAtom = atom(null, (get, set, chatId: string) => {
  const currentChats = get(chatsAtom);
  const chatToDelete = currentChats[chatId];

  if (!chatToDelete) {
    console.warn(`Chat with ID ${chatId} not found for deletion.`);
    return;
  }

  const currentActiveId = get(activeChatIdAtom);
  let nextActiveId: string | null = currentActiveId;

  // If deleting the currently active chat, determine the next active chat
  if (currentActiveId === chatId) {
    const sortedChats = get(sortedChatsAtom); // Use sorted list for predictable selection
    const chatsWithoutDeleted = sortedChats.filter((c) => c.id !== chatId);

    if (chatsWithoutDeleted.length > 0) {
      const currentIndex = sortedChats.findIndex((c) => c.id === chatId);
      // Try to select the one at the same index (which is now the next one),
      // otherwise the one before, finally the first one.
      const nextIndex = Math.min(currentIndex, chatsWithoutDeleted.length - 1);
      nextActiveId = chatsWithoutDeleted[nextIndex]?.id ?? null;
    } else {
      nextActiveId = null; // No chats left
    }

    // If deleting the active chat while it's loading, cancel the request
    const abortInfo = get(abortControllerAtom);
    if (abortInfo && get(isAssistantLoadingAtom)) {
      console.log('Cancelling generation due to active chat deletion.');
      abortInfo.controller.abort();
      set(abortControllerAtom, null);
      set(isAssistantLoadingAtom, false);
      // Potentially reset streaming state on the message if needed, though deletion handles it
    }
  }

  // O(1) deletion using Record (by creating a new object without the key)
  set(chatsAtom, (prevChats) => {
    const newChats = { ...prevChats };
    delete newChats[chatId];
    return newChats;
  });

  // Update the active chat ID
  set(activeChatIdAtom, nextActiveId);

  // Reset editing state if the active chat was deleted
  if (currentActiveId === chatId) {
    set(editingMessageIdAtom, null);
  }

  toast.info(`Chat "${chatToDelete.name}" deleted.`);
});

/** Toggles the pinned status of a chat. */
export const togglePinChatAtom = atom(null, (_get, set, chatId: string) => {
  // O(1) update
  set(chatsAtom, (prevChats) => {
    const chatToToggle = prevChats[chatId];
    if (!chatToToggle) {
      console.warn(`Chat with ID ${chatId} not found for pinning.`);
      return prevChats;
    }
    const updatedChat = {
      ...chatToToggle,
      isPinned: !chatToToggle.isPinned,
      updatedAt: Date.now(),
    };
    return {
      ...prevChats,
      [chatId]: updatedChat,
    };
  });
  // No toast message needed usually for pinning
});

/** Deletes all chats that are not pinned. */
export const clearUnpinnedChatsAtom = atom(null, (get, set) => {
  const currentChats = get(chatsAtom);
  const currentActiveId = get(activeChatIdAtom);
  let activeChatIsUnpinnedAndDeleted = false;
  const pinnedChats: ChatsRecord = {};
  let deletedCount = 0;

  // Iterate and keep only pinned chats
  for (const chatId in currentChats) {
    const chat = currentChats[chatId];
    if (chat.isPinned) {
      pinnedChats[chatId] = chat;
    } else {
      deletedCount++;
      if (chatId === currentActiveId) {
        activeChatIsUnpinnedAndDeleted = true;
      }
    }
  }

  if (deletedCount === 0) {
    toast.info('No unpinned chats to clear.');
    return;
  }

  // If the active chat is unpinned and being deleted while loading, cancel
  if (activeChatIsUnpinnedAndDeleted && get(isAssistantLoadingAtom)) {
    const abortInfo = get(abortControllerAtom);
    if (abortInfo) {
      console.log(
        'Cancelling generation due to active (unpinned) chat being cleared.',
      );
      abortInfo.controller.abort();
      set(abortControllerAtom, null);
      set(isAssistantLoadingAtom, false);
    }
  }

  // Update state to only contain pinned chats
  set(chatsAtom, pinnedChats);

  // If the active chat was cleared, select a new active chat (first pinned)
  if (activeChatIsUnpinnedAndDeleted) {
    const firstPinnedChatId = Object.keys(pinnedChats)[0] ?? null; // Get the first remaining chat ID
    set(activeChatIdAtom, firstPinnedChatId);
    set(editingMessageIdAtom, null); // Reset editing state
  }

  toast.success(`${deletedCount} unpinned conversation(s) cleared.`);
});

/** Creates a duplicate of an existing chat. */
export const forkChatAtom = atom(null, (get, set, chatId: string) => {
  const chats = get(chatsAtom);
  const chatToFork = chats[chatId];

  if (!chatToFork) {
    console.warn(`Chat with ID ${chatId} not found for forking.`);
    toast.error('Could not find the chat to fork.');
    return;
  }

  try {
    // Deep clone using JSON methods (safe for Chat structure)
    const forkedChat: Chat = JSON.parse(JSON.stringify(chatToFork));
    const newId = uuidv4();
    const now = Date.now();

    // Update properties for the new forked chat
    forkedChat.id = newId;
    forkedChat.name = `${chatToFork.name} (forked)`;
    forkedChat.isPinned = false; // Forks aren't pinned by default
    forkedChat.createdAt = now;
    forkedChat.updatedAt = now;
    forkedChat.input = ''; // Reset input draft for the fork

    // Add the forked chat
    set(chatsAtom, (prevChats) => ({
      ...prevChats,
      [newId]: forkedChat,
    }));

    // Make the forked chat active
    set(activeChatIdAtom, newId);

    // Reset potentially interfering states
    set(editingMessageIdAtom, null);
    set(isAssistantLoadingAtom, false);
    set(abortControllerAtom, null);

    toast.success('Conversation forked successfully.');
  } catch (error) {
    console.error('Forking failed:', error);
    toast.error(
      `Forking failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
});

/** Deletes all non-pinned chats created *before* a reference chat. */
export const deleteChatsOlderThanAtom = atom(
  null,
  (get, set, referenceChatId: string) => {
    const currentChats = get(chatsAtom);
    const currentActiveId = get(activeChatIdAtom);
    const referenceChat = currentChats[referenceChatId];

    if (!referenceChat) {
      console.warn(
        `Reference chat with ID ${referenceChatId} not found for deleting older chats.`,
      );
      toast.error('Reference chat not found.');
      return;
    }

    const refTimestamp = referenceChat.createdAt;
    const chatsToKeep: ChatsRecord = {};
    let activeChatDeleted = false;
    let deletedCount = 0;

    for (const chatId in currentChats) {
      const chat = currentChats[chatId];
      // Keep if: Pinned OR is the Reference Chat OR Newer than or equal to reference
      if (
        chat.isPinned ||
        chat.id === referenceChatId ||
        chat.createdAt >= refTimestamp
      ) {
        chatsToKeep[chatId] = chat;
      } else {
        deletedCount++;
        if (chatId === currentActiveId) {
          activeChatDeleted = true;
        }
      }
    }

    if (deletedCount === 0) {
      toast.info('No older, unpinned chats found to delete.');
      return;
    }

    // If the active chat was deleted and loading, cancel generation
    if (activeChatDeleted && get(isAssistantLoadingAtom)) {
      const abortInfo = get(abortControllerAtom);
      if (abortInfo) {
        abortInfo.controller.abort();
        set(abortControllerAtom, null);
        set(isAssistantLoadingAtom, false);
      }
    }

    set(chatsAtom, chatsToKeep);

    // If the active chat was deleted, select a new active chat
    if (activeChatDeleted) {
      // Prefer the reference chat, then the newest remaining, then null
      const remainingChats = Object.values(chatsToKeep).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      const newActiveId = chatsToKeep[referenceChatId]
        ? referenceChatId
        : (remainingChats[0]?.id ?? null);
      set(activeChatIdAtom, newActiveId);
      set(editingMessageIdAtom, null); // Reset editing state
    }

    toast.success(`${deletedCount} older conversation(s) deleted.`);
  },
);

/** Deletes all non-pinned chats created *after* a reference chat. */
export const deleteChatsNewerThanAtom = atom(
  null,
  (get, set, referenceChatId: string) => {
    const currentChats = get(chatsAtom);
    const currentActiveId = get(activeChatIdAtom);
    const referenceChat = currentChats[referenceChatId];

    if (!referenceChat) {
      console.warn(
        `Reference chat with ID ${referenceChatId} not found for deleting newer chats.`,
      );
      toast.error('Reference chat not found.');
      return;
    }

    const refTimestamp = referenceChat.createdAt;
    const chatsToKeep: ChatsRecord = {};
    let activeChatDeleted = false;
    let deletedCount = 0;

    for (const chatId in currentChats) {
      const chat = currentChats[chatId];
      // Keep if: Pinned OR is the Reference Chat OR Older than or equal to reference
      if (
        chat.isPinned ||
        chat.id === referenceChatId ||
        chat.createdAt <= refTimestamp
      ) {
        chatsToKeep[chatId] = chat;
      } else {
        deletedCount++;
        if (chatId === currentActiveId) {
          activeChatDeleted = true;
        }
      }
    }

    if (deletedCount === 0) {
      toast.info('No newer, unpinned chats found to delete.');
      return;
    }

    // If the active chat was deleted and loading, cancel generation
    if (activeChatDeleted && get(isAssistantLoadingAtom)) {
      const abortInfo = get(abortControllerAtom);
      if (abortInfo) {
        abortInfo.controller.abort();
        set(abortControllerAtom, null);
        set(isAssistantLoadingAtom, false);
      }
    }

    set(chatsAtom, chatsToKeep);

    // If the active chat was deleted, select a new active chat
    if (activeChatDeleted) {
      // Prefer the reference chat, then the newest remaining, then null
      const remainingChats = Object.values(chatsToKeep).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      const newActiveId = chatsToKeep[referenceChatId]
        ? referenceChatId
        : (remainingChats[0]?.id ?? null);
      set(activeChatIdAtom, newActiveId);
      set(editingMessageIdAtom, null); // Reset editing state
    }

    toast.success(`${deletedCount} newer conversation(s) deleted.`);
  },
);

/** Resets any lingering streaming states in chats (e.g., after a crash or hard refresh). */
export const resetStreamingStatesAtom = atom(null, (get, set) => {
  let stateChanged = false;
  if (get(isAssistantLoadingAtom)) {
    set(isAssistantLoadingAtom, false);
    stateChanged = true;
  }
  if (get(abortControllerAtom)) {
    set(abortControllerAtom, null);
    stateChanged = true;
  }

  let chatsModified = false;
  set(chatsAtom, (prevChats) => {
    const newChats: ChatsRecord = {};
    let needsUpdate = false;
    for (const chatId in prevChats) {
      const chat = prevChats[chatId];
      let messagesUpdated = false;
      const updatedMessages = chat.messages.map((msg) => {
        if (msg.isStreaming) {
          messagesUpdated = true;
          return { ...msg, isStreaming: false };
        }
        return msg;
      });

      if (messagesUpdated) {
        chatsModified = true; // Mark that at least one chat was modified
        needsUpdate = true; // Mark that the overall chats object needs updating
        newChats[chatId] = { ...chat, messages: updatedMessages };
      } else {
        newChats[chatId] = chat; // Keep the original chat object if no messages changed
      }
    }
    // Only return a new object reference if something actually changed
    return needsUpdate ? newChats : prevChats;
  });

  if (stateChanged || chatsModified) {
    console.log('Reset lingering streaming states.');
    // Optional: Add a subtle toast message if desired
    // toast.info("Cleaned up any interrupted states.");
  }
});
