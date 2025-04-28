// src/store/regeneration.ts
import { atom, Getter } from 'jotai';
import OpenAI from 'openai';
import { toast } from 'sonner';

import { convertToOpenAIMessages } from '@/lib/messageConverter'; // Import the converter
import type { MessageEntity } from '@/types/internal';
import { triggerChatCompletionAtom } from './apiActions'; // Import the NEW trigger action
import { isAssistantLoadingAtom } from './apiState';
import { _activeChatIdAtom, activeChatMessagesAtom } from './chatActions';
import { mcpPromptInjectionAtom } from './mcp';
import { deleteMessageFromActiveChatAtom } from './messageActions';
import { chatDataServiceAtom } from './service'; // Import service
import { defaultMaxHistoryAtom } from './settings';

const daanPrompt = ``.trim(); // Keep if still relevant

/**
 * Prepares the message history for the API call for a given chat ID.
 * Fetches data, applies limits, filters, adds system/MCP prompts, and converts format.
 */
export async function getHistoryForApi(
  get: Getter,
  chatId: string,
): Promise<OpenAI.ChatCompletionMessageParam[] | null> {
  console.log(`[getHistoryForApi] Preparing history for chat ${chatId}...`);
  const service = get(chatDataServiceAtom);

  try {
    // 1. Fetch Chat and Messages
    const chat = await service.getChatById(chatId);
    if (!chat) {
      console.error(`[getHistoryForApi] Chat ${chatId} not found.`);
      return null; // Or throw error
    }
    // Fetch all messages for now, apply limit later
    let allMessages = await service.getMessagesByChatId(chatId);

    // 2. Determine effective history limit
    const maxHistoryCount = chat.maxHistory ?? get(defaultMaxHistoryAtom); // Chat override or global default

    // 3. Find context start (after last divider - assuming divider logic is still desired)
    // Note: Divider messages are not part of AppInternalMessage standard roles.
    // If dividers are needed, they should be handled differently (e.g., metadata or fetched separately).
    // For now, we assume no dividers and use the maxHistoryCount directly.
    // If you need divider logic, fetch message IDs/timestamps and find the divider position.
    /*
    let startIndex = 0;
    // Logic to find divider message index if needed...
    const relevantMessages = allMessages.slice(startIndex);
    */
    const relevantMessages = allMessages; // Use all messages for now

    // 4. Filter and Slice History
    // Filter for roles suitable for API history and apply maxHistory limit
    const history = relevantMessages
      .filter(
        (
          msg,
        ): msg is MessageEntity & {
          role: 'user' | 'assistant' | 'tool_call_result';
        } =>
          // Include user, assistant, and tool RESULTS in the history sent to the model
          (msg.role === 'user' ||
            msg.role === 'assistant' ||
            msg.role === 'tool_call_result') &&
          !msg.isHidden, // Exclude hidden messages
      )
      .slice(-maxHistoryCount); // Apply history limit

    // 5. Prepare System Prompt
    const mcpInjection = get(mcpPromptInjectionAtom);
    const finalSystemPrompt = [
      daanPrompt, // Base prompt if any
      chat.systemPrompt?.trim() || null, // Original prompt from chat
      mcpInjection ? mcpInjection.trim() : null, // MCP instructions
    ]
      .filter(Boolean) // Remove null/empty parts
      .join('\n\n'); // Join non-empty parts with double newline

    // 6. Convert to API Format
    const messagesToSend: OpenAI.ChatCompletionMessageParam[] = [];

    // Add system prompt first if it exists
    if (finalSystemPrompt) {
      messagesToSend.push({ content: finalSystemPrompt, role: 'system' });
      console.log(
        '[getHistoryForApi] Using System Prompt:\n',
        finalSystemPrompt,
      );
    } else {
      console.log('[getHistoryForApi] No system prompt to send.');
    }

    // Convert and add history messages
    const convertedHistory = convertToOpenAIMessages(history);
    messagesToSend.push(...convertedHistory);

    console.log(
      `[getHistoryForApi] Prepared ${messagesToSend.length} messages for API call (History Limit: ${maxHistoryCount}).`,
    );
    // console.log('[getHistoryForApi] Final Message History:', messagesToSend); // Optional: Log full history

    return messagesToSend;
  } catch (error) {
    console.error(
      `[getHistoryForApi] Failed to prepare history for chat ${chatId}:`,
      error,
    );
    toast.error('Failed to prepare message history for AI.');
    return null; // Return null on error
  }
}

// --- Regeneration Action Atoms ---

