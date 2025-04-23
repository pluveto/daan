// src/store/settings.ts
import { atomWithSafeStorage } from '@/lib/utils';
import type { ApiProviderConfig, NamespacedModelId } from '@/types'; // Use NamespacedModelId

// --- Global Settings Atoms ---

/** Global fallback API Key. */
export const apiKeyAtom = atomWithSafeStorage<string | null>(
  'globalSettings_apiKey',
  null,
);

/** Global fallback custom OpenAI-compatible API base URL. */
export const apiBaseUrlAtom = atomWithSafeStorage<string | null>(
  'globalSettings_apiBaseUrl',
  null,
);

/** Default Temperature for API calls (0.0 to 2.0). */
export const defaultTemperatureAtom = atomWithSafeStorage<number>(
  'globalSettings_temperature',
  0.7,
);

/** Default Max Tokens for API calls (or null for default). */
export const defaultMaxTokensAtom = atomWithSafeStorage<number | null>(
  'globalSettings_maxTokens',
  null, // Use null for "default" or "unlimited" based on API behavior
);

/** Default Top P for API calls (or null for default). */
export const defaultTopPAtom = atomWithSafeStorage<number | null>(
  'globalSettings_topP',
  null,
);

/** Default model used for new chats. Uses namespaced ID. */
export const defaultModelAtom = atomWithSafeStorage<NamespacedModelId>(
  'globalSettings_defaultModel',
  'openai::gpt-4o', // Default to OpenAI GPT-4o
);

/** Default model used for generating chat titles/summaries. Uses namespaced ID. */
export const defaultSummaryModelAtom = atomWithSafeStorage<NamespacedModelId>(
  'globalSettings_defaultSummaryModel',
  'openai::gpt-3.5-turbo', // Default to OpenAI GPT-3.5 Turbo
);

