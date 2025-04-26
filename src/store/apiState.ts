import { atom } from 'jotai';

// --- Request State Atoms ---

/** Indicates if an AI assistant response is currently being generated (streaming). */
export const isAssistantLoadingAtom = atom(false);

/** Holds the AbortController for the current AI request, allowing cancellation. */
interface AbortInfo {
  controller: AbortController;
  messageId: string | null; // Host message being streamed to
  miniappRequestId?: string | null; // Originating request ID from miniapp
}
export const abortControllerAtom = atom<AbortInfo | null>(null);

/** Indicates if the character auto-fill process is running. */
export const isCharacterAutoFillingAtom = atom(false);
