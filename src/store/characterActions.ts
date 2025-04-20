import type {
  CustomCharacter,
  PartialCharacter,
  SupportedModels,
} from '@/types';
import { atom } from 'jotai';
import OpenAI from 'openai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { isCharacterAutoFillingAtom } from './apiState';
import { customCharactersAtom } from './characterData';
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  defaultModelAtom,
  defaultPromptAtom,
  defaultSummaryModelAtom,
} from './settings';

// --- Helper Functions ---

/** Calculates the next sequential sort value for a new character. */
const getNextCharacterSortValue = (characters: CustomCharacter[]): number => {
  if (characters.length === 0) {
    return 0;
  }
  // Find the maximum current sort value, defaulting to -1 if all are null/undefined
  const maxSort = Math.max(...characters.map((c) => c.sort ?? -1), -1);
  return maxSort + 1;
};

/** Re-sorts characters and assigns sequential sort values (0, 1, 2...). */
export const normalizeCharacterSort = (
  characters: CustomCharacter[],
): CustomCharacter[] => {
  // Sort by existing sort value, then name as a tie-breaker
  const sorted = [...characters].sort((a, b) => {
    const sortDiff = (a.sort ?? Infinity) - (b.sort ?? Infinity); // Treat null/undefined sort as highest
    if (sortDiff !== 0) return sortDiff;
    return a.name.localeCompare(b.name); // Fallback sort by name
  });
  // Assign sequential sort values based on the sorted order
  return sorted.map((char, index) => ({ ...char, sort: index }));
};

// --- Character Action Atoms ---

/** Adds a new default character to the list. Returns the new character's ID. */
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
  console.log('newCharacter', newCharacter);

  set(customCharactersAtom, [...currentCharacters, newCharacter]);
  toast.success(`Character "${newCharacter.name}" created.`);
  return newId; // Return the ID for potential immediate use (e.g., selection)
});

/** Updates an existing character's properties. */
export const updateCharacterAtom = atom(
  null,
  (
    get, // Added get here
    set,
    updatedCharacterData: Partial<Omit<CustomCharacter, 'id' | 'createdAt'>> & {
      id: string;
    },
  ) => {
    const { id, ...updates } = updatedCharacterData;
    let characterUpdated = false;
    let finalName = 'Character'; // Default name for toast

    set(customCharactersAtom, (prevCharacters) =>
      prevCharacters.map((char) => {
        if (char.id === id) {
          characterUpdated = true;
          const updatedChar = {
            ...char,
            ...updates, // Apply updates
            updatedAt: Date.now(), // Update timestamp
          };
          finalName = updatedChar.name; // Get the potentially updated name
          return updatedChar;
        }
        return char;
      }),
    );

    if (characterUpdated) {
      toast.success(`Character "${finalName}" saved.`);
    } else {
      console.warn(`Character with ID ${id} not found for update.`);
      toast.error('Failed to save: Character not found.');
    }
  },
);

/** Deletes a character from the list. Returns true if successful. */
export const deleteCharacterAtom = atom(
  null,
  (get, set, idToDelete: string): boolean => {
    const currentCharacters = get(customCharactersAtom);
    const charToDelete = currentCharacters.find((c) => c.id === idToDelete);

    if (!charToDelete) {
      console.warn(`Character with ID ${idToDelete} not found for deletion.`);
      return false; // Indicate deletion failed
    }

    const characterName = charToDelete.name ?? 'Character';

    set(customCharactersAtom, (prev) =>
      prev.filter((char) => char.id !== idToDelete),
    );

    toast.success(`Character "${characterName}" deleted.`);
    return true; // Indicate deletion successful
  },
);

/** Moves a character up or down in the sorted list by swapping sort values. */
export const moveCharacterAtom = atom(
  null,
  (get, set, { id, direction }: { id: string; direction: 'up' | 'down' }) => {
    const characters = get(customCharactersAtom);
    // Ensure characters are sorted by 'sort' value for correct index finding
    const sorted = [...characters].sort(
      (a, b) => (a.sort ?? Infinity) - (b.sort ?? Infinity),
    );
    const currentIndex = sorted.findIndex((c) => c.id === id);

    if (currentIndex === -1) {
      console.warn(`Character ${id} not found for moving.`);
      return;
    } // Not found

    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    // Check boundaries
    if (targetIndex < 0 || targetIndex >= sorted.length) {
      // Already at the top or bottom
      return;
    }

    // Get the characters involved from the *sorted* array
    const charToMove = sorted[currentIndex];
    const charToSwapWith = sorted[targetIndex];

    // Get their original sort values to swap
    const sortToMove = charToMove.sort;
    const sortToSwap = charToSwapWith.sort;
    const now = Date.now();

    // Update the original list by finding the IDs and swapping sort values
    const updatedCharacters = characters.map((char) => {
      if (char.id === charToMove.id) {
        // Assign the sort value of the character it's swapping with
        return { ...char, sort: sortToSwap, updatedAt: now };
      }
      if (char.id === charToSwapWith.id) {
        // Assign the sort value of the character being moved
        return { ...char, sort: sortToMove, updatedAt: now };
      }
      return char; // Keep other characters unchanged
    });

    set(customCharactersAtom, updatedCharacters);
    // No toast needed for simple reordering usually
  },
);

