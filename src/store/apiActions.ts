// src/store/apiActions.ts
import { atom, Getter, Setter } from 'jotai';
import { debounce } from 'lodash'; // Import debounce
import OpenAI from 'openai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import type { MessageEntity } from '@/types'; // Use internal type
import { abortControllerAtom, isAssistantLoadingAtom } from './apiState';
import {
  _activeChatIdAtom,
  activeChatDataAtom,
  activeChatIdAtom,
  updateChatAtom,
} from './chatActions';
import { getEffectiveChatParams } from './chatDerived'; // Keep derived params logic
import { handleMcpToolCallAtom } from './mcp';
import {
  addMessageToActiveChatAtom, // Action to update UI state only
  finalizeStreamingMessageInDbAtom,
  updateStreamingMessageUIAtom, // Action to update UI state only
} from './messageActions'; // Use refactored message actions
import { getHistoryForApi } from './regeneration'; // Import refactored history getter
import { chatDataServiceAtom } from './service';
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  apiProvidersAtom,
  defaultSummaryModelAtom,
} from './settings'; // Keep settings atoms

// Debounce delay for updating message content in DB during streaming (in milliseconds)
const STREAM_DB_UPDATE_DEBOUNCE_MS = 750;

/** Core logic for calling the OpenAI Chat Completions API with streaming. */
async function callOpenAIStreamLogic(get: Getter, set: Setter, chatId: string) {
  console.log(
    `[callOpenAIStreamLogic] Starting API call for chat ${chatId}...`,
  );

  // --- 1. Preparation ---
  const service = get(chatDataServiceAtom);
  const chat = get(activeChatDataAtom); // Assumes active chat data is loaded

  if (!chat || chat.id !== chatId) {
    console.error(
      `[callOpenAIStreamLogic] Active chat data mismatch or not loaded for ${chatId}. Aborting.`,
    );
    toast.error('Cannot send message: Chat data not available.');
    // Ensure loading state is off if it somehow got stuck
    if (get(isAssistantLoadingAtom)) set(isAssistantLoadingAtom, false);
    return;
  }

  const modelId = chat.model;
  const { temperature, maxTokens, topP } = getEffectiveChatParams(chat, get); // Use loaded chat data

  const providers = get(apiProvidersAtom);
  const globalApiKey = get(apiKeyAtom);
  const globalApiBaseUrl = get(apiBaseUrlAtom);

  const [providerId, modelName] = modelId.split('::');
  const providerConfig = providers.find((p) => p.id === providerId);

  if (!providerConfig?.enabled) {
    toast.error(
      `API Provider "${providerConfig?.name || providerId}" is not enabled.`,
    );
    return;
  }
  const apiKey = providerConfig.apiKey || globalApiKey;
  const apiBaseUrl = providerConfig.apiBaseUrl || globalApiBaseUrl;

  if (!apiKey) {
    toast.error(
      `API Key not set for provider "${providerConfig.name}". Please configure it in Settings.`,
    );
    return;
  }

  // --- 2. Get Formatted History ---
  const messagesToSend = await getHistoryForApi(get, chatId);
  if (!messagesToSend) {
    console.error(
      `[callOpenAIStreamLogic] Failed to get message history for ${chatId}. Aborting.`,
    );
    // Error toast shown by getHistoryForApi
    return;
  }
  // Ensure history is not empty (besides optional system prompt)
  const hasUserOrAssistantContent = messagesToSend.some(
    (msg) =>
      msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool',
  );
  if (!hasUserOrAssistantContent) {
    console.warn(
      `[callOpenAIStreamLogic] No user/assistant/tool messages to send for chat ${chatId}. Aborting.`,
    );
    toast.info('Nothing to send to the assistant.');
    return;
  }

  // --- 3. Set Loading State & Create Placeholder ---
  set(isAssistantLoadingAtom, true);
  const assistantMessageId = uuidv4(); // ID for the upcoming response
  const controller = new AbortController();
  set(abortControllerAtom, { controller, messageId: assistantMessageId });

  // Add placeholder message to DB and UI
  const placeholderMessageData: Pick<
    MessageEntity,
    'role' | 'content' | 'isStreaming'
  > = {
    role: 'assistant',
    content: '', // Start empty
    isStreaming: true,
  };
  // addMessageToActiveChatAtom handles adding to DB and updating activeChatMessagesAtom
  const placeholderMessage = await set(addMessageToActiveChatAtom, {
    id: assistantMessageId,
    ...placeholderMessageData,
  });

  if (!placeholderMessage) {
    console.error(
      `[callOpenAIStreamLogic] Failed to add placeholder message for ${assistantMessageId}. Aborting.`,
    );
    toast.error('Failed to initialize assistant response.');
    set(isAssistantLoadingAtom, false);
    set(abortControllerAtom, null);
    return;
  }

  // --- 4. Streaming & Updates ---
  let accumulatedContent = '';
  let finalFinishReason: string | null | undefined = null;
  let toolCallProcessed = false;

  // Debounced function for DB updates during stream
  const debouncedDbUpdate = debounce(
    async (messageId: string, content: string) => {
      try {
        console.log(
          `[Debounced DB Update] Updating content for message ${messageId}...`,
        );
        await service.updateMessageContent(messageId, content);
      } catch (dbError) {
        console.error(
          `[Debounced DB Update] Failed to update message ${messageId}:`,
          dbError,
        );
        // Optionally retry or notify user? For now, just log.
      }
    },
    STREAM_DB_UPDATE_DEBOUNCE_MS,
    { leading: false, trailing: true }, // Ensure trailing edge call
  );

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    console.log(
      `[callOpenAIStreamLogic] Creating stream for ${assistantMessageId}... Model: ${modelName}, Params: Temp=${temperature}, MaxTokens=${maxTokens}, TopP=${topP}`,
    );
    const stream = await openai.chat.completions.create(
      {
        messages: messagesToSend,
        model: modelName,
        temperature: temperature ?? undefined,
        max_tokens: maxTokens ?? undefined,
        top_p: topP ?? undefined,
        stream: true,
        // tool_choice: // Add if supporting native tools
        // tools: // Add if supporting native tools
      },
      { signal: controller.signal },
    );

    // Process stream chunks
    for await (const chunk of stream) {
      const contentChunk = chunk.choices[0]?.delta?.content || '';
      if (contentChunk) {
        accumulatedContent += contentChunk;
        // Update UI state immediately
        set(updateStreamingMessageUIAtom, {
          messageId: assistantMessageId,
          contentChunk,
        });
        // Trigger debounced DB update
        debouncedDbUpdate(assistantMessageId, accumulatedContent);
      }

      // Store the finish reason
      if (chunk.choices[0]?.finish_reason) {
        finalFinishReason = chunk.choices[0].finish_reason;
        console.log(
          `[callOpenAIStreamLogic] Stream finish reason received: ${finalFinishReason} for ${assistantMessageId}`,
        );
      }

      // Handle potential native tool calls if needed later
      if (chunk.choices[0]?.delta?.tool_calls) {
        console.warn(
          `[callOpenAIStreamLogic] Native tool call delta detected for ${assistantMessageId}. Ignoring due to MCP preference.`,
        );
        // Set finish reason if appropriate? OpenAI might send 'tool_calls' as finish reason anyway.
      }
    } // End stream loop

    // Ensure any pending debounced update is flushed
    debouncedDbUpdate.flush();
    console.log(
      `[callOpenAIStreamLogic] Stream finished for ${assistantMessageId}. Final Reason: ${finalFinishReason}. Full length: ${accumulatedContent.length}`,
    );

    // --- 5. Post-Stream Processing ---

    // Check for MCP Tool Call Code Block at the end
    const mcpCodeBlockRegex =
      /(\n*)?```json:mcp-tool-call\s*(\{[\s\S]*?\})\s*```\s*$/;
    const match = accumulatedContent.match(mcpCodeBlockRegex);
    let finalContentToSave = accumulatedContent; // Content including MCP block initially
    let toolCallInfoForFinalize = null; // Store tool call info if parsed

    if (match) {
      const jsonString = match[2];
      try {
        const parsedArgs = JSON.parse(jsonString);
        // Basic validation
        if (
          typeof parsedArgs === 'object' &&
          parsedArgs !== null &&
          typeof parsedArgs.serverId === 'string' &&
          typeof parsedArgs.toolName === 'string' &&
          parsedArgs.hasOwnProperty('arguments') // Allow arguments to be any type initially
        ) {
          console.log(
            `[callOpenAIStreamLogic] MCP Tool Call Detected: Server=${parsedArgs.serverId}, Tool=${parsedArgs.toolName}`,
          );
          toast.info(`Assistant wants to use tool: ${parsedArgs.toolName}`);

          const callId = uuidv4(); // Generate unique ID for this call instance

          // Prepare ToolCallInfo to store with the message (using 'pending' initially)
          toolCallInfoForFinalize = {
            type: 'pending', // Will be handled by handleMcpToolCallAtom
            callId,
            serverId: parsedArgs.serverId,
            serverName: '', // Will be filled by handler
            toolName: parsedArgs.toolName,
            args: parsedArgs.arguments,
          } as MessageEntity['toolCallInfo']; // Needs refinement based on actual types

          // Content to save in DB should ideally not include the raw block
          // unless needed for display/debugging. Let's hide it for now.
          // finalContentToSave = accumulatedContent.substring(0, match.index).trim(); // Content before block
          // Or keep full content but mark tool info? Keep full for now for simplicity.
          finalContentToSave = accumulatedContent; // + `\n<hidden>call-id: ${callId}</hidden>`; // Keep full for context

          // Trigger the MCP handler
          set(handleMcpToolCallAtom, {
            callId,
            chatId: chatId,
            serverId: parsedArgs.serverId,
            toolName: parsedArgs.toolName,
            args: parsedArgs.arguments,
            rawBlock: match[0],
          });

          toolCallProcessed = true; // Mark MCP call as handled
        } else {
          throw new Error('Invalid MCP tool call JSON structure.');
        }
      } catch (parseError: any) {
        console.error(
          `[callOpenAIStreamLogic] Failed to parse MCP JSON for ${assistantMessageId}:`,
          parseError,
        );
        toast.error(
          `Tool call failed: AI returned invalid JSON format. (${parseError.message})`,
        );
        // Append error info to the content for debugging
        finalContentToSave =
          accumulatedContent +
          `\n\n--- Error: Invalid Tool Call Format ---\n${parseError.message}`;
        // Do not set toolCallProcessed = true
      }
    }

    // --- 6. Finalize Message State in DB ---
    // Finalize ONLY if a valid MCP tool call wasn't successfully initiated.
    // If MCP was processed, handleMcpToolCallAtom takes over the flow for this turn.
    if (!toolCallProcessed) {
      console.log(
        `[callOpenAIStreamLogic] Finalizing message ${assistantMessageId} normally (no valid tool call processed).`,
      );
      // Check for non-standard finish reasons
      let isErrorFinal = false;
      if (
        finalFinishReason &&
        finalFinishReason !== 'stop' &&
        finalFinishReason !== 'tool_calls'
      ) {
        console.warn(
          `[callOpenAIStreamLogic] Stream finished with non-standard reason: ${finalFinishReason} for message ${assistantMessageId}`,
        );
        if (finalFinishReason === 'length') {
          toast.warning('Response may be truncated due to maximum length.');
          finalContentToSave +=
            '\n\n[Warning: Response truncated due to length limit]';
        } else if (finalFinishReason === 'content_filter') {
          toast.error('Response stopped due to content filter.');
          finalContentToSave = '[Error: Response stopped by content filter]'; // Replace content entirely
          isErrorFinal = true;
        }
        // Handle other reasons if necessary
      } else if (finalFinishReason === 'tool_calls') {
        // This means native tool calls were generated, which we currently ignore.
        console.warn(
          `[callOpenAIStreamLogic] Model used native 'tool_calls' finish reason for ${assistantMessageId}. Ignoring native call.`,
        );
        toast.warning(
          'AI tried using a different tool format. MCP format preferred.',
        );
      }

      // Finalize in DB and UI state (handles loading/abort state cleanup)
      set(finalizeStreamingMessageInDbAtom, {
        messageId: assistantMessageId,
        finalContent: finalContentToSave,
        isError: isErrorFinal,
        toolCallInfo: null, // No MCP tool call processed
      });
    } else {
      console.log(
        `[callOpenAIStreamLogic] Skipping normal finalization for ${assistantMessageId} as MCP tool call was processed.`,
      );
      // MCP handler is now responsible. However, we *still* need to finalize the assistant message
      // itself to mark it as non-streaming and potentially store the ToolCallInfo.
      set(finalizeStreamingMessageInDbAtom, {
        messageId: assistantMessageId,
        finalContent: finalContentToSave, // Content including MCP block (or just conversational part)
        isError: false,
        toolCallInfo: toolCallInfoForFinalize, // Store the parsed tool call info
      });
    }
  } catch (error: any) {
    const isAbortError = error?.name === 'AbortError';
    console.error(
      `[callOpenAIStreamLogic] OpenAI API Error/Abort (${assistantMessageId}):`,
      error,
    );
    debouncedDbUpdate.cancel(); // Cancel any pending debounced write

    let errorContent = `Error: ${error?.message ?? 'Failed to get response'}`;
    if (isAbortError) {
      console.log(
        `[callOpenAIStreamLogic] Generation cancelled/aborted by user for message ${assistantMessageId}.`,
      );
      // Use accumulated content + cancellation notice
      errorContent = accumulatedContent + `\n\n[Generation cancelled]`;
    } else {
      toast.error(`Error: ${error?.message ?? 'Failed to get response.'}`);
    }

    // Finalize the message in DB/UI as an error state
    // This also handles cleaning up loading/abort state
    set(finalizeStreamingMessageInDbAtom, {
      messageId: assistantMessageId,
      finalContent: errorContent,
      isError: true, // Mark as error
      toolCallInfo: null,
    });
  }
  // No finally block needed, as finalizeStreamingMessageInDbAtom handles cleanup
}

