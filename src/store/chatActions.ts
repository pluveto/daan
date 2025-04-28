import { CreateChatDto, type ChatMetadata } from '@/services/ChatDataService';
import type { ChatEntity, MessageEntity } from '@/types';
import { atom } from 'jotai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import {
  abortControllerAtom,
  isAssistantLoadingAtom,
  streamingMessageContentAtom,
} from './apiState';
import { searchServiceAtom } from './search';
import { chatDataServiceAtom, isChatServiceReadyAtom } from './service';
import {
  defaultMaxTokensAtom,
  defaultModelAtom,
  defaultPromptAtom,
  defaultTemperatureAtom,
  defaultTopPAtom,
} from './settings';
import { editingMessageIdAtom, focusInputAtom } from './uiState';

// --- Action Atoms ---
/** Holds the metadata for display in the sidebar (ID, name, icon, timestamps, pinned status). Null until loaded. */

export const chatListMetadataAtom = atom<ChatMetadata[] | null>(null);
/** Tracks loading state for the chat list metadata. */
export const isLoadingChatListAtom = atom<boolean>(false);

// --- Active Chat State ---
/** ID of the currently selected chat. Setting this atom triggers loading the chat details. */
export const _activeChatIdAtom = atom<string | null>(null);
/** Holds the full data object (AppInternalChat) for the active chat. Null if no chat is active or during loading. */
export const activeChatDataAtom = atom<ChatEntity | null>(null);
/** Holds the messages (AppInternalMessage[]) for the active chat. Empty array if no chat or during loading. */
export const activeChatMessagesAtom = atom<MessageEntity[]>([]);
/** Tracks loading state specifically for the active chat's details and messages. */
export const isLoadingActiveChatAtom = atom<boolean>(false);

export const activeChatIdAtom = atom(
  (get) => {
    return get(_activeChatIdAtom);
  },
  (get, set, chatId: string) => {
    set(_activeChatIdAtom, chatId);
    set(loadActiveChatDetailAtom);
  },
);

/** Creates a new chat, adds it to the state, and makes it active. */
export const createNewChatAtom = atom(
  null,
  async (get, set, options?: CreateChatDto) => {
    const service = get(chatDataServiceAtom);
    const globalDefaults = {
      icon: '💬',
      name: `New Chat`, // Default initial name
      model: get(defaultModelAtom),
      systemPrompt: get(defaultPromptAtom),
      temperature: get(defaultTemperatureAtom),
      maxTokens: get(defaultMaxTokensAtom),
      topP: get(defaultTopPAtom),
      maxHistory: null, // Default uses global setting implicitly
    };

    const chatDataToCreate: CreateChatDto = {
      // Internal properties
      characterId: options?.characterId || null,
      isPinned: false,
      // Merge global defaults and specific options
      icon: options?.icon ?? globalDefaults.icon,
      name: options?.name ?? globalDefaults.name,
      model: options?.model ?? globalDefaults.model,
      systemPrompt: options?.systemPrompt ?? globalDefaults.systemPrompt,
      temperature: options?.temperature ?? globalDefaults.temperature,
      maxTokens: options?.maxTokens ?? globalDefaults.maxTokens,
      topP: options?.topP ?? globalDefaults.topP,
      maxHistory:
        options?.maxHistory !== undefined
          ? options?.maxHistory
          : globalDefaults.maxHistory, // Allow explicit null from options
    };

    const newChat = await service.createChat(chatDataToCreate);

    // After successful creation:
    set(_activeChatIdAtom, newChat.id); // Set as active
    set(loadChatListMetadataAtom); // Reload chat list
    set(loadActiveChatDetailAtom);
    toast.success(`Chat "${newChat.name}" created.`);

    // Set the new chat as active
    set(focusInputAtom, (c) => c + 1); // Trigger input focus

    // Reset potentially conflicting states
    set(editingMessageIdAtom, null);
    set(isAssistantLoadingAtom, false);
    set(abortControllerAtom, null); // Cancel any ongoing generation

    toast.success(`Chat "${newChat.name}" created.`);
    return newChat.id; // Return new ID
  },
);

