import { atomWithSafeStorage } from '@/lib/utils.ts';
import {
  exampleModels,
  type Chat,
  type Message,
  type SupportedModels,
  type ValidRoles,
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
  false,
);
export const showTimestampsAtom = atomWithSafeStorage<boolean>(
  'globalSettings_showTimestamps',
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
  if (!activeId) return null;
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
    id: newId,
    name: `Chat ${new Date(now).toLocaleTimeString()}`,
    icon: '💬',
    model: get(defaultModelAtom),
    systemPrompt: get(defaultPromptAtom),
    messages: [],
    createdAt: now,
    updatedAt: now,
    isPinned: false,
    maxHistory: null,
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
      // set(finalizeStreamingMessageAtom, abortInfo.messageId);
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
    if (!activeId) return;

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
    if (!activeId) return;

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

    set(chatsAtom, (prevChats) =>
      prevChats.map((chat) =>
        chat.id === activeId
          ? {
              ...chat,
              messages: chat.messages.filter((msg) => msg.id !== messageId),
              updatedAt: Date.now(),
            }
          : chat,
      ),
    );
    if (get(editingMessageIdAtom) === messageId) {
      set(editingMessageIdAtom, null);
    }
  },
);

export const appendContentToMessageAtom = atom(
  null,
  (
    get,
    set,
    { messageId, contentChunk }: { messageId: string; contentChunk: string },
  ) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) return;

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
    if (!activeId) return;

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

