import type { Message } from '@/types';
import { atom, Getter } from 'jotai';
import OpenAI from 'openai'; // Keep OpenAI type import if needed for helpers

import { toast } from 'sonner';
import { callOpenAIStreamLogic } from './apiActions'; // Import the refactored API call logic
import { isAssistantLoadingAtom } from './apiState';
import { activeChatAtom } from './chatDerived';
import { mcpPromptInjectionAtom } from './mcp';
import { deleteMessageFromActiveChatAtom } from './messageActions';
import { defaultMaxHistoryAtom } from './settings';

// --- Helper Function ---
const daanPrompt = ``.trim();
/**
 * Prepares the message history for the OpenAI API call.
 * Finds messages after the last 'divider', filters roles, applies max history limit,
 * and prepends the system prompt.
 * @param allMessages All messages currently in the chat.
 * @param maxHistoryCount The maximum number of user/assistant messages to include.
 * @param systemPrompt The system prompt string, or null.
 * @returns An array of messages formatted for the OpenAI API.
 */

/**
 * Prepares the message history for the OpenAI API call.
 * Includes MCP tool instructions if applicable.
 */
export function getHistoryForApi(
  get: Getter,
  allMessages: Message[],
  maxHistoryCount: number,
  systemPrompt: string | null, // Original system prompt from chat/character
): OpenAI.ChatCompletionMessageParam[] {
  // --- Find relevant messages (same as before) ---
  let startIndex = 0;
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i].role === 'divider') {
      startIndex = i + 1;
      break;
    }
  }
  const relevantMessages = allMessages.slice(startIndex);
  const history = relevantMessages
    .filter(
      (msg): msg is Message & { content: string; role: 'user' | 'assistant' } =>
        (msg.role === 'user' || msg.role === 'assistant') &&
        typeof msg.content === 'string' &&
        msg.content.trim() !== '',
    )
    .slice(-maxHistoryCount);

  const messagesToSend: OpenAI.ChatCompletionMessageParam[] = [];

  // --- Combine Prompts ---
  const mcpInjection = get(mcpPromptInjectionAtom); // Get MCP instructions
  const finalSystemPrompt = [
    daanPrompt,
    systemPrompt?.trim() || null, // Original prompt
    mcpInjection ? mcpInjection.trim() : null, // MCP instructions
  ]
    .filter(Boolean)
    .join('\n\n'); // Join non-empty parts

  // Add system prompt first if there's any content
  if (finalSystemPrompt) {
    messagesToSend.push({ content: finalSystemPrompt, role: 'system' });
  }

  // Add the filtered history messages
  history.forEach((msg) => {
    messagesToSend.push({
      content: msg.content,
      role: msg.role,
    });
  });

  // Log the final system prompt being sent (optional debug)
  if (finalSystemPrompt) {
    console.log('[getHistoryForApi] Final System Prompt:\n', finalSystemPrompt);
  }

  return messagesToSend;
}

// --- Regeneration Action Atoms ---