/** Regenerates an AI response based on the history up to a specific message. */
export const regenerateMessageAtom = atom(
  null,
  async (get, set, targetMessageId: string) => {
    const activeChatId = get(_activeChatIdAtom);
    const isLoading = get(isAssistantLoadingAtom);

    if (!activeChatId) {
      console.warn('[regenerateMessageAtom] No active chat.');
      toast.warning('No active chat selected to regenerate.');
      return;
    }
    if (isLoading) {
      console.warn('[regenerateMessageAtom] Assistant is already loading.');
      toast.warning('Please wait for the current response to finish.');
      return;
    }
    if (!targetMessageId) {
      console.warn('[regenerateMessageAtom] No target message ID provided.');
      return;
    }

    console.log(
      `[regenerateMessageAtom] Attempting regeneration based on message ${targetMessageId} in chat ${activeChatId}.`,
    );
    const service = get(chatDataServiceAtom);

    try {
      // 1. Fetch current messages for the active chat
      const messages = await service.getMessagesByChatId(activeChatId);
      const targetIndex = messages.findIndex((m) => m.id === targetMessageId);

      if (targetIndex === -1) {
        console.error(
          `[regenerateMessageAtom] Target message ${targetMessageId} not found.`,
        );
        toast.error('Target message for regeneration not found.');
        return;
      }

      const targetMessage = messages[targetIndex];
      let messageIdToDelete: string | null = null;

      // 2. Determine which message (if any) to delete
      if (targetMessage.role === 'assistant') {
        // Regenerating an assistant message: Delete the original assistant message.
        messageIdToDelete = targetMessageId;
        console.log(
          `[regenerateMessageAtom] Target is assistant message ${targetMessageId}. It will be deleted.`,
        );
      } else if (targetMessage.role === 'user') {
        // Regenerating based on a user message: Delete the *next* message if it's an assistant response.
        const nextMessage = messages[targetIndex + 1];
        if (nextMessage?.role === 'assistant') {
          messageIdToDelete = nextMessage.id;
          console.log(
            `[regenerateMessageAtom] Target is user message ${targetMessageId}. Deleting subsequent assistant message ${messageIdToDelete}.`,
          );
        } else {
          console.log(
            `[regenerateMessageAtom] Target is user message ${targetMessageId}. No subsequent assistant message to delete.`,
          );
        }
      } else {
        // Cannot regenerate based on system messages or others
        console.warn(
          `[regenerateMessageAtom] Cannot regenerate from message type: ${targetMessage.role}`,
        );
        toast.error(`Cannot regenerate from a ${targetMessage.role} message.`);
        return;
      }

      // 3. Perform deletion (if necessary) using the message action atom
      if (messageIdToDelete) {
        // Check if the message still exists locally before trying to delete
        const currentLocalMessages = get(activeChatMessagesAtom);
        if (currentLocalMessages.some((m) => m.id === messageIdToDelete)) {
          console.log(
            `[regenerateMessageAtom] Deleting message ${messageIdToDelete} before regenerating...`,
          );
          await set(deleteMessageFromActiveChatAtom, messageIdToDelete);
          // Note: deleteMessageFromActiveChatAtom updates local state (activeChatMessagesAtom)
        } else {
          console.warn(
            `[regenerateMessageAtom] Message ${messageIdToDelete} intended for deletion was already gone locally.`,
          );
          // Ensure it's deleted from DB just in case
          try {
            await service.deleteMessage(messageIdToDelete);
          } catch (dbDeleteError) {
            console.error(
              `[regenerateMessageAtom] Failed to ensure DB deletion of ${messageIdToDelete}:`,
              dbDeleteError,
            );
          }
        }
      }

      // 4. Trigger the main chat completion flow for the active chat
      //    This action will internally call getHistoryForApi with the correct (now potentially shorter) history.
      console.log(
        `[regenerateMessageAtom] Triggering chat completion for chat ${activeChatId}.`,
      );
      set(triggerChatCompletionAtom, activeChatId); // Trigger the new action
    } catch (error) {
      console.error(
        `[regenerateMessageAtom] Error during regeneration process for message ${targetMessageId}:`,
        error,
      );
      toast.error('An error occurred during regeneration.');
      // Ensure loading state is reset if something went wrong before API call started
      if (get(isAssistantLoadingAtom)) {
        set(isAssistantLoadingAtom, false);
        // Consider clearing abort controller if it was somehow set
      }
    }
  },
);

/** Regenerates the *last* assistant response or generates a response based on the last user message. */
export const regenerateLastResponseAtom = atom(null, async (get, set) => {
  const activeChatId = get(_activeChatIdAtom);
  const isLoading = get(isAssistantLoadingAtom);

  if (!activeChatId) {
    console.warn('[regenerateLastResponseAtom] No active chat.');
    return;
  }
  if (isLoading) {
    console.warn('[regenerateLastResponseAtom] Assistant is already loading.');
    toast.warning('Please wait for the current response to finish.');
    return;
  }

  console.log(
    `[regenerateLastResponseAtom] Finding last message in chat ${activeChatId} to regenerate...`,
  );
  try {
    // Fetch latest messages to ensure we have the correct last one
    const service = get(chatDataServiceAtom);
    const messages = await service.getMessagesByChatId(activeChatId); // Fetches sorted by timestamp

    if (messages.length === 0) {
      console.warn('[regenerateLastResponseAtom] Chat is empty.');
      toast.info('Nothing to regenerate in an empty chat.');
      return;
    }

    let targetMessageId: string | null = null;
    // Iterate backwards to find the last user or assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'assistant') {
        targetMessageId = message.id;
        console.log(
          `[regenerateLastResponseAtom] Found last assistant message: ${targetMessageId}`,
        );
        break;
      }
      if (message.role === 'user') {
        targetMessageId = message.id; // Target the user message to generate response *after* it
        console.log(
          `[regenerateLastResponseAtom] Found last user message: ${targetMessageId}`,
        );
        break;
      }
      // Ignore system, tool_call_result, pending for regeneration target finding
    }

    if (targetMessageId) {
      // Call the specific regeneration logic with the found ID
      set(regenerateMessageAtom, targetMessageId);
    } else {
      console.warn(
        '[regenerateLastResponseAtom] No user or assistant message found to regenerate.',
      );
      toast.info('No suitable message found to regenerate response from.');
    }
  } catch (error) {
    console.error(
      '[regenerateLastResponseAtom] Error fetching messages:',
      error,
    );
    toast.error('Failed to find the last message to regenerate.');
  }
});
