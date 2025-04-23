// src/components/RightSidebar.tsx
import {
  activeChatAtom,
  activeChatSourceDefaultsAtom,
  defaultMaxHistoryAtom,
  groupedAvailableModelsAtom,
  updateChatAtom,
} from '@/store/index';
// Import necessary atoms

import { commonEmojis, NamespacedModelId } from '@/types';
import { useAtomValue, useSetAtom } from 'jotai';
import { debounce } from 'lodash'; // Use debounce for input saving
import React, { useEffect, useMemo, useState } from 'react';
import { LuInfo } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/Select';
import { Slider } from './ui/Slider'; // Use Slider for Temperature

import { Textarea } from './ui/Textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/Tooltip';

const DEBOUNCE_SAVE_DELAY = 500; // ms

export const RightSidebar: React.FC = () => {
  const activeChat = useAtomValue(activeChatAtom);
  const sourceDefaults = useAtomValue(activeChatSourceDefaultsAtom); // Get defaults for placeholders
  const updateChat = useSetAtom(updateChatAtom);
  const globalDefaultMaxHistory = useAtomValue(defaultMaxHistoryAtom);

  // Get grouped models for the dropdown
  const groupedModels = useAtomValue(groupedAvailableModelsAtom);
  const availableModelIds = useMemo(
    () => groupedModels.flatMap((group) => group.models.map((m) => m.id)),
    [groupedModels],
  );

  // Local state to manage form inputs, synced with activeChat
  const [temperature, setTemperature] = useState<number | null>(null);
  const [maxTokens, setMaxTokens] = useState<number | null>(null);
  const [topP, setTopP] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [model, setModel] = useState<NamespacedModelId | ''>(''); // Use NamespacedModelId or empty string
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxHistory, setMaxHistory] = useState<string>(''); // Store as string for input

  // Update local state when active chat changes
  useEffect(() => {
    if (activeChat) {
      // Use chat override if set, otherwise null (to indicate using default)
      setName(activeChat.name);
      setIcon(activeChat.icon);
      setModel(activeChat.model);
      setSystemPrompt(activeChat.systemPrompt);
      setMaxHistory(
        activeChat.maxHistory === null ? '' : String(activeChat.maxHistory),
      );
      setTemperature(activeChat.temperature ?? null);
      setMaxTokens(activeChat.maxTokens ?? null);
      setTopP(activeChat.topP ?? null);
    } else {
      // Reset when no chat is active
      setName('');
      setIcon('');
      setModel('');
      setSystemPrompt('');
      setMaxHistory('');
      setTemperature(null);
      setMaxTokens(null);
      setTopP(null);
    }
  }, [activeChat]);

  // Debounced function to save changes to Jotai state
  const debouncedUpdateChat = React.useCallback(
    debounce(
      (
        updates: Partial<
          Pick<
            Exclude<typeof activeChat, null>,
            | 'name'
            | 'icon'
            | 'temperature'
            | 'maxTokens'
            | 'topP'
            | 'model'
            | 'systemPrompt'
            | 'maxHistory'
          >
        >,
      ) => {
        if (activeChat) {
          console.log('Updating chat overrides:', updates);
          updateChat({ id: activeChat.id, ...updates });
        }
      },
      DEBOUNCE_SAVE_DELAY,
    ),
    [activeChat?.id, updateChat], // Recreate debounce if activeChat ID changes
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedUpdateChat.cancel();
    };
  }, [debouncedUpdateChat]);

  const handleTemperatureChange = (value: number[]) => {
    const newTemp = value[0];
    setTemperature(newTemp);
  };

  const handleMaxTokensChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string for null, otherwise parse number
    const newMaxTokens = value === '' ? null : parseInt(value, 10);
    // Only update if it's null or a valid positive integer
    if (newMaxTokens === null || (!isNaN(newMaxTokens) && newMaxTokens > 0)) {
      setMaxTokens(newMaxTokens);
    } else if (value === '') {
      // Handle case where user clears the input
      setMaxTokens(null);
    }
  };

  const handleTopPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const newTopP = value === '' ? null : parseInt(value, 10);
    if (newTopP === null || (!isNaN(newTopP) && newTopP > 0)) {
      setTopP(newTopP);
      debouncedUpdateChat({ topP: newTopP });
    } else if (value === '') {
      setTopP(null);
    }
  };

  // Helper to format placeholder text
  const formatPlaceholder = (
    defaultValue: number | null,
    label: string,
  ): string => {
    return defaultValue !== null
      ? `Default: ${defaultValue}`
      : `Default (${label})`;
  };

  const handleSave = () => {
    if (!activeChat) return;
    if (!model) {
      toast.error('Model cannot be empty.'); // Basic validation
      return;
    }

    const parsedMaxHistory =
      maxHistory.trim() === '' ? null : Number.parseInt(maxHistory, 10);
    const finalMaxHistory =
      parsedMaxHistory === null ||
      isNaN(parsedMaxHistory) ||
      parsedMaxHistory < 0
        ? null
        : parsedMaxHistory;

    debouncedUpdateChat({
      name: name.trim() || 'Untitled Chat',
      icon: icon || '💬',
      model: model, // Save the selected NamespacedModelId
      systemPrompt,
      maxHistory: finalMaxHistory,
      temperature,
      maxTokens,
      topP,
    });
  };
  const handleEmojiSelect = (selectedEmoji: string) => setIcon(selectedEmoji);

  const isModelInAvailableList = availableModelIds.includes(
    model as NamespacedModelId,
  );

  if (!activeChat) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center border-l p-4 text-center text-sm dark:border-neutral-700">
        Select a chat to see its settings.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto border-l border-neutral-200 bg-neutral-100 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-1 text-lg font-semibold text-neutral-950 dark:text-neutral-100">
          Chat Parameters
        </h2>
        <p className="text-muted-foreground mb-4 text-xs">
          Override model parameters for this chat only. Leave blank to use
          defaults.
        </p>
        <div className="bg-background mb-4 space-y-1 rounded-md border p-3 dark:bg-neutral-950">
          <Label className="text-muted-foreground text-xs font-medium">
            Active Model
          </Label>
          <p className="truncate font-medium" title={activeChat.model}>
            {activeChat.model.split('::')[1] || activeChat.model}{' '}
            {/* Show base name */}
            <span className="text-muted-foreground ml-1 text-xs">
              ({activeChat.model.split('::')[0]})
            </span>{' '}
            {/* Show provider */}
          </p>
        </div>

        <div className="space-y-6">
          {/* Chat Name */}
          <div>
            <Label className="mb-1 text-sm font-medium" htmlFor="chatNameModal">
              Chat Name
            </Label>
            <Input
              id="chatNameModal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
            />
          </div>
          {/* Icon Input and Picker */}
          <div>
            <Label className="mb-1 text-sm font-medium" htmlFor="chatIconModal">
              Icon (Emoji)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="chatIconModal"
                className="w-20 p-1 text-center text-xl"
                maxLength={2}
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                type="text"
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
          {/* Model Select (Using grouped list) */}
          <div>
            <Label
              className="mb-1 text-sm font-medium"
              htmlFor="chatModelModal"
            >
              Model
            </Label>
            <Select
              onValueChange={(value) => setModel(value as NamespacedModelId)}
              value={model}
            >
              <SelectTrigger className="w-full" id="chatModelModal">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {groupedModels.map((group) => (
                  <SelectGroup key={group.providerName}>
                    <SelectLabel>{group.providerName}</SelectLabel>
                    {group.models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                {model && !isModelInAvailableList && (
                  <SelectGroup>
                    <SelectLabel className="text-destructive">
                      Current (Unavailable)
                    </SelectLabel>
                    <SelectItem
                      key={model}
                      value={model}
                      className="text-destructive"
                    >
                      {model.split('::')[1] || model}
                    </SelectItem>
                  </SelectGroup>
                )}
                {groupedModels.length === 0 && !model && (
                  <SelectItem value="none" disabled>
                    No models available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          {/* Max History Input */}
          <div>
            <Label
              className="mb-1 text-sm font-medium"
              htmlFor="chatMaxHistoryModal"
            >
              Max History (Messages)
            </Label>
            <Input
              id="chatMaxHistoryModal"
              min="0"
              step="1"
              placeholder={`Default (${globalDefaultMaxHistory ?? 'None'})`}
              value={maxHistory}
              onChange={(e) => setMaxHistory(e.target.value)}
              type="number"
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Leave blank to use the global default.
            </p>
          </div>
          {/* System Prompt */}
          <div>
            <Label
              className="mb-1 text-sm font-medium"
              htmlFor="chatSystemPromptModal"
            >
              System Prompt
            </Label>
            <Textarea
              id="chatSystemPromptModal"
              placeholder="e.g., You are a helpful assistant."
              rows={5}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Temperature Slider */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label htmlFor="chat-temperature">Temperature</Label>
              <span className="bg-background text-muted-foreground w-12 rounded-md border px-2 py-0.5 text-right text-sm dark:bg-neutral-800">
                {temperature !== null ? temperature.toFixed(1) : '-'}{' '}
                {/* Display current or '-' */}
              </span>
            </div>
            <Slider
              id="chat-temperature"
              min={0}
              max={2}
              step={0.1}
              // Use local state value if not null, otherwise use source default for slider position
              value={[temperature ?? sourceDefaults.temperature ?? 0.7]}
              onValueChange={handleTemperatureChange}
              className="my-1"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Default: {sourceDefaults.temperature?.toFixed(1) ?? 'N/A'}
              <Tooltip delayDuration={100}>
                <TooltipTrigger className="ml-1 inline-flex">
                  <LuInfo className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Higher values (e.g., 0.8) make output more random, lower
                  values (e.g., 0.2) make it more focused.
                </TooltipContent>
              </Tooltip>
            </p>
          </div>

          {/* Max Tokens Input */}
          <div>
            <Label htmlFor="chat-max-tokens">Max Tokens</Label>
            <Input
              id="chat-max-tokens"
              type="number"
              min="1"
              step="1"
              placeholder={formatPlaceholder(
                sourceDefaults.maxTokens,
                'API Default',
              )}
              // Use local state value if not null, otherwise empty string for input
              value={maxTokens ?? ''}
              onChange={handleMaxTokensChange}
              className="mt-1"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Limit the maximum number of tokens generated in the response.
              <Tooltip delayDuration={100}>
                <TooltipTrigger className="ml-1 inline-flex">
                  <LuInfo className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Controls the maximum length of the AI's response. Leave blank
                  to use the model's default limit.
                </TooltipContent>
              </Tooltip>
            </p>
          </div>

          {/* Top P Input */}
          <div>
            <Label htmlFor="chat-top-k">Top P</Label>
            <Input
              id="chat-top-k"
              type="number"
              min="1"
              step="1"
              placeholder={formatPlaceholder(
                sourceDefaults.topP,
                'API Default',
              )}
              value={topP ?? ''}
              onChange={handleTopPChange}
              className="mt-1"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Sample from the K most likely next tokens.
              <Tooltip delayDuration={100}>
                <TooltipTrigger className="ml-1 inline-flex">
                  <LuInfo className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Filters the vocabulary to the K most likely tokens at each
                  step. Lower values restrict creativity. (Not supported by all
                  models).
                </TooltipContent>
              </Tooltip>
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} className="mr-2">
              Save
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
