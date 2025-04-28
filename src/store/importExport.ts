// src/store/importExport.ts
import { atom } from 'jotai';
import { toast } from 'sonner';
import { loadCharactersAtom } from './characterData'; // Import load action

import { v4 as uuidv4 } from 'uuid';

import {
  _activeChatIdAtom,
  activeChatDataAtom,
  activeChatMessagesAtom,
  loadChatListMetadataAtom,
} from './chatActions';
import { chatDataServiceAtom } from './service'; // Import service
// Import internal types for validation/casting
import type {
  CharacterEntity,
  ChatEntity,
  MessageEntity,
} from '@/types/internal';
// Keep download helper
import { downloadJson } from '@/lib/download';
import { noop } from 'lodash';
// Import normalize helper ONLY IF needed after service import
// import { normalizeCharacterSort } from './characterActions'; // May not be needed

// --- Validation Helpers ---

// ** IMPORTANT ** Validation needs to adapt.
// We now import Chat *metadata* and *messages* potentially separately or nested.
// Let's assume the import format is an array of objects, where each object
// *might* contain a 'chat' property (ChatEntity structure without messages)
// and a 'messages' property (MessageEntity[] structure).
// Or a simpler format: Array<ChatEntity & { messages: MessageEntity[] }>

// Assume import format: Array<ChatEntity & { messages: MessageEntity[] }>
// This validation checks the combined structure.

const isValidImportedChatEntry = (
  obj: any,
): obj is ChatEntity & { messages: MessageEntity[] } => {
  if (typeof obj !== 'object' || obj === null) return false;

  // Validate Chat part (excluding messages array check here)
  const hasRequiredChatFields =
    typeof obj.id === 'string' &&
    obj.id.length > 0 && // Ensure ID is not empty
    typeof obj.name === 'string' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.updatedAt === 'number' &&
    typeof obj.model === 'string' &&
    obj.model.includes('::') && // Basic check for namespaced ID
    (obj.systemPrompt === null || typeof obj.systemPrompt === 'string') && // Allow null or string
    (obj.characterId === null || typeof obj.characterId === 'string') &&
    (obj.maxHistory === null ||
      (typeof obj.maxHistory === 'number' && obj.maxHistory >= 0)) &&
    (obj.temperature === null || typeof obj.temperature === 'number') &&
    (obj.maxTokens === null ||
      (typeof obj.maxTokens === 'number' && obj.maxTokens > 0)) &&
    (obj.topP === null ||
      (typeof obj.topP === 'number' && obj.topP >= 0 && obj.topP <= 1)) &&
    typeof obj.isPinned === 'boolean';

  if (!hasRequiredChatFields) {
    console.warn('Invalid chat structure:', obj);
    return false;
  }

  // Validate Messages array part
  if (!Array.isArray(obj.messages)) {
    console.warn('Missing or invalid messages array:', obj);
    return false;
  }
  return obj.messages.every(isValidImportedMessage); // Validate each message
};

const isValidImportedMessage = (msg: any): msg is MessageEntity => {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof msg.id === 'string' &&
    msg.id.length > 0 &&
    typeof msg.role === 'string' && // Could add stricter role check
    (msg.content === null || typeof msg.content === 'string') && // Allow null content (e.g., initial assistant message)
    typeof msg.timestamp === 'number' &&
    // Ignore transient fields like isStreaming on import (should default to false)
    // Validate toolCallInfo structure if present? For now, keep it simple.
    (!msg.toolCallInfo || typeof msg.toolCallInfo === 'object')
  );
  // isHidden should likely default to false if missing
};

/** Basic structural validation for an imported CustomCharacter object. */
const isValidCharacter = (obj: any): obj is CharacterEntity => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    typeof obj.name === 'string' &&
    typeof obj.icon === 'string' &&
    typeof obj.prompt === 'string' &&
    typeof obj.model === 'string' &&
    obj.model.includes('::') && // Check model format
    (typeof obj.maxHistory === 'number' || obj.maxHistory === null) &&
    // sort, createdAt, updatedAt might be missing in imported file, handle defaults
    (!obj.sort || typeof obj.sort === 'number') &&
    (!obj.createdAt || typeof obj.createdAt === 'number') &&
    (!obj.updatedAt || typeof obj.updatedAt === 'number')
    // description is optional
  );
};

// --- Import/Export Action Atoms ---

