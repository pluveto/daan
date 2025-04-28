// src/services/ChatDataService.ts
import { ToolCallInfo } from '@/types';
import type {
  CharacterEntity,
  ChatEntity,
  MessageEntity,
} from '@/types/internal';

// --- DTO Definitions ---

/** Minimal chat data for list displays. */
export type ChatMetadata = Pick<
  ChatEntity,
  'id' | 'name' | 'icon' | 'updatedAt' | 'createdAt' | 'isPinned'
>;

/** Data required to create a new chat. */
export type CreateChatDto = Omit<
  ChatEntity,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string; // Optional ID override
};

/** Data allowed for updating an existing chat. */
export type UpdateChatDto = Partial<
  Omit<ChatEntity, 'id' | 'createdAt' | 'updatedAt'>
>;

/** Data required to create a new message. */
export type CreateMessageDto = Omit<MessageEntity, 'id'> & {
  id?: string; // Optional ID override
};

/** Data allowed for updating an existing message (excluding immutable fields). */
export type UpdateMessageDto = Partial<
  Omit<MessageEntity, 'id' | 'chatId' | 'createdAt'>
>;

/** Data required to create a new character. */
export type CreateCharacterDto = Omit<
  CharacterEntity,
  'id' | 'createdAt' | 'updatedAt' | 'sort' // Sort is usually handled automatically on creation
> & {
  id?: string; // Optional ID override
};

/** Data allowed for updating an existing character. */
export type UpdateCharacterDto = Partial<
  Omit<CharacterEntity, 'createdAt' | 'updatedAt'>
> & {
  id: string; // Required ID
};

/** Data structure for updating a character's sort order. */
export type UpdateCharacterSortDto = {
  id: string;
  sort: number;
};

/** Data for finalizing a message, typically after streaming. */
export type FinalizeMessageDto = {
  id: string; // message ID
  finalContent: string;
  isError?: boolean;
  toolCallInfo?: ToolCallInfo | null;
};

// --- Service Interface ---

export interface ChatDataService {
  // Initialization
  initialize(): Promise<void>;

  // --- Chat Operations ---
  /** Fetches minimal data for all chats, sorted by updatedAt descending. */
  getAllChatMetadata(): Promise<ChatMetadata[]>;
  /** Fetches a single chat by its ID. */
  getChatById(chatId: string): Promise<ChatEntity | null>;
  /** Creates a new chat record. */
  createChat(dto: CreateChatDto): Promise<ChatEntity>;
  /** Updates specific fields of a chat. Automatically updates 'updatedAt'. */
  updateChat(chatId: string, dto: UpdateChatDto): Promise<void>;
  /** Deletes a chat and all its associated messages. */
  deleteChat(chatId: string): Promise<void>;
  /** Deletes multiple chats and their messages. */
  deleteChats(chatIds: string[]): Promise<void>;
  /** Deletes all chats that are not pinned. */
  clearUnpinnedChats(): Promise<void>;

  // --- Message Operations ---
  /** Fetches messages for a specific chat, ordered by timestamp ascending. */
  getMessagesByChatId(
    chatId: string,
    limit?: number,
    offset?: number,
  ): Promise<MessageEntity[]>;
  /** Fetches a single message by its ID. */
  getMessageById(messageId: string): Promise<MessageEntity | null>;
  /** Adds a new message to the database. */
  addMessage(dto: CreateMessageDto): Promise<MessageEntity>;
  /** Adds multiple messages in bulk. */
  addMessages(dtos: CreateMessageDto[]): Promise<MessageEntity[]>;
  /** Updates specific fields of a message. */
  updateMessage(messageId: string, dto: UpdateMessageDto): Promise<void>;
  /** Deletes a single message by its ID. */
  deleteMessage(messageId: string): Promise<void>;
  /** Deletes multiple messages by their IDs. */
  deleteMessages(messageIds: string[]): Promise<void>;
  /** Deletes all messages associated with a specific chat ID. */
  deleteMessagesByChatId(chatId: string): Promise<void>;

  // --- Character Operations ---
  /** Fetches all characters, ordered by their sort value. */
  getAllCharacters(): Promise<CharacterEntity[]>;
  /** Fetches a single character by its ID. */
  getCharacterById(characterId: string): Promise<CharacterEntity | null>;
  /** Creates a new character record. Automatically assigns sort order and timestamps. */
  createCharacter(dto: CreateCharacterDto): Promise<CharacterEntity>;
  /** Updates specific fields of a character. Automatically updates 'updatedAt'. */
  updateCharacter(dto: UpdateCharacterDto): Promise<void>;
  /** Deletes a single character by its ID. */
  deleteCharacter(characterId: string): Promise<void>;
  /** Updates the sort order for multiple characters. */
  updateCharacterSortOrder(dtos: UpdateCharacterSortDto[]): Promise<void>;

  // --- Specific Message Update Operations ---
  /** Efficiently updates only the content of a message (e.g., for debounced streaming). */
  updateMessageContent(messageId: string, newContent: string): Promise<void>;
  /** Updates the final content and potentially flags a message as no longer streaming or as an error. */
  finalizeMessage(dto: FinalizeMessageDto): Promise<void>;

  // --- Import/Export (Optional - Define specific structure later if needed) ---
  // exportAllData?(): Promise<YourExportFormat>;
  // importData?(data: YourExportFormat): Promise<void>;
}
