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
  input: string; // active input message
  updatedAt: number; // Added for per-chat history limit (null = use global)
  // Optional: Add summary later if needed
  // summary?: string;
}

// Add more specific types as needed, e.g., for models
// Let's allow any string for flexibility, but keep the examples
export type SupportedModels = string; // Allow any string

// Example models (can be extended)
export const exampleModels: SupportedModels[] = [
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022',
  'claude-3-7-sonnet-thinking',
  'claude-3-haiku-20240307',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'deepseek-r1',
  'deepseek-v3-250324',
  'gemini-1.5-pro-latest',
  'gemini-2.0-flash-lite-preview-02-05',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-thinking-exp-01-21',
  'gemini-2.0-flash',
  'gemini-2.5-pro-preview-03-25',
  'gemini-pro',
  'gpt-3.5-turbo',
  'gpt-4-turbo',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4',
  'gpt-4o',
  'o1-mini',
  'o1',
  'o3-mini',
  'o3',
  'o4-mini',
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

export interface CustomCharacter {
  id: string;
  sort: number;
  name: string;
  description?: string;
  icon: string;
  prompt: string;
  model: string;
  maxHistory: number | null;
  createdAt: number;
}
