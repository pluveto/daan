// src/services/IndexedDBMiniappDataService.ts
import { MiniappDefinitionEntity } from '@/types';
import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid'; // Or use uuidv4
import type {
  CreateMiniappDefinitionDto,
  MiniappConfigEntity,
  MiniappDataService,
  MiniappGeneralDataEntity,
  UpdateMiniappDefinitionDto,
} from './MiniappDataService';

// --- Database Definition ---

const DB_NAME = 'SheafyMiniappStore_v3'; // Increment version or use new name
const DB_VERSION = 1; // Start versioning for this specific service structure

// Use Entity types for Dexie records
type MiniappDefinitionRecord = MiniappDefinitionEntity;
type MiniappConfigRecord = MiniappConfigEntity;
type MiniappGeneralDataRecord = MiniappGeneralDataEntity;

class MiniappDexieDatabase extends Dexie {
  definitions!: Table<MiniappDefinitionRecord, string>; // PK: id
  configs!: Table<MiniappConfigRecord, string>; // PK: definitionId
  generalData!: Table<MiniappGeneralDataRecord, [string, string]>; // PK: [definitionId, key]

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      definitions: 'id, name, createdAt', // index name and createdAt for sorting
      configs: 'definitionId', // definitionId is the primary key
      generalData: '[definitionId+key], definitionId', // Compound PK, index on definitionId
    });

    // Potential future upgrades
    // this.version(2).stores({...}).upgrade(tx => {...});
  }
}

// --- Service Implementation ---

export class IndexedDBMiniappService implements MiniappDataService {
  private db: MiniappDexieDatabase;

  constructor() {
    this.db = new MiniappDexieDatabase();
    console.log('IndexedDBMiniappDataService instance created.');
  }

  async initialize(): Promise<void> {
    try {
      await this.db.open();
      console.log(
        `Miniapp DB [${DB_NAME}] connection opened successfully (version ${this.db.verno}).`,
      );
    } catch (error) {
      console.error(`Failed to open Miniapp DB [${DB_NAME}]:`, error);
      alert(`Failed to initialize Miniapp database. Error: ${error}`);
      throw error;
    }
  }

  // --- Definition Operations ---

  async getAllDefinitions(): Promise<MiniappDefinitionEntity[]> {
    return this.db.definitions.orderBy('createdAt').toArray(); // Or orderBy('name')
  }

  async getDefinitionById(id: string): Promise<MiniappDefinitionEntity | null> {
    const result = await this.db.definitions.get(id);
    return result ?? null;
  }