/** Updates properties of an existing chat. */
export const updateChatAtom = atom(
  null,
  async (
    get,
    set,
    updates: Partial<Omit<ChatEntity, 'id' | 'createdAt' | 'updatedAt'>> & {
      id: string;
    },
  ) => {
    const { id, ...updateData } = updates;
    if (!id) {
      console.warn('Update chat called without ID');
      return;
    }
    const service = get(chatDataServiceAtom);
    const currentActiveChatId = get(_activeChatIdAtom);
    try {
      await service.updateChat(id, updateData);

      // --- Post-update state updates ---
      // 1. Update metadata list if relevant fields changed
      if (
        updateData.name !== undefined ||
        updateData.icon !== undefined ||
        updateData.isPinned !== undefined
      ) {
        set(loadChatListMetadataAtom); // Refresh the list
      }

      // 2. Update active chat data if the updated chat is the active one
      if (id === currentActiveChatId) {
        set(activeChatDataAtom, (prev) =>
          prev ? { ...prev, ...updateData, updatedAt: Date.now() } : null,
        );
      }

      // Don't show toast here, let caller (e.g., ActiveChatSettings save button) handle it.
    } catch (error) {
      console.error(`Failed to update chat ${id}:`, error);
      toast.error(
        `Failed to save chat settings for ${updateData.name || 'chat'}.`,
      );
    }
  },
);

/** Deletes a chat and selects the next appropriate active chat. */
export const deleteChatAtom = atom(null, async (get, set, chatId: string) => {
  const chatService = get(chatDataServiceAtom);
  const searchService = get(searchServiceAtom); // Get search service
  const activeId = get(_activeChatIdAtom);
  const chatMeta = get(chatListMetadataAtom)?.find((c) => c.id === chatId);
  console.log(`[deleteChatAtom] Deleting chat ${chatId}...`);

  // 1. Get message IDs *before* deleting (needed for search index removal)
  let messageIdsToRemove: string[] = [];
  try {
    // Optimize: Fetch only IDs if service supports it, otherwise full messages
    const messages = await chatService.getMessagesByChatId(chatId);
    messageIdsToRemove = messages.map((m) => m.id);
    console.log(
      `[deleteChatAtom] Found ${messageIdsToRemove.length} message IDs for chat ${chatId}.`,
    );
  } catch (error) {
    console.error(
      `[deleteChatAtom] Failed to fetch messages for chat ${chatId} before delete:`,
      error,
    );
    // Proceed with chat deletion? Or abort? Let's proceed but log warning.
    toast.warning(
      'Could not fetch message details before deletion. Search index might be inaccurate.',
    );
  }

  try {
    // 2. Delete chat and messages from DB
    await chatService.deleteChat(chatId); // Service handles DB deletion
    console.log(`[deleteChatAtom] Chat ${chatId} deleted from DB.`);

    // 3. Remove messages from search index (if IDs were fetched)
    if (messageIdsToRemove.length > 0) {
      await searchService.removeChatMessagesByIds(messageIdsToRemove);
      console.log(
        `[deleteChatAtom] Messages removed from search index for chat ${chatId}.`,
      );
    }

    // --- Post-delete state updates ---
    if (chatId === activeId) {
      set(_activeChatIdAtom, null);
    }
    set(loadChatListMetadataAtom);
    toast.success(`Chat "${chatMeta?.name || chatId}" deleted.`);
  } catch (error) {
    console.error(`[deleteChatAtom] Failed to delete chat ${chatId}:`, error);
    toast.error(`Failed to delete chat "${chatMeta?.name || chatId}".`);
  }
});

