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
/**
 * Stores the accumulated content for actively streaming messages.
 * Key: messageId (string) - The ID of the assistant message being streamed.
 * Value: content (string) - The full accumulated content received so far for that message.
 *
 * This atom is updated rapidly during streaming by `updateStreamingMessageUIAtom`
 * and used by `ChatMessageItem` to display real-time updates.
 * Entries are cleared by `finalizeStreamingMessageInDbAtom` when streaming finishes or errors.
 */
export const streamingMessageContentAtom = atom<Map<string, string>>(new Map());
