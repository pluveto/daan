import { atomWithSafeStorage } from '@/lib/utils.ts';
import {
  exampleModels,
  type Chat,
  type Message,
  type SupportedModels,
} from '@/types.ts';
import { atom } from 'jotai';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

// --- UI State Atoms ---
export const isLeftSidebarOpenAtom = atom(true);
export const isRightSidebarOpenAtom = atom(true);
export const isChatSettingsModalOpenAtom = atom(false);
export const isAssistantLoadingAtom = atom(false); // Global flag: Is *any* assistant request running?
export const editingMessageIdAtom = atom<string | null>(null);

// --- Request State Atom ---
// Holds the controller to abort the current OpenAI stream request
export const abortControllerAtom = atom<{
  controller: AbortController;
  messageId: string;
} | null>(null);

// --- Global Settings Atoms ---
export const apiKeyAtom = atomWithSafeStorage<string>(
  'globalSettings_apiKey',
  '',
);
export const apiBaseUrlAtom = atomWithSafeStorage<string>(
  'globalSettings_apiBaseUrl',
  '',
);
export const defaultModelAtom = atomWithSafeStorage<SupportedModels>(
  'globalSettings_defaultModel',
  'gpt-4o',
);
export const defaultSummaryModelAtom = atomWithSafeStorage<SupportedModels>(
  'globalSettings_defaultSummaryModel',
  'gpt-3.5-turbo',
);
export const defaultPromptAtom = atomWithSafeStorage<string>(
  'globalSettings_defaultPrompt',
  'You are a helpful assistant.',
);
export const defaultMaxHistoryAtom = atomWithSafeStorage<number>(
  'globalSettings_maxHistory',
  20,
);
export const nightModeAtom = atomWithSafeStorage<boolean>(
  'globalSettings_nightMode',
  false,
);
export const generateSummaryAtom = atomWithSafeStorage<boolean>(
  'globalSettings_generateSummary',
  true,
);
export const showTimestampsAtom = atomWithSafeStorage<boolean>(
  'globalSettings_showTimestamps',
  true,
);
export const showEstimatedTokensAtom = atomWithSafeStorage<boolean>(
  'globalSettings_showEstimatedTokens',
  true,
);
export const customModelsAtom = atomWithSafeStorage<string[]>(
  'globalSettings_customModels',
  [],
);

// --- Chat Data Atoms ---
export const chatsAtom = atomWithSafeStorage<Chat[]>('chats', []);
export const activeChatIdAtom = atomWithSafeStorage<string | null>(
  'activeChatId',
  null,
);

// --- Derived Atoms ---

export const activeChatAtom = atom<Chat | null>((get) => {
  const chats = get(chatsAtom);
  const activeId = get(activeChatIdAtom);
  if (!activeId) {
    return null;
  }
  return chats.find((chat) => chat.id === activeId) ?? null;
});

export const availableModelsAtom = atom<SupportedModels[]>((get) => {
  const custom = get(customModelsAtom);
  return [...new Set([...exampleModels, ...custom])];
});

export const sortedChatsAtom = atom<Chat[]>((get) => {
  const chats = get(chatsAtom);
  return [...chats].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });
});

// --- Action Atoms (Write-only atoms) ---

export const createNewChatAtom = atom(null, (get, set) => {
  const newId = uuidv4();
  const now = Date.now();
  const newChat: Chat = {
    createdAt: now,
    icon: '💬',
    id: newId,
    isPinned: false,
    input: '',
    maxHistory: null,
    messages: [],
    model: get(defaultModelAtom),
    name: `Chat ${new Date(now).toLocaleTimeString()}`,
    systemPrompt: get(defaultPromptAtom),
    updatedAt: now,
  };
  set(chatsAtom, (prevChats) => [newChat, ...prevChats]);
  set(activeChatIdAtom, newId);
  set(editingMessageIdAtom, null);
  set(isAssistantLoadingAtom, false); // Ensure loading is off when creating new chat
  set(abortControllerAtom, null); // Clear any potential leftover controller
});

