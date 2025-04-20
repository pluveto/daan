import type { Chat, Message, SupportedModels } from '@/types';
import { Atom, atom, WritableAtom } from 'jotai';
import OpenAI from 'openai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { abortControllerAtom, isAssistantLoadingAtom } from './apiState';
import { updateChatAtom } from './chatActions';
import {
  appendContentToMessageAtom,
  finalizeStreamingMessageAtom,
  upsertMessageInActiveChatAtom,
} from './messageActions';
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  defaultSummaryModelAtom,
} from './settings';

/** Action to cancel the current ongoing AI generation. */
export const cancelGenerationAtom = atom(null, (get, set) => {
  const abortInfo = get(abortControllerAtom);
  if (abortInfo) {
    console.log(
      `User requested cancellation for message: ${abortInfo.messageId}`,
    );
    abortInfo.controller.abort('User cancellation'); // Send abort signal

    // The finalizeStreamingMessageAtom logic (called in callOpenAIStreamLogic's finally/catch)
    // is responsible for cleaning up the abortControllerAtom and isAssistantLoadingAtom state
    // based on the specific message ID. We don't *necessarily* need to set them here,
    // but setting loading false can make the UI feel more responsive immediately.
    // set(isAssistantLoadingAtom, false);
    // set(abortControllerAtom, null); // Let finalize handle this based on ID match

    toast.info('Generation cancelled.');
  } else {
    console.warn('Cancel requested, but no active generation found.');
    // Ensure loading state is false if somehow it's stuck
    if (get(isAssistantLoadingAtom)) {
      set(isAssistantLoadingAtom, false);
    }
  }
});

/**
 * Core logic for calling the OpenAI Chat Completions API with streaming.
 * Handles state updates for loading, messages, and cancellation.
 */
export async function callOpenAIStreamLogic(
  // Use Jotai's set function directly for atom updates
  set: (
    atom: WritableAtom<any, any[], any>,
    ...args: any[]
  ) => void | Promise<void>,
  // Pass necessary values instead of the whole get function
  apiKey: string,
  apiBaseUrl: string | null,
  model: string,
  messagesToSend: OpenAI.ChatCompletionMessageParam[],
  // Callbacks are replaced by direct atom updates via `set`
) {
  if (!apiKey) {
    // Use toast for user feedback, alert is generally discouraged
    toast.error('API Key not set. Please configure it in Settings.');
    return;
  }

  set(isAssistantLoadingAtom, true);
  const assistantMessageId = uuidv4(); // ID for the *new* assistant message
  const controller = new AbortController();

  // Store the controller *before* the API call, associated with the new message ID
  set(abortControllerAtom, { controller, messageId: assistantMessageId });

  // Add placeholder assistant message to the active chat
  const placeholderMessage: Message = {
    content: '',
    id: assistantMessageId,
    isStreaming: true,
    role: 'assistant',
    timestamp: Date.now(),
  };
  // Use the specific atom action to add/update the message
  set(upsertMessageInActiveChatAtom, placeholderMessage);

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl || undefined, // Use null or undefined based on OpenAI client expectations
      dangerouslyAllowBrowser: true, // Acknowledge the risk
    });

    console.log(
      `Sending ${messagesToSend.length} messages to OpenAI model ${model}...`,
    );
    const stream = await openai.chat.completions.create(
      {
        messages: messagesToSend,
        model,
        stream: true,
        // temperature: 0.7, // Add other parameters as needed
      },
      { signal: controller.signal }, // Pass the abort signal
    );

    let contentReceived = false;
    for await (const chunk of stream) {
      // The OpenAI client v4+ should throw an AbortError if the signal is aborted,
      // so an explicit check `controller.signal.aborted` within the loop is often redundant,
      // but can be kept for clarity or older versions.

      const contentChunk = chunk.choices[0]?.delta?.content || '';
      if (contentChunk) {
        contentReceived = true;
        // Append content using the specific message action
        set(appendContentToMessageAtom, {
          contentChunk,
          messageId: assistantMessageId,
        });
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      // Log finish reasons other than 'stop' or null/undefined
      if (finishReason && finishReason !== 'stop') {
        console.warn(
          `Stream finished with reason: ${finishReason} for message ${assistantMessageId}`,
        );
        if (finishReason === 'length') {
          toast.warning('Response may be truncated due to maximum length.', {
            duration: 5000,
          });
        } else if (finishReason === 'content_filter') {
          toast.error('Response stopped due to content filter.', {
            duration: 5000,
          });
        }
        // Add handling for other reasons if needed
      }
    }

    // If loop completes without error (and wasn't aborted before starting), finalize normally.
    console.log(
      `Stream finished normally for message ${assistantMessageId}. Content received: ${contentReceived}`,
    );
    // Finalize using the specific message action - this handles loading/abort state internally
    set(finalizeStreamingMessageAtom, assistantMessageId);
  } catch (error: any) {
    // Check if it's an abort error
    const isAbortError = error?.name === 'AbortError';

    console.error(`OpenAI API Error/Abort (${assistantMessageId}):`, error);

    if (!isAbortError) {
      toast.error(`Error: ${error?.message ?? 'Failed to get response.'}`);
      // Update the placeholder message with an error state ONLY if it wasn't an abort
      const errorMessageContent = `Error: ${error?.message ?? 'Failed to get response'}`;
      const errorMessageUpdate: Message = {
        ...placeholderMessage, // Use the ID of the message that failed
        id: assistantMessageId, // Ensure correct ID
        content: errorMessageContent,
        isStreaming: false, // Stop streaming on error
      };
      set(upsertMessageInActiveChatAtom, errorMessageUpdate); // Update placeholder with error
    } else {
      console.log(`Generation cancelled for message ${assistantMessageId}.`);
      // No error toast needed for user-initiated cancel
    }

    // Always finalize the stream state (to handle loading/abort atoms),
    // regardless of whether it was a normal finish, error, or abort.
    // finalizeStreamingMessageAtom checks the message ID before clearing the *global* controller.
    set(finalizeStreamingMessageAtom, assistantMessageId);
  }
  // No finally block needed here because finalizeStreamingMessageAtom now handles
  // the cleanup of isAssistantLoadingAtom and abortControllerAtom based on message ID.
}