// Toggle Pin Chat
export const togglePinChatAtom = atom(
  null,
  async (get, set, chatId: string) => {
    const service = get(chatDataServiceAtom);
    const chat = await service.getChatById(chatId); // Need current state to toggle
    if (!chat) {
      toast.error('Chat not found to toggle pin.');
      return;
    }
    const newPinnedState = !chat.isPinned;
    try {
      await service.updateChat(chatId, { isPinned: newPinnedState });
      // Refresh list metadata to reflect pin change
      set(loadChatListMetadataAtom);
      // Update active chat data if it's the active one
      if (get(_activeChatIdAtom) === chatId) {
        set(activeChatDataAtom, (prev) =>
          prev
            ? { ...prev, isPinned: newPinnedState, updatedAt: Date.now() }
            : null,
        );
      }
      toast.success(`Chat ${newPinnedState ? 'pinned' : 'unpinned'}.`);
    } catch (error) {
      console.error(`Failed to toggle pin for chat ${chatId}:`, error);
      toast.error('Failed to update pin status.');
    }
  },
);

/** Deletes all chats that are not pinned. */
export const clearUnpinnedChatsAtom = atom(null, async (get, set) => {
  const chatService = get(chatDataServiceAtom);
  const searchService = get(searchServiceAtom); // Get search service
  const activeId = get(_activeChatIdAtom);
  const activeChatData = get(activeChatDataAtom);

  console.log('[clearUnpinnedChatsAtom] Clearing unpinned chats...');
  try {
    // 1. Identify chats and messages to delete
    const allMetadata = await chatService.getAllChatMetadata();
    const chatsToDelete = allMetadata.filter((c) => !c.isPinned);
    const idsToDelete = chatsToDelete.map((c) => c.id);

    if (idsToDelete.length === 0) {
      toast.info('No unpinned chats to delete.');
      return;
    }

    console.log(
      `[clearUnpinnedChatsAtom] Found ${idsToDelete.length} unpinned chats to delete.`,
    );
    // Fetch all message IDs for these chats BEFORE deleting
    let allMessageIdsToRemove: string[] = [];
    for (const chatId of idsToDelete) {
      try {
        const messages = await chatService.getMessagesByChatId(chatId);
        allMessageIdsToRemove.push(...messages.map((m) => m.id));
      } catch (fetchError) {
        console.warn(
          `[clearUnpinnedChatsAtom] Failed to fetch messages for chat ${chatId}:`,
          fetchError,
        );
        // Continue deletion, but search index will be partially stale
      }
    }
    console.log(
      `[clearUnpinnedChatsAtom] Found ${allMessageIdsToRemove.length} total messages to remove from index.`,
    );

    // 2. Delete chats from DB (service handles deleting messages too)
    await chatService.clearUnpinnedChats(); // Uses deleteChats internally
    console.log(`[clearUnpinnedChatsAtom] Unpinned chats deleted from DB.`);

    // 3. Remove messages from search index
    if (allMessageIdsToRemove.length > 0) {
      await searchService.removeChatMessagesByIds(allMessageIdsToRemove);
      console.log(
        `[clearUnpinnedChatsAtom] Messages removed from search index.`,
      );
    }

    // --- Post-clear state updates ---
    if (activeId && activeChatData && !activeChatData.isPinned) {
      set(_activeChatIdAtom, null);
    }
    set(loadChatListMetadataAtom);
    toast.success('Unpinned chats deleted.');
  } catch (error) {
    console.error('[clearUnpinnedChatsAtom] Failed:', error);
    toast.error('Failed to delete unpinned chats.');
  }
});

