// src/store/chatDerived.ts (Refactored - Phase 3/4)
import type { ChatMetadata } from '@/services/ChatDataService'; // Import metadata type
import { NamespacedModelId } from '@/types';
import type {
  ApiModelConfig,
  ApiProviderConfig,
  GroupedModels,
} from '@/types/api'; // Keep API types
import type { ChatEntity } from '@/types/internal'; // Use new internal chat type
import { atom, Getter } from 'jotai';
import {
  activeChatDataAtom, // Use this instead of looking up in chatsAtom
  chatListMetadataAtom,
} from './chatActions';
import {
  apiProvidersAtom,
  defaultMaxTokensAtom,
  defaultTemperatureAtom,
  defaultTopPAtom,
} from './settings'; // Settings remain the same

// --- Derived Atoms ---

/** Derives the currently active chat object (AppInternalChat) based on activeChatDataAtom. */
export const activeChatAtom = atom<ChatEntity | null>((get) => {
  // Simply return the value of the atom that holds the loaded active chat data
  return get(activeChatDataAtom);
});

/** Derives the list of available model IDs from enabled providers. (No changes needed) */
export const availableModelsAtom = atom<NamespacedModelId[]>((get) => {
  const providers = get(apiProvidersAtom);
  const enabledModels: NamespacedModelId[] = [];

  providers.forEach((provider) => {
    if (provider.enabled) {
      provider.models.forEach((model) => {
        enabledModels.push(model.id);
      });
    }
  });

  return enabledModels;
});

/** Derives a sorted list of chat metadata for display (e.g., in the sidebar). */
export const sortedChatsMetadataAtom = atom<ChatMetadata[]>((get) => {
  // Read the metadata loaded from the service
  const metadataList = get(chatListMetadataAtom);

  // Handle null state (before initial load)
  if (metadataList === null) {
    return [];
  }

  // Sort the metadata array: Pinned first, then by updatedAt descending
  // Create a mutable copy before sorting
  return [...metadataList].sort((a, b) => {
    // Pinned chats always come first
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1; // Pinned first (true sorts before false)
    }
    // Otherwise, sort by last updated time, newest first
    return b.updatedAt - a.updatedAt;
  });
});

/** Groups available models by provider for dropdowns/selects. (No changes needed) */
export const groupedAvailableModelsAtom = atom((get) => {
  const providers = get(apiProvidersAtom);
  const groups: GroupedModels = [];

  providers.forEach((provider) => {
    if (provider.enabled && provider.models.length > 0) {
      groups.push({
        providerName: provider.name,
        models: provider.models.map((m) => ({ id: m.id, name: m.name })),
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

/** Helper function to find model and provider config (No changes needed) */
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
 * Helper function to get effective parameters for a given chat.
 * Checks chat overrides -> model defaults -> provider defaults -> global defaults.
 * Now accepts AppInternalChat.
 */
export const getEffectiveChatParams = (
  chat: ChatEntity | null, // Updated type
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

  // Find model/provider config using the chat's model ID
  const providers = get(apiProvidersAtom);
  const { modelConfig, providerConfig } = findModelAndProvider(
    chat.model, // Use model from AppInternalChat
    providers,
  );

  // Resolve in order: Chat Override -> Model Config -> Provider Config -> Global
  // Use ?? operator for concise nullish coalescing
  const temperature =
    chat.temperature ??
    modelConfig?.temperature ??
    providerConfig?.defaultTemperature ??
    globalTemp;

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
    // Read the refactored activeChatAtom
    const activeChat = get(activeChatAtom);
    // Pass it to the updated helper function
    return getEffectiveChatParams(activeChat, get);
  },
);

/** Derived atom providing the *source* defaults for the active chat's model, *ignoring* chat overrides. */
export const activeChatSourceDefaultsAtom = atom<EffectiveModelParams>(
  (get) => {
    // Read the refactored activeChatAtom
    const activeChat = get(activeChatAtom);
    const globalTemp = get(defaultTemperatureAtom);
    const globalMaxTokens = get(defaultMaxTokensAtom);
    const globalTopP = get(defaultTopPAtom);

    // If no active chat or no model selected in the active chat
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

    // Resolve ignoring chat overrides: Model Config -> Provider Config -> Global
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