/** Regenerates an AI response based on the history up to a specific message. */
export const regenerateMessageAtom = atom(
  null,
  (get, set, targetMessageId: string) => {
    const activeChat = get(activeChatAtom); // Use derived atom for efficiency

    // Check necessary conditions before proceeding
    if (!activeChat || get(isAssistantLoadingAtom) || !targetMessageId) {
      console.warn('Regeneration aborted: No active chat.');
      return;
    }
    if (get(isAssistantLoadingAtom)) {
      console.warn('Regeneration aborted: Assistant is already loading.');
      toast.warning('Please wait for the current response to finish.');
      return;
    }
    if (!targetMessageId) {
      console.warn('Regeneration aborted: No target message ID provided.');
      return;
    }

    const messages = activeChat.messages;
    const targetIndex = messages.findIndex((m) => m.id === targetMessageId);

    if (targetIndex === -1) {
      console.error(
        `Regeneration failed: Message with ID ${targetMessageId} not found in active chat.`,
      );
      toast.error('Target message for regeneration not found.');
      return;
    }

    const targetMessage = messages[targetIndex];
    const maxHistory = activeChat.maxHistory ?? get(defaultMaxHistoryAtom);

    let historySlice: Message[];
    let messageIdToDelete: string | null = null;

    // Determine the history slice and which message (if any) to delete before regenerating
    if (targetMessage.role === 'assistant') {
      // Regenerating an assistant message: History is everything *before* it.
      historySlice = messages.slice(0, targetIndex);
      messageIdToDelete = targetMessageId; // Delete the original assistant message.
    } else if (targetMessage.role === 'user') {
      // Regenerating based on a user message: History is everything *up to and including* it.
      historySlice = messages.slice(0, targetIndex + 1);
      // Check if the *next* message is an assistant response; if so, delete it.
      const nextMessage = messages[targetIndex + 1];
      if (nextMessage?.role === 'assistant') {
        messageIdToDelete = nextMessage.id;
      }
    } else {
      // Cannot regenerate based on system messages or dividers
      console.warn(`Cannot regenerate message type: ${targetMessage.role}`);
      toast.error(`Cannot regenerate from a ${targetMessage.role} message.`);
      return;
    }

    // Prepare messages for the API using the helper
    const relevantHistory = getHistoryForApi(
      get, // <-- Pass get
      historySlice,
      maxHistory,
      activeChat.systemPrompt,
    );

    // Ensure there's enough context to generate a response
    const hasUserOrAssistantContent = relevantHistory.some(
      (msg) => msg.role === 'user' || msg.role === 'assistant',
    );
    if (!hasUserOrAssistantContent) {
      console.warn(
        'Regeneration aborted: Not enough valid history context for message:',
        targetMessageId,
      );
      toast.error('Not enough context to regenerate from this point.');
      // If we were planning to delete a message but can't regenerate,
      // still delete it to avoid orphaned assistant messages.
      if (messageIdToDelete) {
        // Check if message still exists before deleting
        const currentMessages = get(activeChatAtom)?.messages ?? []; // Get fresh message list
        if (currentMessages.some((m) => m.id === messageIdToDelete)) {
          console.log(
            'Deleting orphaned message before failed regeneration:',
            messageIdToDelete,
          );
          set(deleteMessageFromActiveChatAtom, messageIdToDelete);
        }
      }
      return;
    }

    console.log(
      `Regenerating response based on message ${targetMessageId} (role: ${targetMessage.role}). Will delete message: ${messageIdToDelete ?? 'none'}`,
    );

    // --- Perform Deletion and Generation ---

    // 1. Delete the necessary message *before* calling the API
    if (messageIdToDelete) {
      // Check if message still exists before deleting
      const currentMessages = get(activeChatAtom)?.messages ?? []; // Get fresh message list
      if (currentMessages.some((m) => m.id === messageIdToDelete)) {
        console.log('Deleting message before regeneration:', messageIdToDelete);
        set(deleteMessageFromActiveChatAtom, messageIdToDelete);
      } else {
        console.warn(
          `Message ${messageIdToDelete} intended for deletion was already gone.`,
        );
      }
    }

    // 2. Call the streamlined OpenAI stream logic
    // Pass the 'set' function and necessary parameters directly.
    callOpenAIStreamLogic(
      get, // Pass get
      set, // Pass set
      relevantHistory,
      // Callbacks are replaced by direct atom sets within callOpenAIStreamLogic
    );
  },
);

/** Regenerates the *last* assistant response in the active chat. */
export const regenerateLastResponseAtom = atom(null, (get, set) => {
  const activeChat = get(activeChatAtom); // Use derived atom
  if (
    !activeChat ||
    activeChat.messages.length === 0 ||
    get(isAssistantLoadingAtom)
  ) {
    console.warn(
      'Cannot regenerate last response: No active chat or chat is empty.',
    );
    return;
  }
  if (get(isAssistantLoadingAtom)) {
    console.warn(
      'Cannot regenerate last response: Assistant is already loading.',
    );
    toast.warning('Please wait for the current response to finish.');
    return;
  }

  let lastAssistantMessageId: string | null = null;
  // Iterate backwards to find the last message with role 'assistant'
  for (let i = activeChat.messages.length - 1; i >= 0; i--) {
    const message = activeChat.messages[i];
    // Skip dividers
    if (message.role === 'divider') continue;
    // If it's an assistant message, this is our target
    if (message.role === 'assistant') {
      lastAssistantMessageId = message.id;
      break;
    }
    // If we hit a user message *before* finding an assistant message,
    // it means the last turn was the user's, so we should regenerate *based* on that user message.
    if (message.role === 'user') {
      console.log('Last message was user, regenerating based on it.');
      set(regenerateMessageAtom, message.id); // Trigger regeneration based on the user message ID
      return; // Exit
    }

    // If we hit a system message first (unlikely unless chat structure is odd), stop.
    if (message.role === 'system') {
      break;
    }
  }

  if (lastAssistantMessageId) {
    console.log(
      'Regenerating the last assistant response:',
      lastAssistantMessageId,
    );
    set(regenerateMessageAtom, lastAssistantMessageId); // Trigger regeneration for the assistant message ID
  } else {
    console.warn(
      'No assistant message found in the active chat to regenerate.',
    );
    toast.info('No previous assistant response found to regenerate.');
  }
});