/** Creates a copy of the specified chat including its messages. */
export const forkChatAtom = atom(
  null,
  async (get, set, originalChatId: string): Promise<string | null> => {
    const service = get(chatDataServiceAtom);
    console.log(`[forkChatAtom] Forking chat ${originalChatId}...`);
    try {
      // 1. Get original chat data and messages
      const originalChat = await service.getChatById(originalChatId);
      if (!originalChat) {
        toast.error('Chat to fork not found.');
        console.error(
          `[forkChatAtom] Original chat ${originalChatId} not found.`,
        );
        return null;
      }
      const originalMessages =
        await service.getMessagesByChatId(originalChatId);

      // 2. Prepare new chat data
      const newChatId = uuidv4(); // Generate new ID for the fork
      const { id, createdAt, updatedAt, ...forkedChatData } = originalChat; // Exclude old IDs/timestamps
      forkedChatData.name = `${forkedChatData.name} (fork)`; // Modify name
      forkedChatData.isPinned = false; // Forks are not pinned by default

      // 3. Create the new chat in the DB
      const newChat = await service.createChat({
        ...forkedChatData,
        id: newChatId,
      }); // Pass new ID
      console.log(`[forkChatAtom] Forked chat created with ID ${newChat.id}.`);

      // 4. Prepare and add messages for the new chat
      if (originalMessages.length > 0) {
        const newMessagesData = originalMessages.map((msg) => {
          // Create new message object, assign new chatId, generate new messageId
          const { id: oldMsgId, chatId: oldChatId, ...messageContent } = msg;
          return {
            ...messageContent,
            id: uuidv4(), // New ID for the copied message
            chatId: newChat.id, // Link to the new chat
            // Keep original timestamp? Or reset? Keep for now.
          };
        });
        await service.addMessages(newMessagesData); // Bulk add messages
        console.log(
          `[forkChatAtom] Copied ${newMessagesData.length} messages to forked chat ${newChat.id}.`,
        );
      }

      // 5. Set the new chat as active and refresh list
      set(_activeChatIdAtom, newChat.id); // Triggers loading of the new chat
      set(loadChatListMetadataAtom); // Refresh sidebar
      set(focusInputAtom, Date.now()); // Focus input

      toast.success(`Chat "${originalChat.name}" forked successfully.`);
      return newChat.id;
    } catch (error) {
      console.error(
        `[forkChatAtom] Failed to fork chat ${originalChatId}:`,
        error,
      );
      toast.error('Failed to fork chat.');
      return null;
    }
  },
);

/** Deletes chats created before the specified pivot chat (excluding pinned). */
export const deleteChatsOlderThanAtom = atom(
  null,
  async (get, set, pivotChatId: string) => {
    const service = get(chatDataServiceAtom);
    const activeId = get(_activeChatIdAtom);
    console.log(
      `[deleteChatsOlderThanAtom] Deleting chats older than ${pivotChatId}...`,
    );

    try {
      // 1. Fetch all metadata (needed for timestamp comparison)
      const allMetadata = await service.getAllChatMetadata(); // Use service directly for fresh data
      const pivotMetadata = allMetadata.find((c) => c.id === pivotChatId);

      if (!pivotMetadata) {
        toast.error('Reference chat for deletion not found.');
        console.error(
          `[deleteChatsOlderThanAtom] Pivot chat ${pivotChatId} not found.`,
        );
        return;
      }

      const pivotTimestamp = pivotMetadata.createdAt; // Use createdAt for "older than"

      // 2. Filter for chats to delete (older and not pinned)
      const idsToDelete = allMetadata
        .filter(
          (c) =>
            c.createdAt < pivotTimestamp && !c.isPinned && c.id !== pivotChatId,
        )
        .map((c) => c.id);

      if (idsToDelete.length === 0) {
        toast.info('No older, unpinned chats found to delete.');
        console.log(
          `[deleteChatsOlderThanAtom] No chats older than ${pivotChatId} found.`,
        );
        return;
      }

      console.log(
        `[deleteChatsOlderThanAtom] Found ${idsToDelete.length} chats to delete:`,
        idsToDelete,
      );

      // 3. Perform bulk delete
      await service.deleteChats(idsToDelete);

      // 4. Handle active chat reset and refresh list
      if (activeId && idsToDelete.includes(activeId)) {
        console.log(
          `[deleteChatsOlderThanAtom] Active chat ${activeId} was deleted, clearing active state.`,
        );
        set(_activeChatIdAtom, null);
      }
      set(loadChatListMetadataAtom);

      toast.success(`${idsToDelete.length} older chat(s) deleted.`);
      console.log(
        `[deleteChatsOlderThanAtom] ${idsToDelete.length} chats deleted successfully.`,
      );
    } catch (error) {
      console.error(
        `[deleteChatsOlderThanAtom] Failed for pivot ${pivotChatId}:`,
        error,
      );
      toast.error('Failed to delete older chats.');
    }
  },
);

