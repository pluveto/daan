// src/types.ts
export type ValidRoles = 'user' | 'assistant' | 'system';

export interface Message {
  content: string;
  id: string;
  isStreaming?: boolean;
  // Add 'divider' role
  role: ValidRoles | 'divider';
  timestamp: number;
  // Optional: Add other metadata if needed, e.g., error state
  // error?: string;
}

export interface Chat {
  createdAt: number;
  icon: string;
  id: string;
  isPinned: boolean;
  // Added for pinning
  maxHistory: number | null;
  messages: Message[];
  // Emoji
  model: string;
  name: string;
  systemPrompt: string;
  updatedAt: number; // Added for per-chat history limit (null = use global)
  // Optional: Add summary later if needed
  // summary?: string;
}

// Add more specific types as needed, e.g., for models
// Let's allow any string for flexibility, but keep the examples
export type SupportedModels = string; // Allow any string

// Example models (can be extended)
export const exampleModels: SupportedModels[] = [
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'gemini-1.5-pro-latest',
  'gemini-pro',
  'gemini-2.5-pro-preview-03-25',
  'deepseek-v3-250324',
];

// Simple list of common emojis for selection (can be expanded)
export const commonEmojis = [
  '💬',
  '🧠',
  '💡',
  '📝',
  '🔍',
  '⚙️',
  '🚀',
  '🧪',
  '🤖',
  '💻',
  '📚',
  '📊',
  '📈',
  '🤔',
  '✅',
  '❓',
  '✨',
  '🎉',
  '📌',
  '📎',
];
