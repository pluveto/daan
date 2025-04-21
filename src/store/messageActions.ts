import type { Message } from '@/types';
import { atom } from 'jotai';
import { abortControllerAtom, isAssistantLoadingAtom } from './apiState';
import { activeChatIdAtom, chatsAtom, type ChatsRecord } from './chatData';
import { editingMessageIdAtom } from './uiState';

// --- Helper Function ---

/**
 * Immutable helper to update messages within a specific chat in the ChatsRecord.
 * @param chats The current ChatsRecord state.
 * @param chatId The ID of the chat to update.
 * @param messageUpdater A function that receives the current messages array and returns the updated messages array.
 * @param updateTimestamp Whether to update the chat's `updatedAt` timestamp. Defaults to true.
 * @returns The new ChatsRecord state with the updated chat.
 */
export const updateMessagesInChat = (
  chats: ChatsRecord,
  chatId: string,
  messageUpdater: (messages: Message[]) => Message[],
  updateTimestamp: boolean = true,
): ChatsRecord => {
  const chatToUpdate = chats[chatId];
  if (!chatToUpdate) {
    console.warn(`Chat with ID ${chatId} not found for message update.`);
    return chats; // Return original state if chat not found
  }

  const newMessages = messageUpdater(chatToUpdate.messages);

  // Avoid creating new objects if messages didn't actually change
  if (newMessages === chatToUpdate.messages && !updateTimestamp) {
    return chats;
  }

  // Only update timestamp if messages changed or explicitly requested
  const finalTimestamp =
    newMessages !== chatToUpdate.messages || updateTimestamp
      ? Date.now()
      : chatToUpdate.updatedAt;

  const updatedChat = {
    ...chatToUpdate,
    messages: newMessages,
    updatedAt: finalTimestamp,
  };

  return {
    ...chats,
    [chatId]: updatedChat,
  };
};

// --- Message Action Atoms ---

/** Adds a new message or updates an existing one in the *active* chat. */
export const upsertMessageInActiveChatAtom = atom(
  null,
  (get, set, message: Message) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) {
      console.warn('Cannot upsert message: No active chat.');
      return;
    }

    // O(1) chat access, O(M) message update (where M is message count)
    set(chatsAtom, (prevChats) =>
      updateMessagesInChat(
        prevChats,
        activeId,
        (currentMessages) => {
          const existingMsgIndex = currentMessages.findIndex(
            (m) => m.id === message.id,
          );
          let newMessages: Message[];

          if (existingMsgIndex > -1) {
            // Update existing message
            newMessages = [...currentMessages];
            const isCurrentlyStreaming =
              newMessages[existingMsgIndex].isStreaming;
            // Preserve properties not explicitly provided in the incoming message
            newMessages[existingMsgIndex] = {
              ...newMessages[existingMsgIndex], // Keep old values
              ...message, // Overwrite with new values
              isStreaming: message.isStreaming ?? isCurrentlyStreaming, // Keep streaming if not explicitly set to false
            };
          } else {
            // Add new message
            newMessages = [...currentMessages, message];
          }
          return newMessages;
        },
        !message.isStreaming, // Only update chat timestamp if message is not streaming
      ),
    );
  },
);

/** Deletes a message from the *active* chat. */
export const deleteMessageFromActiveChatAtom = atom(
  null,
  (get, set, messageId: string) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) {
      console.warn('Cannot delete message: No active chat.');
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

    let messageWasDeleted = false;
    // O(1) chat access, O(M) message update
    set(chatsAtom, (prevChats) =>
      updateMessagesInChat(
        prevChats,
        activeId,
        (currentMessages) => {
          const originalLength = currentMessages.length;
          const filteredMessages = currentMessages.filter(
            (msg) => msg.id !== messageId,
          );
          messageWasDeleted = filteredMessages.length < originalLength;
          // Return the filtered array; helper handles immutable update
          return filteredMessages;
        },
        messageWasDeleted, // Only update timestamp if a message was actually deleted
      ),
    );

    // If the deleted message was being edited, clear the editing state
    if (messageWasDeleted && get(editingMessageIdAtom) === messageId) {
      set(editingMessageIdAtom, null);
    }
  },
);

/** Appends a chunk of content to a streaming message in the *active* chat. */
export const appendContentToMessageAtom = atom(
  null,
  (
    get,
    set,
    { contentChunk, messageId }: { contentChunk: string; messageId: string },
  ) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) return; // Should not happen during streaming, but safety first

    // O(1) chat access, O(M) message find/update.
    // Note: Frequent calls during streaming *will* update the state often.
    // atomWithSafeStorage should ideally debounce/throttle writes.
    set(chatsAtom, (prevChats) =>
      updateMessagesInChat(
        prevChats,
        activeId,
        (currentMessages) => {
          const msgIndex = currentMessages.findIndex((m) => m.id === messageId);
          if (msgIndex > -1) {
            const updatedMessages = [...currentMessages];
            const currentContent = updatedMessages[msgIndex].content ?? '';
            updatedMessages[msgIndex] = {
              ...updatedMessages[msgIndex],
              content: currentContent + contentChunk,
              isStreaming: true, // Ensure it's marked as streaming
            };
            return updatedMessages;
          }
          // Message not found (e.g., deleted while streaming), return unchanged
          console.warn(`Message ${messageId} not found to append content.`);
          return currentMessages;
        },
        false, // Do *not* update chat timestamp during streaming appends
      ),
    );
  },
);

