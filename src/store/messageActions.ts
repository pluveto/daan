// src/store/messageActions.ts (Corrected - Phase 3 Fix)
import type { MessageEntity, ToolCallInfo } from '@/types'; // Use internal type
import { atom } from 'jotai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { abortControllerAtom, isAssistantLoadingAtom } from './apiState';
import {
  _activeChatIdAtom,
  activeChatDataAtom,
  activeChatMessagesAtom,
  loadChatListMetadataAtom,
} from './chatActions';
import { searchServiceAtom } from './search';
import { chatDataServiceAtom } from './service';
import { editingMessageIdAtom } from './uiState';

// --- Message Actions (Interacting with the active chat) ---

/** Adds a new message to the active chat's DB store and updates UI state. */
export const addMessageToActiveChatAtom = atom(
  null,
  async (
    get,
    set,
    messageContent: Pick<
      MessageEntity,
      'role' | 'content' | 'toolCallInfo' | 'isHidden'
    > & { id?: string },
  ) => {
    const activeId = get(_activeChatIdAtom);
    if (!activeId) {
      toast.error('Cannot add message: No active chat.');
      console.error('[addMessageToActiveChatAtom] No active chat ID.');
      return null;
    }
    const service = get(chatDataServiceAtom);
    const messageId = messageContent.id ?? uuidv4();
    const now = Date.now();
    console.log(
      `[addMessageToActiveChatAtom] Adding message (Role: ${messageContent.role}) to chat ${activeId}...`,
    );

    try {
      const messageData: MessageEntity = {
        id: messageId,
        chatId: activeId,
        role: messageContent.role,
        content: messageContent.content,
        toolCallInfo: messageContent.toolCallInfo ?? null,
        isHidden: messageContent.isHidden ?? false,
        timestamp: now,
        isStreaming: false,
        isError: false,
        metadata: undefined,
        providerFormatData: undefined,
      };

      const addedMessage = await service.addMessage(messageData);
      console.log(
        `[addMessageToActiveChatAtom] Message ${addedMessage.id} added to DB.`,
      );

      set(activeChatMessagesAtom, (prev) => [...prev, addedMessage]);

      try {
        // Update chat's timestamp in DB (Service handles setting the timestamp)
        await service.updateChat(activeId, {}); // Pass empty object or specific non-timestamp fields if needed
        // Update local chat state for immediate UI feedback
        set(activeChatDataAtom, (chat) =>
          chat ? { ...chat, updatedAt: now } : null,
        );
        // Refresh list metadata
        set(loadChatListMetadataAtom);
      } catch (updateError) {
        console.error(
          `[addMessageToActiveChatAtom] Failed to update chat timestamp for ${activeId}:`,
          updateError,
        );
      }

      return addedMessage;
    } catch (error) {
      console.error(
        `[addMessageToActiveChatAtom] Failed to add message to chat ${activeId}:`,
        error,
      );
      toast.error('Failed to save message.');
      return null;
    }
  },
);

/** Updates an existing message's content, saves to DB, and updates UI state. */
export const updateExistingMessageContentAtom = atom(
  null,
  async (
    get,
    set,
    { messageId, newContent }: { messageId: string; newContent: string },
  ) => {
    const activeId = get(_activeChatIdAtom);
    if (!activeId) {
      console.warn('[updateExistingMessageContentAtom] No active chat ID.');
      return;
    }

    const service = get(chatDataServiceAtom);
    const now = Date.now();
    console.log(
      `[updateExistingMessageContentAtom] Updating message ${messageId} in chat ${activeId}...`,
    );
    try {
      // 1. Update message in DB (includes timestamp)
      await service.updateMessage(messageId, {
        content: newContent,
        timestamp: now,
      });

      // 2. Update message in UI state
      set(activeChatMessagesAtom, (prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: newContent, timestamp: now }
            : msg,
        ),
      );

      // 3. Update parent chat's timestamp in DB and UI
      try {
        await service.updateChat(activeId, {}); // Service handles setting updatedAt
        set(activeChatDataAtom, (chat) =>
          chat ? { ...chat, updatedAt: now } : null,
        ); // Update local state
        set(loadChatListMetadataAtom); // Refresh metadata list
      } catch (updateError) {
        console.error(
          `[updateExistingMessageContentAtom] Failed to update chat timestamp for ${activeId}:`,
          updateError,
        );
      }

      console.log(
        `[updateExistingMessageContentAtom] Message ${messageId} updated successfully.`,
      );
    } catch (error) {
      console.error(
        `[updateExistingMessageContentAtom] Failed to update message ${messageId}:`,
        error,
      );
      toast.error('Failed to save edited message.');
    }
  },
);

