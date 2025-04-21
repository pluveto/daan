import type { ApiProviderConfig, Message, NamespacedModelId } from '@/types';
import { Atom, atom, Getter, Setter, WritableAtom } from 'jotai';
import OpenAI from 'openai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { abortControllerAtom, isAssistantLoadingAtom } from './apiState';
import { updateChatAtom } from './chatActions';
import { activeChatIdAtom } from './chatData';
import { activeChatAtom, getEffectiveChatParams } from './chatDerived';
import { handleMcpToolCallAtom } from './mcp';
import {
  appendContentToMessageAtom,
  finalizeStreamingMessageAtom,
  updateMessageContentAtom,
  upsertMessageInActiveChatAtom,
} from './messageActions';
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  apiProvidersAtom,
  defaultMaxTokensAtom,
  defaultSummaryModelAtom,
  defaultTemperatureAtom,
  defaultTopPAtom,
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
 * Handles state updates, cancellation, and MCP tool call detection.
 */
export async function callOpenAIStreamLogic(
  get: Getter,
  set: Setter,
  messagesToSend: OpenAI.ChatCompletionMessageParam[],
) {
  // --- Get Active Chat and its Effective Parameters ---
  const activeChat = get(activeChatAtom); // Get the whole chat object
  if (!activeChat) {
    console.error('Cannot call API: No active chat.');
    toast.error('Cannot process request: No active chat selected.');
    return;
  }
  const modelId = activeChat.model; // Get model from the active chat
  // Get effective parameters using the helper, considering chat overrides
  const { temperature, maxTokens, topP } = getEffectiveChatParams(
    activeChat,
    get,
  );
  console.log(
    `[API Call] Effective Params for ${modelId}: Temp=${temperature}, MaxTokens=${maxTokens}, TopP=${topP}`,
  );

  // --- Setup: Get settings, check API key, set loading state ---
  const providers = get(apiProvidersAtom);
  const globalApiKey = get(apiKeyAtom);
  const globalApiBaseUrl = get(apiBaseUrlAtom);

  const activeChatId = get(activeChatIdAtom); // Get active chat ID for tool call handler

  if (!activeChatId) {
    console.error('Cannot call API: No active chat ID.');
    toast.error('Cannot process request: No active chat selected.');
    return; // Exit early if no active chat
  }

  // Determine provider config (same as before)
  const providerId = modelId.split('::')[0];
  const modelName = modelId.split('::')[1]; // Get the base model name for the API call
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

  set(isAssistantLoadingAtom, true);
  const assistantMessageId = uuidv4();
  const controller = new AbortController();
  set(abortControllerAtom, { controller, messageId: assistantMessageId });

  // Add placeholder message (same as before)
  const placeholderMessage: Message = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    isStreaming: true,
  };
  set(upsertMessageInActiveChatAtom, placeholderMessage);

  // --- Tool Call Detection Logic ---
  let accumulatedContent = ''; // Buffer to detect tag across chunks
  let toolCallDetected = false;
  const toolCallRegex =
    /<mcp-tool-call\s+server="([^"]+)"\s+tool="([^"]+)"\s+arguments='([^']+)'>/; // Simple regex, might need refinement for escaped quotes in args

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    console.log(
      `Sending ${messagesToSend.length} messages to model ${modelId}...`,
    );
    const stream = await openai.chat.completions.create(
      {
        messages: messagesToSend,
        model: modelName, // Use the base model name
        temperature: temperature ?? undefined,
        max_tokens: maxTokens ?? undefined,
        top_p: topP ?? undefined,
        stream: true,
      },
      { signal: controller.signal },
    );

    for await (const chunk of stream) {
      const contentChunk = chunk.choices[0]?.delta?.content || '';
      if (contentChunk) {
        accumulatedContent += contentChunk;

        // Check for the tool call tag in the accumulated content
        const match = accumulatedContent.match(toolCallRegex);
        if (match) {
          toolCallDetected = true;
          const [, serverId, toolName, argsString] = match;
          const rawTag = match[0];
          console.log(
            `[MCP Tool Call Detected] Server: ${serverId}, Tool: ${toolName}`,
          );
          toast.info(`Assistant wants to use tool: ${toolName}`);

          // Trigger handler (pass activeChat.id)
          set(handleMcpToolCallAtom, {
            chatId: activeChat.id,
            serverId,
            toolName,
            argsString,
            rawTag,
          });

          // Update placeholder and finalize
          set(updateMessageContentAtom, {
            messageId: assistantMessageId,
            newContent: `Attempting to use tool: ${toolName}...`,
          });
          set(finalizeStreamingMessageAtom, assistantMessageId);
          break; // Exit loop
        }

        // If no tool call detected yet, append content normally
        set(appendContentToMessageAtom, {
          contentChunk,
          messageId: assistantMessageId,
        });
      }

      // Handle finish reasons (same as before)
      const finishReason = chunk.choices[0]?.finish_reason;
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
        } else if (finishReason === 'tool_calls') {
          // This happens if the model itself uses OpenAI's native tool calling format
          console.warn(
            'Model used native tool_calls finish reason. Ensure MCP format is preferred.',
          );
          toast.warning('AI tried using a different tool format.');
          // We might need to handle `chunk.choices[0]?.delta?.tool_calls` here if we want to support native calls too.
        }
      }
    } // End stream loop

    // Finalize normally ONLY if no tool call was detected
    if (!toolCallDetected) {
      console.log(
        `Stream finished normally for message ${assistantMessageId}.`,
      );
      set(finalizeStreamingMessageAtom, assistantMessageId);
    }
  } catch (error: any) {
    const isAbortError = error?.name === 'AbortError';
    console.error(`OpenAI API Error/Abort (${assistantMessageId}):`, error);

    // Only show error toast/update message if it wasn't a deliberate tool call interruption or user cancel
    if (!isAbortError && !toolCallDetected) {
      toast.error(`Error: ${error?.message ?? 'Failed to get response.'}`);
      const errorMessageContent = `Error: ${error?.message ?? 'Failed to get response'}`;
      // Use updateMessageContentAtom instead of upsert to avoid creating duplicates if placeholder exists
      set(updateMessageContentAtom, {
        messageId: assistantMessageId,
        newContent: errorMessageContent,
      });
    } else if (isAbortError) {
      console.log(
        `Generation cancelled/aborted for message ${assistantMessageId}.`,
      );
      // No error toast for user cancel or tool call handover
    }

    // Always finalize the stream state for the specific message ID,
    // unless a tool call was detected (which finalized it already).
    if (!toolCallDetected) {
      set(finalizeStreamingMessageAtom, assistantMessageId);
    }
  }
}
/** Generates a concise chat title based on the first user message using AI. */
export async function generateChatTitle(
  set: Setter,
  get: Getter, // Pass get
  chatId: string,
  userMessageContent: string,
): Promise<void> {
  const apiKey = get(apiKeyAtom); // Read values using get
  const apiBaseUrl = get(apiBaseUrlAtom);
  const summaryModelId = get(defaultSummaryModelAtom); // Get the configured summary model
  const providers = get(apiProvidersAtom); // Get providers to find config

  if (!apiKey && !providers.some((p) => p.enabled && p.apiKey)) {
    console.warn('Cannot generate title: No global or provider API Key set.');
    return;
  }
  if (!userMessageContent?.trim()) {
    console.warn('Cannot generate title: User message is empty.');
    return;
  }
  if (!summaryModelId) {
    console.warn(
      'Cannot generate title: Default Summary Model not configured.',
    );
    return;
  }

  // Determine API settings for the summary model
  const [providerId, modelName] = summaryModelId.split('::');
  const providerConfig = providers.find((p) => p.id === providerId);

  const finalApiKey = providerConfig?.apiKey || get(apiKeyAtom); // Use provider key or global
  const finalApiBaseUrl = providerConfig?.apiBaseUrl || get(apiBaseUrlAtom); // Use provider URL or global

  if (!finalApiKey) {
    console.warn(
      `Cannot generate title: API Key not resolved for summary model ${summaryModelId}.`,
    );
    return; // Need a key to make the call
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
      apiKey: finalApiKey,
      baseURL: finalApiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    console.log(
      `Generating chat title for ${chatId} with model ${modelName}...`,
    );
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'user', content: prompt } as OpenAI.ChatCompletionMessageParam,
      ],

      max_tokens: 30,
      temperature: 0.5, // Fixed temperature for title generation
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
