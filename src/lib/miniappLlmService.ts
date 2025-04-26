// src/lib/miniappLlmService.ts
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  apiProvidersAtom,
  defaultMaxTokensAtom,
  defaultModelAtom,
  defaultTemperatureAtom,
  defaultTopPAtom,
} from '@/store/settings';
import type {
  LlmCallParams,
  LlmDefaultSettings,
  LlmModelInfo,
  NamespacedModelId,
} from '@/types';
import { Getter } from 'jotai'; // Use Getter if reading atoms outside React components/hooks
import OpenAI from 'openai';

// --- State Management for Active Calls ---

// Map to store AbortControllers for ongoing Miniapp LLM calls
// Key: miniappRequestId (string), Value: AbortController
const activeMiniappLlmCalls = new Map<string, AbortController>();

// Helper to get API config based on model ID
function resolveApiConfig(
  modelId: NamespacedModelId,
  get: Getter,
): { apiKey: string | null; baseUrl: string | null; modelName: string } {
  const providers = get(apiProvidersAtom);
  const globalApiKey = get(apiKeyAtom);
  const globalBaseUrl = get(apiBaseUrlAtom);

  const [providerId, modelName] = modelId.split('::');
  const providerConfig = providers.find(
    (p) => p.id === providerId && p.enabled,
  );

  if (!providerConfig && providerId !== 'custom') {
    // Allow 'custom' provider implicitly
    throw new Error(`Provider '${providerId}' not found or not enabled.`);
  }

  // For 'custom' provider or if provider config doesn't override, use global settings
  const apiKey = providerConfig?.apiKey || globalApiKey;
  // Special handling for OpenAI default URL if no specific URL is provided
  let baseUrl = providerConfig?.apiBaseUrl || globalBaseUrl;
  if (providerId === 'openai' && !baseUrl) {
    baseUrl = 'https://api.openai.com/v1'; // Default OpenAI URL
  }

  return { apiKey, baseUrl, modelName };
}

// --- Service Functions ---

/**
 * Registers an active LLM call initiated by a Miniapp.
 * @param miniappRequestId The unique ID provided by the Miniapp for the call.
 * @returns The AbortController for this call.
 */
export function registerLlmCall(miniappRequestId: string): AbortController {
  // If a call with the same ID is somehow already active, abort it first
  if (activeMiniappLlmCalls.has(miniappRequestId)) {
    console.warn(
      `Miniapp LLM Service: Request ID ${miniappRequestId} already active. Aborting previous call.`,
    );
    activeMiniappLlmCalls.get(miniappRequestId)?.abort();
  }
  const controller = new AbortController();
  activeMiniappLlmCalls.set(miniappRequestId, controller);
  console.log(
    `Miniapp LLM Service: Registered call ${miniappRequestId}. Total active: ${activeMiniappLlmCalls.size}`,
  );
  return controller;
}

/**
 * Cleans up the state for a finished/aborted/errored LLM call.
 * @param miniappRequestId The unique ID provided by the Miniapp.
 */
export function cleanupLlmCall(miniappRequestId: string): void {
  if (activeMiniappLlmCalls.has(miniappRequestId)) {
    activeMiniappLlmCalls.delete(miniappRequestId);
    console.log(
      `Miniapp LLM Service: Cleaned up call ${miniappRequestId}. Total active: ${activeMiniappLlmCalls.size}`,
    );
  }
}

/**
 * Handles abort requests from Miniapps.
 * @param miniappRequestId The unique ID of the call to abort.
 */
export function handleLlmAbort(miniappRequestId: string): void {
  const controller = activeMiniappLlmCalls.get(miniappRequestId);
  if (controller) {
    console.log(`Miniapp LLM Service: Aborting call ${miniappRequestId}`);
    controller.abort(`Miniapp request ${miniappRequestId} aborted by host.`);
    cleanupLlmCall(miniappRequestId); // Clean up immediately after aborting
  } else {
    console.warn(
      `Miniapp LLM Service: Cannot abort call ${miniappRequestId}, controller not found (already finished or invalid ID?).`,
    );
  }
}

/**
 * Retrieves available LLM models for Miniapps.
 * @param get Jotai getter function.
 */
export function handleLlmGetModels(get: Getter): LlmModelInfo[] {
  const providers = get(apiProvidersAtom);
  const availableModels: LlmModelInfo[] = providers
    .filter((p) => p.enabled)
    .flatMap((p) =>
      p.models.map((m) => ({
        id: m.id,
        name: m.name,
        providerId: p.id,
        providerName: p.name,
        // Add other details if needed
      })),
    );
  return availableModels;
}

