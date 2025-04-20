// src/components/ChatSettingsModal.tsx
import {
  activeChatAtom,
  availableModelsAtom, // Use combined models list
  defaultMaxHistoryAtom, // To show default value
  isChatSettingsModalOpenAtom,
  updateChatAtom,
} from '@/store/index.ts';
import { commonEmojis, exampleModels } from '@/types.ts'; // Import emojis and example models
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useEffect, useState } from 'react';
import { Button } from './ui/Button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/Dialog.tsx';
import { Input } from './ui/Input.tsx';
import { Label } from './ui/Label.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/Select.tsx';
import { Textarea } from './ui/Textarea.tsx';

export const ChatSettingsModal: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(isChatSettingsModalOpenAtom);
  const [activeChat] = useAtom(activeChatAtom);
  const updateChat = useSetAtom(updateChatAtom);
  const availableModels = useAtomValue(availableModelsAtom);
  const globalDefaultMaxHistory = useAtomValue(defaultMaxHistoryAtom);

  // Local state for form fields
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [model, setModel] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxHistory, setMaxHistory] = useState<string>(''); // Store as string for input flexibility

  // Populate local state when modal opens or active chat changes
  useEffect(() => {
    if (isOpen && activeChat) {
      setName(activeChat.name);
      setIcon(activeChat.icon);
      setModel(activeChat.model);
      setSystemPrompt(activeChat.systemPrompt);
      // Set maxHistory input: show chat's value, or empty string if using global default (null)
      setMaxHistory(
        activeChat.maxHistory === null ? '' : String(activeChat.maxHistory),
      );
    }
    // Reset state if modal closes without an active chat (optional)
    if (!isOpen) {
      // Could reset fields here if desired
    }
  }, [isOpen, activeChat]);

  const handleSave = () => {
    if (!activeChat) {
      return;
    }

    // Parse maxHistory: null if empty/invalid, otherwise number
    const parsedMaxHistory =
      maxHistory.trim() === '' ? null : Number.parseInt(maxHistory, 10);
    const finalMaxHistory =
      parsedMaxHistory === null ||
      isNaN(parsedMaxHistory) ||
      parsedMaxHistory < 0
        ? null
        : parsedMaxHistory;

    updateChat({
      // Ensure name is not empty
      icon: icon || '💬',

      id: activeChat.id,

      maxHistory: finalMaxHistory,
      // Default icon if empty
      model,
      name: name.trim() || 'Untitled Chat',
      systemPrompt, // Save parsed value
    });
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleEmojiSelect = (selectedEmoji: string) => {
    setIcon(selectedEmoji);
  };

  // Filter custom models for the "Custom" group
  const customOnlyModels = availableModels.filter(
    (m) => !exampleModels.includes(m),
  );

  return (
    <Dialog onOpenChange={handleClose} open={isOpen}>
      <DialogContent className="sm:max-w-md">
        {' '}
        {/* Adjusted width */}
        <DialogHeader>
          <DialogTitle>Chat Settings</DialogTitle>
          <DialogDescription>
            Customize the behavior and appearance of this chat.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {activeChat ? (
            <div className="space-y-4">
              {/* Chat Name */}
              <div>
                <Label className="mb-1 text-sm font-medium" htmlFor="chatName">
                  Chat Name
                </Label>
                <Input
                  id="chatName"
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  value={name}
                />
              </div>

              {/* Icon Input and Picker */}
              <div>
                <Label className="mb-1 text-sm font-medium" htmlFor="chatIcon">
                  Icon (Emoji)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    className="w-16 p-1 text-center text-xl" // Larger text for emoji
                    id="chatIcon"
                    maxLength={2} // Limit to typical emoji length
                    onChange={(e) => setIcon(e.target.value)}
                    type="text"
                    value={icon}
                  />
                  <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto rounded border p-1">
                    {commonEmojis.map((emoji) => (
                      <button
                        aria-label={`Select ${emoji}`}
                        className="hover:bg-accent rounded p-1 text-xl"
                        key={emoji}
                        onClick={() => handleEmojiSelect(emoji)}
                        title={`Select ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Model Select */}
              <div>
                <Label className="mb-1 text-sm font-medium" htmlFor="chatModel">
                  Model
                </Label>
                <Select onValueChange={setModel} value={model}>
                  <SelectTrigger className="w-full" id="chatModel">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Recommended</SelectLabel>
                      {exampleModels.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {customOnlyModels.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Custom</SelectLabel>
                        {customOnlyModels.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {/* Ensure current model is selectable even if not in lists */}
                    {!availableModels.includes(model) && model && (
                      <SelectGroup>
                        <SelectLabel>Current (Not in lists)</SelectLabel>
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Max History Input */}
              <div>
                <Label
                  className="mb-1 text-sm font-medium"
                  htmlFor="chatMaxHistory"
                >
                  Max History (Messages)
                </Label>
                <Input
                  id="chatMaxHistory"
                  min="0"
                  onChange={(e) => setMaxHistory(e.target.value)}
                  placeholder={`Default (${globalDefaultMaxHistory})`}
                  step="1"
                  type="number"
                  value={maxHistory}
                />
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Leave blank to use the global default.
                </p>
              </div>

              {/* System Prompt */}
              <div>
                <Label
                  className="mb-1 text-sm font-medium"
                  htmlFor="chatSystemPrompt"
                >
                  System Prompt
                </Label>
                <Textarea
                  className="text-sm"
                  id="chatSystemPrompt"
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="e.g., You are a helpful assistant."
                  rows={5}
                  value={systemPrompt}
                />
              </div>
            </div>
          ) : (
            <p className="text-neutral-500 dark:text-neutral-400">
              No active chat selected.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={!activeChat} onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