/** Imports chats and their messages from an array, merging/overwriting by ID. */
export const importChatsAtom = atom(
  null, // Write-only atom
  async (get, set, importedData: unknown) => {
    if (!Array.isArray(importedData)) {
      toast.error('Import failed: Invalid data format. Expected an array.');
      return;
    }

    const service = get(chatDataServiceAtom);
    let importedChatCount = 0;
    let importedMessageCount = 0;
    let skippedCount = 0;
    const idsToRefresh: string[] = []; // Track IDs that were added/updated

    console.log(
      `[importChatsAtom] Starting import of ${importedData.length} potential chat entries...`,
    );

    for (const [index, importedEntry] of importedData.entries()) {
      if (isValidImportedChatEntry(importedEntry)) {
        // Separate chat data from messages
        const { messages: importedMessages, ...importedChatData } =
          importedEntry;
        const chatId = importedChatData.id;

        try {
          // Check if chat exists
          const existingChat = await service.getChatById(chatId);
          let savedChatData: ChatEntity;

          if (existingChat) {
            // Update existing chat (service handles updatedAt)
            console.warn(
              `[importChatsAtom] Updating existing chat ${chatId}...`,
            );
            await service.updateChat(chatId, importedChatData);
            savedChatData = {
              ...existingChat,
              ...importedChatData,
              updatedAt: Date.now(),
            }; // Estimate for log
          } else {
            // Create new chat (service handles createdAt, updatedAt)
            console.log(`[importChatsAtom] Creating new chat ${chatId}...`);
            savedChatData = await service.createChat(importedChatData);
            noop(savedChatData);
          }

          // Replace messages: Delete existing, then add imported
          console.log(
            `[importChatsAtom] Replacing messages for chat ${chatId}...`,
          );
          await service.deleteMessagesByChatId(chatId); // Delete existing
          if (importedMessages && importedMessages.length > 0) {
            // Prepare messages for insertion (ensure chatId is correct, assign new IDs?)
            // For simplicity, let's trust imported message IDs if they exist and seem valid,
            // otherwise generate new ones. Ensure chatId matches the chat.
            const messagesToAdd = importedMessages
              .filter(isValidImportedMessage) // Filter invalid messages within the chat
              .map((msg) => ({
                ...msg,
                id: msg.id && typeof msg.id === 'string' ? msg.id : uuidv4(), // Use provided ID or generate
                chatId: chatId, // Ensure correct chatId linkage
                isStreaming: false, // Ensure streaming is off
                isHidden: msg.isHidden ?? false, // Default isHidden
                isError: msg.isError ?? false, // Default isError
                // Ensure timestamp is valid, default if not
                timestamp:
                  typeof msg.timestamp === 'number'
                    ? msg.timestamp
                    : Date.now(),
              }));

            if (messagesToAdd.length !== importedMessages.length) {
              console.warn(
                `[importChatsAtom] Skipped ${importedMessages.length - messagesToAdd.length} invalid messages within chat ${chatId}.`,
              );
              skippedCount += importedMessages.length - messagesToAdd.length;
            }
            if (messagesToAdd.length > 0) {
              await service.addMessages(messagesToAdd);
              importedMessageCount += messagesToAdd.length;
            }
          }

          importedChatCount++;
          idsToRefresh.push(chatId); // Mark chat for potential UI update if active
        } catch (error) {
          console.error(
            `[importChatsAtom] Error processing entry ${index} (Chat ID: ${chatId || 'N/A'}):`,
            error,
          );
          toast.error(
            `Error importing chat: ${importedChatData.name || chatId}`,
          );
          skippedCount++;
        }
      } else {
        console.warn(
          `[importChatsAtom] Skipping invalid chat entry structure at index ${index}:`,
          JSON.stringify(importedEntry),
        );
        skippedCount++;
      }
    } // End loop

    // --- Final Updates & Feedback ---
    console.log(
      `[importChatsAtom] Import finished. Imported: ${importedChatCount} chats, ${importedMessageCount} messages. Skipped: ${skippedCount}.`,
    );
    if (importedChatCount > 0) {
      toast.success(
        `${importedChatCount} conversation(s) imported/updated successfully.`,
      );
      set(loadChatListMetadataAtom); // Refresh the sidebar list

      // Check if the currently active chat was among those imported/updated
      const activeId = get(_activeChatIdAtom);
      if (activeId && idsToRefresh.includes(activeId)) {
        console.log(
          '[importChatsAtom] Active chat was imported, reloading its data...',
        );
        // Reload active chat data (will fetch chat + messages)
        // Assuming activeChatEffectAtom will handle this when activeChatId is potentially reset/set
        // For safety, trigger load explicitly if needed:
        // set(loadActiveChatDetailAtom); // (Requires importing this private atom action)
        // Or just rely on the list refresh potentially triggering selection change if needed.
      }
    }
    if (skippedCount > 0) {
      toast.warning(
        `${skippedCount} invalid record(s) or messages skipped. Check console for details.`,
      );
    }
    if (
      importedChatCount === 0 &&
      skippedCount === 0 &&
      importedData.length > 0
    ) {
      toast.warning(
        'Import file contained records, but none were valid conversations.',
      );
    } else if (importedData.length === 0) {
      toast.info('Import file was empty.');
    }
  },
);