/** Marks a streaming message in the *active* chat as complete. */
export const finalizeStreamingMessageAtom = atom(
  null,
  (get, set, messageId: string) => {
    const activeId = get(activeChatIdAtom);

    // If no active chat (e.g., chat deleted before stream finished), just clean up global state.
    if (!activeId) {
      console.warn(
        `Finalize called for message ${messageId} but no active chat. Resetting global state.`,
      );
      const abortInfo = get(abortControllerAtom);
      if (abortInfo?.messageId === messageId) {
        set(isAssistantLoadingAtom, false);
        set(abortControllerAtom, null);
      }
      return;
    }

    let messageFoundAndFinalized = false;
    // O(1) chat access, O(M) message find/update
    set(chatsAtom, (prevChats) =>
      updateMessagesInChat(
        prevChats,
        activeId,
        (currentMessages) => {
          const msgIndex = currentMessages.findIndex((m) => m.id === messageId);
          // Only finalize if the message exists and is currently streaming
          if (msgIndex > -1 && currentMessages[msgIndex].isStreaming) {
            const updatedMessages = [...currentMessages];
            updatedMessages[msgIndex] = {
              ...updatedMessages[msgIndex],
              isStreaming: false, // Mark as complete
            };
            messageFoundAndFinalized = true;
            return updatedMessages;
          }
          // Message not found or not streaming, return unchanged
          if (msgIndex === -1)
            console.warn(`Message ${messageId} not found to finalize.`);
          else if (!currentMessages[msgIndex].isStreaming)
            console.warn(`Message ${messageId} was already finalized.`);
          return currentMessages;
        },
        true, // Update chat timestamp when streaming finishes
      ),
    );

    // Only reset global loading state if the specific message was found and finalized.
    // This prevents race conditions if multiple requests were somehow active.
    const abortInfo = get(abortControllerAtom);
    if (abortInfo?.messageId === messageId) {
      if (messageFoundAndFinalized) {
        console.log(`Finalized message ${messageId}, resetting loading state.`);
      } else {
        console.warn(
          `Finalize called for ${messageId}, but message wasn't finalized in state. Resetting loading state anyway.`,
        );
      }
      set(isAssistantLoadingAtom, false);
      // Crucially, clear the controller ONLY if it matches the message being finalized.
      set(abortControllerAtom, null);
    } else if (messageFoundAndFinalized) {
      // Message was finalized, but the controller was for a *different* message or already cleared.
      // This scenario might indicate a logic issue or rapid requests.
      console.warn(
        `Finalized message ${messageId}, but the active abort controller was different or null.`,
      );
      // Ensure loading state is false just in case.
      if (get(isAssistantLoadingAtom)) set(isAssistantLoadingAtom, false);
    }
    // If !messageFoundAndFinalized and controller didn't match, do nothing to global state here.
  },
);

/** Sets the ID of the message currently being edited. */
export const setEditingMessageIdAtom = atom(
  null,
  (_get, set, messageId: string | null) => {
    set(editingMessageIdAtom, messageId);
  },
);

/** Updates the content of a specific message in the *active* chat, typically after editing. */
export const updateMessageContentAtom = atom(
  null,
  (
    get,
    set,
    { messageId, newContent }: { messageId: string; newContent: string },
  ) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) {
      console.warn('Cannot update message content: No active chat.');
      return;
    }

    let messageUpdated = false;
    // O(1) chat access, O(M) message find/update
    set(chatsAtom, (prevChats) =>
      updateMessagesInChat(
        prevChats,
        activeId,
        (currentMessages) => {
          const msgIndex = currentMessages.findIndex((m) => m.id === messageId);
          if (msgIndex > -1) {
            // Only update if content actually changed to prevent unnecessary state changes
            if (currentMessages[msgIndex].content !== newContent) {
              const updatedMessages = [...currentMessages];
              updatedMessages[msgIndex] = {
                ...updatedMessages[msgIndex],
                content: newContent,
                isStreaming: false, // Ensure editing marks streaming as false
              };
              messageUpdated = true;
              return updatedMessages;
            } else {
              console.log(`Content for message ${messageId} is unchanged.`);
              return currentMessages; // No change needed
            }
          }
          console.warn(`Message ${messageId} not found for content update.`);
          return currentMessages; // Message not found
        },
        messageUpdated, // Only update timestamp if content actually changed
      ),
    );

    // Clear editing state after successful update
    if (messageUpdated) {
      set(editingMessageIdAtom, null);
    }
  },
);