export const regenerateLastResponseAtom = atom(null, (get, set) => {
  const activeChat = get(activeChatAtom);
  const apiKey = get(apiKeyAtom);
  const apiBaseUrl = get(apiBaseUrlAtom);
  const upsertMessage = (msg: Message) =>
    set(upsertMessageInActiveChatAtom, msg);
  const appendContent = (payload: {
    messageId: string;
    contentChunk: string;
  }) => set(appendContentToMessageAtom, payload);
  const finalizeStream = (msgId: string) =>
    set(finalizeStreamingMessageAtom, msgId);
  const setIsLoading = (loading: boolean) =>
    set(isAssistantLoadingAtom, loading);
  const setAbortCtrl = (
    ctrl: { controller: AbortController; messageId: string } | null,
  ) => set(abortControllerAtom, ctrl);

  if (!activeChat || get(isAssistantLoadingAtom)) return;

  const messages = activeChat.messages;
  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIndex = i;
      break;
    }
  }

  if (lastAssistantIndex === -1) {
    console.warn('No assistant message found to regenerate.');
    return;
  }

  // Delete the last assistant message *before* preparing history
  const messageToDeleteId = messages[lastAssistantIndex].id;
  // Use a temporary variable to avoid modifying the array while iterating if needed elsewhere
  const historyWithoutLastAssistant = messages.slice(0, lastAssistantIndex);

  // Prepare messages for API call
  const maxHistory = activeChat.maxHistory ?? get(defaultMaxHistoryAtom);
  const relevantHistory = getHistoryForApi(
    historyWithoutLastAssistant,
    maxHistory,
    activeChat.systemPrompt,
  );

  if (
    relevantHistory.length === 0 ||
    (relevantHistory.length === 1 && relevantHistory[0].role === 'system')
  ) {
    console.warn('Not enough history to regenerate response.');
    // Add back the deleted message if regeneration fails early? No, keep it deleted.
    set(deleteMessageFromActiveChatAtom, messageToDeleteId); // Ensure it's gone
    return;
  }

  // Now actually delete the message from state *after* history is prepared
  set(deleteMessageFromActiveChatAtom, messageToDeleteId);

  // Call the OpenAI stream function
  callOpenAIStreamLogic(
    apiKey,
    apiBaseUrl,
    activeChat.model,
    relevantHistory,
    setIsLoading,
    upsertMessage,
    appendContent,
    finalizeStream,
    setAbortCtrl, // Pass the abort controller setter
  );
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
  appendContent: (payload: { messageId: string; contentChunk: string }) => void,
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
  const assistantMessageId = uuidv4();
  const controller = new AbortController();
  setAbortController({ controller, messageId: assistantMessageId }); // Store the controller

  // Add placeholder assistant message
  const placeholderMessage: Message = {
    id: assistantMessageId,
    role: 'assistant',
    content: '', // Start empty, content will be appended
    timestamp: Date.now(),
    isStreaming: true, // Mark as streaming immediately
  };
  upsertMessage(placeholderMessage);

  try {
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    console.log('Sending request to OpenAI:', {
      model,
      messages: messagesToSend.length,
    });
    const stream = await openai.chat.completions.create({
      model: model,
      messages: messagesToSend,
      stream: true,
      signal: controller.signal, // Pass the abort signal
    });

    let contentReceived = false;
    for await (const chunk of stream) {
      // Check if cancellation was requested during the async iteration
      if (controller.signal.aborted) {
        console.log(
          `Stream processing aborted for message ${assistantMessageId}`,
        );
        // Error handling below will catch the AbortError
        throw new Error('Stream aborted by user request.'); // Throw to trigger catch/finally
      }
      const contentChunk = chunk.choices[0]?.delta?.content || '';
      if (contentChunk) {
        contentReceived = true;
        appendContent({ messageId: assistantMessageId, contentChunk });
      }
      // Handle finish reason if needed (e.g., length, stop, content_filter)
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason && finishReason !== 'stop') {
        console.warn(`Stream finished with reason: ${finishReason}`);
        // Optionally append a note about the finish reason
        // appendContent({ messageId: assistantMessageId, contentChunk: `\n[Finished: ${finishReason}]` });
      }
    }

    // Finalize normally if loop completes without error/abort
    console.log(
      `Stream finished normally for message ${assistantMessageId}. Content received: ${contentReceived}`,
    );
    finalizeStream(assistantMessageId);
  } catch (error) {
    const isAbortError =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.includes('aborted'));

    console.error(`OpenAI API Error/Abort (${assistantMessageId}):`, error);

    if (!isAbortError) {
      // Update the placeholder message with an error state only for non-abort errors
      const errorMessageContent = `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`;
      const errorMessage: Message = {
        ...placeholderMessage, // Use the ID of the message that failed
        content: errorMessageContent,
        isStreaming: false, // Stop streaming on error
      };
      upsertMessage(errorMessage); // Update placeholder with error
      finalizeStream(assistantMessageId); // Ensure finalize runs to set loading false etc.
    } else {
      console.log(
        `Generation cancelled for message ${assistantMessageId}. Finalizing.`,
      );
      // If aborted, finalize the stream state without adding error text to the message content.
      // The message will contain whatever content was received before the abort.
      finalizeStream(assistantMessageId);
    }
  } finally {
    // CRITICAL: Always clear the abort controller atom when the operation finishes/errors/aborts
    setAbortController(null);
    console.log(`Cleared abort controller for message ${assistantMessageId}`);
    // Note: setIsLoading(false) is handled within finalizeStreamingMessageAtom
    // Ensure finalizeStream is robust enough to always set loading false eventually.
  }
}

function getHistoryForApi(
  allMessages: Message[],
  maxHistoryCount: number,
  systemPrompt: string | null,
): OpenAI.ChatCompletionMessageParam[] {
  let startIndex = 0;
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i].role === 'divider') {
      startIndex = i + 1;
      break;
    }
  }

  const relevantMessages = allMessages.slice(startIndex);

  const history = relevantMessages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    // Ensure content is not null/undefined before sending
    .filter((msg) => typeof msg.content === 'string')
    .slice(-maxHistoryCount);

  const messagesToSend: OpenAI.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messagesToSend.push({ role: 'system', content: systemPrompt });
  }

  history.forEach((msg) => {
    // Type assertion needed as filter guarantees role is 'user' or 'assistant'
    messagesToSend.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  });

  return messagesToSend;
}

// Export helpers needed by components
export { callOpenAIStreamLogic, getHistoryForApi };
