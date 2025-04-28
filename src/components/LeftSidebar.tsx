// src/components/LeftSidebar.tsx (Updated - Phase 5)
import type { ChatMetadata } from '@/services/ChatDataService'; // Import ChatMetadata
import {
  activeChatIdAtom,
  clearUnpinnedChatsAtom,
  createNewChatAtom,
  deleteChatAtom,
  enableMiniappFeatureAtom,
  // --- End new atoms ---
  isCharacterEditorOpenAtom,
  isCharacterMarketplaceOpenAtom,
  isConversationSearchOpenAtom,
  isLoadingCharactersAtom, // Use sorted metadata atom
  isLoadingChatListAtom,
  isSystemSettingsDialogOpenAtom,
  // --- Use new atoms ---
  loadedCharactersAtom,
  sortedChatsMetadataAtom,
  togglePinChatAtom,
} from '@/store/index';
import type { CharacterEntity } from '@/types'; // Use internal character type
import { formatDateLabel } from '@/utils/dateUtils';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useMemo } from 'react';
import { CharacterSection } from './CharacterSection';
import {
  ConversationList,
  type GroupedChatsMetadata,
} from './ConversationList'; // Import updated type
import { ConversationSearch } from './ConversationSearch';
import { MiniappSection } from './MiniappSection';
import { SidebarActions } from './SidebarActions';
import { SidebarFooter } from './SidebarFooter';
import { SidebarHeader } from './SidebarHeader';

// Branding constants (unchanged)
const appName = import.meta.env.VITE_APP_NAME || 'Daan';
const slogan = import.meta.env.VITE_APP_SLOGAN || 'Opensource Chat UI';
const logoUrl = import.meta.env.VITE_APP_LOGO_URL || '/logo.png';
const version = import.meta.env.VITE_APP_TAG || 'unknown';
const commitInfo = import.meta.env.VITE_APP_COMMIT_HASH || 'N/A';

export const LeftSidebar: React.FC = () => {
  // --- State Management ---
  const sortedMetadata = useAtomValue(sortedChatsMetadataAtom); // Read sorted metadata
  const characters = useAtomValue(loadedCharactersAtom);
  const isLoadingList = useAtomValue(isLoadingChatListAtom); // Read loading state
  const isLoadingChars = useAtomValue(isLoadingCharactersAtom); // Read loading state

  const [activeChatId, setActiveChatId] = useAtom(activeChatIdAtom);
  const setIsCharacterEditorOpen = useSetAtom(isCharacterEditorOpenAtom);
  const setIsCharacterMarketplaceOpen = useSetAtom(
    isCharacterMarketplaceOpenAtom,
  );
  const setIsSystemSettingsOpen = useSetAtom(isSystemSettingsDialogOpenAtom);
  const setConversationSearchOpen = useSetAtom(isConversationSearchOpenAtom);
  const createNewChat = useSetAtom(createNewChatAtom); // Action atom refactored
  const deleteChat = useSetAtom(deleteChatAtom); // Action atom refactored
  const togglePinChat = useSetAtom(togglePinChatAtom); // Action atom refactored
  const clearUnpinnedChats = useSetAtom(clearUnpinnedChatsAtom); // Action atom refactored
  const enableMiniappFeature = useAtomValue(enableMiniappFeatureAtom);

  // --- Event Handlers (mostly unchanged, actions are refactored) ---
  const handleSettingsClick = () => setIsSystemSettingsOpen(true);
  const handleNewChatClick = () => createNewChat(); // Calls refactored action
  const handleClearUnpinnedClick = () => {
    // Confirmation handled by ConversationActionsMenu now
    clearUnpinnedChats(); // Calls refactored action
  };
  const handleAddCharacterClick = () => setIsCharacterEditorOpen(true);
  const handleOpenChartMarketplaceClick = () =>
    setIsCharacterMarketplaceOpen(true); // TODO: Implement this
  const handleInstantiateCharacterClick = async (
    character: CharacterEntity,
  ) => {
    console.log('Instantiating character:', character.name);
    // Pass character details as overrides to the refactored action
    await createNewChat({
      name: character.name,
      icon: character.icon,
      systemPrompt: character.prompt,
      model: character.model,
      maxHistory: character.maxHistory,
      characterId: character.id,
      isPinned: false,
      temperature: null,
      maxTokens: null,
      topP: null,
    });
  };
  const handleSearchClick = () => setConversationSearchOpen(true);
  const handleChatSelect = (chatId: string) => setActiveChatId(chatId); // Remains the same
  const handlePinToggle = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    togglePinChat(chatId); // Calls refactored action
  };
  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    // Confirmation handled within ConversationItem's AlertDialog
    deleteChat(chatId); // Calls refactored action
    // No need to manually reset activeChatId here, deleteChatAtom handles it if necessary
  };

  // --- Derived Data (Grouping logic now uses metadata) ---
  const groupedChatsMetadata = useMemo(() => {
    const groups: GroupedChatsMetadata[] = [];
    // Handle null state during initial load
    if (!sortedMetadata) {
      return groups;
    }

    const pinnedChats: ChatMetadata[] = [];
    const unpinnedChats: ChatMetadata[] = [];

    // Separate pinned and unpinned using the sorted metadata
    sortedMetadata.forEach((chatMeta) => {
      if (chatMeta.isPinned) {
        pinnedChats.push(chatMeta);
      } else {
        unpinnedChats.push(chatMeta);
      }
    });

    // Add pinned group if any exist
    if (pinnedChats.length > 0) {
      groups.push({ label: 'Pinned', chats: pinnedChats });
    }

    // Group unpinned chats by date
    let currentGroup: GroupedChatsMetadata | null = null;
    unpinnedChats.forEach((chatMeta) => {
      const dateLabel = formatDateLabel(chatMeta.updatedAt); // Use updatedAt from metadata
      if (!currentGroup || currentGroup.label !== dateLabel) {
        currentGroup = { label: dateLabel, chats: [chatMeta] };
        groups.push(currentGroup);
      } else {
        currentGroup.chats.push(chatMeta);
      }
    });

    return groups;
  }, [sortedMetadata]); // Depend on the sorted metadata atom

  // --- Render Composition ---
  return (
    <div className="flex h-full flex-col border-r border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900">
      <SidebarHeader
        appName={appName}
        slogan={slogan}
        logoUrl={logoUrl}
        onSettingsClick={handleSettingsClick}
      />
      <SidebarActions
        onNewChatClick={handleNewChatClick}
        onClearUnpinnedClick={handleClearUnpinnedClick} // Passed to menu inside
      />

      {/* Character Section - Pass loading state */}
      <CharacterSection
        characters={characters ?? []}
        isLoading={isLoadingChars}
        onAddCharacterClick={handleAddCharacterClick}
        onInstantiateCharacterClick={handleInstantiateCharacterClick}
        onOpenMarketplaceClick={handleOpenChartMarketplaceClick}
      />

      {/* MiniApp Section (unchanged logic) */}
      {enableMiniappFeature && <MiniappSection />}

      {/* Conversation section */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <ConversationSearch onSearchClick={handleSearchClick} />
        {/* Pass metadata, loading state, and handlers to ConversationList */}
        <ConversationList
          groupedChats={groupedChatsMetadata} // Pass grouped metadata
          activeChatId={activeChatId}
          isLoading={isLoadingList} // Pass loading state
          onChatSelect={handleChatSelect}
          onPinToggle={handlePinToggle}
          onDeleteChat={handleDeleteChat}
        />
      </div>

      <SidebarFooter version={version} commitInfo={commitInfo} />
    </div>
  );
};
