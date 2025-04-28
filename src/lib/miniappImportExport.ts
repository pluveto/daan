// src/lib/miniappImportExport.ts
import { MiniappDataService } from '@/services/MiniappDataService';
import {
  MiniappMcpDefinitionSchema,
  type CustomCharacter,
  type MiniappDefinitionEntity,
} from '@/types';
import _ from 'lodash';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid'; // Import uuid
import { z } from 'zod';
import { downloadJson } from './download';

// --- Zod Schema for Import Validation ---

// More detailed schema reflecting MiniappDefinition for better validation during import
// Making most fields optional during initial parse, will apply defaults later.
const MiniappImportDefinitionSchema = z
  .object({
    id: z.string().uuid().or(z.string().min(1)).optional(), // Allow existing or file ID
    name: z.string().min(1, 'Definition must have a name'),
    icon: z.string().optional(),
    description: z.string().optional(),
    htmlContent: z.string().min(1, 'Definition must have htmlContent'),
    configSchema: z.record(z.any()).optional(),
    defaultConfig: z.record(z.any()).optional(),
    defaultWindowSize: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .optional(),
    enabled: z.boolean().optional(), // Will default later
    dependencies: z.array(z.string()).optional(),
    requiredApis: z.array(z.string()).optional(), // Include this field
    permissions: z.record(z.any()).optional(), // Define more strictly later if needed
    mcpDefinition: MiniappMcpDefinitionSchema.optional(),
    // createdAt/updatedAt are handled during import logic, not required in file
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
  })
  .passthrough(); // Allow other fields initially

const MiniappExportDataSchema = z.record(z.string(), z.any()).optional();

const MiniappExportFileSchema = z.object({
  version: z.literal(1),
  type: z.literal('miniapp'),
  definition: MiniappImportDefinitionSchema,
  data: MiniappExportDataSchema,
});

type MiniappExportFileData = z.infer<typeof MiniappExportFileSchema>;
type MiniappImportDefinition = z.infer<typeof MiniappImportDefinitionSchema>;

// --- Export Functions ---

/**
 * Sanitizes a string for use in a filename.
 * @param name The string to sanitize.
 * @returns A filesystem-safe string.
 */