/** Deletes a message from the active chat in the DB and updates UI state. */
export const deleteMessageFromActiveChatAtom = atom(
  null,
  async (get, set, messageId: string) => {
    const activeId = get(_activeChatIdAtom);
    if (!activeId) {
      console.warn('[deleteMessageFromActiveChatAtom] No active chat.');
      return;
    }

    const abortInfo = get(abortControllerAtom);
    if (abortInfo?.messageId === messageId && get(isAssistantLoadingAtom)) {
      console.log(
        `[deleteMessageFromActiveChatAtom] Cancelling generation for message ${messageId} due to deletion.`,
      );
      abortInfo.controller.abort('Message deleted during generation');
      set(abortControllerAtom, null);
      set(isAssistantLoadingAtom, false);
    }

    const service = get(chatDataServiceAtom);
    console.log(
      `[deleteMessageFromActiveChatAtom] Deleting message ${messageId} from chat ${activeId}...`,
    );
    try {
      await service.deleteMessage(messageId);
      set(activeChatMessagesAtom, (prev) =>
        prev.filter((msg) => msg.id !== messageId),
      );

      if (get(editingMessageIdAtom) === messageId) {
        set(editingMessageIdAtom, null);
      }
      console.log(
        `[deleteMessageFromActiveChatAtom] Message ${messageId} deleted successfully.`,
      );
    } catch (error) {
      console.error(
        `[deleteMessageFromActiveChatAtom] Failed to delete message ${messageId}:`,
        error,
      );
      toast.error('Failed to delete message.');
    }
  },
);

/** [Phase 4] Updates the UI state ONLY for a streaming message. Does NOT write to DB frequently. */
export const updateStreamingMessageUIAtom = atom(
  null,
  (
    get,
    set,
    {
      messageId,
      contentChunk,
      toolCallInfo,
    }: {
      messageId: string;
      contentChunk?: string;
      toolCallInfo?: ToolCallInfo | null;
    },
  ) => {
    set(activeChatMessagesAtom, (prev) =>
      prev.map((msg) => {
        if (msg.id === messageId) {
          const newContent =
            contentChunk !== undefined
              ? (msg.content ?? '') + contentChunk
              : msg.content;
          const newToolCallInfo =
            toolCallInfo !== undefined ? toolCallInfo : msg.toolCallInfo;
          return {
            ...msg,
            content: newContent,
            toolCallInfo: newToolCallInfo,
            isStreaming: true,
          };
        }
        return msg;
      }),
    );
  },
);

/** [Phase 4] Finalizes a message in the DB after streaming ends (success, error, or cancel). */
export const finalizeStreamingMessageInDbAtom = atom(
  null,
  async (
    get,
    set,
    {
      messageId,
      finalContent,
      isError,
      toolCallInfo,
    }: {
      messageId: string;
      finalContent: string;
      isError?: boolean;
      toolCallInfo?: ToolCallInfo | null;
    },
  ) => {
    const activeId = get(_activeChatIdAtom);
    if (!activeId) {
      console.warn(
        `[finalizeStreamingMessageInDbAtom] No active chat ID for message ${messageId}.`,
      );
      const abortInfo = get(abortControllerAtom);
      if (abortInfo?.messageId === messageId) {
        set(isAssistantLoadingAtom, false);
        set(abortControllerAtom, null);
      }
      return;
    }

    const service = get(chatDataServiceAtom);
    const now = Date.now();
    console.log(
      `[finalizeStreamingMessageInDbAtom] Finalizing message ${messageId} in chat ${activeId} (Error: ${!!isError}).`,
    );
    try {
      await service.finalizeMessage({
        id: messageId,
        finalContent,
        isError,
        toolCallInfo,
      });

      set(activeChatMessagesAtom, (prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                content: finalContent,
                isStreaming: false,
                isError: isError ?? false,
                toolCallInfo: toolCallInfo,
                timestamp: now,
              }
            : msg,
        ),
      );

      try {
        await service.updateChat(activeId, {}); // Service handles setting updatedAt
        set(activeChatDataAtom, (chat) =>
          chat ? { ...chat, updatedAt: now } : null,
        ); // Update local state
        set(loadChatListMetadataAtom);
      } catch (updateError) {
        console.error(
          `[finalizeStreamingMessageInDbAtom] Failed to update chat timestamp for ${activeId}:`,
          updateError,
        );
      }
    } catch (error) {
      console.error(
        `[finalizeStreamingMessageInDbAtom] Failed to finalize message ${messageId} in DB:`,
        error,
      );
      toast.error('Failed to save final message content.');
      set(activeChatMessagesAtom, (prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                content: finalContent + '\n[Save Error]',
                isStreaming: false,
                isError: true,
                timestamp: now,
              }
            : msg,
        ),
      );
    } finally {
      const abortInfo = get(abortControllerAtom);
      if (abortInfo?.messageId === messageId) {
        console.log(
          `[finalizeStreamingMessageInDbAtom] Clearing API loading state for message ${messageId}.`,
        );
        set(isAssistantLoadingAtom, false);
        set(abortControllerAtom, null);
      } else {
        console.warn(
          `[finalizeStreamingMessageInDbAtom] Finalize called for ${messageId}, but abort controller was for ${abortInfo?.messageId ?? 'null'}.`,
        );
        if (get(isAssistantLoadingAtom)) {
          set(isAssistantLoadingAtom, false);
        }
      }
    }
  },
);

