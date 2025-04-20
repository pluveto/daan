import type { Chat, CustomCharacter, Message } from '@/types.ts';
import { atom } from 'jotai';
import { toast } from 'sonner';
import { normalizeCharacterSort } from './characterActions.ts'; // Import helper
import { customCharactersAtom } from './characterData.ts';
import { chatsAtom, type ChatsRecord } from './chatData.ts';

// --- Validation Helpers ---

/** Basic structural validation for an imported Chat object. */
const isValidChat = (obj: any): obj is Chat => {
  if (typeof obj !== 'object' || obj === null) return false;

  // Required fields
  const hasRequired =
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.updatedAt === 'number' &&
    typeof obj.model === 'string' && // Assuming SupportedModels is string-based
    typeof obj.systemPrompt === 'string' && // Allow empty string
    Array.isArray(obj.messages);

  if (!hasRequired) return false;

  // Optional fields type checks (if present)
  if ('icon' in obj && typeof obj.icon !== 'string') return false;
  if (
    'characterId' in obj &&
    obj.characterId !== null &&
    typeof obj.characterId !== 'string'
  )
    return false;
  if (
    'maxHistory' in obj &&
    obj.maxHistory !== null &&
    typeof obj.maxHistory !== 'number'
  )
    return false;
  if ('isPinned' in obj && typeof obj.isPinned !== 'boolean') return false;
  if ('input' in obj && typeof obj.input !== 'string') return false; // Check for input draft

  // Validate message structure within the array
  return obj.messages.every(
    (msg: any): msg is Message =>
      typeof msg === 'object' &&
      msg !== null &&
      typeof msg.id === 'string' &&
      typeof msg.role === 'string' && // Could check against specific roles ('user', 'assistant', 'system', 'divider')
      typeof msg.content === 'string' && // Allow empty string
      typeof msg.timestamp === 'number' &&
      // Optional check for isStreaming (should default/be false on import)
      (!('isStreaming' in msg) || typeof msg.isStreaming === 'boolean'),
  );
};

/** Basic structural validation for an imported CustomCharacter object. */
const isValidCharacter = (obj: any): obj is CustomCharacter => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.icon === 'string' && // Icon is required
    typeof obj.prompt === 'string' && // Prompt is required
    typeof obj.model === 'string' && // Model is required
    (typeof obj.maxHistory === 'number' || obj.maxHistory === null) && // MaxHistory required (can be null)
    typeof obj.sort === 'number' && // Sort is required
    typeof obj.createdAt === 'number' && // CreatedAt is required
    typeof obj.updatedAt === 'number' // UpdatedAt is required
    // description is optional, no strict check needed unless format is enforced
    // && (!('description' in obj) || typeof obj.description === 'string')
  );
};

// --- Import/Export Action Atoms ---

/** Imports chats from an array, merging with or overwriting existing chats by ID. */
export const importChatsAtom = atom(null, (get, set, importedData: unknown) => {
  if (!Array.isArray(importedData)) {
    toast.error(
      'Import failed: Invalid data format. Expected an array of chat objects.',
    );
    return;
  }

  let importedCount = 0;
  let skippedCount = 0;

  set(chatsAtom, (prevChats) => {
    const mergedChats: ChatsRecord = { ...prevChats }; // Start with existing chats

    importedData.forEach((importedObj: unknown, index) => {
      if (isValidChat(importedObj)) {
        const importedChat = importedObj as Chat; // Type assertion after validation
        // Ensure imported streaming states are reset
        importedChat.messages = importedChat.messages.map((m) => ({
          ...m,
          isStreaming: false,
        }));

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
          JSON.stringify(importedObj), // Log the problematic object
        );
        skippedCount++;
      }
    });
    return mergedChats; // Return the merged result
  });

  // Feedback messages
  if (importedCount > 0) {
    toast.success(`${importedCount} conversation(s) imported successfully.`);
    // Maybe activate the first imported chat if none was active? Needs careful thought.
  }
  if (skippedCount > 0) {
    toast.warning(
      `${skippedCount} invalid or malformed conversation record(s) skipped. Check console for details.`,
    );
  }
  if (importedCount === 0 && skippedCount === 0 && importedData.length > 0) {
    toast.warning(
      'Import file contained records, but none were valid conversations.',
    );
  } else if (importedData.length === 0) {
    toast.info('Import file was empty.');
  }
});

/** Imports characters from an array, merging/overwriting by ID and normalizing sort order. */
export const importCharactersAtom = atom(
  null,
  (get, set, importedData: unknown) => {
    if (!Array.isArray(importedData)) {
      toast.error(
        'Import failed: Invalid data format. Expected an array of character objects.',
      );
      return;
    }

    let importedCount = 0;
    let skippedCount = 0;
    const currentCharacters = get(customCharactersAtom);
    // Use a Map for efficient merging/overwriting by ID
    const mergedCharsMap = new Map<string, CustomCharacter>(
      currentCharacters.map((c) => [c.id, c]),
    );

    importedData.forEach((importedObj: unknown, index) => {
      // Basic structural check first
      if (typeof importedObj !== 'object' || importedObj === null) {
        console.warn(
          `Skipping non-object character data at index ${index}:`,
          importedObj,
        );
        skippedCount++;
        return;
      }

      // Add required fields with defaults if missing *before* validation
      const now = Date.now();
      const objWithDefaults = {
        // Create a new object to avoid modifying the original potentially invalid input
        sort: Infinity, // Default sort to high value, will be normalized
        createdAt: now,
        updatedAt: now,
        ...(importedObj as object), // Spread the imported object, potentially overwriting defaults
      };

      if (isValidCharacter(objWithDefaults)) {
        const importedChar = objWithDefaults as CustomCharacter; // Type assertion after validation
        if (mergedCharsMap.has(importedChar.id)) {
          console.warn(
            `Overwriting existing character with imported ID: ${importedChar.id}`,
          );
        }
        mergedCharsMap.set(importedChar.id, importedChar); // Add/overwrite in map
        importedCount++;
      } else {
        console.warn(
          `Skipping invalid character structure at index ${index}:`,
          JSON.stringify(importedObj), // Log the original problematic object
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
      toast.success(
        `${importedCount} character(s) imported/updated successfully.`,
      );
    }
    if (skippedCount > 0) {
      toast.warning(
        `${skippedCount} invalid or malformed character record(s) skipped. Check console for details.`,
      );
    }
    if (importedCount === 0 && skippedCount === 0 && importedData.length > 0) {
      toast.warning(
        'Import file contained records, but none were valid characters.',
      );
    } else if (importedData.length === 0) {
      toast.info('Import file was empty.');
    }
  },
);