/**
 * Retrieves default LLM settings for Miniapps.
 * @param get Jotai getter function.
 */
export function handleLlmGetDefaults(get: Getter): LlmDefaultSettings {
  return {
    defaultModelId: get(defaultModelAtom),
    defaultTemperature: get(defaultTemperatureAtom),
    defaultMaxTokens: get(defaultMaxTokensAtom),
    defaultTopP: get(defaultTopPAtom),
  };
}

/** Callbacks used by handleLlmCall */
export interface StreamCallbacks {
  onChunk: (chunk: any) => void; // Sends one chunk back
  onComplete: (finalResult: any) => void; // Sends the final aggregated result
  onError: (error: Error) => void; // Sends an error
}

/**
 * Handles the core LLM call logic (streaming and non-streaming).
 * @param get Jotai getter.
 * @param options Parameters from the Miniapp call.
 * @param callbacks Functions to send data/errors back to the bridge.
 * @param signal AbortSignal for the call.
 */
export async function handleLlmCall(
  get: Getter,
  options: LlmCallParams,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const { model, messages, stream, ...callOptions } = options;
  const { requestId: miniappRequestId } = options; // Extract for logging/cleanup

  try {
    // 1. Resolve API Key and Endpoint
    const { apiKey, baseUrl, modelName } = resolveApiConfig(model, get);
    if (!apiKey) {
      throw new Error(`API Key not configured for model ${model}.`);
    }

    // 2. Instantiate Client (Assuming OpenAI for now)
    // TODO: Extend this for other providers if needed
    const openai = new OpenAI({
      apiKey,
      baseURL: baseUrl || undefined, // Pass null or let OpenAI client use default
      dangerouslyAllowBrowser: true, // Acknowledge browser usage risk
    });

    // 3. Prepare API Parameters
    const apiParams: Partial<OpenAI.ChatCompletionCreateParams> = {
      model: modelName,
      messages: messages as OpenAI.ChatCompletionMessageParam[], // Cast needed
      temperature: callOptions.temperature ?? get(defaultTemperatureAtom), // Use global default if not provided
      max_tokens:
        callOptions.maxTokens ?? get(defaultMaxTokensAtom) ?? undefined, // Ensure null becomes undefined
      top_p: callOptions.topP ?? get(defaultTopPAtom) ?? undefined, // Ensure null becomes undefined
      stream: stream,
    };

    // 4. Make API Call
    if (stream) {
      const streamResponse = await openai.chat.completions.create(
        apiParams as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
        { signal },
      );

      let fullContent = '';
      let finalResult: any = null;

      for await (const chunk of streamResponse) {
        if (signal.aborted) throw new Error('Operation aborted');

        const contentChunk = chunk.choices[0]?.delta?.content || '';
        if (contentChunk) fullContent += contentChunk;

        // Send the raw chunk back for the Miniapp to process
        callbacks.onChunk(chunk);

        // Store potential finish reason
        if (chunk.choices[0]?.finish_reason) {
          finalResult = {
            // Prepare final structure even if streaming
            role: 'assistant',
            content: fullContent,
            finishReason: chunk.choices[0].finish_reason,
            // Include usage data if available in the last chunk? Check API spec.
            // usage: chunk.usage // Example
          };
        }
      }
      // If finish_reason wasn't in the last chunk (should be, but fallback)
      if (!finalResult) {
        finalResult = {
          role: 'assistant',
          content: fullContent,
          finishReason: 'unknown',
        };
      }
      callbacks.onComplete(finalResult);
    } else {
      // Non-streaming
      const response = await openai.chat.completions.create(
        apiParams as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
        { signal },
      );
      if (signal.aborted) throw new Error('Operation aborted');

      const result = response.choices[0]?.message; // Includes role, content
      const resultWithReason = {
        ...result,
        finishReason: response.choices[0]?.finish_reason,
        usage: response.usage, // Include usage if available
      };
      callbacks.onComplete(resultWithReason);
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log(
        `Miniapp LLM Service: Call ${miniappRequestId} aborted successfully.`,
      );
      // Don't propagate abort errors back to miniapp via onError, just stop sending data
      // Cleanup is handled by handleLlmAbort or the caller's finally block
      return; // Stop execution here for abort
    }
    console.error(
      `Miniapp LLM Service: Error during call ${miniappRequestId} for model ${model}:`,
      error,
    );
    callbacks.onError(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  // NOTE: No 'finally' block here for cleanup. Cleanup should be called
  // explicitly by the bridge hook after onComplete/onError, or by handleLlmAbort.
}