/** Duplicates an existing character. Returns the new character's ID or null on failure. */
export const duplicateCharacterAtom = atom(
  null,
  (get, set, idToDuplicate: string): string | null => {
    const characters = get(customCharactersAtom);
    const charToDuplicate = characters.find((c) => c.id === idToDuplicate);

    if (!charToDuplicate) {
      toast.error('Character to duplicate not found.');
      return null;
    }

    try {
      // Deep clone using JSON (safe for this structure)
      const duplicatedChar: CustomCharacter = JSON.parse(
        JSON.stringify(charToDuplicate),
      );
      const newId = uuidv4();
      const now = Date.now();

      duplicatedChar.id = newId;
      duplicatedChar.name = `${charToDuplicate.name} (copy)`;
      // Place the duplicate right after the original or at the end
      // Using getNextCharacterSortValue is simpler and places it at the end
      duplicatedChar.sort = getNextCharacterSortValue(characters);
      duplicatedChar.createdAt = now;
      duplicatedChar.updatedAt = now;

      const updatedCharacters = [...characters, duplicatedChar];
      // Optional: Renormalize sort order after adding
      // const normalizedCharacters = normalizeCharacterSort(updatedCharacters);
      // set(customCharactersAtom, normalizedCharacters);
      set(customCharactersAtom, updatedCharacters); // Simpler: just add to end

      toast.success(`Character "${duplicatedChar.name}" duplicated.`);
      return newId;
    } catch (error) {
      console.error('Duplication failed:', error);
      toast.error('Failed to duplicate character.');
      return null;
    }
  },
);

