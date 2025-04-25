// src/components/RightSidebar.tsx
import { ActiveChatSettings } from './ActiveChatSettings';

export function RightSidebar() {
  return (
    // Use ScrollArea for the entire sidebar if needed, or for individual tab content
    <div className="flex h-full flex-col border-l border-neutral-200">
      <ActiveChatSettings />
    </div>
  );
}