/** Generates a concise chat title based on the first user message using AI. */
export async function generateChatTitle(
  // Pass specific state values and the 'set' function
  set: (
    atom: WritableAtom<any, any[], any>,
    ...args: any[]
  ) => void | Promise<void>,
  get: (atom: Atom<any>) => any, // Need get for reading settings inside
  chatId: string,
  userMessageContent: string,
  // Remove updateChat callback, use set(updateChatAtom, ...) instead
): Promise<void> {
  const apiKey = get(apiKeyAtom); // Read values using get
  const apiBaseUrl = get(apiBaseUrlAtom);
  const summaryModel = get(defaultSummaryModelAtom);

  if (!apiKey) {
    console.warn('Cannot generate title: API Key not set.');
    return;
  }
  if (!userMessageContent?.trim()) {
    console.warn('Cannot generate title: User message is empty.');
    return;
  }

  // Truncate long messages to avoid excessive token usage/cost for title generation
  let processedContent = userMessageContent;
  if (processedContent.length > 1000) {
    // Example length limit
    processedContent =
      processedContent.slice(0, 500) +
      '...[truncated]...' +
      processedContent.slice(-500);
  }

  const prompt = `Based *only* on the following user message, generate a concise (3-6 words) chat title that starts with a single relevant emoji. Examples: "🚀 Project Phoenix Kickoff", "💡 Brainstorming New Features", "🤔 Debugging Login Issue". Respond with ONLY the title text, nothing else.

User Message: "${processedContent}"`;

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    console.log(
      `Generating chat title for ${chatId} with model ${summaryModel}...`,
    );
    const response = await openai.chat.completions.create({
      model: summaryModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 30,
      temperature: 0.5, // Lower temperature for more predictable titles
      stream: false,
      // stop: ['\n'], // Optional: try stopping at newline
    });

    let generatedTitle = response.choices[0]?.message?.content
      ?.trim()
      .replace(/(\r\n|\n|\r)/gm, '') // Remove line breaks
      .replace(/["'`]/g, ''); // Remove quotes/backticks

    if (generatedTitle) {
      // Simple regex to find leading emoji (might need refinement)
      const emojiRegex =
        /^([\p{Emoji_Presentation}\p{Extended_Pictographic}])/u;
      const emojiMatch = generatedTitle.match(emojiRegex);

      let icon = '💬'; // Default icon if no emoji found
      if (emojiMatch) {
        icon = emojiMatch[0]; // Extract the emoji
        // Remove the matched emoji and surrounding space from the title
        generatedTitle = generatedTitle.replace(emojiRegex, '').trim();
      }

      // Ensure title isn't just an emoji or empty after extraction
      if (!generatedTitle) {
        console.warn('Generated title was empty after removing emoji.');
        generatedTitle =
          userMessageContent.split(' ').slice(0, 5).join(' ') + '...'; // Fallback title
        icon = '💬'; // Reset icon if title became empty
      }

      console.log(
        `Generated title: "${generatedTitle}", Icon: "${icon}" for chat ${chatId}`,
      );

      // Update the chat using the updateChatAtom action
      set(updateChatAtom, { id: chatId, name: generatedTitle, icon: icon });
    } else {
      console.warn('Title generation resulted in empty content.');
      // No update needed if generation failed
    }
  } catch (error) {
    console.error('Error generating chat title:', error);
    // Don't update the title on error, keep the default/current one
    // Optional: Show a subtle error toast?
    // toast.error("Couldn't auto-generate title.");
  }
}
