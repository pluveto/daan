import { atomWithSafeStorage } from '@/lib/utils.ts';
import {
  CustomCharacter,
  exampleModels,
  type Chat,
  type Message,
  type SupportedModels,
} from '@/types.ts';
import { atom } from 'jotai';
import OpenAI from 'openai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

// --- 类型定义 ---
export type ChatsRecord = Record<string, Chat>;

// --- UI State Atoms ---
export const isLeftSidebarOpenAtom = atomWithSafeStorage(
  'leftSidebarOpen',
  true,
);
export const isRightSidebarOpenAtom = atomWithSafeStorage(
  'rightSidebarOpen',
  true,
);
export const isChatSettingsModalOpenAtom = atom(false);
export const isCharacterEditorOpenAtom = atom(false);
export const isCharacterAutoFillingAtom = atom(false);
export const isAssistantLoadingAtom = atom(false);
export const editingMessageIdAtom = atom<string | null>(null);
export const isConversationSearchOpenAtom = atom(false);
export const focusInputAtom = atom(0);
// --- Request State Atom ---

export const abortControllerAtom = atom<{
  controller: AbortController;
  messageId: string;
} | null>(null);

// --- Global Settings Atoms ---
export const apiKeyAtom = atomWithSafeStorage<string>(
  'globalSettings_apiKey',
  '',
);
export const apiBaseUrlAtom = atomWithSafeStorage<string>(
  'globalSettings_apiBaseUrl',
  '',
);
export const defaultModelAtom = atomWithSafeStorage<SupportedModels>(
  'globalSettings_defaultModel',
  'gpt-4o',
);
export const defaultSummaryModelAtom = atomWithSafeStorage<SupportedModels>(
  'globalSettings_defaultSummaryModel',
  'gpt-3.5-turbo',
);
export const defaultPromptAtom = atomWithSafeStorage<string>(
  'globalSettings_defaultPrompt',
  'You are a helpful assistant.',
);
export const defaultMaxHistoryAtom = atomWithSafeStorage<number>(
  'globalSettings_maxHistory',
  20,
);
export const nightModeAtom = atomWithSafeStorage<boolean>(
  'globalSettings_nightMode',
  false,
);
export const generateSummaryAtom = atomWithSafeStorage<boolean>(
  'globalSettings_generateSummary',
  true,
);
export const showTimestampsAtom = atomWithSafeStorage<boolean>(
  'globalSettings_showTimestamps',
  true,
);
export const showEstimatedTokensAtom = atomWithSafeStorage<boolean>(
  'globalSettings_showEstimatedTokens',
  true,
);
export const customModelsAtom = atomWithSafeStorage<string[]>(
  'globalSettings_customModels',
  [],
);
export const customCharactersAtom = atomWithSafeStorage<CustomCharacter[]>(
  'globalSettings_customCharacters',
  [],
);

// --- Chat Data Atoms ---
// ! 主要优化点：使用 Record<string, Chat> 替代 Chat[]
export const chatsAtom = atomWithSafeStorage<ChatsRecord>('chats', {});
export const activeChatIdAtom = atomWithSafeStorage<string | null>(
  'activeChatId',
  null,
);

// --- Derived Atoms ---

// ! 优化: O(1) 查找
export const activeChatAtom = atom<Chat | null>((get) => {
  const chats = get(chatsAtom);
  const activeId = get(activeChatIdAtom);
  // 直接通过 ID 访问，如果 ID 无效或不存在则为 null
  return activeId ? (chats[activeId] ?? null) : null;
});

export const availableModelsAtom = atom<SupportedModels[]>((get) => {
  const custom = get(customModelsAtom);
  // 使用 Set 去重
  return [...new Set([...exampleModels, ...custom])];
});

// ! 优化: 从 Object.values 获取数组再排序
export const sortedChatsAtom = atom<Chat[]>((get) => {
  const chats = get(chatsAtom);
  // 获取所有 chat 对象，然后排序
  const chatList = Object.values(chats);
  return chatList.sort((a, b) => {
    // 优先按置顶排序
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1; // true (pinned) 排在前面
    }
    // 按更新时间降序排序
    return b.updatedAt - a.updatedAt;
  });
});

// --- Action Atoms (Write-only atoms) ---
type NewChatOptions = Partial<
  Omit<
    Chat,
    'id' | 'messages' | 'createdAt' | 'updatedAt' | 'isPinned' | 'input'
  >
>;

export const createNewChatAtom = atom(
  null,
  (get, set, options?: NewChatOptions) => {
    const newId = uuidv4();
    const now = Date.now();
    const globalDefaults = {
      icon: '💬',
      name: `Chat ${new Date(now).toLocaleTimeString()}`, // Default initial name
      model: get(defaultModelAtom),
      systemPrompt: get(defaultPromptAtom),
      maxHistory: null, // Default uses global setting implicitly
    };

    const newChat: Chat = {
      // Start with internal properties
      id: newId,
      messages: [],
      createdAt: now,
      updatedAt: now,
      isPinned: false,
      input: '', // Always start with empty input draft
      // Merge global defaults and specific options
      icon: options?.icon ?? globalDefaults.icon,
      name: options?.name ?? globalDefaults.name,
      model: options?.model ?? globalDefaults.model,
      systemPrompt: options?.systemPrompt ?? globalDefaults.systemPrompt,
      maxHistory:
        options?.maxHistory !== undefined
          ? options?.maxHistory
          : globalDefaults.maxHistory, // Allow explicit null from options
    };

    // ! 优化: O(1) 添加
    set(chatsAtom, (prevChats) => ({
      ...prevChats,
      [newId]: newChat, // 直接添加新条目
    }));

    // 设置新创建的聊天为活动聊天
    set(activeChatIdAtom, newId);
    set(focusInputAtom, (c) => c + 1);
    // 重置编辑状态和加载状态
    set(editingMessageIdAtom, null);
    set(isAssistantLoadingAtom, false);
    set(abortControllerAtom, null);

    toast.success(`Chat "${newChat.name}" created.`);
  },
);

export const updateChatAtom = atom(
  null,
  (_get, set, update: Partial<Omit<Chat, 'id'>> & { id: string }) => {
    const chatId = update.id;
    // ! 优化: O(1) 更新
    set(chatsAtom, (prevChats) => {
      const chatToUpdate = prevChats[chatId];
      // 确保聊天存在才更新
      if (!chatToUpdate) {
        console.warn(`Chat with ID ${chatId} not found for update.`);
        return prevChats; // 返回原状态
      }
      // 创建新的聊天对象进行更新，保持不变性
      const updatedChat = {
        ...chatToUpdate,
        ...update, // 应用传入的更新
        updatedAt: Date.now(), // 更新时间戳
      };
      // 返回包含更新后聊天的新状态对象
      return {
        ...prevChats,
        [chatId]: updatedChat,
      };
    });
  },
);

