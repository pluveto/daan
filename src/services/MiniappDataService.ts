// src/services/MiniappDataService.ts
import type { MiniappConfig, MiniappDefinitionEntity } from '@/types';

// Use existing types as our "Entity" types
export type MiniappConfigEntity = {
  definitionId: string; // Primary Key
  config: MiniappConfig;
};
export type MiniappGeneralDataEntity = {
  definitionId: string;
  key: string;
  value: any;
};

// DTOs (Data Transfer Objects) for specific operations

export type CreateMiniappDefinitionDto = Omit<
  MiniappDefinitionEntity,
  'id' | 'enabled' | 'createdAt' | 'updatedAt'
> & {
  id?: string; // Allow providing an ID (e.g., from Marketplace install)
};

export type UpdateMiniappDefinitionDto = Partial<
  Omit<MiniappDefinitionEntity, 'id' | 'createdAt' | 'updatedAt'>
> & {
  name: string;
  id: string;
};

export interface MiniappDataService {
  // Initialization
  initialize(): Promise<void>;

  // --- Definition Operations ---
  /** Fetches all Miniapp definitions, ordered by name ascending (or createdAt). */
  getAllDefinitions(): Promise<MiniappDefinitionEntity[]>;
  /** Fetches a single Miniapp definition by its ID. */
  getDefinitionById(id: string): Promise<MiniappDefinitionEntity | null>;
  /** Creates a new Miniapp definition record. Assigns ID and timestamps if not provided. */
  createDefinition(
    defData: CreateMiniappDefinitionDto,
  ): Promise<MiniappDefinitionEntity>;
  /** Updates specific fields of a Miniapp definition. Automatically updates 'updatedAt'. */
  updateDefinition(updates: UpdateMiniappDefinitionDto): Promise<void>;
  /** Deletes a Miniapp definition and its associated config and general data. */
  deleteDefinition(id: string): Promise<void>;
  /** Replaces all existing definitions with the provided list (used by sync/initial load). */
  bulkReplaceDefinitions(definitions: MiniappDefinitionEntity[]): Promise<void>;

  // --- Config Operations ---
  /** Fetches all Miniapp configurations. */
  getAllConfigs(): Promise<MiniappConfigEntity[]>;
  /** Fetches the configuration for a specific Miniapp definition ID. */
  getConfig(definitionId: string): Promise<MiniappConfigEntity | null>;
  /** Creates or updates the configuration for a specific Miniapp definition ID. */
  upsertConfig(configData: MiniappConfigEntity): Promise<void>;
  /** Deletes the configuration for a specific Miniapp definition ID. */
  deleteConfig(definitionId: string): Promise<void>;

  // --- General Data Operations (Key-Value store per Miniapp) ---
  /** Creates or updates a key-value data item scoped to a Miniapp definition. */
  upsertDataItem(dataItem: MiniappGeneralDataEntity): Promise<void>;
  /** Retrieves the value for a specific key scoped to a Miniapp definition. */
  getDataItem(
    definitionId: string,
    key: string,
  ): Promise<MiniappGeneralDataEntity | null>; // Return full entity or just value? Returning entity for consistency.
  /** Removes a specific key-value pair scoped to a Miniapp definition. */
  removeDataItem(definitionId: string, key: string): Promise<void>;
  /** Retrieves all data keys stored for a specific Miniapp definition. */
  getAllDataKeys(definitionId: string): Promise<string[]>;
  /** Retrieves all key-value pairs stored for a specific Miniapp definition. */
  getAllDataItems(definitionId: string): Promise<MiniappGeneralDataEntity[]>;
  /** Deletes all general data associated with a specific Miniapp definition ID. */
  deleteAllDataForDefinition(definitionId: string): Promise<void>;

  // --- Import/Export (Optional) ---
  // exportAllMiniappData?(): Promise<YourExportFormat>;
  // importMiniappData?(data: YourExportFormat): Promise<void>;
}