function sanitizeFilename(name: string): string {
  // Remove invalid characters, replace spaces, limit length
  return name
    .replace(/[<>:"/\\|?*\s]+/g, '_') // Replace invalid chars and whitespace with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with one
    .slice(0, 50); // Limit length
}

/**
 * Exports a Miniapp definition to a JSON file.
 * @param definition The MiniappDefinition object to export.
 */
export function exportMiniappDefinition(
  definition: MiniappImportDefinition,
): void {
  try {
    const exportData: MiniappExportFileData = {
      version: 1,
      type: 'miniapp',
      definition: definition,
      data: undefined, // No data to export
    };

    const filename = `${sanitizeFilename(definition.name)}.daan-miniapp.json`;
    downloadJson(exportData, filename);
    toast.success(`Exported Miniapp definition "${definition.name}".`);
  } catch (error) {
    console.error('Error exporting Miniapp definition:', error);
    toast.error(
      `Failed to export Miniapp: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Exports a Miniapp definition along with its associated data to a JSON file.
 * @param definition The MiniappDefinition object to export.
 */
export async function exportMiniappWithData(
  service: MiniappDataService,
  definition: MiniappImportDefinition,
): Promise<void> {
  try {
    toast.info(`Workspaceing data for Miniapp "${definition.name}"...`);
    if (!definition.id) {
      throw new Error('Cannot export data for a Miniapp without an ID.');
    }
    const data = await service.getAllDataItems(definition.id);
    const exportData: MiniappExportFileData = {
      version: 1,
      type: 'miniapp',
      definition: definition,
      data: data, // Include the fetched data
    };

    const filename = `${sanitizeFilename(definition.name)}.daan-miniapp-data.json`; // Slightly different name
    downloadJson(exportData, filename);
    toast.success(`Exported Miniapp "${definition.name}" with data.`);
  } catch (error) {
    console.error('Error exporting Miniapp with data:', error);
    toast.error(
      `Failed to export Miniapp with data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// --- Import Function ---

/**
 * Imports a Miniapp definition (and optionally data) from a File object.
 * Handles validation, ID conflicts, merging fields, and updates application state.
 *
 * @param file The File object to import.
 * @param getDefinitions A function to get the current list of MiniappDefinition.
 * @param setDefinitions The state setter function for miniappsDefinitionAtom.
 * @returns Promise resolving when import is complete or failed.
 */
export async function importMiniappFromFile(
  file: File,
  service: MiniappDataService,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      if (!event.target?.result || typeof event.target.result !== 'string') {
        toast.error('Failed to read file content.');
        reject(new Error('Failed to read file content.'));
        return;
      }

      let parsedData: any;
      try {
        parsedData = JSON.parse(event.target.result);
      } catch (error) {
        console.error('Import error: Failed to parse JSON.', error);
        toast.error('Import failed: Invalid JSON file.');
        reject(new Error('Invalid JSON file.'));
        return;
      }

      // Validate the overall structure
      const validationResult = MiniappExportFileSchema.safeParse(parsedData);
      if (!validationResult.success) {
        console.error(
          'Import error: File structure validation failed.',
          validationResult.error.errors,
        );
        const errorDetails = validationResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        toast.error('Import failed: Invalid file format.', {
          description: errorDetails,
        });
        reject(new Error(`Invalid file format: ${errorDetails}`));
        return;
      }

      const importedData = validationResult.data;
      const importedDefinitionData = importedData.definition; // Data parsed by Zod
      const importedMiniappData = importedData.data;

      const currentDefinitions = await service.getAllDefinitions();
      // Use ID from file if present, otherwise generate one (for potentially malformed exports)
      const idFromFile = importedDefinitionData.id || uuidv4();
      const existingDefinitionIndex = currentDefinitions.findIndex(
        (def) => def.id === idFromFile,
      );
      const definitionExists = existingDefinitionIndex !== -1;
      const existingDefinition = definitionExists
        ? currentDefinitions[existingDefinitionIndex]
        : null;

      let finalDefinition: MiniappDefinitionEntity;
      const now = Date.now();

      // --- Handle Conflicts / Prepare Final Definition ---

      // Define default values for a new MiniappDefinition
      const defaultValues: Omit<
        MiniappDefinitionEntity,
        'id' | 'name' | 'htmlContent' | 'createdAt' | 'updatedAt'
      > = {
        icon: '📦',
        description: '',
        configSchema: {},
        defaultConfig: {},
        defaultWindowSize: { width: 800, height: 600 },
        enabled: false,
        dependencies: [],
        requiredApis: [],
        permissions: { useStorage: true }, // Default sensible permission
        mcpDefinition: undefined,
      };

      if (definitionExists && existingDefinition) {
        // --- Overwrite Logic ---
        const confirmed = window.confirm(
          `Miniapp "${importedDefinitionData.name}" (ID: ${idFromFile}) already exists. Overwrite it?`,
        );
        if (!confirmed) {
          toast.info('Import cancelled by user.');
          resolve();
          return;
        }

        // Merge imported data with existing, prioritizing imported values but keeping existing ID/createdAt
        finalDefinition = {
          // Base: existing definition (to ensure all keys are present)
          ...existingDefinition,
          // Overwrite with imported values if they exist
          name: importedDefinitionData.name, // Required by schema
          icon:
            importedDefinitionData.icon ??
            existingDefinition.icon ??
            defaultValues.icon,
          description:
            importedDefinitionData.description ??
            existingDefinition.description ??
            defaultValues.description,
          htmlContent: importedDefinitionData.htmlContent, // Required by schema
          configSchema:
            importedDefinitionData.configSchema ??
            existingDefinition.configSchema ??
            defaultValues.configSchema,
          defaultConfig:
            importedDefinitionData.defaultConfig ??
            existingDefinition.defaultConfig ??
            defaultValues.defaultConfig,
          defaultWindowSize:
            importedDefinitionData.defaultWindowSize ??
            existingDefinition.defaultWindowSize ??
            defaultValues.defaultWindowSize,
          enabled: importedDefinitionData.enabled ?? existingDefinition.enabled, // Keep existing enabled state by default on overwrite
          dependencies:
            importedDefinitionData.dependencies ??
            existingDefinition.dependencies ??
            defaultValues.dependencies,
          requiredApis:
            importedDefinitionData.requiredApis ??
            existingDefinition.requiredApis ??
            defaultValues.requiredApis,
          permissions:
            importedDefinitionData.permissions ??
            existingDefinition.permissions ??
            defaultValues.permissions,
          mcpDefinition:
            importedDefinitionData.mcpDefinition ??
            existingDefinition.mcpDefinition,
          // Preserve existing ID and createdAt, update updatedAt
          id: existingDefinition.id,
          createdAt: existingDefinition.createdAt,
          updatedAt: now,
        };
        console.log(
          `Import: Preparing to overwrite Miniapp ${finalDefinition.id}`,
        );
      } else {
        // --- New Install Logic ---
        // Use imported data, falling back to defaults for missing fields
        finalDefinition = {
          id: idFromFile, // Use ID from file or generated one
          name: importedDefinitionData.name, // Required
          htmlContent: importedDefinitionData.htmlContent, // Required
          icon: importedDefinitionData.icon ?? defaultValues.icon,
          description:
            importedDefinitionData.description ?? defaultValues.description,
          configSchema:
            importedDefinitionData.configSchema ?? defaultValues.configSchema,
          defaultConfig:
            importedDefinitionData.defaultConfig ?? defaultValues.defaultConfig,
          defaultWindowSize:
            importedDefinitionData.defaultWindowSize ??
            defaultValues.defaultWindowSize,
          enabled: importedDefinitionData.enabled ?? defaultValues.enabled, // Default false for new installs
          dependencies:
            importedDefinitionData.dependencies ?? defaultValues.dependencies,
          requiredApis:
            importedDefinitionData.requiredApis ?? defaultValues.requiredApis,
          permissions:
            importedDefinitionData.permissions ?? defaultValues.permissions,
          createdAt: now,
          updatedAt: now,
        };
        console.log(
          `Import: Preparing to install new Miniapp ${finalDefinition.id}`,
        );
      }

      // --- Update State: Definition ---
      try {
        // setDefinitions((prev) => {
        //   if (definitionExists) {
        //     // Overwrite existing
        //     return prev.map((def) =>
        //       def.id === finalDefinition.id ? finalDefinition : def,
        //     );
        //   } else {
        //     // Add new
        //     return [...prev, finalDefinition];
        //   }
        // });
        if (definitionExists) {
          await service.updateDefinition(finalDefinition);
        } else {
          await service.createDefinition(finalDefinition);
        }
        // Toast success after definition is updated
        toast.success(
          `Miniapp "${finalDefinition.name}" ${definitionExists ? 'updated' : 'installed'} successfully.`,
        );
      } catch (stateError) {
        console.error(
          'Import error: Failed to update definitions state:',
          stateError,
        );
        toast.error('Import failed: Could not save Miniapp definition.');
        reject(new Error('Failed to save Miniapp definition.'));
        return;
      }

      // --- Update State: Data (if included) ---
      if (importedMiniappData && Object.keys(importedMiniappData).length > 0) {
        // Use the final ID (in case it was preserved during overwrite)
        const definitionId = finalDefinition.id;
        toast.info(
          `Importing data for "${finalDefinition.name}" (ID: ${definitionId})...`,
        );
        let dataImportErrors = 0;
        const importPromises = Object.entries(importedMiniappData).map(
          async ([key, value]) => {
            try {
              await service.upsertDataItem({ definitionId, key, value });
            } catch (error) {
              console.error(
                `Import error: Failed to import data key '${key}' for ${definitionId}:`,
                error,
              );
              dataImportErrors++;
            }
          },
        );

        await Promise.allSettled(importPromises);

        if (dataImportErrors > 0) {
          toast.warning(
            `Import partially complete for "${finalDefinition.name}". ${dataImportErrors} data items failed to import. Check console for details.`,
          );
        } else {
          toast.success(
            `Successfully imported ${Object.keys(importedMiniappData).length} data items for "${finalDefinition.name}".`,
          );
        }
      }

      resolve(); // Import process finished
    };

    reader.onerror = (error) => {
      console.error('Import error: FileReader failed.', error);
      toast.error('Import failed: Could not read the file.');
      reject(new Error('Could not read the file.'));
    };

    reader.readAsText(file);
  });
}

/**
 * Generates Markdown content suitable for publishing a Miniapp to the GitHub Issues marketplace.
 * @param definition The MiniappDefinition to format.
 * @param author GitHub username (optional, defaults to 'Unknown').
 * @returns A string containing the formatted Markdown.
 */
export function formatMiniappForPublishing(
  definition: MiniappDefinitionEntity,
  author: string = 'UnknownAuthor',
): string {
  // Prepare metadata, ensuring required fields have fallbacks
  const metadata = {
    name: definition.name || 'Untitled Miniapp',
    icon: definition.icon || '📦',
    version: '1.0.0', // Default version, user should update
    author: author,
    description: definition.description?.split('\n')[0] || 'No description.', // Use first line
    tags: [], // User should add tags manually
    license: 'Specify License', // User should update
    // permissions: definition.permissions // Optionally include permissions metadata
  };

  const htmlContent = definition.htmlContent || '';

  // Prepare definition for JSON block (remove potentially sensitive or irrelevant fields for publishing?)
  // Keep most fields as they define the miniapp
  const definitionForJson = {
    // id: "placeholder-id-generated-on-install", // Omit ID
    name: metadata.name,
    icon: metadata.icon,
    description: definition.description || '', // Include full description here
    configSchema: definition.configSchema,
    defaultConfig: definition.defaultConfig,
    defaultWindowSize: definition.defaultWindowSize,
    permissions: definition.permissions,
    mcpDefinition: definition.mcpDefinition,
    dependencies: definition.dependencies,
    // Omit createdAt, updatedAt, enabled
  };

  _.omitBy(definitionForJson, _.isUndefined);

  const jsonString = JSON.stringify({ definition: definitionForJson }, null, 2);

  // Construct YAML Frontmatter string manually
  let frontmatter = '---\n';
  Object.entries(metadata).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      frontmatter += `${key}: ${JSON.stringify(value)}\n`; // Ensure proper quoting/escaping
    }
  });
  frontmatter += '---\n';

  // Assemble the final Markdown
  const markdown = `
${frontmatter}
## Overview

${definition.description || '*(Please add a detailed description here)*'}

<!-- Add more details, usage instructions, screenshots etc. using Markdown -->


## Installation Data

\`\`\`json
${jsonString}
\`\`\`

## HTML Content

\`\`\`html
${htmlContent}
\`\`\`
`;
  return markdown.trim();
}

