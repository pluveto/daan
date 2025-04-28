// src/store/characterActions.ts
import { UpdateCharacterDto } from '@/services/ChatDataService';
import type { CharacterEntity } from '@/types/internal';
import { atom } from 'jotai';
import OpenAI from 'openai'; // Keep OpenAI import for auto-fill API call
import { toast } from 'sonner';
import { isCharacterAutoFillingAtom } from './apiState'; // Keep UI state atom
import { loadCharactersAtom, loadedCharactersAtom } from './characterData';
import { chatDataServiceAtom } from './service';
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  apiProvidersAtom,
  defaultMaxHistoryAtom,
  defaultModelAtom,
  defaultPromptAtom,
  defaultSummaryModelAtom,
} from './settings';

// --- Character CRUD Actions ---

/** Adds a new default character to the DB and refreshes the list atom. */
export const addCharacterAtom = atom(
  null,
  async (get, set): Promise<string | null> => {
    const service = get(chatDataServiceAtom);
    console.log('[addCharacterAtom] Adding new character...');
    try {
      // Prepare default data
      const newCharacterData: Omit<
        CharacterEntity,
        'id' | 'createdAt' | 'updatedAt' | 'sort'
      > = {
        name: 'New Character',
        icon: '👤',
        description: '',
        prompt: get(defaultPromptAtom),
        model: get(defaultModelAtom),
        maxHistory: null, // Rely on effective calculation later
      };
      // Service handles assigning sort order and timestamps
      const createdChar = await service.createCharacter(newCharacterData);
      console.log(
        `[addCharacterAtom] Character ${createdChar.id} created in DB.`,
      );

      // Refresh character list from DB
      set(loadCharactersAtom);

      toast.success(`Character "${createdChar.name}" created.`);
      return createdChar.id; // Return new ID for potential immediate use (e.g., selection)
    } catch (error) {
      console.error('[addCharacterAtom] Failed:', error);
      toast.error('Failed to create character.');
      return null;
    }
  },
);

/** Updates an existing character in the DB and refreshes the list atom. */
export const updateCharacterAtom = atom(
  null,
  async (get, set, updatedCharacterData: UpdateCharacterDto) => {
    const { id, ...updates } = updatedCharacterData;
    if (!id) {
      console.warn('[updateCharacterAtom] Called without ID.');
      return;
    }

    const service = get(chatDataServiceAtom);
    console.log(`[updateCharacterAtom] Updating character ${id}...`, updates);
    try {
      // Service handles updating 'updatedAt' timestamp
      await service.updateCharacter(updatedCharacterData);
      console.log(`[updateCharacterAtom] Character ${id} updated in DB.`);

      // Refresh character list from DB
      set(loadCharactersAtom);

      // Success toast is typically handled by the caller (e.g., CharacterForm save button)
      // toast.success(`Character "${updates.name || 'Character'}" saved.`);
    } catch (error) {
      console.error(
        `[updateCharacterAtom] Failed to update character ${id}:`,
        error,
      );
      toast.error(`Failed to save character "${updates.name || 'Character'}".`);
    }
  },
);

/** Deletes a character from the DB and refreshes the list atom. */
export const deleteCharacterAtom = atom(
  null,
  async (get, set, idToDelete: string): Promise<boolean> => {
    const service = get(chatDataServiceAtom);
    // Get name for toast *before* deleting
    const charToDelete = get(loadedCharactersAtom)?.find(
      (c) => c.id === idToDelete,
    );
    const charName = charToDelete?.name || idToDelete;

    console.log(
      `[deleteCharacterAtom] Deleting character ${idToDelete} (${charName})...`,
    );
    try {
      await service.deleteCharacter(idToDelete);
      console.log(
        `[deleteCharacterAtom] Character ${idToDelete} deleted from DB.`,
      );

      // Refresh character list from DB
      set(loadCharactersAtom);

      toast.success(`Character "${charName}" deleted.`);
      return true;
    } catch (error) {
      console.error(
        `[deleteCharacterAtom] Failed to delete character ${idToDelete}:`,
        error,
      );
      toast.error(`Failed to delete character "${charName}".`);
      return false;
    }
  },
);

