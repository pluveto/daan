// src/store/chatFlowActions.ts (or similar)
import type { Message } from '@/types.ts';
import { atom } from 'jotai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { callOpenAIStreamLogic, generateChatTitle } from './apiActions.ts';
import { isAssistantLoadingAtom } from './apiState.ts';
import { updateChatAtom } from './chatActions.ts';
// Import all necessary atoms and functions directly here
import { activeChatAtom } from './chatDerived.ts';
import {
  deleteMessageFromActiveChatAtom,
  upsertMessageInActiveChatAtom,
} from './messageActions.ts';
import { getHistoryForApi } from './regeneration.ts';
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  defaultMaxHistoryAtom,
  defaultSummaryModelAtom,
  generateSummaryAtom,
} from './settings.ts';

export const sendMessageActionAtom = atom(
  null, // Write-only atom
  (get, set, rawInput: string) => {
    // --- Move all logic from the component's handleSend here ---
    const trimmedInput = rawInput.trim();
    const activeChat = get(activeChatAtom);
    const isLoading = get(isAssistantLoadingAtom);

    if (!trimmedInput || !activeChat || isLoading) {
      if (isLoading) toast.warning('Please wait for the previous response.');
      console.warn('Send message condition not met', {
        trimmedInput,
        activeChat,
        isLoading,
      });
      return;
    }

    const apiKey = get(apiKeyAtom);
    const apiBaseUrl = get(apiBaseUrlAtom);
    const globalDefaultMaxHistory = get(defaultMaxHistoryAtom);
    const generateSummary = get(generateSummaryAtom);
    const summaryModel = get(defaultSummaryModelAtom);

    // Context Clearing ('---')
    if (trimmedInput === '---') {
      const lastMessage = activeChat.messages.at(-1);
      if (lastMessage?.content === '---') {
        set(deleteMessageFromActiveChatAtom, lastMessage.id);
      } else {
        const dividerMessage: Message = {
          content: '---',
          id: uuidv4(),
          role: 'divider',
          timestamp: Date.now(),
        };
        set(upsertMessageInActiveChatAtom, dividerMessage);
      }
      // Clear input draft in chat state? Assuming MessageInput will clear its local state.
      set(updateChatAtom, { id: activeChat.id, input: '' });
      return;
    }

    // Standard Message Sending
    const userMessage: Message = {
      content: trimmedInput,
      id: uuidv4(),
      role: 'user',
      timestamp: Date.now(),
    };
    set(upsertMessageInActiveChatAtom, userMessage);

    // Get state *after* adding the message for history/title gen
    const updatedChat = get(activeChatAtom);
    if (!updatedChat) {
      console.error('Chat became inactive unexpectedly after sending message.');
      return; // Should not happen
    }

    const maxHistory = updatedChat.maxHistory ?? globalDefaultMaxHistory;
    const historyMessages = updatedChat.messages; // Use messages from the latest state

    // --- Title Generation ---
    const needsTitle = updatedChat.name === 'New Chat'; // Or your default
    const isFirstUserMessage =
      historyMessages.filter((m) => m.role === 'user').length === 1;

    if (
      !updatedChat.characterId && // Example condition
      generateSummary &&
      isFirstUserMessage &&
      needsTitle
    ) {
      // Call NEW signature, passing set and get
      generateChatTitle(set, get, updatedChat.id, userMessage.content).catch(
        (err) => console.error('Background title generation failed:', err),
      );
    }
    // --- End Title Generation ---

    const messagesToSend = getHistoryForApi(
      historyMessages, // Use messages from the latest state
      maxHistory,
      updatedChat.systemPrompt?.trim(),
    );

    // Check if there's actually something to send besides system prompt
    const hasUserOrAssistantContent = messagesToSend.some(
      (msg) => msg.role === 'user' || msg.role === 'assistant',
    );
    if (!hasUserOrAssistantContent) {
      console.warn('No user/assistant messages in history, not calling API.');
      return;
    }

    // Call NEW signature, passing set
    callOpenAIStreamLogic(
      set, // Pass set!
      apiKey,
      apiBaseUrl,
      updatedChat.model,
      messagesToSend,
    ).catch((err) =>
      console.error('Error during assistant response generation:', err),
    );

    // Clear input draft in chat state
    set(updateChatAtom, { id: activeChat.id, input: '' });
  },
);
