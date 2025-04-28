import { NamespacedModelId } from './misc';

export interface ApiModelConfig {
  id: NamespacedModelId; // Fully namespaced ID (e.g., "openai::gpt-4o")
  name: string; // User-facing display name (e.g., "GPT-4o")
  supportsFileUpload?: boolean;
  supportsImageUpload?: boolean;
  temperature?: number | null;
  maxTokens?: number | null;
  topP?: number | null;
}

export interface ApiProviderConfig {
  id: string; // Unique provider ID (e.g., "openai", "custom")
  name: string; // User-facing display name (e.g., "OpenAI")
  description?: string;
  enabled: boolean;
  apiKey?: string | null;
  apiBaseUrl?: string | null;
  defaultTemperature?: number | null;
  defaultMaxTokens?: number | null;
  defaultTopP?: number | null;
  models: ApiModelConfig[];
}

export type GroupedModel = {
  providerName: string;
  models: Array<{ id: NamespacedModelId; name: string }>;
};

export type GroupedModels = Array<GroupedModel>;