export const updateChatAtom = atom(
  null,
  (_get, set, update: Partial<Chat> & { id: string }) => {
    set(chatsAtom, (prevChats) =>
      prevChats.map((chat) =>
        chat.id === update.id
          ? { ...chat, ...update, updatedAt: Date.now() }
          : chat,
      ),
    );
  },
);

export const deleteChatAtom = atom(null, (get, set, chatId: string) => {
  const currentActiveId = get(activeChatIdAtom);
  let nextActiveId: string | null = null;

  if (currentActiveId === chatId) {
    const sortedChats = get(sortedChatsAtom);
    const currentIndex = sortedChats.findIndex((c) => c.id === chatId);
    const chatsWithoutDeleted = sortedChats.filter((c) => c.id !== chatId);
    if (chatsWithoutDeleted.length > 0) {
      nextActiveId =
        chatsWithoutDeleted[currentIndex]?.id ??
        chatsWithoutDeleted[currentIndex - 1]?.id ??
        chatsWithoutDeleted[0]?.id;
    }
    // If deleting the active chat while loading, cancel generation
    const abortInfo = get(abortControllerAtom);
    if (abortInfo) {
      console.log('Cancelling generation due to active chat deletion.');
      abortInfo.controller.abort();
      set(abortControllerAtom, null);
      set(isAssistantLoadingAtom, false);
      // Find the streaming message and finalize it (optional, finalize might handle it)
      // set(finalizeStreamingMessageAtom, abortInfo.messageId); // Let finalize handle it
    }
  } else {
    nextActiveId = currentActiveId;
  }

  set(chatsAtom, (prevChats) => prevChats.filter((chat) => chat.id !== chatId));
  set(activeChatIdAtom, nextActiveId);

  if (currentActiveId === chatId) {
    set(editingMessageIdAtom, null);
  }
});

export const togglePinChatAtom = atom(null, (_get, set, chatId: string) => {
  set(chatsAtom, (prevChats) =>
    prevChats.map((chat) =>
      chat.id === chatId
        ? { ...chat, isPinned: !chat.isPinned, updatedAt: Date.now() }
        : chat,
    ),
  );
});

export const clearUnpinnedChatsAtom = atom(null, (get, set) => {
  const currentActiveId = get(activeChatIdAtom);
  const pinnedChats = get(chatsAtom).filter((chat) => chat.isPinned);
  const unpinnedChats = get(chatsAtom).filter((chat) => !chat.isPinned);
  const activeChatIsUnpinned = unpinnedChats.some(
    (chat) => chat.id === currentActiveId,
  );

  // If the active chat is unpinned and loading, cancel generation
  if (activeChatIsUnpinned && get(isAssistantLoadingAtom)) {
    const abortInfo = get(abortControllerAtom);
    if (abortInfo) {
      console.log('Cancelling generation due to active chat being cleared.');
      abortInfo.controller.abort();
      set(abortControllerAtom, null);
      set(isAssistantLoadingAtom, false);
    }
  }

  set(chatsAtom, pinnedChats);

  if (activeChatIsUnpinned) {
    set(activeChatIdAtom, pinnedChats.length > 0 ? pinnedChats[0].id : null);
    set(editingMessageIdAtom, null);
  }
});

export const upsertMessageInActiveChatAtom = atom(
  null,
  (get, set, message: Message) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) {
      return;
    }

    set(chatsAtom, (prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === activeId) {
          const existingMsgIndex = chat.messages.findIndex(
            (m) => m.id === message.id,
          );
          let newMessages: Message[];
          if (existingMsgIndex > -1) {
            // Update existing message
            newMessages = [...chat.messages];
            // Preserve isStreaming flag if the update is for a streaming message
            // unless the incoming message explicitly sets it to false
            const isCurrentlyStreaming =
              newMessages[existingMsgIndex].isStreaming;
            newMessages[existingMsgIndex] = {
              ...message,
              // Keep streaming true if it was already true and the update doesn't change it
              isStreaming: message.isStreaming ?? isCurrentlyStreaming,
            };
          } else {
            // Add new message
            newMessages = [...chat.messages, message];
          }
          return {
            ...chat,
            messages: newMessages,
            // Only update timestamp if not currently streaming this message
            updatedAt: message.isStreaming ? chat.updatedAt : Date.now(),
          };
        }
        return chat;
      }),
    );
  },
);

