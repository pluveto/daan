import { atom } from 'jotai';

// --- Request State Atoms ---

/** Indicates if an AI assistant response is currently being generated (streaming). */
export const isAssistantLoadingAtom = atom(false);

/** Holds the AbortController for the current AI request, allowing cancellation. */
export const abortControllerAtom = atom<{
  controller: AbortController;
  messageId: string; // Associate controller with the specific message being generated
} | null>(null);

/** Indicates if the character auto-fill process is running. */
export const isCharacterAutoFillingAtom = atom(false);