/** Attempts to auto-fill character details (icon, description, prompt) using AI. */
export const autoFillCharacterAtom = atom(
  null,
  async (get, set, characterToFill: PartialCharacter) => {
    // Mark atom as async
    const apiKey = get(apiKeyAtom);
    if (!apiKey) {
      toast.error('Auto-fill failed: OpenAI API Key not set.');
      return;
    }

    // Prevent concurrent auto-fills
    if (get(isCharacterAutoFillingAtom)) {
      toast.warning('Auto-fill already in progress.');
      return;
    }

    set(isCharacterAutoFillingAtom, true);
    toast.info('🤖 Attempting to auto-fill character...');

    try {
      // 1. Prepare partial data (only non-empty/non-default fields)
      const partialData: Partial<CustomCharacter> = {};
      if (characterToFill.name && characterToFill.name !== 'New Character') {
        partialData.name = characterToFill.name;
      }
      if (characterToFill.icon && characterToFill.icon !== '👤') {
        partialData.icon = characterToFill.icon;
      }
      if (characterToFill.description) {
        partialData.description = characterToFill.description;
      }
      // Include prompt only if non-empty and maybe different from default? Let's include if non-empty.
      if (
        characterToFill.prompt &&
        characterToFill.prompt !== get(defaultPromptAtom)
      ) {
        partialData.prompt = characterToFill.prompt;
      }
      // Include model only if different from default?
      if (
        characterToFill.model /* && characterToFill.model !== get(defaultModelAtom) */
      ) {
        partialData.model = characterToFill.model;
      }
      if (characterToFill.maxHistory !== null) {
        partialData.maxHistory = characterToFill.maxHistory;
      }

      if (Object.keys(partialData).length === 0) {
        toast.error(
          'Auto-fill failed: Please provide some initial details (like Name) first.',
        );
        set(isCharacterAutoFillingAtom, false); // Reset loading state
        return;
      }

      // 2. Construct the prompt for the AI
      const prompt = `
You are an assistant that helps create character profiles for a GPT chatbot UI.
Based on the partial information provided below, complete the character profile.
Use the provided values where available, otherwise generate suitable content.
Ensure name is concise (several words) and fits the character's persona.
The 'description' should be a concise summary (1-2 sentences).
The 'prompt' should define the character's persona and instructions for the chatbot.
Provide the most appropriate (according to the topic) single emoji for the 'icon' if not provided or if unsuitable (NEVER use too generic emoji like 🤖).
Respond ONLY with a single, valid JSON object containing the following keys: "name", "icon", "description", "prompt", "model", "maxHistory".
'maxHistory' should be a number or null.

Partial Data:
\`\`\`json
${JSON.stringify(partialData, null, 2)}
\`\`\`

JSON Response format (ONLY the JSON object):
{"name": "...", "icon": "...", "description": "...", "prompt": "...", "model": "...", "maxHistory": ...}
`;

      // 3. API Call (using a capable model, non-streaming)
      const openai = new OpenAI({
        apiKey,
        baseURL: get(apiBaseUrlAtom) || undefined,
        dangerouslyAllowBrowser: true, // Acknowledge browser usage risk
      });

      // Use the character's specified model or the global default for the generation request itself
      const modelToUseForGeneration: SupportedModels = get(
        defaultSummaryModelAtom,
      );

      console.log(
        `Requesting auto-fill for char ${characterToFill.id} with model ${modelToUseForGeneration}...`,
      );

      const response = await openai.chat.completions.create({
        model: modelToUseForGeneration, // Use a capable model like gpt-4o or similar
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7, // Allow some creativity
        max_tokens: 500, // Adjust based on expected length
        response_format: { type: 'json_object' }, // Request JSON output
        stream: false,
      });

      const aiResponseContent = response.choices[0]?.message?.content;

      if (!aiResponseContent) {
        throw new Error('AI returned an empty response.');
      }

      console.log('AI Auto-fill raw response:', aiResponseContent);

      // 4. Parse and Validate AI Response
      let aiJson: Partial<CustomCharacter>;
      try {
        aiJson = JSON.parse(aiResponseContent);
      } catch (parseError) {
        console.error('Failed to parse AI JSON response:', parseError);
        // Attempt to extract JSON from potential ```json ... ``` blocks
        const jsonMatch = aiResponseContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          try {
            aiJson = JSON.parse(jsonMatch[1]);
            console.log('Successfully parsed JSON from code block.');
          } catch (nestedError) {
            console.error(
              'Failed to parse JSON even from code block:',
              nestedError,
            );
            throw new Error('AI returned invalid JSON content.');
          }
        } else {
          throw new Error('AI returned invalid JSON.');
        }
      }

      if (typeof aiJson !== 'object' || aiJson === null) {
        throw new Error('AI response was not a valid JSON object.');
      }

      // 5. Merge Results: Create update object with only valid fields from AI
      const fieldsToUpdate: Partial<
        Omit<CustomCharacter, 'id' | 'createdAt' | 'updatedAt' | 'sort'>
      > = {};

      // Validate and potentially update each field from AI response
      if (typeof aiJson.name === 'string' && aiJson.name.trim())
        fieldsToUpdate.name = aiJson.name.trim();
      // Basic emoji check (might need refinement for complex emojis/flags)
      if (
        typeof aiJson.icon === 'string' &&
        /\p{Emoji}/u.test(aiJson.icon.trim())
      )
        fieldsToUpdate.icon = aiJson.icon.trim();
      if (typeof aiJson.description === 'string' && aiJson.description.trim())
        fieldsToUpdate.description = aiJson.description.trim();
      if (typeof aiJson.prompt === 'string' && aiJson.prompt.trim())
        fieldsToUpdate.prompt = aiJson.prompt.trim();
      if (typeof aiJson.model === 'string' && aiJson.model.trim())
        fieldsToUpdate.model = aiJson.model.trim() as SupportedModels; // Assume valid model name
      if (typeof aiJson.maxHistory === 'number' && aiJson.maxHistory >= 0)
        fieldsToUpdate.maxHistory = Math.floor(aiJson.maxHistory);
      else if (aiJson.maxHistory === null) fieldsToUpdate.maxHistory = null;

      if (Object.keys(fieldsToUpdate).length === 0) {
        toast.info("Auto-fill didn't suggest any valid changes.");
        set(isCharacterAutoFillingAtom, false); // Still need to reset loading
        return;
      }

      console.log('Applying auto-fill updates:', fieldsToUpdate);

      // 6. Update State via updateCharacterAtom
      // Use the specific updateCharacterAtom which handles state update and toast
      return {
        id: characterToFill.id,
        ...fieldsToUpdate, // Apply updates (omit id, createdAt, and updatedAt)
      };
      // updateCharacterAtom will show its own success toast
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