export const deleteMessageFromActiveChatAtom = atom(
  null,
  (get, set, messageId: string) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) {
      return;
    }

    // If deleting the message currently being generated, cancel the generation
    const abortInfo = get(abortControllerAtom);
    if (abortInfo?.messageId === messageId) {
      console.log(
        'Cancelling generation because the streaming message was deleted.',
      );
      abortInfo.controller.abort();
      set(abortControllerAtom, null);
      set(isAssistantLoadingAtom, false);
    }

    let chatFound = false;
    set(chatsAtom, (prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === activeId) {
          chatFound = true;
          const originalLength = chat.messages.length;
          const filteredMessages = chat.messages.filter(
            (msg) => msg.id !== messageId,
          );
          // Only update timestamp if a message was actually deleted
          const updatedAt =
            filteredMessages.length < originalLength
              ? Date.now()
              : chat.updatedAt;
          return {
            ...chat,
            messages: filteredMessages,
            updatedAt,
          };
        }
        return chat;
      }),
    );

    // Clear editing state if the deleted message was being edited
    if (chatFound && get(editingMessageIdAtom) === messageId) {
      set(editingMessageIdAtom, null);
    }
  },
);

export const appendContentToMessageAtom = atom(
  null,
  (
    get,
    set,
    { contentChunk, messageId }: { contentChunk: string; messageId: string },
  ) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) {
      return;
    }

    set(chatsAtom, (prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === activeId) {
          const msgIndex = chat.messages.findIndex((m) => m.id === messageId);
          if (msgIndex > -1) {
            const updatedMessages = [...chat.messages];
            const currentContent = updatedMessages[msgIndex].content ?? '';
            updatedMessages[msgIndex] = {
              ...updatedMessages[msgIndex],
              content: currentContent + contentChunk,
              isStreaming: true, // Ensure it's marked as streaming
              timestamp: updatedMessages[msgIndex].timestamp, // Keep original timestamp
            };
            // Do not update chat's updatedAt during streaming appends
            return { ...chat, messages: updatedMessages };
          }
        }
        return chat;
      }),
    );
  },
);

export const finalizeStreamingMessageAtom = atom(
  null,
  (get, set, messageId: string) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) {
      // If no active chat, ensure loading state is off
      set(isAssistantLoadingAtom, false);
      set(abortControllerAtom, null); // Also clear controller if finalizing without active chat
      return;
    }

    let messageFoundAndFinalized = false;
    set(chatsAtom, (prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === activeId) {
          const msgIndex = chat.messages.findIndex((m) => m.id === messageId);
          if (msgIndex > -1 && chat.messages[msgIndex].isStreaming) {
            const updatedMessages = [...chat.messages];
            updatedMessages[msgIndex] = {
              ...updatedMessages[msgIndex],
              isStreaming: false, // Mark as finished
            };
            messageFoundAndFinalized = true;
            // Update chat timestamp when streaming finishes
            return {
              ...chat,
              messages: updatedMessages,
              updatedAt: Date.now(),
            };
          }
        }
        return chat;
      }),
    );

    // Only turn off global loading if the message was actually found and finalized
    // This prevents turning off loading prematurely if finalize is called unexpectedly
    if (messageFoundAndFinalized) {
      set(isAssistantLoadingAtom, false);
      // No need to clear abortController here, finally block in callOpenAIStreamLogic handles it
    } else {
      // If the message wasn't found (e.g., deleted before finalize), ensure loading is off
      const abortInfo = get(abortControllerAtom);
      if (abortInfo?.messageId === messageId) {
        set(isAssistantLoadingAtom, false);
        set(abortControllerAtom, null); // Clean up controller if message is gone
      }
    }
  },
);