/** Moves a character up or down by swapping sort values in the DB and refreshing the list atom. */
export const moveCharacterAtom = atom(
  null,
  async (
    get,
    set,
    { id, direction }: { id: string; direction: 'up' | 'down' },
  ) => {
    // Get current characters directly from the atom for index calculation
    const currentCharacters = get(loadedCharactersAtom);
    if (!currentCharacters) {
      console.warn('[moveCharacterAtom] Characters not loaded yet.');
      return; // Not loaded yet
    }

    const currentIndex = currentCharacters.findIndex((c) => c.id === id);
    if (currentIndex === -1) {
      console.warn(`[moveCharacterAtom] Character ${id} not found.`);
      return;
    }

    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    // Check boundaries
    if (targetIndex < 0 || targetIndex >= currentCharacters.length) {
      console.log(`[moveCharacterAtom] Character ${id} already at boundary.`);
      return; // Already at the top or bottom
    }

    // Characters involved in the swap
    const charToMove = currentCharacters[currentIndex];
    const charToSwapWith = currentCharacters[targetIndex];

    // Prepare updates for the service (ID and new sort value)
    const updates = [
      { id: charToMove.id, sort: charToSwapWith.sort },
      { id: charToSwapWith.id, sort: charToMove.sort },
    ];

    const service = get(chatDataServiceAtom);
    console.log(
      `[moveCharacterAtom] Swapping sort order for ${charToMove.id} and ${charToSwapWith.id}...`,
    );
    try {
      // Service method handles updating sort and updatedAt timestamp
      await service.updateCharacterSortOrder(updates);
      console.log(`[moveCharacterAtom] Sort order updated in DB.`);

      // Refresh list from DB to ensure UI reflects the new order
      set(loadCharactersAtom);
    } catch (error) {
      console.error(
        `[moveCharacterAtom] Failed to move character ${id}:`,
        error,
      );
      toast.error('Failed to reorder characters.');
    }
  },
);

/** Duplicates an existing character, saves the new one, and refreshes the list atom. */
export const duplicateCharacterAtom = atom(
  null,
  async (get, set, idToDuplicate: string): Promise<string | null> => {
    const service = get(chatDataServiceAtom);
    console.log(
      `[duplicateCharacterAtom] Duplicating character ${idToDuplicate}...`,
    );
    try {
      // Fetch the full data of the character to duplicate
      const charToDuplicate = await service.getCharacterById(idToDuplicate);
      if (!charToDuplicate) {
        toast.error('Character to duplicate not found.');
        console.error(
          `[duplicateCharacterAtom] Character ${idToDuplicate} not found.`,
        );
        return null;
      }

      // Prepare data for the new character
      // Exclude fields that should be regenerated (id, timestamps, sort)
      const { id, createdAt, updatedAt, sort, ...dupeData } = charToDuplicate;
      dupeData.name = `${dupeData.name} (copy)`;

      // Create the new character using the service (handles sort, timestamps)
      const createdChar = await service.createCharacter(dupeData);
      console.log(
        `[duplicateCharacterAtom] Duplicated character created with ID ${createdChar.id}.`,
      );

      // Refresh the character list
      set(loadCharactersAtom);
      toast.success(`Character "${createdChar.name}" duplicated.`);
      return createdChar.id; // Return the ID of the new character
    } catch (error) {
      console.error(
        `[duplicateCharacterAtom] Failed for ${idToDuplicate}:`,
        error,
      );
      toast.error('Failed to duplicate character.');
      return null;
    }
  },
);

// --- Auto-fill Action ---

