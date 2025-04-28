// src/store/chatFlowActions.ts
import { atom } from 'jotai';
import { toast } from 'sonner';
// --- Use refactored atoms and actions ---
import type { MessageEntity } from '@/types'; // Use internal type
import { generateChatTitle, triggerChatCompletionAtom } from './apiActions'; // Use new trigger action, updated title gen
import { isAssistantLoadingAtom } from './apiState';
import {
  _activeChatIdAtom,
  activeChatDataAtom, // Needed for title generation check
  activeChatMessagesAtom,
} from './chatActions';
import { addMessageToActiveChatAtom } from './messageActions'; // Use new add action
import { generateSummaryAtom } from './settings'; // Keep settings
// --- End imports ---

// Removed dependencies: updateChatAtom (for input clear), activeChatAtom (use activeChatIdAtom/activeChatDataAtom),
// deleteMessageFromActiveChatAtom, upsertMessageInActiveChatAtom, getHistoryForApi, callOpenAIStreamLogic (handled by triggerChatCompletionAtom)

/**
 * Orchestrates sending a user message:
 * 1. Adds the user message to the active chat via the service.
 * 2. Optionally triggers background chat title generation.
 * 3. Triggers the AI completion process for the active chat.
 */
export const sendMessageActionAtom = atom(
  null, // Write-only atom
  async (get, set, rawInput: string) => {
    const activeId = get(_activeChatIdAtom);
    const isLoading = get(isAssistantLoadingAtom);
    const trimmedInput = rawInput.trim();

    // --- 1. Initial Checks ---
    if (!activeId) {
      toast.error('Cannot send message: No active chat selected.');
      console.warn('[sendMessageActionAtom] No active chat.');
      return;
    }
    if (isLoading) {
      toast.warning('Please wait for the current response to finish.');
      console.warn('[sendMessageActionAtom] Assistant is already loading.');
      return;
    }
    if (!trimmedInput) {
      console.warn('[sendMessageActionAtom] Input is empty.');
      return; // Don't send empty messages
    }

    // --- 2. Context Clearing ('---') Handling (REMOVED) ---
    // The previous logic added a 'divider' message. This is removed for DB simplicity.
    // If '---' needs to clear history, the MessageInput component should detect '---'
    // and call clearActiveChatMessagesAtom instead of this action.
    if (trimmedInput === '---') {
      toast.info("Use the 'Clear History' button to clear context."); // Inform user about change
      console.warn(
        '[sendMessageActionAtom] "---" input detected, but divider logic removed. Use Clear History button.',
      );
      return; // Stop processing for '---' input
    }

    // --- 3. Add User Message ---
    console.log(
      `[sendMessageActionAtom] Adding user message to chat ${activeId}...`,
    );
    const userMessageData: Pick<MessageEntity, 'role' | 'content'> = {
      role: 'user',
      content: trimmedInput,
    };
    // Use the refactored action atom to add the message to DB and update UI state
    const addedUserMessage = await set(
      addMessageToActiveChatAtom,
      userMessageData,
    );

    if (!addedUserMessage) {
      console.error(
        '[sendMessageActionAtom] Failed to add user message. Aborting.',
      );
      // Error toast shown by addMessageToActiveChatAtom
      return; // Stop if message couldn't be saved
    }

    // --- 4. Optional: Trigger Title Generation (Runs in background) ---
    const shouldGenerateSummary = get(generateSummaryAtom);
    if (shouldGenerateSummary) {
      // Read state *after* potentially adding the message
      const currentChatData = get(activeChatDataAtom);
      const currentMessages = get(activeChatMessagesAtom);
      const isDefaultName = currentChatData?.name === 'New Chat'; // Check against default name
      const isFirstUserMsg =
        currentMessages.filter((m) => m.role === 'user').length === 1;

      if (
        currentChatData &&
        !currentChatData.characterId &&
        isDefaultName &&
        isFirstUserMsg
      ) {
        console.log(
          `[sendMessageActionAtom] Triggering background title generation for chat ${activeId}...`,
        );
        // Call the refactored action atom (fire and forget)
        set(generateChatTitle, {
          chatId: activeId,
          userMessageContent: trimmedInput,
        });
        // Error handling is inside generateChatTitle atom
      }
    }

    // --- 5. Trigger AI Completion ---
    console.log(
      `[sendMessageActionAtom] Triggering AI completion for chat ${activeId}...`,
    );
    // Call the refactored trigger atom. It handles history prep and the API call flow.
    set(triggerChatCompletionAtom, activeId); // Pass only the chat ID

    // --- 6. Input Clearing ---
    // Input clearing is now handled locally in MessageInput.tsx after this action resolves (or immediately).
    // No need to update chat state here for input draft.
  },
);