// Action to cancel the current streaming generation
export const cancelGenerationAtom = atom(null, (get, set) => {
  const abortInfo = get(abortControllerAtom);
  if (abortInfo) {
    console.log(
      'User requested cancellation for message:',
      abortInfo.messageId,
    );
    abortInfo.controller.abort(); // Signal cancellation
    // The finally block in callOpenAIStreamLogic and the finalize atom
    // will handle resetting loading state and clearing the controller atom.
    // We don't strictly need to set loading false here, but it can make UI feel faster.
    // set(isAssistantLoadingAtom, false);
    // set(abortControllerAtom, null); // Let finally block handle this
  } else {
    console.warn('Cancel requested, but no active abort controller found.');
    // Ensure loading state is reset if somehow cancellation is triggered without a controller
    if (get(isAssistantLoadingAtom)) {
      set(isAssistantLoadingAtom, false);
    }
  }
});

export const setEditingMessageIdAtom = atom(
  null,
  (_get, set, messageId: string | null) => {
    set(editingMessageIdAtom, messageId);
  },
);

export const updateMessageContentAtom = atom(
  null,
  (
    get,
    set,
    { messageId, newContent }: { messageId: string; newContent: string },
  ) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) {
      return;
    }

    set(chatsAtom, (prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === activeId) {
          const msgIndex = chat.messages.findIndex((m) => m.id === messageId);
          if (msgIndex > -1) {
            const updatedMessages = [...chat.messages];
            updatedMessages[msgIndex] = {
              ...updatedMessages[msgIndex],
              content: newContent,
              isStreaming: false, // Ensure streaming is off after edit
            };
            return {
              ...chat,
              messages: updatedMessages,
              updatedAt: Date.now(),
            };
          }
        }
        return chat;
      }),
    );
    set(editingMessageIdAtom, null);
  },
);

// --- NEW REGENERATION ATOM ---