/** Attempts to auto-fill character details using AI based on partial input. */
export const autoFillCharacterAtom = atom(
  null,
  async (
    get,
    set,
    id: string,
    characterToFill: Partial<CharacterEntity>,
  ): Promise<Partial<CharacterEntity> | null> => {
    const globalApiKey = get(apiKeyAtom);
    const providers = get(apiProvidersAtom); // Need providers to resolve API key/URL
    const summaryModelId = get(defaultSummaryModelAtom); // Model used for the fill itself
    const globalApiBaseUrl = get(apiBaseUrlAtom);

    // Resolve API key and URL for the summary model
    const [providerId, modelName] = summaryModelId.split('::');
    const providerConfig = providers.find(
      (p) => p.id === providerId && p.enabled,
    );
    const apiKey = providerConfig?.apiKey || globalApiKey;
    const apiBaseUrl = providerConfig?.apiBaseUrl || globalApiBaseUrl;

    if (!apiKey) {
      toast.error(
        'Auto-fill failed: API Key for summary model not configured.',
      );
      return null;
    }
    if (!modelName) {
      toast.error('Auto-fill failed: Summary model invalid.');
      return null;
    }

    // Prevent concurrent auto-fills
    if (get(isCharacterAutoFillingAtom)) {
      toast.warning('Auto-fill already in progress.');
      return null;
    }

    set(isCharacterAutoFillingAtom, true);
    toast.info('🤖 Attempting to auto-fill character...');
    console.log(
      `[autoFillCharacterAtom] Requesting auto-fill for char ${characterToFill?.id} with model ${modelName}...`,
    );

    try {
      // 1. Prepare partial data (only non-empty/non-default fields)
      const partialData: Partial<CharacterEntity> = {};
      if (characterToFill.name && characterToFill.name !== 'New Character')
        partialData.name = characterToFill.name;
      if (characterToFill.icon && characterToFill.icon !== '👤')
        partialData.icon = characterToFill.icon;
      if (characterToFill.description)
        partialData.description = characterToFill.description;
      if (
        characterToFill.prompt &&
        characterToFill.prompt !== get(defaultPromptAtom)
      )
        partialData.prompt = characterToFill.prompt;
      if (
        characterToFill.model &&
        characterToFill.model !== get(defaultModelAtom)
      )
        partialData.model = characterToFill.model;
      if (
        characterToFill.maxHistory !== null &&
        characterToFill.maxHistory !== get(defaultMaxHistoryAtom)
      )
        partialData.maxHistory = characterToFill.maxHistory; // Compare with global default? Or just non-null?

      if (Object.keys(partialData).length === 0) {
        toast.error(
          'Auto-fill failed: Please provide some initial details (like Name) first.',
        );
        set(isCharacterAutoFillingAtom, false);
        return null;
      }

      // 2. Construct the prompt for the AI
      //    (Prompt remains largely the same as before, requesting JSON output)
      const prompt = `
You are an assistant that helps create character profiles for a GPT chatbot UI.
Based on the partial information provided below, complete the character profile.
Use the provided values where available, otherwise generate suitable content.
Ensure name is concise (several words) and fits the character's persona.
The 'description' should be a concise summary (1-2 sentences).
The 'prompt' should define the character's persona and instructions for the chatbot.
Provide the most appropriate (according to the topic) single emoji for the 'icon' if not provided or if unsuitable (NEVER use too generic emoji like 🤖).
Respond ONLY with a single, valid JSON object containing the following keys: "name", "icon", "description", "prompt", "model", "maxHistory".
'maxHistory' should be a number or null. 'model' should be a valid model identifier string (e.g., 'openai::gpt-4o').

Partial Data:
\`\`\`json
${JSON.stringify(partialData, null, 2)}
\`\`\`

JSON Response format (ONLY the JSON object):
{"name": "...", "icon": "...", "description": "...", "prompt": "...", "model": "...", "maxHistory": ...}
`;

      // 3. API Call (using OpenAI SDK)
      const openai = new OpenAI({
        apiKey,
        baseURL: apiBaseUrl || undefined, // Use resolved base URL
        dangerouslyAllowBrowser: true,
      });

      const response = await openai.chat.completions.create({
        model: modelName, // Use the resolved summary model name
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        stream: false,
      });

      const aiResponseContent = response.choices[0]?.message?.content;

      if (!aiResponseContent) {
        throw new Error('AI returned an empty response.');
      }
      console.log(
        '[autoFillCharacterAtom] AI raw response:',
        aiResponseContent,
      );

      // 4. Parse and Validate AI Response
      let aiJson: Partial<CharacterEntity>;
      try {
        aiJson = JSON.parse(aiResponseContent);
      } catch (parseError) {
        console.error(
          '[autoFillCharacterAtom] Failed to parse AI JSON response:',
          parseError,
        );
        throw new Error('AI returned invalid JSON.'); // Simplify error handling
      }
      if (typeof aiJson !== 'object' || aiJson === null) {
        throw new Error('AI response was not a valid JSON object.');
      }

      // 5. Create update object with validated fields
      const fieldsToUpdate: Partial<
        Omit<CharacterEntity, 'id' | 'createdAt' | 'updatedAt' | 'sort'>
      > = {};
      if (typeof aiJson.name === 'string' && aiJson.name.trim())
        fieldsToUpdate.name = aiJson.name.trim();
      // Basic emoji check
      if (
        typeof aiJson.icon === 'string' &&
        /\p{Emoji}/u.test(aiJson.icon.trim())
      )
        fieldsToUpdate.icon = aiJson.icon.trim();
      if (typeof aiJson.description === 'string' && aiJson.description.trim())
        fieldsToUpdate.description = aiJson.description.trim();
      if (typeof aiJson.prompt === 'string' && aiJson.prompt.trim())
        fieldsToUpdate.prompt = aiJson.prompt.trim();
      if (typeof aiJson.model === 'string' && aiJson.model.includes('::'))
        fieldsToUpdate.model = aiJson.model as any; // Basic format check
      if (typeof aiJson.maxHistory === 'number' && aiJson.maxHistory >= 0)
        fieldsToUpdate.maxHistory = Math.floor(aiJson.maxHistory);
      else if (aiJson.maxHistory === null) fieldsToUpdate.maxHistory = null;

      if (Object.keys(fieldsToUpdate).length === 0) {
        toast.info("Auto-fill didn't suggest any valid changes.");
        return null; // No updates to apply
      }

      console.log(
        '[autoFillCharacterAtom] Applying auto-fill updates:',
        fieldsToUpdate,
      );

      // 6. Update character using updateCharacterAtom (which handles DB save and list refresh)
      //    No need to await here unless the caller needs the result immediately after save confirmation.
      set(updateCharacterAtom, { id, ...fieldsToUpdate });
      toast.success('Character details auto-filled and saved.'); // Give feedback here

      return fieldsToUpdate; // Return the suggested updates
    } catch (error) {
      console.error('[autoFillCharacterAtom] Failed:', error);
      toast.error(
        `Auto-fill failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null; // Indicate failure
    } finally {
      set(isCharacterAutoFillingAtom, false); // Ensure loading state is reset
    }
  },
);