/** Imports characters from an array, merging/overwriting by ID. Sort order is managed by the service on creation/update. */
export const importCharactersAtom = atom(
  null, // Write-only atom
  async (get, set, importedData: unknown) => {
    if (!Array.isArray(importedData)) {
      toast.error('Import failed: Invalid data format. Expected an array.');
      return;
    }

    const service = get(chatDataServiceAtom);
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    console.log(
      `[importCharactersAtom] Starting import of ${importedData.length} potential character entries...`,
    );

    // Fetch existing IDs for quicker checking (optional optimization)
    // const existingChars = await service.getAllCharacters();
    // const existingCharIds = new Set(existingChars.map(c => c.id));

    for (const [index, importedObj] of importedData.entries()) {
      // Basic structural check
      if (
        typeof importedObj !== 'object' ||
        importedObj === null ||
        !importedObj.hasOwnProperty('id') ||
        typeof importedObj.id !== 'string' ||
        importedObj.id.length === 0
      ) {
        console.warn(
          `[importCharactersAtom] Skipping entry ${index} due to missing or invalid ID:`,
          importedObj,
        );
        skippedCount++;
        continue;
      }

      const charId = importedObj.id;

      // Prepare data with defaults ONLY IF CREATING, otherwise use update logic
      const now = Date.now();
      // We don't need defaults like 'sort' if we update; only if we create.
      // The validation needs to be slightly different for update vs create.
      // Let's validate the core structure first.

      const potentialCharacterData = {
        ...(importedObj as object), // Assume object structure based on earlier check
        // Ensure timestamps exist for potential update call consistency if needed by validator
        createdAt:
          typeof importedObj.createdAt === 'number'
            ? importedObj.createdAt
            : now,
        updatedAt:
          typeof importedObj.updatedAt === 'number'
            ? importedObj.updatedAt
            : now,
      } as Partial<CharacterEntity> & { id: string }; // Cast for validation

      if (isValidCharacter(potentialCharacterData)) {
        // Separate fields that should NOT overwrite during an update unless present
        // (like sort, createdAt). Service handles updatedAt automatically.
        const { id, createdAt, updatedAt, sort, ...updateData } =
          potentialCharacterData;

        try {
          const existingChar = await service.getCharacterById(charId);

          if (existingChar) {
            // Update existing (service handles updatedAt, ignore sort/createdAt from import)
            await service.updateCharacter({ id, ...updateData });
            updatedCount++;
          } else {
            // Create new (service handles sort, createdAt, updatedAt)
            // Ensure all *required* fields for creation are present in updateData
            const createData: Omit<
              CharacterEntity,
              'id' | 'createdAt' | 'updatedAt' | 'sort'
            > = {
              name: updateData.name ?? 'Imported Character',
              icon: updateData.icon ?? '❓',
              prompt: updateData.prompt ?? '',
              model: updateData.model ?? 'default::model', // Provide a fallback or make mandatory
              maxHistory:
                updateData.maxHistory === undefined
                  ? null
                  : updateData.maxHistory,
              description: updateData.description,
            };
            // Add extra validation here if needed for createData
            if (!createData.model || !createData.model.includes('::')) {
              throw new Error(
                `Missing or invalid model for new character ID ${charId}`,
              );
            }
            await service.createCharacter(createData);
            importedCount++;
          }
        } catch (error) {
          console.error(
            `[importCharactersAtom] Error processing character ID ${charId}:`,
            error,
          );
          toast.error(
            `Error processing character: ${potentialCharacterData.name || charId}`,
          );
          skippedCount++;
        }
      } else {
        console.warn(
          `[importCharactersAtom] Skipping invalid character structure at index ${index}:`,
          JSON.stringify(importedObj),
        );
        skippedCount++;
      }
    } // End loop

    // --- Final Updates & Feedback ---
    console.log(
      `[importCharactersAtom] Import finished. Imported: ${importedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}.`,
    );
    if (importedCount > 0 || updatedCount > 0) {
      toast.success(
        `${importedCount + updatedCount} character(s) imported/updated successfully.`,
      );
      set(loadCharactersAtom); // Refresh the UI list
    }
    if (skippedCount > 0) {
      toast.warning(
        `${skippedCount} invalid character record(s) skipped. Check console.`,
      );
    }
    if (
      importedCount === 0 &&
      updatedCount === 0 &&
      skippedCount === 0 &&
      importedData.length > 0
    ) {
      toast.warning(
        'Import file contained records, but none were valid characters.',
      );
    } else if (importedData.length === 0) {
      toast.info('Import file was empty.');
    }
  },
);