export const regenerateMessageAtom = atom(
  null,
  (get, set, targetMessageId: string) => {
    const activeChat = get(activeChatAtom);
    const apiKey = get(apiKeyAtom);
    const apiBaseUrl = get(apiBaseUrlAtom);
    const upsertMessage = (msg: Message) =>
      set(upsertMessageInActiveChatAtom, msg);
    const appendContent = (payload: {
      contentChunk: string;
      messageId: string;
    }) => set(appendContentToMessageAtom, payload);
    const finalizeStream = (msgId: string) =>
      set(finalizeStreamingMessageAtom, msgId);
    const setIsLoading = (loading: boolean) =>
      set(isAssistantLoadingAtom, loading);
    const setAbortCtrl = (
      ctrl: { controller: AbortController; messageId: string } | null,
    ) => set(abortControllerAtom, ctrl);

    if (!activeChat || get(isAssistantLoadingAtom) || !targetMessageId) {
      console.warn('Regeneration conditions not met:', {
        hasActiveChat: !!activeChat,
        isLoading: get(isAssistantLoadingAtom),
        targetMessageId,
      });
      return;
    }

    const targetIndex = activeChat.messages.findIndex(
      (m) => m.id === targetMessageId,
    );

    if (targetIndex === -1) {
      console.error(
        `Message with ID ${targetMessageId} not found in active chat.`,
      );
      return;
    }

    const targetMessage = activeChat.messages[targetIndex];
    const maxHistory = activeChat.maxHistory ?? get(defaultMaxHistoryAtom);

    let historySlice: Message[];
    let messageIdToDelete: string | null = null;

    if (targetMessage.role === 'assistant') {
      // Regenerate Assistant Message:
      // History includes messages *before* this assistant message.
      historySlice = activeChat.messages.slice(0, targetIndex);
      // We will delete the original assistant message.
      messageIdToDelete = targetMessageId;
    } else if (targetMessage.role === 'user') {
      // Regenerate based on User Message:
      // History includes messages *up to and including* this user message.
      historySlice = activeChat.messages.slice(0, targetIndex + 1);
      // We need to delete the *next* message if it's an assistant response.
      const nextMessage = activeChat.messages[targetIndex + 1];
      if (nextMessage?.role === 'assistant') {
        messageIdToDelete = nextMessage.id;
      }
      // If the next message isn't an assistant message, we delete nothing and just append.
    } else {
      // Don't regenerate other message types (like dividers)
      console.warn(`Cannot regenerate message type: ${targetMessage.role}`);
      return;
    }

    // Prepare messages for API call using the determined history slice
    const relevantHistory = getHistoryForApi(
      historySlice,
      maxHistory,
      activeChat.systemPrompt,
    );

    // Check if there's enough context to generate a response
    // (Allowing just a system prompt is okay if the first message is user/assistant)
    if (
      relevantHistory.length === 0 ||
      (relevantHistory.length === 1 &&
        relevantHistory[0].role === 'system' &&
        historySlice.length === 0) // Only system prompt is not enough if there was no user msg
    ) {
      console.warn(
        'Not enough history context to regenerate response for message:',
        targetMessageId,
      );
      // We might have decided to delete a message; if regeneration fails early,
      // ensure the deletion happens IF it was planned.
      if (messageIdToDelete) {
        // Check if message still exists before deleting
        if (activeChat.messages.some((m) => m.id === messageIdToDelete)) {
          console.log(
            'Deleting message before failed regeneration:',
            messageIdToDelete,
          );
          set(deleteMessageFromActiveChatAtom, messageIdToDelete);
        }
      }
      return;
    }

    console.log(
      'Regenerating message:',
      targetMessageId,
      'Role:',
      targetMessage.role,
    );

    // --- Execute Deletion and Generation ---

    // 1. Delete the appropriate message (if identified) *before* calling the API
    if (messageIdToDelete) {
      // Check if message still exists before deleting (important due to potential async nature)
      const currentChatState = get(activeChatAtom); // Get fresh state
      if (currentChatState?.messages.some((m) => m.id === messageIdToDelete)) {
        console.log('Deleting message before regeneration:', messageIdToDelete);
        set(deleteMessageFromActiveChatAtom, messageIdToDelete);
      } else {
        console.warn('Message to delete was already gone:', messageIdToDelete);
      }
    }

    // 2. Call the OpenAI stream function to generate and append/upsert the new response
    callOpenAIStreamLogic(
      apiKey,
      apiBaseUrl,
      activeChat.model,
      relevantHistory,
      setIsLoading,
      upsertMessage, // Adds the new message placeholder
      appendContent, // Appends content to the new message
      finalizeStream, // Finalizes the new message
      setAbortCtrl, // Sets the abort controller for the new message
    );
  },
);

// --- End of NEW REGENERATION ATOM ---

// Deprecated: Only regenerates the *last* response
export const regenerateLastResponseAtom = atom(null, (get, set) => {
  const activeChat = get(activeChatAtom);
  if (!activeChat) return;

  let lastAssistantIndex = -1;
  for (let i = activeChat.messages.length - 1; i >= 0; i--) {
    if (activeChat.messages[i].role === 'assistant') {
      lastAssistantIndex = i;
      break;
    }
  }

  if (lastAssistantIndex !== -1) {
    console.log('Using NEW regenerateMessageAtom for last response.');
    set(regenerateMessageAtom, activeChat.messages[lastAssistantIndex].id);
  } else {
    console.warn('No assistant message found to regenerate.');
  }
});

export const resetStreamingStatesAtom = atom(null, (get, set) => {
  // Reset global loading state
  set(isAssistantLoadingAtom, false);

  // Clear any active abort controller
  set(abortControllerAtom, null);

  // Reset streaming flags in all messages across all chats
  set(chatsAtom, (prevChats) =>
    prevChats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((msg) => ({
        ...msg,
        isStreaming: false,
      })),
    })),
  );
});

// --- Helper Functions (used by actions) ---

