// src/services/IndexedDBService.ts
import { searchService } from '@/store/search';
import type {
  CharacterEntity,
  ChatEntity,
  MessageEntity,
} from '@/types/internal';
import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import type {
  ChatDataService,
  ChatMetadata,
  FinalizeMessageDto,
  UpdateCharacterDto,
} from './ChatDataService';

// Define interfaces matching DB schema - can often reuse internal types directly
type ChatRecord = Omit<ChatEntity, 'isPinned'> & {
  isPinned: number; // indexedDB doesn't support boolean, use 0/1 instead
};
type MessageRecord = MessageEntity;
type CharacterRecord = CharacterEntity;

const DB_NAME = 'DaanDatabase_v2'; // Use a new name or version bump to avoid conflicts with old localStorage structure implicitly

class DaanDexieDatabase extends Dexie {
  // Define table properties for type safety
  chats!: Table<ChatRecord, string>; // Primary key '<ChatRecord, PrimaryKeyType>'
  messages!: Table<MessageRecord, string>;
  characters!: Table<CharacterRecord, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      // Define stores and indexes
      // Format: 'primaryKey, index1, index2, ...'
      // Use ++ for auto-incrementing primary keys (if desired, UUIDs are generally better for sync)
      chats: 'id, name, updatedAt, createdAt, isPinned', // 'id' is the primary key
      messages: 'id, chatId, timestamp', // 'id' PK, index on 'chatId' and 'timestamp'
      characters: 'id, name, sort, createdAt', // 'id' PK, index on 'sort'
    });

    // Example for potential future migration:
    // this.version(2).stores({
    //     chats: 'id, name, updatedAt, createdAt, isPinned, ndeleteChatewField', // Add new field
    //     messages: 'id, chatId, timestamp, anotherNewField',
    //     characters: 'id, name, sort, createdAt',
    // }).upgrade(tx => {
    //      // Migration logic for version 2, e.g., setting default values for new fields
    //      return tx.table('chats').toCollection().modify(chat => {
    //          chat.newField = chat.newField ?? 'defaultValue';
    //      });
    // });
  }
}

export class IndexedDBChatDataService implements ChatDataService {
  private db: DaanDexieDatabase;

  constructor() {
    this.db = new DaanDexieDatabase();
    console.log('IndexedDBService instance created.');
  }

  async initialize(): Promise<void> {
    try {
      // db.open() is idempotent and handles initialization/upgrades.
      await this.db.open();
      console.log(
        `IndexedDB [${DB_NAME}] connection opened successfully (version ${this.db.verno}).`,
      );
      // Add any initial data seeding or checks here if needed
    } catch (error) {
      console.error(`Failed to open IndexedDB [${DB_NAME}]:`, error);
      // Potentially try deleting the DB if it's corrupted? Risky.
      // Dexie.delete(DB_NAME).then(() => console.log("Attempted to delete corrupted DB"));
      // Better to inform the user.
      alert(
        `Failed to initialize database. Please try clearing site data or contact support. Error: ${error}`,
      );
      throw error; // Re-throw for higher-level handling if necessary
    }
  }

  // --- CRUD Methods will be implemented here in the next steps ---
  // Placeholder implementations (to avoid compile errors for now)

