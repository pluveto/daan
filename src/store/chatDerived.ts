// src/store/chatDerived.ts
import {
  ApiModelConfig,
  ApiProviderConfig,
  type Chat,
  type NamespacedModelId,
} from '@/types';
// Use NamespacedModelId
import { atom, Getter } from 'jotai';
import { activeChatIdAtom, chatsAtom } from './chatData';
import {
  apiProvidersAtom,
  defaultMaxTokensAtom,
  defaultTemperatureAtom,
  defaultTopPAtom,
} from './settings';

// Import the source of truth

// --- Derived Atoms ---

/** Derives the currently active chat object based on activeChatIdAtom. O(1) lookup. */
export const activeChatAtom = atom<Chat | null>((get) => {
  const chats = get(chatsAtom);
  const activeId = get(activeChatIdAtom);
  return activeId ? (chats[activeId] ?? null) : null;
});

/** Derives the list of available model IDs from enabled providers. */
export const availableModelsAtom = atom<NamespacedModelId[]>((get) => {
  const providers = get(apiProvidersAtom);
  const enabledModels: NamespacedModelId[] = [];

  providers.forEach((provider) => {
    // Only include models from enabled providers
    if (provider.enabled) {
      provider.models.forEach((model) => {
        // The model ID is already namespaced (e.g., "openai::gpt-4o")
        enabledModels.push(model.id);
      });
    }
  });

  return enabledModels;
});

/** Derives a sorted list of chats for display purposes (e.g., in the sidebar). */
export const sortedChatsAtom = atom<Chat[]>((get) => {
  const chats = get(chatsAtom);
  const chatList = Object.values(chats);
  return chatList.sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });
});

/** Groups available models by provider for dropdowns/selects. */
export const groupedAvailableModelsAtom = atom((get) => {
  const providers = get(apiProvidersAtom);
  const groups: {
    providerName: string;
    models: { id: NamespacedModelId; name: string }[];
  }[] = [];

  providers.forEach((provider) => {
    if (provider.enabled && provider.models.length > 0) {
      groups.push({
        providerName: provider.name, // Use the user-friendly provider name
        models: provider.models.map((m) => ({ id: m.id, name: m.name })), // Map to simpler structure for UI
      });
    }
  });

  return groups;
});

// --- Parameter Resolution Logic ---

interface EffectiveModelParams {
  temperature: number | null;
  maxTokens: number | null;
  topP: number | null;
}

/** Helper function to find model and provider config */
const findModelAndProvider = (
  modelId: NamespacedModelId | null,
  providers: ApiProviderConfig[],
): {
  modelConfig: ApiModelConfig | null;
  providerConfig: ApiProviderConfig | null;
} => {
  if (!modelId) return { modelConfig: null, providerConfig: null };
  const [providerId] = modelId.split('::');
  const providerConfig = providers.find((p) => p.id === providerId) ?? null;
  const modelConfig =
    providerConfig?.models.find((m) => m.id === modelId) ?? null;
  return { modelConfig, providerConfig };
};

/**
 * Helper function (or could be a derived atom) to get effective parameters for a given chat.
 * Checks chat overrides -> model defaults -> provider defaults -> global defaults.
 */
export const getEffectiveChatParams = (
  chat: Chat | null,
  get: Getter,
): EffectiveModelParams => {
  // Global defaults
  const globalTemp = get(defaultTemperatureAtom);
  const globalMaxTokens = get(defaultMaxTokensAtom);
  const globalTopP = get(defaultTopPAtom);

  if (!chat) {
    // No active chat, return global defaults
    return {
      temperature: globalTemp,
      maxTokens: globalMaxTokens,
      topP: globalTopP,
    };
  }

  // Find model/provider config
  const providers = get(apiProvidersAtom);
  const { modelConfig, providerConfig } = findModelAndProvider(
    chat.model,
    providers,
  );

  // Resolve in order: Chat Override -> Model Config -> Provider Config -> Global
  const temperature =
    chat.temperature ?? // Chat override
    modelConfig?.temperature ?? // Model default
    providerConfig?.defaultTemperature ?? // Provider default
    globalTemp; // Global default

  const maxTokens =
    chat.maxTokens ??
    modelConfig?.maxTokens ??
    providerConfig?.defaultMaxTokens ??
    globalMaxTokens;

  const topP =
    chat.topP ?? modelConfig?.topP ?? providerConfig?.defaultTopP ?? globalTopP;

  return { temperature, maxTokens, topP };
};

/** Derived atom providing the effective parameters for the *active* chat */
export const activeChatEffectiveParamsAtom = atom<EffectiveModelParams>(
  (get) => {
    const activeChat = get(activeChatAtom);
    return getEffectiveChatParams(activeChat, get);
  },
);

/** Derived atom providing the *source* defaults (model/provider/global) for the active chat's model, *ignoring* chat overrides. Used for placeholders. */
export const activeChatSourceDefaultsAtom = atom<EffectiveModelParams>(
  (get) => {
    const activeChat = get(activeChatAtom);
    const globalTemp = get(defaultTemperatureAtom);
    const globalMaxTokens = get(defaultMaxTokensAtom);
    const globalTopP = get(defaultTopPAtom);

    if (!activeChat?.model) {
      return {
        temperature: globalTemp,
        maxTokens: globalMaxTokens,
        topP: globalTopP,
      };
    }

    const providers = get(apiProvidersAtom);
    const { modelConfig, providerConfig } = findModelAndProvider(
      activeChat.model,
      providers,
    );

    const temperature =
      modelConfig?.temperature ??
      providerConfig?.defaultTemperature ??
      globalTemp;
    const maxTokens =
      modelConfig?.maxTokens ??
      providerConfig?.defaultMaxTokens ??
      globalMaxTokens;
    const topP = modelConfig?.topP ?? providerConfig?.defaultTopP ?? globalTopP;

    return { temperature, maxTokens, topP };
  },
);