async function callOpenAIStreamLogic(
  apiKey: string,
  apiBaseUrl: string | null,
  model: string,
  messagesToSend: OpenAI.ChatCompletionMessageParam[],
  setIsLoading: (loading: boolean) => void,
  upsertMessage: (message: Message) => void,
  appendContent: (payload: { contentChunk: string; messageId: string }) => void,
  finalizeStream: (messageId: string) => void,
  setAbortController: (
    controllerInfo: { controller: AbortController; messageId: string } | null,
  ) => void,
) {
  if (!apiKey) {
    alert('Please set your OpenAI API Key in the Global Settings.');
    // No need to set loading false here, as it wasn't set true yet
    return;
  }

  setIsLoading(true);
  const assistantMessageId = uuidv4(); // Generate a unique ID for the new message
  const controller = new AbortController();
  setAbortController({ controller, messageId: assistantMessageId }); // Store the controller associated with the new message ID

  // Add placeholder assistant message for the *new* response
  const placeholderMessage: Message = {
    content: '',
    id: assistantMessageId, // Use the new ID
    isStreaming: true,
    role: 'assistant',
    timestamp: Date.now(),
  };
  upsertMessage(placeholderMessage); // This will add the new message to the end of the list (or update if somehow ID collided)

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    console.log('Sending request to OpenAI:', {
      messages: messagesToSend.length,
      model,
    });
    const stream = await openai.chat.completions.create(
      {
        messages: messagesToSend,
        model,
        stream: true,
      },
      {
        signal: controller.signal,
      },
    );

    let contentReceived = false;
    for await (const chunk of stream) {
      // Check if cancellation was requested during the async iteration
      // Note: openai-js v4 might automatically throw AbortError if signal is aborted
      // Keeping explicit check for robustness
      if (controller.signal.aborted) {
        console.log(
          `Stream processing aborted by signal for message ${assistantMessageId}`,
        );
        // Throwing here ensures we hit the catch block for abort handling
        throw new Error('Stream aborted by signal.');
      }

      const contentChunk = chunk.choices[0]?.delta?.content || '';
      if (contentChunk) {
        contentReceived = true;
        // Append content to the *new* message ID
        appendContent({ contentChunk, messageId: assistantMessageId });
      }
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason && finishReason !== 'stop') {
        console.warn(`Stream finished with reason: ${finishReason}`);
      }
    }

    // Finalize normally if loop completes without error/abort
    console.log(
      `Stream finished normally for message ${assistantMessageId}. Content received: ${contentReceived}`,
    );
    finalizeStream(assistantMessageId); // Finalize the *new* message ID
  } catch (error) {
    const isAbortError =
      error instanceof Error &&
      (error.name === 'AbortError' ||
        error.message.includes('aborted') ||
        error.message.includes('signal'));

    console.error(`OpenAI API Error/Abort (${assistantMessageId}):`, error);

    if (!isAbortError) {
      // Update the new placeholder message with an error state
      const errorMessageContent = `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`;
      const errorMessage: Message = {
        ...placeholderMessage, // Use the ID of the message that failed
        id: assistantMessageId, // Ensure correct ID
        content: errorMessageContent,
        isStreaming: false, // Stop streaming on error
      };
      upsertMessage(errorMessage); // Update placeholder with error
      // Finalize even on error to reset loading state etc.
      finalizeStream(assistantMessageId);
    } else {
      console.log(
        `Generation cancelled for message ${assistantMessageId}. Finalizing.`,
      );
      // If aborted, finalize the stream state without adding error text.
      // The message will contain whatever content was received before the abort.
      finalizeStream(assistantMessageId); // Finalize the *new* message ID
    }
  } finally {
    // CRITICAL: Always clear the abort controller atom when the operation finishes/errors/aborts
    // Check if the current controller in the atom is the one we are finishing
    // This prevents accidentally clearing a controller from a *newer* request
    // if requests somehow overlapped or finalize was called out of order.
    // Note: Added get() for safety, ensure atom definitions allow this if needed.
    // const currentControllerInfo = get(abortControllerAtom); // Can't use get() inside atom setter directly easily.
    // Let's rely on finalizeStream and the loading state for now. The primary safety is
    // that setAbortController(null) is called. If another request started, it would have
    // already overwritten the controller atom anyway.
    setAbortController(null);
    console.log(
      `Cleared abort controller reference after handling message ${assistantMessageId}`,
    );
    // Note: setIsLoading(false) is handled within finalizeStreamingMessageAtom
  }
}