export const deleteChatAtom = atom(null, (get, set, chatId: string) => {
  const currentChats = get(chatsAtom);
  const chatToDelete = currentChats[chatId];

  if (!chatToDelete) {
    console.warn(`Chat with ID ${chatId} not found for deletion.`);
    return; // 聊天不存在，直接返回
  }

  const currentActiveId = get(activeChatIdAtom);
  let nextActiveId: string | null = currentActiveId;

  // 如果删除的是当前活动的聊天
  if (currentActiveId === chatId) {
    // 需要确定下一个活动的聊天 ID
    const sortedChats = get(sortedChatsAtom); // 获取排序后的列表来决定邻近项
    const currentIndex = sortedChats.findIndex((c) => c.id === chatId);
    const chatsWithoutDeleted = sortedChats.filter((c) => c.id !== chatId);

    if (chatsWithoutDeleted.length > 0) {
      // 尝试选择当前索引位置的下一个（如果存在），否则选择前一个，最后选择第一个
      const nextIndex = Math.min(currentIndex, chatsWithoutDeleted.length - 1);
      nextActiveId = chatsWithoutDeleted[nextIndex]?.id ?? null;
      // 更鲁棒的查找方式：
      // nextActiveId = chatsWithoutDeleted[currentIndex]?.id ?? // Try same index
      //               chatsWithoutDeleted[currentIndex - 1]?.id ?? // Try previous index
      //               chatsWithoutDeleted[0]?.id; // Fallback to first
    } else {
      nextActiveId = null; // 没有其他聊天了
    }

    // 如果删除活动聊天时正在加载，取消请求
    const abortInfo = get(abortControllerAtom);
    if (abortInfo) {
      console.log('Cancelling generation due to active chat deletion.');
      abortInfo.controller.abort();
      set(abortControllerAtom, null);
      set(isAssistantLoadingAtom, false);
      // finalizeStreamingMessageAtom 可能需要被调用，但这通常在 abort 的 finally 块中处理
    }
  }

  // ! 优化: O(1) 删除 (通过创建新对象实现)
  set(chatsAtom, (prevChats) => {
    const newChats = { ...prevChats };
    delete newChats[chatId]; // 从对象中移除属性
    return newChats;
  });

  // 更新 activeChatIdAtom
  set(activeChatIdAtom, nextActiveId);

  // 如果删除的是活动聊天，重置编辑状态
  if (currentActiveId === chatId) {
    set(editingMessageIdAtom, null);
  }
});

export const togglePinChatAtom = atom(null, (_get, set, chatId: string) => {
  // ! 优化: O(1) 更新
  set(chatsAtom, (prevChats) => {
    const chatToToggle = prevChats[chatId];
    if (!chatToToggle) {
      console.warn(`Chat with ID ${chatId} not found for pinning.`);
      return prevChats;
    }
    const updatedChat = {
      ...chatToToggle,
      isPinned: !chatToToggle.isPinned, // 切换置顶状态
      updatedAt: Date.now(), // 更新时间戳
    };
    return {
      ...prevChats,
      [chatId]: updatedChat,
    };
  });
});

export const clearUnpinnedChatsAtom = atom(null, (get, set) => {
  const currentChats = get(chatsAtom);
  const currentActiveId = get(activeChatIdAtom);
  let activeChatIsUnpinned = false;
  const pinnedChats: ChatsRecord = {};

  // 遍历当前聊天记录
  for (const chatId in currentChats) {
    const chat = currentChats[chatId];
    if (chat.isPinned) {
      pinnedChats[chatId] = chat; // 保留置顶的聊天
    } else if (chatId === currentActiveId) {
      activeChatIsUnpinned = true; // 标记活动聊天是否未置顶
    }
  }

  // 如果活动聊天未置顶且正在加载，则取消
  if (activeChatIsUnpinned && get(isAssistantLoadingAtom)) {
    const abortInfo = get(abortControllerAtom);
    if (abortInfo) {
      console.log(
        'Cancelling generation due to active (unpinned) chat being cleared.',
      );
      abortInfo.controller.abort();
      set(abortControllerAtom, null);
      set(isAssistantLoadingAtom, false);
    }
  }

  // ! 优化: 更新为只包含置顶聊天的对象
  set(chatsAtom, pinnedChats);

  // 如果活动聊天被清除了，设置新的活动聊天
  if (activeChatIsUnpinned) {
    // 从剩余的（置顶的）聊天中选择第一个作为新的活动聊天
    const firstPinnedChatId = Object.keys(pinnedChats)[0] ?? null;
    set(activeChatIdAtom, firstPinnedChatId);
    set(editingMessageIdAtom, null); // 重置编辑状态
  }
});