  async getAllChatMetadata(): Promise<ChatMetadata[]> {
    // Temporary implementation:
    return this.db.chats
      .orderBy('updatedAt')
      .reverse()
      .toArray((chats) =>
        chats.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          updatedAt: c.updatedAt,
          createdAt: c.createdAt,
          isPinned: !!c.isPinned,
        })),
      );
  }
  async getChatById(chatId: string): Promise<ChatEntity | null> {
    let record = await this.db.chats.get(chatId);
    if (!record) {
      return null;
    }
    return {
      ...record,
      isPinned: !!record.isPinned,
    };
  }
  async createChat(
    chatData: Omit<ChatEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ChatEntity> {
    const newId = uuidv4();
    const now = Date.now();
    const newChat: ChatRecord = {
      ...chatData,
      id: newId,
      isPinned: +chatData.isPinned,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.chats.add(newChat);
    return {
      ...newChat,
      isPinned: !!newChat.isPinned,
    };
  }
  async updateChat(
    chatId: string,
    updates: Partial<Omit<ChatEntity, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void> {
    await this.db.chats.update(chatId, {
      ...updates,
      updatedAt: Date.now(),
      isPinned: +(updates.isPinned ?? false),
    });
  }
  async deleteChat(chatId: string): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.chats,
      this.db.messages,
      async () => {
        await this.db.messages.where('chatId').equals(chatId).delete();
        await this.db.chats.delete(chatId);
      },
    );
  }
  async deleteChats(chatIds: string[]): Promise<void> {
    console.log('[ChatDataService] deleteChats', chatIds);
    await this.db.transaction(
      'rw',
      this.db.chats,
      this.db.messages,
      async () => {
        await this.db.messages.where('chatId').anyOf(chatIds).delete();
        await this.db.chats.bulkDelete(chatIds);
      },
    );
  }
  async clearUnpinnedChats(): Promise<void> {
    const unpinnedIds = await this.db.chats
      .where('isPinned')
      .equals(0)
      .primaryKeys(); // 0 for false in IndexedDB often
    if (unpinnedIds.length > 0) {
      await this.deleteChats(unpinnedIds);
    } else {
      console.log('[ChatDataService] No unpinned chats to delete.');
    }
  }

  // --- Message Placeholders ---
  async getMessagesByChatId(
    chatId: string,
    limit?: number | undefined,
    offset?: number | undefined,
  ): Promise<MessageEntity[]> {
    let query = this.db.messages.where({ chatId }).sortBy('timestamp');
    // Dexie doesn't support offset directly with sortBy efficiently. Usually paginate by timestamp.
    // For now, just fetch all:
    return query;
  }
  async getMessageById(messageId: string): Promise<MessageEntity | null> {
    return (await this.db.messages.get(messageId)) ?? null;
  }
  async addMessage(
    messageData: Omit<MessageEntity, 'id'> & { id?: string | undefined },
  ): Promise<MessageEntity> {
    const newId = messageData.id ?? uuidv4();
    const newMessage: MessageEntity = {
      ...messageData,
      id: newId,
      timestamp: messageData.timestamp ?? Date.now(),
    };
    await this.db.messages.add(newMessage);
    await searchService.indexMessage(newMessage);

    return newMessage;
  }
  async addMessages(
    messagesData: (Omit<MessageEntity, 'id'> & {
      id?: string | undefined;
    })[],
  ): Promise<MessageEntity[]> {
    const now = Date.now();
    const messages = messagesData.map((m) => ({
      ...m,
      id: m.id ?? uuidv4(),
      timestamp: m.timestamp ?? now,
    }));
    await this.db.messages.bulkAdd(messages);
    for (const msg of messages) {
      await searchService.indexMessage(msg); // Consider batching in searchService if needed
    }
    return messages;
  }
  async updateMessage(
    messageId: string,
    updates: Partial<Omit<MessageEntity, 'id' | 'chatId'>>,
  ): Promise<void> {
    await this.db.messages.update(messageId, updates);
    const updatedMessage = await this.db.messages.get(messageId);
    if (updatedMessage) {
      await searchService.indexMessage(updatedMessage);
    }
  }
  async deleteMessage(messageId: string): Promise<void> {
    await this.db.messages.delete(messageId);
    await searchService.removeMessage(messageId);
  }
  async deleteMessages(messageIds: string[]): Promise<void> {
    await this.db.messages.bulkDelete(messageIds);
    for (const msgId of messageIds) {
      await searchService.removeMessage(msgId); // Consider batching in searchService
    }
  }
  async deleteMessagesByChatId(chatId: string): Promise<void> {
    console.warn();
    await this.db.messages.where({ chatId }).delete();
  }

  // --- Character Placeholders ---
  async getAllCharacters(): Promise<CharacterEntity[]> {
    return this.db.characters.orderBy('sort').toArray();
  }
  async getCharacterById(characterId: string): Promise<CharacterEntity | null> {
    return (await this.db.characters.get(characterId)) ?? null;
  }
  async createCharacter(
    charData: Omit<
      CharacterEntity,
      'id' | 'createdAt' | 'updatedAt' | 'sort'
    > & { id?: string | undefined },
  ): Promise<CharacterEntity> {
    const newId = charData.id ?? uuidv4();
    const now = Date.now();
    const lastChar = await this.db.characters.orderBy('sort').last();
    const sort = (lastChar?.sort ?? -1) + 1;
    const newChar: CharacterEntity = {
      ...charData,
      id: newId,
      sort,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.characters.add(newChar);
    return newChar;
  }
  async updateCharacter(updates: UpdateCharacterDto): Promise<void> {
    await this.db.characters.update(updates.id, {
      ...updates,
      updatedAt: Date.now(),
    });
  }
  async deleteCharacter(characterId: string): Promise<void> {
    await this.db.characters.delete(characterId);
    // TODO: Consider sort order renormalization later if needed
  }
  async updateCharacterSortOrder(
    updates: { id: string; sort: number }[],
  ): Promise<void> {
    console.warn();
    await this.db.transaction('rw', this.db.characters, async () => {
      for (const update of updates) {
        await this.db.characters.update(update.id, {
          sort: update.sort,
          updatedAt: Date.now(),
        });
      }
    });
  }

  // --- Specific Message Update Placeholders ---
  async updateMessageContent(
    messageId: string,
    newContent: string,
  ): Promise<void> {
    await this.db.messages.update(messageId, { content: newContent });
    const updatedMessage = await this.db.messages.get(messageId);
    if (updatedMessage) {
      await searchService.indexMessage(updatedMessage);
    }
  }
  async finalizeMessage(dto: FinalizeMessageDto): Promise<void> {
    const { id, finalContent, isError, toolCallInfo } = dto;
    const updates: Partial<MessageEntity> = { content: finalContent };
    if (isError !== undefined) updates.isError = isError;
    if (toolCallInfo !== undefined) updates.toolCallInfo = toolCallInfo;
    // Clear transient flags if necessary, e.g. updates.isStreaming = false;
    await this.db.messages.update(id, updates);
    const finalMessage = await this.db.messages.get(id);
    if (finalMessage) {
      await searchService.indexMessage(finalMessage);
    }
  }
}