// --- Action Atoms ---

/** Action to cancel the current ongoing AI generation. */
export const cancelGenerationAtom = atom(
  null, // Write-only
  (get, set) => {
    const abortInfo = get(abortControllerAtom);
    if (abortInfo) {
      console.log(
        `[cancelGenerationAtom] User requested cancellation for message: ${abortInfo.messageId}`,
      );
      toast.info('Attempting to cancel generation...');
      abortInfo.controller.abort('User cancellation'); // Send abort signal

      // Let the finalize logic within callOpenAIStreamLogic handle state cleanup
      // based on the AbortError being caught. Setting loading state here might cause race conditions.
      // set(isAssistantLoadingAtom, false); // Avoid setting here
      // set(abortControllerAtom, null);   // Avoid setting here
    } else {
      console.warn(
        '[cancelGenerationAtom] Cancel requested, but no active generation found.',
      );
      // Ensure loading state is false if somehow it's stuck
      if (get(isAssistantLoadingAtom)) {
        set(isAssistantLoadingAtom, false);
      }
    }
  },
);

/**
 * Main action to trigger a chat completion for the active chat.
 * Optionally adds a user message first.
 */
export const triggerChatCompletionAtom = atom(
  null, // Write-only
  async (get, set, chatId: string, userMessageContent?: string) => {
    const currentActiveChatId = get(activeChatIdAtom);
    if (chatId !== currentActiveChatId) {
      console.warn(
        `[triggerChatCompletionAtom] Attempted trigger for non-active chat ${chatId}. Setting active first.`,
      );
      set(_activeChatIdAtom, chatId);
      // Wait briefly for chat data to potentially load via effect? Or rely on callOpenAIStreamLogic check?
      // A small delay might help, but complicates logic. Let's rely on the check inside callOpenAIStreamLogic.
      await new Promise((resolve) => setTimeout(resolve, 50)); // Small delay, may not be sufficient
    }

    // If user content is provided, add it as a user message first
    if (
      userMessageContent &&
      typeof userMessageContent === 'string' &&
      userMessageContent.trim().length > 0
    ) {
      console.log(
        `[triggerChatCompletionAtom] Adding user message to chat ${chatId} before API call.`,
      );
      const userMessageData: Pick<MessageEntity, 'role' | 'content'> = {
        role: 'user',
        content: userMessageContent.trim(),
      };
      // Wait for the message to be added before proceeding
      const addedMsg = await set(addMessageToActiveChatAtom, userMessageData);
      if (!addedMsg) {
        console.error(
          '[triggerChatCompletionAtom] Failed to add user message. Aborting API call.',
        );
        toast.error('Failed to send message.');
        return; // Stop if user message couldn't be saved
      }
    } else {
      console.log(
        `[triggerChatCompletionAtom] Triggering completion for chat ${chatId} without adding new user message.`,
      );
    }

    // Call the core streaming logic function
    // Use set directly as callOpenAIStreamLogic is async
    await callOpenAIStreamLogic(get, set, chatId);
  },
);