/** Stores configurations for various API providers. Persisted. */
export const apiProvidersAtom = atomWithSafeStorage<ApiProviderConfig[]>(
  'apiProviders',
  [
    // Default OpenAI Provider
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'Official OpenAI API models.',
      enabled: true,
      apiKey: null, // Use global fallback by default
      apiBaseUrl: null, // Use global fallback by default
      defaultTemperature: null, // Use global fallback
      defaultMaxTokens: null, // Use global fallback
      defaultTopP: null, // Use global fallback
      models: [
        {
          id: 'openai::gpt-4o-2024-08-06',
          name: 'GPT-4o (2024-08-06)',
          supportsImageUpload: true,
          supportsFileUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::gpt-4o-2024-11-20',
          name: 'GPT-4o (2024-11-20)',
          supportsImageUpload: true,
          supportsFileUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::gpt-4o',
          name: 'GPT-4o',
          supportsImageUpload: true,
          supportsFileUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::gpt-4.1-2025-04-14',
          name: 'GPT-4.1 (2025-04-14)',
          supportsImageUpload: true,
          supportsFileUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::gpt-4.1-mini-2025-04-14',
          name: 'GPT-4.1 Mini (2025-04-14)',
          supportsImageUpload: true,
          supportsFileUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::gpt-4.1-nano-2025-04-14',
          name: 'GPT-4.1 Nano (2025-04-14)',
          supportsImageUpload: true,
          supportsFileUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::gpt-4-turbo',
          name: 'GPT-4 Turbo',
          supportsImageUpload: true,
          supportsFileUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::gpt-4',
          name: 'GPT-4',
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::o1',
          name: 'O1',
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::o1-mini',
          name: 'O1 Mini',
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::o3',
          name: 'O3',
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::o3-mini',
          name: 'O3 Mini',
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::o4-mini',
          name: 'O4 Mini',
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'openai::gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          temperature: null,
          maxTokens: null,
          topP: null,
        },
      ],
    },
    // Placeholder for Google Gemini (initially disabled)
    {
      id: 'google',
      name: 'Google Gemini',
      description: 'Google Gemini models via Google AI Studio or Vertex AI.',
      enabled: false,
      apiKey: null,
      apiBaseUrl: null, // Needs specific URL for Gemini API
      defaultTemperature: null,
      defaultMaxTokens: null,
      defaultTopP: null, // Gemini often uses TopP
      models: [
        {
          id: 'google::gemini-1.5-pro-latest',
          name: 'Gemini 1.5 Pro',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'google::gemini-pro',
          name: 'Gemini Pro',
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'google::gemini-2.5-flash-preview-04-17',
          name: 'Gemini 2.5 Flash (Preview)',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'google::gemini-2.5-pro-preview-03-25',
          name: 'Gemini 2.5 Pro (Preview)',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'google::gemini-2.0-flash-001',
          name: 'Gemini 2.0 Flash',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'google::gemini-2.0-flash-lite-001',
          name: 'Gemini 2.0 Flash Lite',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
      ],
    },
    // Placeholder for Anthropic Claude (initially disabled)
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      description: 'Anthropic Claude models.',
      enabled: false,
      apiKey: null,
      apiBaseUrl: null, // Needs specific URL
      defaultTemperature: null,
      defaultMaxTokens: null,
      defaultTopP: null,
      models: [
        {
          id: 'anthropic::claude-3-7-sonnet-20241022',
          name: 'Claude 3.7 Sonnet',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'anthropic::claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'anthropic::claude-3-5-haiku-20241022',
          name: 'Claude 3.5 Haiku',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'anthropic::claude-3-opus-20240229',
          name: 'Claude 3 Opus',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
      ],
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      description: 'DeepSeek models.',
      enabled: false,
      apiKey: null,
      apiBaseUrl: null, // Needs specific URL
      defaultTemperature: null,
      defaultMaxTokens: null,
      defaultTopP: null,
      models: [
        {
          id: 'deepseek::deepseek-chat',
          name: 'DeepSeek Chat',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'deepseek::deepseek-reasoner',
          name: 'DeepSeek Reasoner',
          supportsImageUpload: true,
          temperature: null,
          maxTokens: null,
          topP: null,
        },
      ],
    },
    // Provider for user-defined custom models
    {
      id: 'custom',
      name: 'Custom Models',
      description: 'User-added custom models (uses global settings).',
      enabled: true, // Enabled by default so users can add models
      apiKey: null, // Always uses global
      apiBaseUrl: null, // Always uses global
      defaultTemperature: null, // Always uses global
      defaultMaxTokens: null, // Always uses global
      defaultTopP: null, // Always uses global
      models: [
        {
          id: 'custom::deepseek-v3-250324',
          name: 'deepseek-v3-250324',
          temperature: 0.7,
          maxTokens: null,
          topP: null,
        },
        {
          id: 'custom::deepseek-r1',
          name: 'deepseek-r1',
          temperature: 0.7,
          maxTokens: null,
          topP: null,
        },
      ],
    },
  ],
);

/** Default system prompt used for new chats. */
export const defaultPromptAtom = atomWithSafeStorage<string>(
  'globalSettings_defaultPrompt',
  'You are a helpful assistant.',
);

/** Default maximum number of history messages sent to the API. */
export const defaultMaxHistoryAtom = atomWithSafeStorage<number>(
  'globalSettings_maxHistory',
  20, // Default value
);

// --- UI Related Settings ---

/** Controls the application's night mode theme. */
export const nightModeAtom = atomWithSafeStorage<boolean>(
  'globalSettings_nightMode',
  false,
);

/** Whether to automatically generate chat titles based on the first message. */
export const generateSummaryAtom = atomWithSafeStorage<boolean>(
  'globalSettings_generateSummary',
  true,
);

/** Whether to display timestamps next to messages. */
export const showTimestampsAtom = atomWithSafeStorage<boolean>(
  'globalSettings_showTimestamps',
  true,
);

/** Whether to display estimated token counts. */
export const showEstimatedTokensAtom = atomWithSafeStorage<boolean>(
  'globalSettings_showEstimatedTokens',
  true,
);