/**
 * Generates Markdown content suitable for publishing a Character to the GitHub Issues marketplace.
 * @param character The CustomCharacter object to format.
 * @param author GitHub username (optional, defaults to 'Unknown').
 * @returns A string containing the formatted Markdown.
 */
export function formatCharacterForPublishing(
  character: CustomCharacter,
  author: string = 'UnknownAuthor',
): string {
  // Prepare metadata
  const metadata = {
    name: character.name || 'Untitled Character',
    icon: character.icon || '👤',
    version: '1.0.0', // Default version, user should update
    author: author,
    description: character.description?.split('\n')[0] || 'A custom character.', // Use first line or default
    tags: ['character'], // Default tag, user can add more
    // license: "Specify License", // License might not be applicable
  };

  // Prepare definition for JSON block
  const definitionForJson = {
    // id: "placeholder-id-generated-on-install", // Omit ID
    name: metadata.name,
    icon: metadata.icon,
    description: character.description || '',
    prompt: character.prompt,
    model: character.model,
    maxHistory: character.maxHistory,
    // Omit sort, createdAt, updatedAt
  };

  const jsonString = JSON.stringify({ definition: definitionForJson }, null, 2);

  // Construct YAML Frontmatter string
  let frontmatter = '---\n';
  Object.entries(metadata).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      frontmatter += `${key}: ${JSON.stringify(value)}\n`;
    }
  });
  frontmatter += '---\n';

  // Assemble the final Markdown
  const markdown = `
${frontmatter}
## Overview

${character.description || '*(Please add a detailed description for this character)*'}

<!-- Add more details about the character's personality, purpose, etc. -->

## Installation Data

\`\`\`json
${jsonString}
\`\`\`


`;
  return markdown.trim();
}
