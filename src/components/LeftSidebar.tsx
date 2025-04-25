// src/components/LeftSidebar.tsx
import {
  activeChatIdAtom,
  clearUnpinnedChatsAtom,
  createNewChatAtom,
  customCharactersAtom,
  deleteChatAtom,
  isCharacterEditorOpenAtom,
  isConversationSearchOpenAtom,
  isSystemSettingsDialogOpenAtom,
  sortedChatsAtom,
  togglePinChatAtom,
} from '@/store/index';
import { Chat, CustomCharacter } from '@/types';
import { formatDateLabel } from '@/utils/dateUtils'; // Import the utility
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useMemo } from 'react';
import { CharacterSection } from './CharacterSection';
import { ConversationList, GroupedChats } from './ConversationList';
import { ConversationSearch } from './ConversationSearch';
import { SidebarActions } from './SidebarActions';
import { SidebarFooter } from './SidebarFooter';
// Import the new child components
import { SidebarHeader } from './SidebarHeader';

// Get branding and config from environment variables or use defaults
const appName = import.meta.env.VITE_APP_NAME || 'Daan';
const slogan = import.meta.env.VITE_APP_SLOGAN || 'Opensource Chat UI';
const logoUrl = import.meta.env.VITE_APP_LOGO_URL || '/logo.png';
const version = import.meta.env.VITE_APP_TAG || 'unknown';
const commitInfo = import.meta.env.VITE_APP_COMMIT_HASH || 'N/A';

export const LeftSidebar: React.FC = () => {
  // --- State Management (Hooks remain here as they orchestrate the sidebar) ---
  const sortedChats = useAtomValue(sortedChatsAtom);
  const characters = useAtomValue(customCharactersAtom);
  const [activeChatId, setActiveChatId] = useAtom(activeChatIdAtom);
  const setIsCharacterEditorOpen = useSetAtom(isCharacterEditorOpenAtom);
  const setIsSystemSettingsOpen = useSetAtom(isSystemSettingsDialogOpenAtom);
  const setConversationSearchOpen = useSetAtom(isConversationSearchOpenAtom);
  const createNewChat = useSetAtom(createNewChatAtom);
  const deleteChat = useSetAtom(deleteChatAtom);
  const togglePinChat = useSetAtom(togglePinChatAtom);
  const clearUnpinnedChats = useSetAtom(clearUnpinnedChatsAtom);

  // --- Event Handlers (Defined here to interact with atoms/state) ---
  const handleSettingsClick = () => setIsSystemSettingsOpen(true);

  const handleNewChatClick = () => createNewChat();

  const handleClearUnpinnedClick = () => {
    // You might want a confirmation dialog here instead of window.confirm
    // This could be a separate modal component triggered here.
    if (
      window.confirm(
        'Are you sure you want to delete all unpinned chats? This cannot be undone.',
      )
    ) {
      clearUnpinnedChats();
    }
  };

  const handleAddCharacterClick = () => setIsCharacterEditorOpen(true);

  const handleInstantiateCharacterClick = (character: CustomCharacter) => {
    console.log('Instantiating character:', character.name);
    createNewChat({
      name: character.name,
      icon: character.icon,
      systemPrompt: character.prompt,
      model: character.model,
      maxHistory: character.maxHistory,
      characterId: character.id,
    });
  };

  const handleSearchClick = () => setConversationSearchOpen(true);

  const handleChatSelect = (chatId: string) => setActiveChatId(chatId);

  const handlePinToggle = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation(); // Prevent chat selection when clicking pin
    togglePinChat(chatId);
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    // The confirmation is handled within ConversationItem's AlertDialog
    e.stopPropagation(); // Prevent chat selection
    deleteChat(chatId);
    // If the deleted chat was active, potentially select another chat or clear active state
    if (activeChatId === chatId) {
      setActiveChatId(null); // Or select the next/previous chat
    }
  };

  // --- Derived Data (Grouping Logic remains close to the data source) ---
  const groupedChats = useMemo(() => {
    const groups: GroupedChats[] = [];
    if (!sortedChats || sortedChats.length === 0) {
      return groups;
    }

    const pinnedChats: Chat[] = [];
    const unpinnedChats: Chat[] = [];

    sortedChats.forEach((chat) => {
      if (chat.isPinned) {
        pinnedChats.push(chat);
      } else {
        unpinnedChats.push(chat);
      }
    });

    if (pinnedChats.length > 0) {
      groups.push({ label: 'Pinned', chats: pinnedChats });
    }

    let currentGroup: GroupedChats | null = null;
    unpinnedChats.forEach((chat) => {
      const dateLabel = formatDateLabel(chat.updatedAt);
      if (!currentGroup || currentGroup.label !== dateLabel) {
        currentGroup = { label: dateLabel, chats: [chat] };
        groups.push(currentGroup);
      } else {
        currentGroup.chats.push(chat);
      }
    });

    return groups;
  }, [sortedChats]);

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
        onClearUnpinnedClick={handleClearUnpinnedClick}
      />

      <CharacterSection
        characters={characters}
        onAddCharacterClick={handleAddCharacterClick}
        onInstantiateCharacterClick={handleInstantiateCharacterClick}
      />

      {/* Conversation section now combines Search and List */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Added wrapper for flex-1 layout */}
        <ConversationSearch onSearchClick={handleSearchClick} />
        <ConversationList
          groupedChats={groupedChats}
          activeChatId={activeChatId}
          onChatSelect={handleChatSelect}
          onPinToggle={handlePinToggle}
          onDeleteChat={handleDeleteChat}
        />
      </div>

      <SidebarFooter version={version} commitInfo={commitInfo} />
    </div>
  );
};
