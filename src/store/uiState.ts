// src/store/uiState.ts
// No changes needed, isSystemSettingsDialogOpenAtom already exists.
import { atomWithSafeStorage } from '@/lib/utils';
import { atom } from 'jotai';

// --- UI State Atoms ---

/** Controls the visibility of the left sidebar. Persisted in storage. */
export const isLeftSidebarOpenAtom = atomWithSafeStorage(
  'leftSidebarOpen',
  true,
);

/** Controls the visibility of the right sidebar. Persisted in storage. */
export const isRightSidebarOpenAtom = atomWithSafeStorage(
  'rightSidebarOpen',
  true,
);

/** Controls the visibility of the character editor/creator view. */
export const isCharacterEditorOpenAtom = atom(false);
export const isCharacterMarketplaceOpenAtom = atom(false);

/** ID of the message currently being edited, or null if none. */
export const editingMessageIdAtom = atom<string | null>(null);

/** Controls the visibility of the conversation search input/modal. */
export const isConversationSearchOpenAtom = atom(false);

/** Controls the visibility of the System Settings dialog. */
export const isSystemSettingsDialogOpenAtom = atom(false); // Already here
export const systemSettingsDialogActiveTabAtom = atom('api'); // Already here

/** Atom to trigger focus on the main chat input. Increment the value to trigger focus. */
export const focusInputAtom = atom(0);