/** Deletes chats created after the specified pivot chat (excluding pinned). */
export const deleteChatsNewerThanAtom = atom(
  null,
  async (get, set, pivotChatId: string) => {
    const service = get(chatDataServiceAtom);
    const activeId = get(_activeChatIdAtom);
    console.log(
      `[deleteChatsNewerThanAtom] Deleting chats newer than ${pivotChatId}...`,
    );

    try {
      // 1. Fetch metadata
      const allMetadata = await service.getAllChatMetadata();
      const pivotMetadata = allMetadata.find((c) => c.id === pivotChatId);

      if (!pivotMetadata) {
        toast.error('Reference chat for deletion not found.');
        console.error(
          `[deleteChatsNewerThanAtom] Pivot chat ${pivotChatId} not found.`,
        );
        return;
      }

      const pivotTimestamp = pivotMetadata.createdAt; // Use createdAt for "newer than"

      // 2. Filter for chats to delete (newer and not pinned)
      const idsToDelete = allMetadata
        .filter(
          (c) =>
            c.createdAt > pivotTimestamp && !c.isPinned && c.id !== pivotChatId,
        )
        .map((c) => c.id);

      if (idsToDelete.length === 0) {
        toast.info('No newer, unpinned chats found to delete.');
        console.log(
          `[deleteChatsNewerThanAtom] No chats newer than ${pivotChatId} found.`,
        );
        return;
      }

      console.log(
        `[deleteChatsNewerThanAtom] Found ${idsToDelete.length} chats to delete:`,
        idsToDelete,
      );

      // 3. Perform bulk delete
      await service.deleteChats(idsToDelete);

      // 4. Handle active chat reset and refresh list
      if (activeId && idsToDelete.includes(activeId)) {
        console.log(
          `[deleteChatsNewerThanAtom] Active chat ${activeId} was deleted, clearing active state.`,
        );
        set(_activeChatIdAtom, null);
      }
      set(loadChatListMetadataAtom);

      toast.success(`${idsToDelete.length} newer chat(s) deleted.`);
      console.log(
        `[deleteChatsNewerThanAtom] ${idsToDelete.length} chats deleted successfully.`,
      );
    } catch (error) {
      console.error(
        `[deleteChatsNewerThanAtom] Failed for pivot ${pivotChatId}:`,
        error,
      );
      toast.error('Failed to delete newer chats.');
    }
  },
);

/**
 * Resets global API loading states and clears any transient in-memory
 * streaming content state.
 *
 * Intended to be called once on application startup (e.g., in App.tsx useEffect)
 * to clean up potentially inconsistent global/transient state after a hard
 * refresh or crash that occurred during an API response stream.
 *
 * Note: This atom does NOT scan the database for potentially incomplete messages
 * that might have been partially saved before a crash. Handling or indicating
 * such potentially incomplete messages would require a different strategy
 * (e.g., checking message state on load within ChatHistory).
 */
export const resetGlobalStreamingStateAtom = atom(
  null, // Write-only atom
  (get, set) => {
    let stateChanged = false;
    console.log(
      '[resetGlobalStreamingStateAtom] Checking for lingering global/transient streaming states...',
    );

    // 1. Reset global 'isAssistantLoading' flag
    if (get(isAssistantLoadingAtom)) {
      set(isAssistantLoadingAtom, false);
      stateChanged = true;
      console.log(
        '[resetGlobalStreamingStateAtom] Reset isAssistantLoadingAtom to false.',
      );
    }

    // 2. Reset global 'abortController' info
    if (get(abortControllerAtom)) {
      // The controller itself is likely invalid after a refresh, just clear the atom.
      set(abortControllerAtom, null);
      stateChanged = true;
      console.log(
        '[resetGlobalStreamingStateAtom] Cleared abortControllerAtom.',
      );
    }

    // 3. Clear the transient streaming content map
    const currentStreamingMap = get(streamingMessageContentAtom);
    if (currentStreamingMap.size > 0) {
      set(streamingMessageContentAtom, new Map()); // Reset to a new empty map
      stateChanged = true;
      console.log(
        `[resetGlobalStreamingStateAtom] Cleared ${currentStreamingMap.size} entries from transient streamingMessageContentAtom.`,
      );
    }

    if (stateChanged) {
      console.log(
        '[resetGlobalStreamingStateAtom] Lingering global/transient states were reset.',
      );
      // Optional feedback to the user if desired
      // toast.info("Cleaned up potentially interrupted operations.", { duration: 2000 });
    } else {
      console.log(
        '[resetGlobalStreamingStateAtom] No lingering global/transient states found to reset.',
      );
    }
  },
);

