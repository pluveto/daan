import type { Message } from '@/types';
import { atom, Getter, Setter } from 'jotai';
import OpenAI from 'openai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { abortControllerAtom, isAssistantLoadingAtom } from './apiState';
import { updateChatAtom } from './chatActions';
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
 * Handles state updates, cancellation, and MCP tool call detection using
 * a ```json:mcp-tool-call code block at the end of the response.
 */
export async function callOpenAIStreamLogic(
  get: Getter,
  set: Setter,
  messagesToSend: OpenAI.ChatCompletionMessageParam[],
) {
  // --- Get Active Chat and its Effective Parameters (Same as before) ---
  const activeChat = get(activeChatAtom);
  if (!activeChat) {
    console.error('Cannot call API: No active chat.');
    toast.error('Cannot process request: No active chat selected.');
    return;
  }
  const modelId = activeChat.model;
  const { temperature, maxTokens, topP } = getEffectiveChatParams(
    activeChat,
    get,
  );
  console.log(
    `[API Call] Effective Params for ${modelId}: Temp=${temperature}, MaxTokens=${maxTokens}, TopP=${topP}`,
  );

  // --- Setup: Get settings, check API key, set loading state (Same as before) ---
  const providers = get(apiProvidersAtom);
  const globalApiKey = get(apiKeyAtom);
  const globalApiBaseUrl = get(apiBaseUrlAtom);
  const activeChatId = activeChat.id; // Use ID directly from activeChat

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

  set(isAssistantLoadingAtom, true);
  const assistantMessageId = uuidv4();
  const controller = new AbortController();
  set(abortControllerAtom, { controller, messageId: assistantMessageId });

  // --- Add placeholder message (Same as before) ---
  const placeholderMessage: Message = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    isStreaming: true,
  };
  set(upsertMessageInActiveChatAtom, placeholderMessage);

  // --- Accumulate full response & Detect Tool Call at the END ---
  let fullAssistantResponse = '';
  let finalFinishReason: string | null | undefined = null;
  let toolCallProcessed = false;

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true, // Ensure this is acceptable for your security context
    });

    const stream = await openai.chat.completions.create(
      {
        messages: messagesToSend,
        model: modelName,
        temperature: temperature ?? undefined,
        max_tokens: maxTokens ?? undefined,
        top_p: topP ?? undefined,
        stream: true,
        // Potentially add 'tool_choice: "none"' if you ONLY want MCP calls
        // and want to discourage native tool use, though prompt is usually sufficient.
      },
      { signal: controller.signal },
    );

    for await (const chunk of stream) {
      const contentChunk = chunk.choices[0]?.delta?.content || '';
      if (contentChunk) {
        fullAssistantResponse += contentChunk;
        // Append content smoothly to the UI
        set(appendContentToMessageAtom, {
          contentChunk,
          messageId: assistantMessageId,
        });
      }

      // Store the finish reason when it arrives
      if (chunk.choices[0]?.finish_reason) {
        finalFinishReason = chunk.choices[0].finish_reason;
        console.log(
          `Stream finish reason received: ${finalFinishReason} for ${assistantMessageId}`,
        );
      }

      // Handle potential native tool calls if necessary (though we discourage them via prompt)
      if (chunk.choices[0]?.delta?.tool_calls) {
        console.warn(
          `Native tool call delta detected for ${assistantMessageId}. Ignoring due to MCP preference.`,
        );
        // Potentially add logic here if you want fallback support for native calls
      }
    } // End stream loop

    // --- Post-Stream Processing: Check for MCP Tool Call Code Block ---
    console.log(
      `Stream finished for ${assistantMessageId}. Final Reason: ${finalFinishReason}. Full length: ${fullAssistantResponse.length}`,
    );

    // Regex to find the ```
    // - (\n*)?: Optional leading newlines before the block.
    // - ```json:mcp-tool-call\s*: Matches the opening fence with language specifier.
    // - (\{[\s\S]*?\}): Captures the JSON object (non-greedy). Handles multi-line JSON.
    // - \s*```
    // - \s*$: Ensures this pattern is at the very end of the string (allowing trailing whitespace).
    const mcpCodeBlockRegex =
      /(\n*)?```json:mcp-tool-call\s*(\{[\s\S]*?\})\s*```s*$/;
    const match = fullAssistantResponse.match(mcpCodeBlockRegex);

    if (match) {
      // const leadingNewlines = match[1] ?? ''; // Optional leading newlines before block
      const jsonString = match[2]; // Captured JSON object as string
      console.debug('matched json: \n', jsonString);
      // const blockLength = match.length; // Full length of the matched block pattern

      // Extract the conversational content BEFORE the block
      // const conversationalContent = fullAssistantResponse.substring(
      //   0,
      //   fullAssistantResponse.length - blockLength
      // ).trim(); // Trim trailing whitespace from conversational part

      try {
        const parsedArgs = JSON.parse(jsonString);

        // Validate the structure (basic check)
        if (
          typeof parsedArgs === 'object' &&
          parsedArgs !== null &&
          typeof parsedArgs.serverId === 'string' &&
          typeof parsedArgs.toolName === 'string' &&
          // Allow 'arguments' to be missing or any type (validation happens later)
          parsedArgs.hasOwnProperty('arguments')
        ) {
          console.log(
            `[MCP Tool Call Detected] Server: ${parsedArgs.serverId}, Tool: ${parsedArgs.toolName}`,
          );
          toast.info(`Assistant wants to use tool: ${parsedArgs.toolName}`);

          const callId = uuidv4();
          // Update the message to *only* contain the conversational part
          set(updateMessageContentAtom, {
            messageId: assistantMessageId,
            // newContent: conversationalContent, // Show only text before the block
            newContent:
              fullAssistantResponse + `\n<hidden>call-id: ${callId}</hidden>`, // Now show full because AI may misunderstand whether he has called a tool or not
          });

          // Trigger the handler with the parsed arguments object
          set(handleMcpToolCallAtom, {
            callId,
            chatId: activeChatId,
            serverId: parsedArgs.serverId,
            toolName: parsedArgs.toolName,
            // Pass the actual parsed arguments object, not a string
            // The handler will validate against the schema
            args: parsedArgs.arguments,
            rawBlock: match[0], // Pass the raw block for potential logging/debugging
          });

          toolCallProcessed = true; // Mark as processed
        } else {
          // JSON structure is invalid
          throw new Error(
            'Invalid MCP tool call JSON structure. Missing required fields (serverId, toolName, arguments).',
          );
        }
      } catch (parseError: any) {
        console.error(
          `[MCP Tool Call] Failed to parse JSON arguments for ${assistantMessageId}:`,
          parseError,
        );
        toast.error(
          `Tool call failed: AI returned invalid JSON format. (${parseError.message})`,
        );
        // Keep the full response (including the bad block) for debugging
        set(updateMessageContentAtom, {
          messageId: assistantMessageId,
          newContent:
            fullAssistantResponse +
            `\n\n--- Error From LLM Client: Tool call format invalid ---\n\n` +
            `MCP Error: Failed to parse arguments for tool call. Please provide a valid JSON string.`,
        });
        // Don't set toolCallProcessed = true
      }
    }

    // --- Finalize Message State ---
    // Finalize ONLY if a tool call wasn't successfully processed.
    // If it was processed, the handler is now responsible for the flow.
    // The message content is already updated to exclude the block.
    if (!toolCallProcessed) {
      console.log(
        `Finalizing message ${assistantMessageId} normally (no valid tool call detected/processed).`,
      );
      set(finalizeStreamingMessageAtom, assistantMessageId);
    } else {
      console.log(
        `Skipping normal finalization for ${assistantMessageId} as MCP tool call was processed.`,
      );
      // Ensure loading state is reset EVEN IF tool call is processed,
      // unless the tool call handler itself manages subsequent loading states.
      // It's often better for the handler to manage this if it involves further async work.
      // For now, let's assume the handler DOES NOT manage it, so we reset here.
      // If the handler DOES manage it, remove this line.
      set(isAssistantLoadingAtom, false);
      set(abortControllerAtom, null); // Clear abort controller as this sequence is done.
    }

    // Handle finish reasons warnings (after potential tool call processing)
    // We check this regardless of tool call, as truncation/filtering could still occur.
    if (
      finalFinishReason &&
      finalFinishReason !== 'stop' &&
      finalFinishReason !== 'tool_calls'
    ) {
      console.warn(
        `Stream finished with non-standard reason: ${finalFinishReason} for message ${assistantMessageId}`,
      );
      if (finalFinishReason === 'length') {
        toast.warning('Response may be truncated due to maximum length.', {
          duration: 5000,
        });
        // Append warning to message *if* no tool call processed (otherwise it might look weird)
        if (!toolCallProcessed) {
          set(appendContentToMessageAtom, {
            messageId: assistantMessageId,
            contentChunk:
              '\n\n[Warning: Response truncated due to length limit]',
          });
        }
      } else if (finalFinishReason === 'content_filter') {
        toast.error('Response stopped due to content filter.', {
          duration: 5000,
        });
        if (!toolCallProcessed) {
          set(appendContentToMessageAtom, {
            messageId: assistantMessageId,
            contentChunk: '\n\n[Error: Response stopped by content filter]',
          });
        }
      }
      // If finish_reason is 'tool_calls', it means the *native* OpenAI tool call mechanism was triggered.
      // Our prompt discourages this, but if it happens, we log it.
    } else if (finalFinishReason === 'tool_calls') {
      console.warn(
        `Model used native 'tool_calls' finish reason for ${assistantMessageId}, despite MCP instructions. Ignoring native call.`,
      );
      toast.warning(
        'AI tried using a different tool format. MCP format preferred.',
      );
    }
  } catch (error: any) {
    const isAbortError = error?.name === 'AbortError';
    console.error(`OpenAI API Error/Abort (${assistantMessageId}):`, error);

    // Only show error toast/update message if it wasn't a deliberate user cancel.
    // Tool call processing happens *after* the stream, so errors during stream
    // should generally be shown unless it's a user abort.
    if (!isAbortError) {
      toast.error(`Error: ${error?.message ?? 'Failed to get response.'}`);
      // Update the placeholder with the error message
      set(updateMessageContentAtom, {
        messageId: assistantMessageId,
        newContent: `Error: ${error?.message ?? 'Failed to get response'}`,
        // Keep isStreaming false or let finalize handle it
      });
    } else {
      console.log(
        `Generation cancelled/aborted by user for message ${assistantMessageId}.`,
      );
      // Update message content to indicate cancellation
      set(updateMessageContentAtom, {
        messageId: assistantMessageId,
        newContent: fullAssistantResponse + `\n\n[Generation cancelled]`,
      });
    }

    // Always finalize the message state on error or abort, regardless of tool call attempts.
    // This ensures isStreaming is set to false and loading indicators are reset.
    console.log(
      `Finalizing message ${assistantMessageId} due to error or abort.`,
    );
    set(finalizeStreamingMessageAtom, assistantMessageId);
  } finally {
    // Ensure loading state and abort controller are reset if not handled elsewhere
    // (e.g., if finalizeStreamingMessageAtom doesn't handle these)
    // Note: We reset loading/abort in the successful tool call case explicitly now.
    // Finalize handles resetting these in normal success/error cases.
    // Check if finalizeStreamingMessageAtom already resets these; if so, this might be redundant.
    // set(isAssistantLoadingAtom, false); // Often handled by finalize
    // set(abortControllerAtom, null);     // Often handled by finalize
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
