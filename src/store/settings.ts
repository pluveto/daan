import { atomWithSafeStorage } from '@/lib/utils.ts';
import type { SupportedModels } from '@/types.ts';

// --- Global Settings Atoms ---

/** OpenAI API Key. Persisted securely (ideally not directly in localStorage). */
export const apiKeyAtom = atomWithSafeStorage<string>(
  'globalSettings_apiKey',
  '',
);

/** Optional custom OpenAI-compatible API base URL. Persisted. */
export const apiBaseUrlAtom = atomWithSafeStorage<string>(
  'globalSettings_apiBaseUrl',
  '',
);

/** Default model used for new chats. Persisted. */
export const defaultModelAtom = atomWithSafeStorage<SupportedModels>(
  'globalSettings_defaultModel',
  'gpt-4o',
);

/** Default model used for generating chat titles/summaries. Persisted. */
export const defaultSummaryModelAtom = atomWithSafeStorage<SupportedModels>(
  'globalSettings_defaultSummaryModel',
  'gpt-3.5-turbo',
);

/** Default system prompt used for new chats. Persisted. */
export const defaultPromptAtom = atomWithSafeStorage<string>(
  'globalSettings_defaultPrompt',
  'You are a helpful assistant.',
);

/** Default maximum number of history messages sent to the API. Persisted. */
export const defaultMaxHistoryAtom = atomWithSafeStorage<number>(
  'globalSettings_maxHistory',
  20,
);

/** Controls the application's night mode theme. Persisted. */
export const nightModeAtom = atomWithSafeStorage<boolean>(
  'globalSettings_nightMode',
  false,
);

/** Whether to automatically generate chat titles based on the first message. Persisted. */
export const generateSummaryAtom = atomWithSafeStorage<boolean>(
  'globalSettings_generateSummary',
  true,
);

/** Whether to display timestamps next to messages. Persisted. */
export const showTimestampsAtom = atomWithSafeStorage<boolean>(
  'globalSettings_showTimestamps',
  true,
);

/** Whether to display estimated token counts (if implemented). Persisted. */
export const showEstimatedTokensAtom = atomWithSafeStorage<boolean>(
  'globalSettings_showEstimatedTokens',
  true,
);

/** List of custom model names added by the user. Persisted. */
export const customModelsAtom = atomWithSafeStorage<string[]>(
  'globalSettings_customModels',
  [],
);