/** Action atom to load/refresh chat list metadata from the data service. */
export const loadChatListMetadataAtom = atom(
  null, // No read value needed for the action itself
  async (get, set) => {
    if (!get(isChatServiceReadyAtom)) {
      console.warn(
        '[loadChatListMetadataAtom] Chat service not ready, skipping metadata load.',
      );
      return;
    }
    // Avoid concurrent loads if already loading
    if (get(isLoadingChatListAtom)) {
      console.log('[loadChatListMetadataAtom] Already loading, skipping.');
      return;
    }
    set(isLoadingChatListAtom, true);
    console.log('[loadChatListMetadataAtom] Loading chat list metadata...');
    try {
      const service = get(chatDataServiceAtom);
      const metadata = await service.getAllChatMetadata(); // Sorted by service
      set(chatListMetadataAtom, metadata);
      console.log(
        `[loadChatListMetadataAtom] Loaded ${metadata.length} chat metadata items.`,
      );
    } catch (error) {
      console.error('[loadChatListMetadataAtom] Failed:', error);
      set(chatListMetadataAtom, []); // Set to empty array on error
      toast.error('Failed to load chat list.');
    } finally {
      set(isLoadingChatListAtom, false);
    }
  },
);

/** Private action atom to perform the actual loading of active chat details and messages. */
const loadActiveChatDetailAtom = atom(null, async (get, set) => {
  const activeId = get(_activeChatIdAtom);
  const alreadyLoadedChatId = get(activeChatDataAtom)?.id;

  if (!activeId) {
    if (alreadyLoadedChatId) {
      // Clear state only if something was loaded before
      set(activeChatDataAtom, null);
      set(activeChatMessagesAtom, []);
    }
    return;
  }

  // Avoid reloading the same chat unnecessarily
  if (activeId === alreadyLoadedChatId) {
    console.log(
      `[loadActiveChatDetailAtom] Chat ${activeId} is already loaded.`,
    );
    return;
  }

  set(isLoadingActiveChatAtom, true);
  set(activeChatDataAtom, null); // Clear previous data before loading new
  set(activeChatMessagesAtom, []); // Clear previous messages

  console.log(`[loadActiveChatDetailAtom] Loading active chat: ${activeId}...`);
  try {
    const service = get(chatDataServiceAtom);
    // Fetch concurrently
    const [chat, messages] = await Promise.all([
      service.getChatById(activeId),
      service.getMessagesByChatId(activeId), // Load all messages for now
    ]);

    if (chat) {
      set(activeChatDataAtom, chat);
      set(activeChatMessagesAtom, messages);
      console.log(
        `[loadActiveChatDetailAtom] Loaded active chat ${activeId} with ${messages.length} messages.`,
      );
    } else {
      console.error(
        `[loadActiveChatDetailAtom] Active chat with ID ${activeId} not found in DB.`,
      );
      toast.error(
        `Could not load chat (ID: ${activeId}). It may have been deleted.`,
      );
      set(_activeChatIdAtom, null); // Reset active ID as it's invalid
    }
  } catch (error) {
    console.error(
      `[loadActiveChatDetailAtom] Failed to load active chat ${activeId}:`,
      error,
    );
    toast.error(
      `Failed to load chat: ${error instanceof Error ? error.message : String(error)}`,
    );
    set(_activeChatIdAtom, null); // Reset active ID on error
    set(activeChatDataAtom, null);
    set(activeChatMessagesAtom, []);
  } finally {
    set(isLoadingActiveChatAtom, false);
  }
}); // --- Chat List State ---