/** Clears all messages for the active chat in the DB and updates UI state. */
/** Clears all messages for the active chat in the DB, search index, and updates UI state. */
export const clearActiveChatMessagesAtom = atom(
  null,
  // Add 'get' to the signature
  async (get, set) => {
    const activeId = get(_activeChatIdAtom);
    if (!activeId) {
      toast.warning('No active chat to clear messages from.');
      return;
    }

    const chatService = get(chatDataServiceAtom);
    const searchService = get(searchServiceAtom); // Get search service
    const now = Date.now();
    console.log(
      `[clearActiveChatMessagesAtom] Clearing messages for chat ${activeId}...`,
    );

    // 1. Get message IDs before deleting (for search index removal)
    let messageIdsToRemove: string[] = [];
    try {
      const messages = await chatService.getMessagesByChatId(activeId);
      messageIdsToRemove = messages.map((m) => m.id);
    } catch (error) {
      console.error(
        `[clearActiveChatMessagesAtom] Failed to fetch messages for chat ${activeId} before clear:`,
        error,
      );
      // Continue clearing DB, but log warning
      toast.warning(
        'Could not fetch message details before clearing. Search index might be inaccurate.',
      );
    }

    try {
      // 2. Delete messages from DB
      await chatService.deleteMessagesByChatId(activeId); // Service deletes from DB

      // 3. Remove messages from search index
      if (messageIdsToRemove.length > 0) {
        await searchService.removeChatMessagesByIds(messageIdsToRemove);
        console.log(
          `[clearActiveChatMessagesAtom] Messages removed from search index for chat ${activeId}.`,
        );
      }

      // --- Post-clear state updates ---
      set(activeChatMessagesAtom, []); // Set UI messages to empty array
      try {
        // Update parent chat's timestamp
        await chatService.updateChat(activeId, {});
        set(activeChatDataAtom, (chat) =>
          chat ? { ...chat, updatedAt: now } : null,
        );
        set(loadChatListMetadataAtom);

        toast.success('Chat history cleared.');
        console.log(
          `[clearActiveChatMessagesAtom] Messages cleared for chat ${activeId}.`,
        );
      } catch (updateError) {
        console.error(
          `[clearActiveChatMessagesAtom] Failed to update chat timestamp for ${activeId}:`,
          updateError,
        );
      }
    } catch (error) {
      console.error(
        `[clearActiveChatMessagesAtom] Failed to clear messages for chat ${activeId}:`,
        error,
      );
      toast.error('Failed to clear chat history.');
    }
  },
);

/** Updates the content and toolCallInfo of an existing message. */
export const updateMessageToolInfoAtom = atom(
  null, // Write-only
  async (
    get,
    set,
    {
      messageId,
      content,
      toolCallInfo,
    }: { messageId: string; content: string; toolCallInfo: ToolCallInfo },
  ) => {
    const activeId = get(_activeChatIdAtom); // Need active chat ID for context/updates
    if (!activeId) {
      console.warn(
        `[updateMessageToolInfoAtom] No active chat to update message ${messageId}.`,
      );
      return;
    }

    const service = get(chatDataServiceAtom);
    const now = Date.now(); // Update timestamp when tool state changes
    console.log(
      `[updateMessageToolInfoAtom] Updating tool info for message ${messageId} in chat ${activeId} to type ${toolCallInfo.type}.`,
    );
    try {
      // 1. Update DB
      // Service handles updating timestamp implicitly if content/toolCallInfo changes
      await service.updateMessage(messageId, {
        content,
        toolCallInfo,
        timestamp: now,
      });

      // 2. Update UI state (active messages)
      set(activeChatMessagesAtom, (prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content, toolCallInfo, timestamp: now }
            : msg,
        ),
      );

      // 3. Update parent chat's timestamp (optional, but good for consistency)
      try {
        await service.updateChat(activeId, {});
        set(activeChatDataAtom, (chat) =>
          chat ? { ...chat, updatedAt: now } : null,
        );
        set(loadChatListMetadataAtom);
      } catch (updateError) {
        console.error(
          `[updateMessageToolInfoAtom] Failed to update chat timestamp for ${activeId}:`,
          updateError,
        );
      }
    } catch (error) {
      console.error(
        `[updateMessageToolInfoAtom] Failed to update message ${messageId}:`,
        error,
      );
      toast.error('Failed to update tool call status.');
    }
  },
);

/** Sets the ID of the message currently being edited in the UI. */
export const setEditingMessageIdAtom = atom(
  null,
  (_get, set, messageId: string | null) => {
    set(editingMessageIdAtom, messageId);
  },
);