export const forkChatAtom = atom(null, (get, set, chatId: string) => {
  const chats = get(chatsAtom);
  const chatToFork = chats[chatId];

  if (!chatToFork) {
    console.warn(`Chat with ID ${chatId} not found for forking.`);
    toast.error('Could not find the chat to fork.');
    return;
  }

  try {
    // Simple deep clone using JSON methods (sufficient for Chat structure)
    // Alternatively use _.cloneDeep(chatToFork) if lodash is preferred
    const forkedChat: Chat = JSON.parse(JSON.stringify(chatToFork));
    const newId = uuidv4();
    const now = Date.now();

    // Update properties for the new forked chat
    forkedChat.id = newId;
    forkedChat.name = `${chatToFork.name} (forked)`;
    forkedChat.isPinned = false; // Forks are not pinned by default
    forkedChat.createdAt = now;
    forkedChat.updatedAt = now;
    // Reset input draft if desired
    // forkedChat.input = '';

    set(chatsAtom, (prevChats) => ({
      ...prevChats,
      [newId]: forkedChat,
    }));

    set(activeChatIdAtom, newId); // Make the forked chat active

    // Reset potentially interfering states
    set(editingMessageIdAtom, null);
    set(isAssistantLoadingAtom, false);
    set(abortControllerAtom, null);

    toast.success('Conversation forked successfully.');
  } catch (error) {
    console.error('Forking failed:', error);
    toast.error(
      `Forking failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
});

export const deleteChatsOlderThanAtom = atom(
  null,
  (get, set, referenceChatId: string) => {
    const currentChats = get(chatsAtom);
    const currentActiveId = get(activeChatIdAtom);
    const referenceChat = currentChats[referenceChatId];

    if (!referenceChat) {
      console.warn(
        `Reference chat with ID ${referenceChatId} not found for deleting older chats.`,
      );
      toast.error('Reference chat not found.');
      return;
    }

    const refTimestamp = referenceChat.createdAt;
    const chatsToKeep: ChatsRecord = {};
    let activeChatDeleted = false;

    for (const chatId in currentChats) {
      const chat = currentChats[chatId];
      // Keep if: Pinned OR Reference Chat OR Newer than or equal to reference
      if (
        chat.isPinned ||
        chat.id === referenceChatId ||
        chat.createdAt >= refTimestamp
      ) {
        chatsToKeep[chatId] = chat;
      } else if (chatId === currentActiveId) {
        // Mark if the active chat is among those to be deleted
        activeChatDeleted = true;
      }
    }

    // If the active chat was deleted and loading, cancel generation
    if (activeChatDeleted && get(isAssistantLoadingAtom)) {
      const abortInfo = get(abortControllerAtom);
      if (abortInfo) {
        abortInfo.controller.abort();
        set(abortControllerAtom, null);
        set(isAssistantLoadingAtom, false);
      }
    }

    set(chatsAtom, chatsToKeep);

    // If the active chat was deleted, select a new active chat
    if (activeChatDeleted) {
      // Try to select the reference chat first, then the newest remaining, then null
      const remainingChats = Object.values(chatsToKeep).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      const newActiveId = chatsToKeep[referenceChatId]
        ? referenceChatId
        : (remainingChats[0]?.id ?? null);
      set(activeChatIdAtom, newActiveId);
      set(editingMessageIdAtom, null); // Reset editing state
    }

    toast.success('Older conversations deleted.');
  },
);

export const deleteChatsNewerThanAtom = atom(
  null,
  (get, set, referenceChatId: string) => {
    const currentChats = get(chatsAtom);
    const currentActiveId = get(activeChatIdAtom);
    const referenceChat = currentChats[referenceChatId];

    if (!referenceChat) {
      console.warn(
        `Reference chat with ID ${referenceChatId} not found for deleting newer chats.`,
      );
      toast.error('Reference chat not found.');
      return;
    }

    const refTimestamp = referenceChat.createdAt;
    const chatsToKeep: ChatsRecord = {};
    let activeChatDeleted = false;

    for (const chatId in currentChats) {
      const chat = currentChats[chatId];
      // Keep if: Pinned OR Reference Chat OR Older than or equal to reference
      if (
        chat.isPinned ||
        chat.id === referenceChatId ||
        chat.createdAt <= refTimestamp
      ) {
        chatsToKeep[chatId] = chat;
      } else if (chatId === currentActiveId) {
        // Mark if the active chat is among those to be deleted
        activeChatDeleted = true;
      }
    }

    // If the active chat was deleted and loading, cancel generation
    if (activeChatDeleted && get(isAssistantLoadingAtom)) {
      const abortInfo = get(abortControllerAtom);
      if (abortInfo) {
        abortInfo.controller.abort();
        set(abortControllerAtom, null);
        set(isAssistantLoadingAtom, false);
      }
    }

    set(chatsAtom, chatsToKeep);

    // If the active chat was deleted, select a new active chat
    if (activeChatDeleted) {
      // Try to select the reference chat first, then the newest remaining, then null
      const remainingChats = Object.values(chatsToKeep).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      const newActiveId = chatsToKeep[referenceChatId]
        ? referenceChatId
        : (remainingChats[0]?.id ?? null);
      set(activeChatIdAtom, newActiveId);
      set(editingMessageIdAtom, null); // Reset editing state
    }

    toast.success('Newer conversations deleted.');
  },
);

// Basic Chat structure validation helper
const isValidChat = (obj: any): obj is Chat => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.updatedAt === 'number' &&
    typeof obj.model === 'string' &&
    typeof obj.systemPrompt === 'string' &&
    Array.isArray(obj.messages) &&
    // Optionally add more checks for message structure, icon, pinned, maxHistory, input etc.
    obj.messages.every(
      (msg: any) =>
        typeof msg.id === 'string' &&
        typeof msg.role === 'string' &&
        typeof msg.content === 'string' &&
        typeof msg.timestamp === 'number',
    )
  );
};

const isValidCharacter = (obj: any): obj is CustomCharacter => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.icon === 'string' && // Added icon check
    typeof obj.prompt === 'string' &&
    typeof obj.model === 'string' &&
    (typeof obj.maxHistory === 'number' || obj.maxHistory === null) &&
    typeof obj.sort === 'number' && // Require sort
    typeof obj.createdAt === 'number' &&
    typeof obj.updatedAt === 'number' // Require updatedAt
    // description is optional, no strict check needed unless required format
  );
};

export const importChatsAtom = atom(
  null,
  (get, set, importedChats: unknown[]) => {
    if (!Array.isArray(importedChats)) {
      toast.error('Import failed: Invalid data format. Expected an array.');
      return;
    }

    let importedCount = 0;
    let skippedCount = 0;

    set(chatsAtom, (prevChats) => {
      const mergedChats = { ...prevChats }; // Start with existing chats

      importedChats.forEach((importedObj: unknown, index) => {
        // Validate the structure of the imported chat object
        if (isValidChat(importedObj)) {
          const importedChat = importedObj as Chat; // Type assertion after validation
          // Overwrite existing chat if ID conflicts
          if (mergedChats[importedChat.id]) {
            console.warn(
              `Overwriting existing chat with imported chat (ID: ${importedChat.id})`,
            );
          }
          mergedChats[importedChat.id] = importedChat;
          importedCount++;
        } else {
          console.warn(
            `Skipping invalid chat object at index ${index}:`,
            importedObj,
          );
          skippedCount++;
        }
      });
      return mergedChats; // Return the merged result
    });

    if (importedCount > 0) {
      toast.success(`${importedCount} conversation(s) imported successfully.`);
      // Optional: Set the first *newly* imported chat as active if nothing was active before?
      // const currentActiveId = get(activeChatIdAtom);
      // if (!currentActiveId && importedCount > 0) {
      //    const firstValidImported = importedChats.find(isValidChat);
      //    if(firstValidImported) set(activeChatIdAtom, (firstValidImported as Chat).id);
      // }
    }
    if (skippedCount > 0) {
      toast.warning(
        `${skippedCount} invalid conversation record(s) skipped during import.`,
      );
    }
    if (importedCount === 0 && skippedCount === 0) {
      toast.info('No conversations found in the imported file.');
    }
  },
);

// --- Message Specific Actions ---

// Helper function to update messages in a specific chat immutably
const updateMessagesInChat = (
  chats: ChatsRecord,
  chatId: string,
  messageUpdater: (messages: Message[]) => Message[],
  updateTimestamp: boolean = true,
): ChatsRecord => {
  const chatToUpdate = chats[chatId];
  if (!chatToUpdate) {
    console.warn(`Chat with ID ${chatId} not found for message update.`);
    return chats;
  }
  const newMessages = messageUpdater(chatToUpdate.messages);
  // 只有当消息列表实际改变时才更新时间戳（可选优化）
  // const timestamp = newMessages !== chatToUpdate.messages && updateTimestamp ? Date.now() : chatToUpdate.updatedAt;
  const timestamp = updateTimestamp ? Date.now() : chatToUpdate.updatedAt;

  const updatedChat = {
    ...chatToUpdate,
    messages: newMessages,
    updatedAt: timestamp,
  };
  return {
    ...chats,
    [chatId]: updatedChat,
  };
};

export const upsertMessageInActiveChatAtom = atom(
  null,
  (get, set, message: Message) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) return; // 如果没有活动聊天，则不执行任何操作

    // ! 优化: O(1) 访问聊天，O(M) 更新消息列表
    set(chatsAtom, (prevChats) =>
      updateMessagesInChat(
        prevChats,
        activeId,
        (currentMessages) => {
          const existingMsgIndex = currentMessages.findIndex(
            (m) => m.id === message.id,
          );
          let newMessages: Message[];

          if (existingMsgIndex > -1) {
            // 更新现有消息
            newMessages = [...currentMessages];
            const isCurrentlyStreaming =
              newMessages[existingMsgIndex].isStreaming;
            newMessages[existingMsgIndex] = {
              ...message,
              // 保持流状态，除非新消息明确设置为 false
              isStreaming: message.isStreaming ?? isCurrentlyStreaming,
            };
          } else {
            // 添加新消息
            newMessages = [...currentMessages, message];
          }
          return newMessages;
          // 只有当消息不是流式传输时才更新聊天的时间戳（因为流式更新会非常频繁）
        },
        !message.isStreaming,
      ),
    );
  },
);

export const deleteMessageFromActiveChatAtom = atom(
  null,
  (get, set, messageId: string) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) return;

    // 如果删除的是正在生成的消息，取消生成
    const abortInfo = get(abortControllerAtom);
    if (abortInfo?.messageId === messageId) {
      console.log(
        'Cancelling generation because the streaming message was deleted.',
      );
      abortInfo.controller.abort();
      set(abortControllerAtom, null);
      set(isAssistantLoadingAtom, false);
    }

    let messageWasDeleted = false;
    // ! 优化: O(1) 访问聊天，O(M) 更新消息列表
    set(
      chatsAtom,
      (prevChats) =>
        updateMessagesInChat(
          prevChats,
          activeId,
          (currentMessages) => {
            const originalLength = currentMessages.length;
            const filteredMessages = currentMessages.filter(
              (msg) => msg.id !== messageId,
            );
            messageWasDeleted = filteredMessages.length < originalLength;
            return filteredMessages;
          },
          messageWasDeleted,
        ), // 仅在实际删除消息时更新时间戳
    );

    // 如果删除的消息正在被编辑，清除编辑状态
    if (messageWasDeleted && get(editingMessageIdAtom) === messageId) {
      set(editingMessageIdAtom, null);
    }
  },
);

export const appendContentToMessageAtom = atom(
  null,
  (
    get,
    set,
    { contentChunk, messageId }: { contentChunk: string; messageId: string },
  ) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) return;

    // ! 优化: O(1) 访问聊天，O(M) 查找消息
    // ! 潜在问题: 频繁调用此 Action 可能导致频繁的 state 更新和 localStorage 写入 (取决于 atomWithSafeStorage 实现)
    //   考虑的优化：
    //   1. Debounce/Throttle 对 chatsAtom 的 set 操作（如果 atomWithSafeStorage 不支持）
    //   2. 使用一个临时的内存原子存储流式块，在 finalize 时合并
    //   3. 确保 atomWithSafeStorage 内部有高效的写入策略
    set(
      chatsAtom,
      (prevChats) =>
        updateMessagesInChat(
          prevChats,
          activeId,
          (currentMessages) => {
            const msgIndex = currentMessages.findIndex(
              (m) => m.id === messageId,
            );
            if (msgIndex > -1) {
              const updatedMessages = [...currentMessages];
              const currentContent = updatedMessages[msgIndex].content ?? '';
              updatedMessages[msgIndex] = {
                ...updatedMessages[msgIndex],
                content: currentContent + contentChunk,
                isStreaming: true, // 确保标记为流式
                // timestamp: updatedMessages[msgIndex].timestamp, // 保持原始时间戳
              };
              return updatedMessages;
            }
            return currentMessages; // 如果找不到消息，返回原始列表
          },
          false,
        ), // ! 不在流式追加时更新聊天时间戳
    );
  },
);

export const finalizeStreamingMessageAtom = atom(
  null,
  (get, set, messageId: string) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) {
      // 如果没有活动聊天（可能在流完成前被删除），确保重置状态
      set(isAssistantLoadingAtom, false);
      set(abortControllerAtom, null);
      return;
    }

    let messageFoundAndFinalized = false;
    // ! 优化: O(1) 访问聊天，O(M) 查找消息
    set(
      chatsAtom,
      (prevChats) =>
        updateMessagesInChat(
          prevChats,
          activeId,
          (currentMessages) => {
            const msgIndex = currentMessages.findIndex(
              (m) => m.id === messageId,
            );
            // 确保消息存在且当前正在流式传输
            if (msgIndex > -1 && currentMessages[msgIndex].isStreaming) {
              const updatedMessages = [...currentMessages];
              updatedMessages[msgIndex] = {
                ...updatedMessages[msgIndex],
                isStreaming: false, // 标记为完成
              };
              messageFoundAndFinalized = true;
              return updatedMessages;
            }
            return currentMessages; // 消息不存在或未在流式传输，则不更改
          },
          true,
        ), // ! 在流结束后更新聊天的时间戳
    );

    // 只有当消息确实被找到并标记为完成时，才关闭全局加载状态
    if (messageFoundAndFinalized) {
      set(isAssistantLoadingAtom, false);
      // abortController 通常在调用此函数的 finally 块中清除，这里无需处理
    } else {
      // 如果消息未找到（例如，在 finalize 之前被删除），则检查是否需要重置加载状态
      const abortInfo = get(abortControllerAtom);
      if (abortInfo?.messageId === messageId) {
        set(isAssistantLoadingAtom, false);
        set(abortControllerAtom, null); // 清理控制器
      }
    }
  },
);

// Action to cancel the current streaming generation
// (逻辑与原代码类似，主要是状态依赖可能变化)
export const cancelGenerationAtom = atom(null, (get, set) => {
  const abortInfo = get(abortControllerAtom);
  if (abortInfo) {
    console.log(
      'User requested cancellation for message:',
      abortInfo.messageId,
    );
    abortInfo.controller.abort(); // 发出中止信号
    // 注意：实际的状态清理（isAssistantLoadingAtom, abortControllerAtom）
    // 应该由调用 OpenAI 的逻辑中的 finally 块和 finalizeStreamingMessageAtom 来处理
    // 提前设置 isAssistantLoadingAtom 为 false 可以让 UI 响应更快，但不是必须的
    // set(isAssistantLoadingAtom, false);
  } else {
    console.warn('Cancel requested, but no active abort controller found.');
    // 以防万一，如果取消时没有控制器但仍在加载，重置加载状态
    if (get(isAssistantLoadingAtom)) {
      set(isAssistantLoadingAtom, false);
    }
  }
});

export const setEditingMessageIdAtom = atom(
  null,
  (_get, set, messageId: string | null) => {
    set(editingMessageIdAtom, messageId);
  },
);

export const updateMessageContentAtom = atom(
  null,
  (
    get,
    set,
    { messageId, newContent }: { messageId: string; newContent: string },
  ) => {
    const activeId = get(activeChatIdAtom);
    if (!activeId) return;

    // ! 优化: O(1) 访问聊天，O(M) 查找消息
    set(
      chatsAtom,
      (prevChats) =>
        updateMessagesInChat(
          prevChats,
          activeId,
          (currentMessages) => {
            const msgIndex = currentMessages.findIndex(
              (m) => m.id === messageId,
            );
            if (msgIndex > -1) {
              const updatedMessages = [...currentMessages];
              updatedMessages[msgIndex] = {
                ...updatedMessages[msgIndex],
                content: newContent,
                isStreaming: false, // 确保编辑后流状态为 false
              };
              return updatedMessages;
            }
            return currentMessages; // 消息未找到
          },
          true,
        ), // 更新聊天时间戳
    );
    set(editingMessageIdAtom, null); // 编辑完成后清除编辑状态
  },
);

// --- Regeneration Logic ---

// ! 已优化: 使用 get(activeChatAtom) 获取活动聊天 (O(1))
export const regenerateMessageAtom = atom(
  null,
  (get, set, targetMessageId: string) => {
    // ! 优化: 直接从派生 atom 获取活动聊天，更高效
    const activeChat = get(activeChatAtom);
    const apiKey = get(apiKeyAtom);
    const apiBaseUrl = get(apiBaseUrlAtom) || null; // 确保是 string | null

    // 获取所需的 setter 函数 (与原代码一致)
    const upsertMessage = (msg: Message) =>
      set(upsertMessageInActiveChatAtom, msg);
    const appendContent = (payload: {
      contentChunk: string;
      messageId: string;
    }) => set(appendContentToMessageAtom, payload);
    const finalizeStream = (msgId: string) =>
      set(finalizeStreamingMessageAtom, msgId);
    const setIsLoading = (loading: boolean) =>
      set(isAssistantLoadingAtom, loading);
    const setAbortCtrl = (
      ctrl: { controller: AbortController; messageId: string } | null,
    ) => set(abortControllerAtom, ctrl);
    const deleteMessage = (msgId: string) =>
      set(deleteMessageFromActiveChatAtom, msgId); // 使用优化后的删除 action

    // 条件检查 (与原代码一致)
    if (!activeChat || get(isAssistantLoadingAtom) || !targetMessageId) {
      console.warn('Regeneration conditions not met:', {
        hasActiveChat: !!activeChat,
        isLoading: get(isAssistantLoadingAtom),
        targetMessageId,
      });
      return;
    }

    const messages = activeChat.messages; // 从活动聊天对象获取消息数组
    const targetIndex = messages.findIndex((m) => m.id === targetMessageId);

    if (targetIndex === -1) {
      console.error(
        `Message with ID ${targetMessageId} not found in active chat.`,
      );
      return;
    }

    const targetMessage = messages[targetIndex];
    const maxHistory = activeChat.maxHistory ?? get(defaultMaxHistoryAtom);

    let historySlice: Message[];
    let messageIdToDelete: string | null = null;

    // --- 确定历史记录和要删除的消息 ID (逻辑与原代码一致) ---
    if (targetMessage.role === 'assistant') {
      // 再生助手消息: 历史是此消息之前的所有消息
      historySlice = messages.slice(0, targetIndex);
      messageIdToDelete = targetMessageId; // 删除原始助手消息
    } else if (targetMessage.role === 'user') {
      // 基于用户消息再生: 历史是此消息（包括）之前的所有消息
      historySlice = messages.slice(0, targetIndex + 1);
      // 检查下一条消息是否是助手响应，如果是则删除它
      const nextMessage = messages[targetIndex + 1];
      if (nextMessage?.role === 'assistant') {
        messageIdToDelete = nextMessage.id;
      }
    } else {
      console.warn(`Cannot regenerate message type: ${targetMessage.role}`);
      return;
    }

    // --- 准备 API 调用 (逻辑与原代码一致) ---
    const relevantHistory = getHistoryForApi(
      historySlice,
      maxHistory,
      activeChat.systemPrompt,
    );

    // 检查是否有足够上下文 (逻辑与原代码一致)
    if (
      relevantHistory.length === 0 ||
      (relevantHistory.length === 1 &&
        relevantHistory[0].role === 'system' &&
        historySlice.length === 0)
    ) {
      console.warn(
        'Not enough history context to regenerate response for message:',
        targetMessageId,
      );
      // 如果计划了删除，但提前失败，确保删除发生
      if (messageIdToDelete) {
        // ! 优化: 再次获取最新状态检查消息是否存在
        const currentChatState = get(activeChatAtom);
        if (
          currentChatState?.messages.some((m) => m.id === messageIdToDelete)
        ) {
          console.log(
            'Deleting message before failed regeneration:',
            messageIdToDelete,
          );
          deleteMessage(messageIdToDelete); // 使用 action 删除
        }
      }
      return;
    }

    console.log(
      'Regenerating message:',
      targetMessageId,
      'Role:',
      targetMessage.role,
    );

    // --- 执行删除和生成 ---

    // 1. 删除消息 (如果需要)
    if (messageIdToDelete) {
      // ! 优化: 再次获取最新状态检查消息是否存在，防止重复删除或删除不存在的消息
      const currentChatState = get(activeChatAtom); // 获取最新聊天状态
      if (currentChatState?.messages.some((m) => m.id === messageIdToDelete)) {
        console.log('Deleting message before regeneration:', messageIdToDelete);
        deleteMessage(messageIdToDelete); // 使用 action 删除
      } else {
        console.warn(
          'Message to delete was already gone or chat changed:',
          messageIdToDelete,
        );
        // 考虑是否还要继续？取决于业务逻辑，这里假设继续
      }
    }

    // 2. 调用 OpenAI 流式 API (与原代码一致)
    callOpenAIStreamLogic(
      apiKey,
      apiBaseUrl,
      activeChat.model,
      relevantHistory,
      setIsLoading,
      upsertMessage,
      appendContent,
      finalizeStream,
      setAbortCtrl,
    );
  },
);

// (基本不变，现在内部调用优化后的 regenerateMessageAtom)
export const regenerateLastResponseAtom = atom(null, (get, set) => {
  const activeChat = get(activeChatAtom); // Use the derived atom
  if (!activeChat) return;

  let lastAssistantMessageId: string | null = null;
  // Iterate backwards through the messages of the active chat
  for (let i = activeChat.messages.length - 1; i >= 0; i--) {
    if (activeChat.messages[i].role === 'assistant') {
      lastAssistantMessageId = activeChat.messages[i].id;
      break;
    }
  }

  if (lastAssistantMessageId) {
    console.log('Using regenerateMessageAtom for last response.');
    set(regenerateMessageAtom, lastAssistantMessageId); // Trigger the main regeneration atom
  } else {
    console.warn(
      'No assistant message found in the active chat to regenerate.',
    );
  }
});

// ! 优化: 遍历 Record 的 values
export const resetStreamingStatesAtom = atom(null, (get, set) => {
  set(isAssistantLoadingAtom, false);
  set(abortControllerAtom, null);

  set(chatsAtom, (prevChats) => {
    const newChats: ChatsRecord = {};
    // 遍历对象的值 (Chat 对象)
    for (const chatId in prevChats) {
      const chat = prevChats[chatId];
      let messagesUpdated = false;
      const updatedMessages = chat.messages.map((msg) => {
        if (msg.isStreaming) {
          messagesUpdated = true;
          return { ...msg, isStreaming: false };
        }
        return msg;
      });
      // 只有当消息确实被更新时才创建新聊天对象
      newChats[chatId] = messagesUpdated
        ? { ...chat, messages: updatedMessages }
        : chat;
    }
    // 检查是否有任何聊天对象被修改，避免不必要的更新
    // （简单的实现是直接返回 newChats，但更精细的检查可以避免触发衍生态的计算）
    // const hasChanges = Object.keys(prevChats).some(id => prevChats[id] !== newChats[id]);
    // return hasChanges ? newChats : prevChats;
    return newChats; // 简化处理，直接返回新对象
  });
});

export const addCharacterAtom = atom(null, (get, set): string => {
  const currentCharacters = get(customCharactersAtom);
  const now = Date.now();
  const newId = uuidv4();

  const newCharacter: CustomCharacter = {
    id: newId,
    name: 'New Character',
    icon: '👤',
    description: '',
    prompt: get(defaultPromptAtom), // Use global default prompt
    model: get(defaultModelAtom), // Use global default model
    maxHistory: null, // Use global default maxHistory implicitly
    sort: getNextCharacterSortValue(currentCharacters),
    createdAt: now,
    updatedAt: now,
  };

  set(customCharactersAtom, [...currentCharacters, newCharacter]);
  toast.success(`Character "${newCharacter.name}" created.`);
  return newId; // Return the ID of the newly created character
});

export const updateCharacterAtom = atom(
  null,
  (
    get,
    set,
    updatedCharacterData: Partial<Omit<CustomCharacter, 'id' | 'createdAt'>> & {
      id: string;
    },
  ) => {
    const { id, ...updates } = updatedCharacterData;
    let characterUpdated = false;

    set(customCharactersAtom, (prevCharacters) =>
      prevCharacters.map((char) => {
        if (char.id === id) {
          characterUpdated = true;
          return {
            ...char,
            ...updates, // Apply updates
            updatedAt: Date.now(), // Update timestamp
          };
        }
        return char;
      }),
    );

    if (characterUpdated) {
      // Find the updated name for the toast message, default if somehow not found
      const finalName =
        get(customCharactersAtom).find((c) => c.id === id)?.name ?? 'Character';
      toast.success(`Character "${finalName}" saved.`);
    } else {
      console.warn(`Character with ID ${id} not found for update.`);
      toast.error('Failed to save: Character not found.');
    }
  },
);

export const deleteCharacterAtom = atom(
  null,
  (get, set, idToDelete: string): boolean => {
    // Return true if deletion happened
    const currentCharacters = get(customCharactersAtom);
    const characterExists = currentCharacters.some((c) => c.id === idToDelete);

    if (!characterExists) {
      console.warn(`Character with ID ${idToDelete} not found for deletion.`);
      return false;
    }

    const characterName =
      currentCharacters.find((c) => c.id === idToDelete)?.name ?? 'Character';

    set(customCharactersAtom, (prev) =>
      prev.filter((char) => char.id !== idToDelete),
    );

    toast.success(`Character "${characterName}" deleted.`);
    return true;
  },
);

export const moveCharacterAtom = atom(
  null,
  (get, set, { id, direction }: { id: string; direction: 'up' | 'down' }) => {
    const characters = get(customCharactersAtom);
    // Create a sorted list based on current sort values to find indices correctly
    const sorted = [...characters].sort(
      (a, b) => (a.sort ?? 0) - (b.sort ?? 0),
    );
    const currentIndex = sorted.findIndex((c) => c.id === id);

    if (currentIndex === -1) return; // Not found

    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    // Check boundaries
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    // Get the characters to swap from the *sorted* array
    const charToMove = sorted[currentIndex];
    const charToSwapWith = sorted[targetIndex];

    // Get their original sort values
    const sortToMove = charToMove.sort;
    const sortToSwap = charToSwapWith.sort;

    // Create the updated list by mapping the *original* unsorted list
    const updatedCharacters = characters.map((char) => {
      if (char.id === charToMove.id) {
        return { ...char, sort: sortToSwap, updatedAt: Date.now() }; // Assign the other's sort value
      }
      if (char.id === charToSwapWith.id) {
        return { ...char, sort: sortToMove, updatedAt: Date.now() }; // Assign the other's sort value
      }
      return char;
    });

    set(customCharactersAtom, updatedCharacters);
  },
);

export const duplicateCharacterAtom = atom(
  null,
  (get, set, idToDuplicate: string): string | null => {
    // Return new ID or null
    const characters = get(customCharactersAtom);
    const charToDuplicate = characters.find((c) => c.id === idToDuplicate);

    if (!charToDuplicate) {
      toast.error('Character to duplicate not found.');
      return null;
    }

    try {
      const duplicatedChar: CustomCharacter = JSON.parse(
        JSON.stringify(charToDuplicate),
      );
      const newId = uuidv4();
      const now = Date.now();

      duplicatedChar.id = newId;
      duplicatedChar.name = `${charToDuplicate.name} (copy)`;
      // Place the duplicate right after the original by adjusting sort values
      // Or simpler: just put at the end using getNextCharacterSortValue
      duplicatedChar.sort = getNextCharacterSortValue(characters);
      duplicatedChar.createdAt = now;
      duplicatedChar.updatedAt = now;

      set(customCharactersAtom, [...characters, duplicatedChar]);
      toast.success(`Character "${duplicatedChar.name}" duplicated.`);
      return newId;
    } catch (error) {
      console.error('Duplication failed:', error);
      toast.error('Failed to duplicate character.');
      return null;
    }
  },
);

// Helper to re-sort/normalize sort values after potential changes like import
const normalizeCharacterSort = (
  characters: CustomCharacter[],
): CustomCharacter[] => {
  // Sort by existing sort, then maybe name/id as tie-breaker
  const sorted = [...characters].sort((a, b) => {
    const sortDiff = (a.sort ?? 0) - (b.sort ?? 0);
    if (sortDiff !== 0) return sortDiff;
    return a.name.localeCompare(b.name); // Fallback sort
  });
  // Assign sequential sort values
  return sorted.map((char, index) => ({ ...char, sort: index }));
};

export const importCharactersAtom = atom(
  null,
  (get, set, importedCharacters: unknown[]) => {
    if (!Array.isArray(importedCharacters)) {
      toast.error('Import failed: Invalid data format. Expected an array.');
      return;
    }

    let importedCount = 0;
    let skippedCount = 0;
    const currentCharacters = get(customCharactersAtom);
    const mergedCharsMap = new Map<string, CustomCharacter>(
      currentCharacters.map((c) => [c.id, c]),
    );

    importedCharacters.forEach((importedObj: unknown, index) => {
      // Basic validation first
      if (typeof importedObj !== 'object' || importedObj === null) {
        console.warn(`Skipping non-object at index ${index}:`, importedObj);
        skippedCount++;
        return;
      }
      // Add default sort if missing before full validation
      if (
        !('sort' in importedObj) ||
        typeof (importedObj as any).sort !== 'number'
      ) {
        (importedObj as any).sort = Infinity; // Assign temporary high sort value
      }
      // Add default timestamps if missing
      const now = Date.now();
      if (
        !('createdAt' in importedObj) ||
        typeof (importedObj as any).createdAt !== 'number'
      ) {
        (importedObj as any).createdAt = now;
      }
      if (
        !('updatedAt' in importedObj) ||
        typeof (importedObj as any).updatedAt !== 'number'
      ) {
        (importedObj as any).updatedAt = now;
      }

      if (isValidCharacter(importedObj)) {
        const importedChar = importedObj as CustomCharacter;
        if (mergedCharsMap.has(importedChar.id)) {
          console.warn(
            `Overwriting existing character with imported ID: ${importedChar.id}`,
          );
        }
        mergedCharsMap.set(importedChar.id, importedChar); // Add/overwrite
        importedCount++;
      } else {
        console.warn(
          `Skipping invalid character structure at index ${index}:`,
          importedObj,
        );
        skippedCount++;
      }
    });

    // Convert map back to array and normalize sort values
    const finalCharacterList = normalizeCharacterSort(
      Array.from(mergedCharsMap.values()),
    );

    set(customCharactersAtom, finalCharacterList);

    // Feedback
    if (importedCount > 0) {
      toast.success(`${importedCount} character(s) imported successfully.`);
    }
    if (skippedCount > 0) {
      toast.warning(`${skippedCount} invalid character record(s) skipped.`);
    }
    if (importedCount === 0 && skippedCount === 0) {
      toast.info('No valid characters found in the imported file.');
    }
  },
);

export const autoFillCharacterAtom = atom(
  null,
  async (get, set, characterId: string) => {
    // Make atom async
    const apiKey = get(apiKeyAtom);
    if (!apiKey) {
      toast.error('Auto-fill failed: OpenAI API Key not set.');
      return;
    }

    const characters = get(customCharactersAtom);
    const characterToFill = characters.find((c) => c.id === characterId);

    if (!characterToFill) {
      toast.error('Auto-fill failed: Character not found.');
      return;
    }

    // Prevent concurrent auto-fills (optional, but good practice)
    if (get(isCharacterAutoFillingAtom)) {
      toast.warning('Auto-fill already in progress.');
      return;
    }

    set(isCharacterAutoFillingAtom, true);
    toast.info('🤖 Attempting to auto-fill character...');

    try {
      // 1. Prepare partial data (only non-empty/non-default fields user might have provided)
      const partialData: Partial<CustomCharacter> = {};
      if (characterToFill.name && characterToFill.name !== 'New Character')
        partialData.name = characterToFill.name;
      if (characterToFill.icon && characterToFill.icon !== '👤')
        partialData.icon = characterToFill.icon;
      if (characterToFill.description)
        partialData.description = characterToFill.description;
      // Include prompt only if it's non-empty and differs from global default? Or always include if non-empty? Let's include if non-empty.
      if (
        characterToFill.prompt /* && characterToFill.prompt !== get(defaultPromptAtom) */
      )
        partialData.prompt = characterToFill.prompt;
      // Include model only if it differs from global default?
      if (
        characterToFill.model /* && characterToFill.model !== get(defaultModelAtom) */
      )
        partialData.model = characterToFill.model;
      if (characterToFill.maxHistory !== null)
        partialData.maxHistory = characterToFill.maxHistory;

      if (Object.keys(partialData).length === 0) {
        toast.error(
          'Auto-fill failed: Please provide some initial details (like Name) first.',
        );
        set(isCharacterAutoFillingAtom, false); // Reset loading state early
        return;
      }

      // 2. Construct the prompt for the AI
      // Strategy: Ask AI to return the *full* JSON, merging it carefully later.
      const prompt = `
You are an assistant that helps create character profiles for a GPT chatbot UI.
Based on the partial information provided below, complete the character profile.
Use the provided values where available, otherwise generate suitable content.
Ensure name is consise (several words) and fits the character's persona
and the 'description' is a concise summary (1-2 sentences) 
and the 'prompt' defines the character's persona and instructions for the chatbot.
and the most appropriate (according to the topic) emoji for the 'icon' if not provided or if unsuitable.
Respond ONLY with a single, valid JSON object containing the following keys: "name", "icon", "description", "prompt", "model", "maxHistory".
'maxHistory' should be a number or null.

Partial Data:
\`\`\`json
${JSON.stringify(partialData, null, 2)}
\`\`\`

JSON Response format:
{"name": "...", "icon": "...", "description": "...", "prompt": "...", "model": "...", "maxHistory": ...}
`;

      // 3. API Call (using a capable model, non-streaming)
      const openai = new OpenAI({
        apiKey,
        baseURL: get(apiBaseUrlAtom) || undefined,
        dangerouslyAllowBrowser: true,
      });

      const modelToUse = characterToFill.model || get(defaultModelAtom); // Use character's model or default

      console.log(
        `Requesting auto-fill for char ${characterId} with model ${modelToUse}...`,
      );

      const response = await openai.chat.completions.create({
        model: modelToUse, // Use a reasonably capable model
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7, // Allow some creativity
        max_tokens: 500, // Adjust as needed for expected prompt/desc length
        response_format: { type: 'json_object' }, // Request JSON output if model supports it
        stream: false,
      });

      const aiResponseContent = response.choices[0]?.message?.content;

      if (!aiResponseContent) {
        throw new Error('AI returned an empty response.');
      }

      console.log('AI Auto-fill response:', aiResponseContent);

      // 4. Parse and Validate AI Response
      let aiJson: Partial<CustomCharacter>;
      try {
        aiJson = JSON.parse(aiResponseContent);
      } catch (parseError) {
        console.error('Failed to parse AI JSON response:', parseError);
        throw new Error('AI returned invalid JSON.');
      }

      // Basic validation of returned object structure (add more checks if needed)
      if (typeof aiJson !== 'object' || aiJson === null) {
        throw new Error('AI response was not a valid JSON object.');
      }

      // 5. Merge Results (Carefully apply AI suggestions)
      // Strategy: Update fields *only if* the AI provided a non-empty value for them
      // AND the field was empty/default in the original character before auto-fill.
      // This prevents overwriting user's specific initial input unless desired.
      // A simpler strategy for now: just merge the valid fields from AI response.
      // User can always reset if they don't like it.

      const fieldsToUpdate: Partial<
        Omit<CustomCharacter, 'id' | 'createdAt' | 'updatedAt' | 'sort'>
      > = {};

      // Validate and potentially update each field from AI response
      if (typeof aiJson.name === 'string' && aiJson.name.trim())
        fieldsToUpdate.name = aiJson.name.trim();
      if (typeof aiJson.icon === 'string' && /\p{Emoji}/u.test(aiJson.icon))
        fieldsToUpdate.icon = aiJson.icon; // Basic emoji check
      if (typeof aiJson.description === 'string' && aiJson.description.trim())
        fieldsToUpdate.description = aiJson.description.trim();
      if (typeof aiJson.prompt === 'string' && aiJson.prompt.trim())
        fieldsToUpdate.prompt = aiJson.prompt.trim();
      if (typeof aiJson.model === 'string' && aiJson.model.trim())
        fieldsToUpdate.model = aiJson.model.trim();
      if (typeof aiJson.maxHistory === 'number' && aiJson.maxHistory >= 0)
        fieldsToUpdate.maxHistory = Math.floor(aiJson.maxHistory);
      else if (aiJson.maxHistory === null) fieldsToUpdate.maxHistory = null;

      if (Object.keys(fieldsToUpdate).length === 0) {
        toast.info("Auto-fill didn't suggest any new values.");
        set(isCharacterAutoFillingAtom, false); // Still need to reset loading
        return;
      }

      console.log('Applying auto-fill updates:', fieldsToUpdate);

      // 6. Update State via updateCharacterAtom
      set(updateCharacterAtom, { id: characterId, ...fieldsToUpdate });
      // updateCharacterAtom will show its own success toast

      // Optional: Directly update form state in CharacterEditor?
      // Might be better to let the atom update flow trigger the form refresh via useEffect.
    } catch (error) {
      console.error('Auto-fill API call failed:', error);
      toast.error(
        `Auto-fill failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      set(isCharacterAutoFillingAtom, false); // Ensure loading state is reset
    }
  },
);

// --- Helper Functions (used by actions) ---
const getNextCharacterSortValue = (characters: CustomCharacter[]): number => {
  if (characters.length === 0) {
    return 0;
  }
  const maxSort = Math.max(...characters.map((c) => c.sort), -1);
  return maxSort + 1;
};
async function callOpenAIStreamLogic(
  apiKey: string,
  apiBaseUrl: string | null,
  model: string,
  messagesToSend: OpenAI.ChatCompletionMessageParam[],
  setIsLoading: (loading: boolean) => void,
  upsertMessage: (message: Message) => void,
  appendContent: (payload: { contentChunk: string; messageId: string }) => void,
  finalizeStream: (messageId: string) => void,
  setAbortController: (
    controllerInfo: { controller: AbortController; messageId: string } | null,
  ) => void,
) {
  if (!apiKey) {
    alert('Please set your OpenAI API Key in the Global Settings.');
    toast.error('APIKey not set. Open right sidebar and set it.');
    // No need to set loading false here, as it wasn't set true yet
    return;
  }

  setIsLoading(true);
  const assistantMessageId = uuidv4(); // Generate a unique ID for the new message
  const controller = new AbortController();
  setAbortController({ controller, messageId: assistantMessageId }); // Store the controller associated with the new message ID

  // Add placeholder assistant message for the *new* response
  const placeholderMessage: Message = {
    content: '',
    id: assistantMessageId, // Use the new ID
    isStreaming: true,
    role: 'assistant',
    timestamp: Date.now(),
  };
  upsertMessage(placeholderMessage); // This will add the new message to the end of the list (or update if somehow ID collided)

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    console.log('Sending request to OpenAI:', {
      messages: messagesToSend.length,
      model,
    });
    const stream = await openai.chat.completions.create(
      {
        messages: messagesToSend,
        model,
        stream: true,
      },
      {
        signal: controller.signal,
      },
    );

    let contentReceived = false;
    for await (const chunk of stream) {
      // Check if cancellation was requested during the async iteration
      // Note: openai-js v4 might automatically throw AbortError if signal is aborted
      // Keeping explicit check for robustness
      if (controller.signal.aborted) {
        console.log(
          `Stream processing aborted by signal for message ${assistantMessageId}`,
        );
        // Throwing here ensures we hit the catch block for abort handling
        throw new Error('Stream aborted by signal.');
      }

      const contentChunk = chunk.choices[0]?.delta?.content || '';
      if (contentChunk) {
        contentReceived = true;
        // Append content to the *new* message ID
        appendContent({ contentChunk, messageId: assistantMessageId });
      }
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason && finishReason !== 'stop') {
        console.warn(`Stream finished with reason: ${finishReason}`);
      }
    }

    // Finalize normally if loop completes without error/abort
    console.log(
      `Stream finished normally for message ${assistantMessageId}. Content received: ${contentReceived}`,
    );
    finalizeStream(assistantMessageId); // Finalize the *new* message ID
  } catch (error) {
    const isAbortError =
      error instanceof Error &&
      (error.name === 'AbortError' ||
        error.message.includes('aborted') ||
        error.message.includes('signal'));

    console.error(`OpenAI API Error/Abort (${assistantMessageId}):`, error);
    toast.error('Error: Failed to get response. Please try again later.');

    if (!isAbortError) {
      // Update the new placeholder message with an error state
      const errorMessageContent = `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`;
      const errorMessage: Message = {
        ...placeholderMessage, // Use the ID of the message that failed
        id: assistantMessageId, // Ensure correct ID
        content: errorMessageContent,
        isStreaming: false, // Stop streaming on error
      };
      upsertMessage(errorMessage); // Update placeholder with error
      // Finalize even on error to reset loading state etc.
      finalizeStream(assistantMessageId);
    } else {
      console.log(
        `Generation cancelled for message ${assistantMessageId}. Finalizing.`,
      );
      // If aborted, finalize the stream state without adding error text.
      // The message will contain whatever content was received before the abort.
      finalizeStream(assistantMessageId); // Finalize the *new* message ID
    }
  } finally {
    // CRITICAL: Always clear the abort controller atom when the operation finishes/errors/aborts
    // Check if the current controller in the atom is the one we are finishing
    // This prevents accidentally clearing a controller from a *newer* request
    // if requests somehow overlapped or finalize was called out of order.
    // Note: Added get() for safety, ensure atom definitions allow this if needed.
    // const currentControllerInfo = get(abortControllerAtom); // Can't use get() inside atom setter directly easily.
    // Let's rely on finalizeStream and the loading state for now. The primary safety is
    // that setAbortController(null) is called. If another request started, it would have
    // already overwritten the controller atom anyway.
    setAbortController(null);
    console.log(
      `Cleared abort controller reference after handling message ${assistantMessageId}`,
    );
    // Note: setIsLoading(false) is handled within finalizeStreamingMessageAtom
  }
}

function getHistoryForApi(
  allMessages: Message[],
  maxHistoryCount: number,
  systemPrompt: string | null,
): OpenAI.ChatCompletionMessageParam[] {
  // Find the start index after the last divider, if any
  let startIndex = 0;
  // Iterate backwards to find the last divider efficiently
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i].role === 'divider') {
      startIndex = i + 1;
      break;
    }
  }

  const relevantMessages = allMessages.slice(startIndex);

  // Filter valid roles and non-empty content, apply maxHistoryCount limit *after* finding relevant segment
  const history = relevantMessages
    .filter(
      (msg) =>
        (msg.role === 'user' || msg.role === 'assistant') &&
        typeof msg.content === 'string' && // Ensure content is a string
        msg.content.trim() !== '', // Optional: Filter out empty messages
    )
    .slice(-maxHistoryCount); // Apply history limit

  const messagesToSend: OpenAI.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messagesToSend.push({ content: systemPrompt, role: 'system' });
  }

  history.forEach((msg) => {
    // Type assertion needed as filter guarantees role is 'user' or 'assistant'
    messagesToSend.push({
      content: msg.content as string, // We filtered for string content
      role: msg.role as 'user' | 'assistant',
    });
  });

  return messagesToSend;
}

async function generateChatTitle(
  apiKey: string,
  apiBaseUrl: string | null,
  summaryModel: SupportedModels,
  userMessageContent: string,
  chatId: string,
  updateChat: (update: Partial<Chat> & { id: string }) => void, // Pass the update function
): Promise<void> {
  if (!apiKey) {
    console.warn('Cannot generate title: API Key not set.');
    return;
  }
  if (!userMessageContent?.trim()) {
    console.warn('Cannot generate title: User message is empty.');
    return;
  }

  if (userMessageContent.length > 1000) {
    userMessageContent =
      userMessageContent.slice(0, 500) +
      '...(truncated due to large length)...' +
      userMessageContent.slice(-500);
  }

  const prompt = `You are a helpful assistant that generates concise chat titles. Based *only* on the following user message, generate a one-line chat title (no quotes, code blocks, only return plain text title like "💡 My Awesome Chat") that starts with a relevant emoji:\n\nUser Message: "${userMessageContent}"`; // Modified prompt

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    console.log('Generating chat title with model:', summaryModel);
    const response = await openai.chat.completions.create({
      model: summaryModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 30, // Increased tokens to allow for emoji and title
      temperature: 0.7, // Increased temperature slightly for more varied emoji selection
      stream: false, // We want a single response, not streaming
    });

    let generatedTitle = response.choices[0]?.message?.content
      ?.trim()
      .replace(/(\r\n|\n|\r)/gm, '') // Remove line breaks
      .replace(/["']/g, '')
      .replace(/```/g, '')
      .replace(/`/g, ''); // Remove quotes and code blocks

    if (generatedTitle) {
      const emojiRegex =
        /([\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}])/u;
      const emojiMatch = generatedTitle.match(emojiRegex);

      let icon = '';
      if (emojiMatch) {
        icon = emojiMatch[0]; // Extract the emoji
        generatedTitle = generatedTitle.replace(emojiRegex, '').trim(); // Remove emoji from title
      }

      console.log(`Generated title for chat ${chatId}: "${generatedTitle}"`);
      console.log(`Generated icon for chat ${chatId}: "${icon}"`);

      // Update the chat name and icon using the passed function
      updateChat({ id: chatId, name: generatedTitle, icon: icon });
    } else {
      console.warn('Title generation resulted in empty content.');
    }
  } catch (error) {
    console.error('Error generating chat title:', error);
    // Don't update the title on error, keep the default
  }
}

// Export helpers needed by components
export { callOpenAIStreamLogic, getHistoryForApi, generateChatTitle };