// --- Export Actions ---

/** Exports all chats and their messages to a JSON file. */
export const exportAllChatsAtom = atom(
  null, // Write-only
  async (get) => {
    const service = get(chatDataServiceAtom);
    console.log('[exportAllChatsAtom] Exporting all chats...');
    try {
      const allMetadata = await service.getAllChatMetadata();
      if (allMetadata.length === 0) {
        toast.info('There are no chats to export.');
        return;
      }

      const exportData = [];
      for (const meta of allMetadata) {
        const chatData = await service.getChatById(meta.id);
        const messages = await service.getMessagesByChatId(meta.id);
        if (chatData) {
          // Combine chat data and messages for export format
          exportData.push({ ...chatData, messages });
        } else {
          console.warn(
            `[exportAllChatsAtom] Chat ${meta.id} found in metadata but not in full data fetch. Skipping.`,
          );
        }
      }

      if (exportData.length > 0) {
        downloadJson(exportData, 'daan_all_chats_export.json');
        toast.success(`${exportData.length} chats exported successfully.`);
      } else {
        toast.warning('No valid chat data found to export.');
      }
    } catch (error) {
      console.error('[exportAllChatsAtom] Failed:', error);
      toast.error('Failed to export chats.');
    }
  },
);

/** Exports all characters to a JSON file. */
export const exportAllCharactersAtom = atom(
  null, // Write-only
  async (get) => {
    const service = get(chatDataServiceAtom);
    console.log('[exportAllCharactersAtom] Exporting all characters...');
    try {
      const allCharacters = await service.getAllCharacters();

      if (allCharacters.length === 0) {
        toast.info('There are no characters to export.');
        return;
      }

      downloadJson(allCharacters, 'daan_characters_export.json');
      toast.success(
        `${allCharacters.length} characters exported successfully.`,
      );
    } catch (error) {
      console.error('[exportAllCharactersAtom] Failed:', error);
      toast.error('Failed to export characters.');
    }
  },
);

// Combined export can be added if needed, creating a single JSON
// with top-level 'chats' and 'characters' arrays.

/** Exports the currently active chat and its messages. */
export const exportCurrentChatAtom = atom(
  null, // Write-only
  async (get, _set) => {
    const activeChat = get(activeChatDataAtom); // Get loaded active chat data
    const activeMessages = get(activeChatMessagesAtom); // Get loaded messages

    if (!activeChat) {
      toast.warning('No active chat to export.');
      return;
    }

    console.log(
      `[exportCurrentChatAtom] Exporting current chat ${activeChat.id}...`,
    );
    try {
      const exportData = [
        {
          ...activeChat,
          messages: activeMessages, // Use already loaded messages
        },
      ];

      // Sanitize filename
      const filename = `conversation_${activeChat.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || activeChat.id}.json`;
      downloadJson(exportData, filename);
      toast.success(`Conversation "${activeChat.name}" exported.`);
    } catch (error) {
      console.error(
        `[exportCurrentChatAtom] Failed for chat ${activeChat.id}:`,
        error,
      );
      toast.error('Failed to export current conversation.');
    }
  },
);
