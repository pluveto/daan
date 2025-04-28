import { NamespacedModelId } from './misc';

/** Structure returned by hostApi.llm.getModels() */
export interface LlmModelInfo {
  id: NamespacedModelId;
  name: string;
  providerId: string;
  providerName: string;
  // Add other relevant info like supportsImageUpload if needed
}

/** Structure returned by hostApi.llm.getDefaults() */
export interface LlmDefaultSettings {
  defaultModelId: NamespacedModelId;
  defaultTemperature: number;
  defaultMaxTokens: number | null;
  defaultTopP: number | null;
  // Add other global defaults if relevant
}

/** Parameters for hostApi.llm.call() */
export interface LlmCallParams {
  requestId: string; // Miniapp-generated ID for this specific call
  model: NamespacedModelId | undefined;
  messages: Array<{ role: string; content: string }>; // Simplify for bridge
  stream: boolean;
  temperature?: number | null;
  maxTokens?: number | null;
  topP?: number | null;
  // Add other OpenAI compatible params if host supports them
}

/** Data structure for the 'daan:llmChunk' event detail */
export interface LlmChunkDetail {
  requestId: string;
  chunk: any; // Structure depends on what the host LLM logic sends back (e.g., { content: "...", ... })
}

/** Data structure for the 'daan:llmFinal' event detail */
export interface LlmFinalDetail {
  requestId: string;
  result: any; // Structure depends on host (e.g., { role: "assistant", content: "...", finishReason: "stop" })
  finishReason?: string | null;
}

/** Data structure for the 'daan:llmError' event detail */
export interface LlmErrorDetail {
  requestId: string;
  error: string; // Error message string
}