/** Generates a concise chat title based on user message using AI. */
export const generateChatTitle = atom(
  null, // Write-only
  async (
    get,
    set,
    {
      chatId,
      userMessageContent,
    }: { chatId: string; userMessageContent: string },
  ) => {
    // This function seems less dependent on the main chat state refactoring,
    // but ensure it uses the correct API key/URL resolution.

    const globalApiKey = get(apiKeyAtom);
    const summaryModelId = get(defaultSummaryModelAtom);
    const providers = get(apiProvidersAtom);
    const globalApiBaseUrl = get(apiBaseUrlAtom);

    if (!userMessageContent?.trim()) {
      console.warn(
        '[generateChatTitle] Cannot generate title: User message is empty.',
      );
      return;
    }
    if (!summaryModelId) {
      console.warn(
        '[generateChatTitle] Cannot generate title: Default Summary Model not configured.',
      );
      return;
    }

    // Resolve API settings for the summary model
    const [providerId, modelName] = summaryModelId.split('::');
    const providerConfig = providers.find(
      (p) => p.id === providerId && p.enabled,
    );
    const finalApiKey = providerConfig?.apiKey || globalApiKey;
    const finalApiBaseUrl = providerConfig?.apiBaseUrl || globalApiBaseUrl;

    if (!finalApiKey) {
      console.warn(
        `[generateChatTitle] API Key not resolved for summary model ${summaryModelId}. Cannot generate title.`,
      );
      return; // Cannot make the call without a key
    }
    if (!modelName) {
      console.warn(
        `[generateChatTitle] Invalid model name extracted from ${summaryModelId}. Cannot generate title.`,
      );
      return;
    }

    console.log(
      `[generateChatTitle] Generating title for ${chatId} with model ${modelName}...`,
    );

    // Truncate long messages
    let processedContent =
      userMessageContent.length > 800
        ? `${userMessageContent.slice(0, 400)}...[truncated]...${userMessageContent.slice(-400)}`
        : userMessageContent;

    const prompt = `Based *only* on the following user message, generate a concise (3-6 words) chat title that starts with a single relevant emoji. Examples: "🚀 Project Phoenix Kickoff", "💡 Brainstorming New Features", "🤔 Debugging Login Issue". Respond with ONLY the title text, nothing else.\n\nUser Message: "${processedContent}"`;

    try {
      const openai = new OpenAI({
        apiKey: finalApiKey,
        baseURL: finalApiBaseUrl || undefined,
        dangerouslyAllowBrowser: true,
      });

      const response = await openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 30,
        temperature: 0.5,
        stream: false,
      });

      let generatedTitle = response.choices[0]?.message?.content
        ?.trim()
        .replace(/(\r\n|\n|\r)/gm, '')
        .replace(/["'`]/g, '');

      if (generatedTitle) {
        const emojiRegex =
          /^([\p{Emoji_Presentation}\p{Extended_Pictographic}])/u;
        const emojiMatch = generatedTitle.match(emojiRegex);
        let icon = '💬'; // Default

        if (emojiMatch) {
          icon = emojiMatch[0];
          generatedTitle = generatedTitle.replace(emojiRegex, '').trim();
        }

        if (!generatedTitle) {
          console.warn(
            '[generateChatTitle] Generated title was empty after removing emoji.',
          );
          generatedTitle =
            userMessageContent.split(' ').slice(0, 5).join(' ') + '...'; // Fallback
          icon = '💬';
        }

        console.log(
          `[generateChatTitle] Generated title: "${generatedTitle}", Icon: "${icon}" for chat ${chatId}`,
        );

        // Update the chat using the updateChatAtom action (which uses the service)
        set(updateChatAtom, { id: chatId, name: generatedTitle, icon: icon });
        // Note: updateChatAtom handles updating DB and UI state atoms (incl. metadata list)
      } else {
        console.warn(
          '[generateChatTitle] Title generation resulted in empty content.',
        );
      }
    } catch (error) {
      console.error('[generateChatTitle] Error:', error);
      // Don't update title on error
      // toast.error("Couldn't auto-generate title."); // Optional user feedback
    }
  },
);