function getHistoryForApi(
  allMessages: Message[],
  maxHistoryCount: number,
  systemPrompt: string | null,
): OpenAI.ChatCompletionMessageParam[] {
  // Find the start index after the last divider, if any
  let startIndex = 0;
  // Iterate backwards to find the last divider efficiently
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i].role === 'divider') {
      startIndex = i + 1;
      break;
    }
  }

  const relevantMessages = allMessages.slice(startIndex);

  // Filter valid roles and non-empty content, apply maxHistoryCount limit *after* finding relevant segment
  const history = relevantMessages
    .filter(
      (msg) =>
        (msg.role === 'user' || msg.role === 'assistant') &&
        typeof msg.content === 'string' && // Ensure content is a string
        msg.content.trim() !== '', // Optional: Filter out empty messages
    )
    .slice(-maxHistoryCount); // Apply history limit

  const messagesToSend: OpenAI.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messagesToSend.push({ content: systemPrompt, role: 'system' });
  }

  history.forEach((msg) => {
    // Type assertion needed as filter guarantees role is 'user' or 'assistant'
    messagesToSend.push({
      content: msg.content as string, // We filtered for string content
      role: msg.role as 'user' | 'assistant',
    });
  });

  return messagesToSend;
}

async function generateChatTitle(
  apiKey: string,
  apiBaseUrl: string | null,
  summaryModel: SupportedModels,
  userMessageContent: string,
  chatId: string,
  updateChat: (update: Partial<Chat> & { id: string }) => void, // Pass the update function
): Promise<void> {
  if (!apiKey) {
    console.warn('Cannot generate title: API Key not set.');
    return;
  }
  if (!userMessageContent?.trim()) {
    console.warn('Cannot generate title: User message is empty.');
    return;
  }

  if (userMessageContent.length > 1000) {
    userMessageContent =
      userMessageContent.slice(0, 500) +
      '...(truncated due to large length)...' +
      userMessageContent.slice(-500);
  }

  const prompt = `You are a helpful assistant that generates concise chat titles. Based *only* on the following user message, generate a one-line chat title (no quotes, code blocks, only return plain text title like "💡 My Awesome Chat") that starts with a relevant emoji:\n\nUser Message: "${userMessageContent}"`; // Modified prompt

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    console.log('Generating chat title with model:', summaryModel);
    const response = await openai.chat.completions.create({
      model: summaryModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 30, // Increased tokens to allow for emoji and title
      temperature: 0.7, // Increased temperature slightly for more varied emoji selection
      stream: false, // We want a single response, not streaming
    });

    let generatedTitle = response.choices[0]?.message?.content
      ?.trim()
      .replace(/(\r\n|\n|\r)/gm, '') // Remove line breaks
      .replace(/["']/g, '')
      .replace(/```/g, '')
      .replace(/`/g, ''); // Remove quotes and code blocks

    if (generatedTitle) {
      const emojiRegex =
        /([\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}])/u;
      const emojiMatch = generatedTitle.match(emojiRegex);

      let icon = '';
      if (emojiMatch) {
        icon = emojiMatch[0]; // Extract the emoji
        generatedTitle = generatedTitle.replace(emojiRegex, '').trim(); // Remove emoji from title
      }

      console.log(`Generated title for chat ${chatId}: "${generatedTitle}"`);
      console.log(`Generated icon for chat ${chatId}: "${icon}"`);

      // Update the chat name and icon using the passed function
      updateChat({ id: chatId, name: generatedTitle, icon: icon });
    } else {
      console.warn('Title generation resulted in empty content.');
    }
  } catch (error) {
    console.error('Error generating chat title:', error);
    // Don't update the title on error, keep the default
  }
}

// Export helpers needed by components
export { callOpenAIStreamLogic, getHistoryForApi, generateChatTitle };