  async createDefinition(
    defData: CreateMiniappDefinitionDto,
  ): Promise<MiniappDefinitionEntity> {
    const newId = defData.id ?? uuidv4();
    const now = Date.now();
    const newDefinition: MiniappDefinitionEntity = {
      // Provide defaults for all required fields in MiniappDefinition
      configSchema: {},
      defaultConfig: {},
      defaultWindowSize: { width: 800, height: 600 },
      enabled: false,
      permissions: { useStorage: true }, // Sensible default
      dependencies: [],
      icon: '📦',
      description: '',
      // Spread incoming data over defaults
      ...defData,
      // Overwrite/ensure system fields
      id: newId,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.definitions.add(newDefinition);
    return newDefinition;
  }

  async updateDefinition(updates: UpdateMiniappDefinitionDto): Promise<void> {
    if (Object.keys(updates).length === 0) {
      return; // No updates needed
    }
    await this.db.definitions.update(updates.id, {
      ...updates,
      updatedAt: Date.now(),
    });
  }

  async deleteDefinition(id: string): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.definitions,
      this.db.configs,
      this.db.generalData,
      async () => {
        await this.deleteAllDataForDefinition(id); // Delete general data first
        await this.deleteConfig(id); // Delete config
        await this.db.definitions.delete(id); // Delete definition
      },
    );
  }

  async bulkReplaceDefinitions(
    definitions: MiniappDefinitionEntity[],
  ): Promise<void> {
    try {
      await this.db.transaction('rw', this.db.definitions, async () => {
        await this.db.definitions.clear();
        if (definitions.length > 0) {
          await this.db.definitions.bulkPut(definitions);
        }
      });
      console.log('Miniapp Persistence: Bulk replaced definitions.');
    } catch (error) {
      console.error(
        'Miniapp Persistence: Failed to bulk replace definitions:',
        error,
      );
      throw error; // Rethrow
    }
  }

  // --- Config Operations ---

  async getAllConfigs(): Promise<MiniappConfigEntity[]> {
    return this.db.configs.toArray();
  }

  async getConfig(definitionId: string): Promise<MiniappConfigEntity | null> {
    const result = await this.db.configs.get(definitionId);
    return result ?? null;
  }

  async upsertConfig(configData: MiniappConfigEntity): Promise<void> {
    if (
      typeof configData?.definitionId !== 'string' ||
      !configData.definitionId
    ) {
      throw new Error('upsertConfig: definitionId is missing or invalid.');
    }
    // `put` handles both insert and update based on the primary key (definitionId)
    await this.db.configs.put(configData);
  }

  async deleteConfig(definitionId: string): Promise<void> {
    await this.db.configs.delete(definitionId);
  }

  // --- General Data Operations ---

  async upsertDataItem(dataItem: MiniappGeneralDataEntity): Promise<void> {
    if (typeof dataItem?.definitionId !== 'string' || !dataItem.definitionId) {
      throw new Error('upsertDataItem: definitionId is missing or invalid.');
    }
    if (typeof dataItem?.key !== 'string' || !dataItem.key) {
      throw new Error('upsertDataItem: key is missing or invalid.');
    }
    // Use `put` which handles insert/update based on the compound primary key [definitionId, key]
    await this.db.generalData.put(dataItem);
  }

  async getDataItem(
    definitionId: string,
    key: string,
  ): Promise<MiniappGeneralDataEntity | null> {
    if (typeof definitionId !== 'string' || !definitionId) {
      throw new Error('getDataItem: definitionId must be a non-empty string.');
    }
    if (typeof key !== 'string' || !key) {
      throw new Error('getDataItem: key must be a non-empty string.');
    }
    const result = await this.db.generalData.get([definitionId, key]);
    return result ?? null;
  }

  async removeDataItem(definitionId: string, key: string): Promise<void> {
    if (typeof definitionId !== 'string' || !definitionId) {
      throw new Error(
        'removeDataItem: definitionId must be a non-empty string.',
      );
    }
    if (typeof key !== 'string' || !key) {
      throw new Error('removeDataItem: key must be a non-empty string.');
    }
    // Use the compound key to delete the specific record
    await this.db.generalData.delete([definitionId, key]);
  }

  async getAllDataKeys(definitionId: string): Promise<string[]> {
    if (typeof definitionId !== 'string' || !definitionId) {
      throw new Error(
        'getAllDataKeys: definitionId must be a non-empty string.',
      );
    }
    // Use the index on 'definitionId'
    const records = await this.db.generalData.where({ definitionId }).toArray();
    return records.map((record) => record.key);
  }

  async getAllDataItems(
    definitionId: string,
  ): Promise<MiniappGeneralDataEntity[]> {
    if (typeof definitionId !== 'string' || !definitionId) {
      throw new Error(
        'getAllDataItems: definitionId must be a non-empty string.',
      );
    }
    // Use the index on 'definitionId'
    return this.db.generalData.where({ definitionId }).toArray();
  }

  async deleteAllDataForDefinition(definitionId: string): Promise<void> {
    if (typeof definitionId !== 'string' || !definitionId) {
      throw new Error(
        'deleteAllDataForDefinition: definitionId must be a non-empty string.',
      );
    }
    await this.db.generalData.where({ definitionId }).delete();
  }
}
