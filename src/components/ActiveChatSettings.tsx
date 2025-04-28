import {
  activeChatDataAtom,
  activeChatSourceDefaultsAtom,
  defaultMaxHistoryAtom,
  groupedAvailableModelsAtom,
  updateChatAtom,
} from '@/store/index';
import { ChatEntity, NamespacedModelId } from '@/types';
import { useAtomValue, useSetAtom } from 'jotai';
import { noop } from 'lodash';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LuInfo } from 'react-icons/lu';
import { toast } from 'sonner';
import { useDebouncedCallback } from 'use-debounce'; // Keep use-debounce
import { IconPicker } from './IconPicker';
import { ModelSelect } from './ModelSelect';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Slider } from './ui/Slider';
import { Textarea } from './ui/Textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/Tooltip';
// Removed useEffectDebugger as it's not needed for the final version

const DEBOUNCE_SAVE_DELAY = 500; // ms delay for debounced save

export const ActiveChatSettings: React.FC = () => {
  const activeChat = useAtomValue(activeChatDataAtom);
  const sourceDefaults = useAtomValue(activeChatSourceDefaultsAtom);
  const updateChat = useSetAtom(updateChatAtom);
  const globalDefaultMaxHistory = useAtomValue(defaultMaxHistoryAtom);
  const groupedModels = useAtomValue(groupedAvailableModelsAtom);

  const availableModelIds = useMemo(
    () => groupedModels.flatMap((group) => group.models.map((m) => m.id)),
    [groupedModels],
  );

  // Local state for form inputs remains the same
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [model, setModel] = useState<NamespacedModelId | ''>('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxHistory, setMaxHistory] = useState<string>('');
  const [temperature, setTemperature] = useState<number | null>(null);
  const [maxTokens, setMaxTokens] = useState<number | null>(null);
  const [topP, setTopP] = useState<number | null>(null);

  // Ref to track if it's the initial mount/sync - crucial for preventing save on load
  const isInitialMount = useRef(true);

  // Sync local form state when activeChatDataAtom changes (Essential logic)
  useEffect(() => {
    isInitialMount.current = true; // Set flag ON during sync
    if (activeChat) {
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

      // Use setTimeout to flip the flag OFF *after* state updates propagate
      // This prevents the first "change" (the sync itself) from triggering saves
      const timer = setTimeout(() => {
        isInitialMount.current = false;
        // console.log('Initial mount/sync complete for chat:', activeChat.id);
      }, 0); // Delay of 0ms pushes execution after current render cycle

      // console.log('Synced form state from activeChat:', activeChat.id);

      return () => clearTimeout(timer); // Cleanup timeout on unmount/change
    } else {
      // Reset form when no chat is active
      setName('');
      setIcon('');
      setModel('');
      setSystemPrompt('');
      setMaxHistory('');
      setTemperature(null);
      setMaxTokens(null);
      setTopP(null);
      // No need to set isInitialMount here, as it's set true when a chat *is* selected
    }
  }, [activeChat?.id]); // Depend only on the chat ID changing

  // --- Core Save Logic ---
  // useCallback dependencies *must* include all state variables read inside
  // to ensure the debounced function closes over the *latest* values when executed.
  const performSave = useCallback(() => {
    // Prevent saving if no active chat (shouldn't happen if called correctly, but safe)
    // The isInitialMount check is now handled *before* calling debouncedSave
    if (!activeChat) return;

    if (!model) {
      toast.error('Model cannot be empty.');
      // Reverting state here might be complex; better to just prevent save.
      return;
    }

    // Validate and parse maxHistory
    let finalMaxHistory: number | null = null;
    if (maxHistory.trim() !== '') {
      const parsed = parseInt(maxHistory, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        finalMaxHistory = parsed;
      } else {
        toast.error(
          'Invalid Max History value. Must be a non-negative number or blank.',
        );
        return; // Prevent saving with invalid input
      }
    } // If blank, finalMaxHistory remains null

    // Construct update object (reading current state values)
    const updates: Partial<
      Omit<ChatEntity, 'id' | 'createdAt' | 'updatedAt'>
    > & { id: string } = {
      id: activeChat.id,
      name: name.trim() || 'Untitled Chat', // Ensure name isn't just whitespace
      icon: icon || '💬', // Default icon if empty
      model: model,
      systemPrompt: systemPrompt,
      maxHistory: finalMaxHistory,
      temperature: temperature,
      maxTokens: maxTokens,
      topP: topP,
    };

    // console.log('Performing save with updates:', updates); // Debug log
    updateChat(updates);
    // Note: Success toast is now only shown on *explicit* save for better UX
  }, [
    activeChat?.id, // Need id to perform the update
    name,
    icon,
    model,
    systemPrompt,
    maxHistory,
    temperature,
    maxTokens,
    topP,
    updateChat, // The function to call
  ]);

  // --- Debounced Save Handler (using the useCallback'd performSave) ---
  const debouncedSave = useDebouncedCallback(performSave, DEBOUNCE_SAVE_DELAY);

  // --- Removed the central useEffect that triggered debouncedSave ---
  // The logic is now moved into individual handlers below.

  // --- Input Handlers (Optimized: Update state AND call debounce) ---

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName); // Update local state for input responsiveness
    if (!isInitialMount.current) {
      debouncedSave(); // Trigger debounce directly after state update
    }
  };

  const handleIconChange = useCallback(
    (newIcon: string) => {
      setIcon(newIcon);
      if (!isInitialMount.current) {
        debouncedSave();
      }
    },
    [debouncedSave, isInitialMount],
  );

  const handleModelChange = useCallback(
    (value: NamespacedModelId | '') => {
      setModel(value);
      if (!isInitialMount.current) {
        debouncedSave();
      }
    },
    [debouncedSave, isInitialMount],
  );

  const handleSystemPromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newPrompt = e.target.value;
      setSystemPrompt(newPrompt);
      console.log('handleSystemPromptChange');
      if (!isInitialMount.current) {
        debouncedSave();
      }
    },
    [debouncedSave, isInitialMount],
  );

  const handleTemperatureChange = useCallback(
    (value: number[]) => {
      // Slider typically gives an array, take the first value
      const newTemp = value[0];
      setTemperature(newTemp);
      if (!isInitialMount.current) {
        debouncedSave();
      }
    },
    [debouncedSave, isInitialMount],
  );

  const handleMaxTokensChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const num = value === '' ? null : parseInt(value, 10);
      // Allow empty string (-> null) or positive integers
      if (value === '' || (num !== null && !isNaN(num) && num > 0)) {
        setMaxTokens(num); // Update state first
        if (!isInitialMount.current) {
          debouncedSave(); // Then trigger save if valid change
        }
      } else if (!num) {
      } else if (value !== '' && (isNaN(num) || num <= 0)) {
        // Handle invalid input case - maybe just update state visually without saving?
        // Or keep the current state and don't save. Let's just update state for now.
        // The actual save won't happen if the state is invalid during performSave,
        // but updating the state here allows the user to see their invalid input.
        // We could add visual feedback later if needed.
        // No save trigger here for clearly invalid numbers (but allow empty)
      }
    },
    [debouncedSave, isInitialMount],
  );

  const handleTopPChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const num = value === '' ? null : parseFloat(value);
      // Allow empty string (-> null) or numbers between 0 and 1 inclusive
      if (
        value === '' ||
        (num !== null && !isNaN(num) && num >= 0 && num <= 1)
      ) {
        setTopP(num); // Update state first
        if (!isInitialMount.current) {
          debouncedSave(); // Then trigger save if valid change
        }
      } else if (!num) {
      } else if (value !== '' && (isNaN(num) || num < 0 || num > 1)) {
        // Handle invalid input (out of range) - similar to maxTokens
        // No save trigger here for clearly invalid numbers (but allow empty)
      }
    },
    [debouncedSave, isInitialMount],
  );

  const handleMaxHistoryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setMaxHistory(newValue); // Update local state immediately (validation happens in performSave)
      if (!isInitialMount.current) {
        debouncedSave(); // Trigger debounce; performSave will validate
      }
    },
    [debouncedSave, isInitialMount],
  );

  // Explicit Save Button Handler
  const handleExplicitSave = () => {
    // Cancel any pending debounced save and trigger immediately
    debouncedSave.flush();

    // Give user feedback *only* if save could proceed (basic checks)
    // More robust would be if performSave returned success/failure
    if (activeChat && model) {
      // Re-check maxHistory validation here just for the toast logic
      let isValidMaxHistory = true;
      if (maxHistory.trim() !== '') {
        const parsed = parseInt(maxHistory, 10);
        if (isNaN(parsed) || parsed < 0) {
          isValidMaxHistory = false;
          // Error toast is shown in performSave if flush triggers it with bad data
        }
      }
      // Show success only if basic requirements met AND maxHistory (if set) is valid
      if (isValidMaxHistory) {
        toast.success('Chat settings saved.');
      }
    } else if (!model) {
      // Error toast for model already shown in performSave if flush triggers it
    }
  };

  noop(handleExplicitSave);

  // Format placeholder function remains the same
  const formatPlaceholder = (
    defaultValue: number | null,
    label: string,
  ): string => {
    return defaultValue !== null
      ? `Default: ${defaultValue}`
      : `Default (${label})`;
  };

  // --- Rendering ---
  const isModelInAvailableList = useMemo(
    () =>
      availableModelIds
        .map((v) => v.toString()) // Ensure comparison with string model ID state
        .includes(model),
    [availableModelIds, model],
  ); // Recalculate only when needed

  if (!activeChat) {
    return (
      <div className="flex h-full items-center justify-center border-l p-4 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        Select a chat to see its settings.
      </div>
    );
  }

  // Render the form - ensure onChange/onValueChange point to the *new handlers*
  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto border-l bg-neutral-100 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-1 text-lg font-semibold text-neutral-950 dark:text-neutral-100">
          Active Chat Settings
        </h2>
        <p className="text-muted-foreground mb-4 text-xs">
          Settings auto-save ~{DEBOUNCE_SAVE_DELAY / 1000}s after you stop
          typing. Leave API fields blank to use defaults.
        </p>

        {/* Display Active Model (Read-only) */}
        <div className="bg-background mb-4 space-y-1 rounded-md border p-3 dark:bg-neutral-950">
          <Label className="text-muted-foreground text-xs font-medium">
            Active Model
          </Label>
          <p className="truncate font-medium" title={activeChat.model}>
            {activeChat.model.split('::')[1] || activeChat.model}
            <span className="text-muted-foreground ml-1 text-xs">
              ({activeChat.model.split('::')[0]})
            </span>
          </p>
        </div>

        {/* Form Fields */}
        <div className="space-y-5">
          {/* Chat Name */}
          <div>
            <Label
              className="mb-1 text-sm font-medium"
              htmlFor="chat-name-settings"
            >
              Chat Name
            </Label>
            <Input
              id="chat-name-settings"
              value={name}
              onChange={handleNameChange}
              type="text"
              autoComplete="off"
            />
          </div>

          {/* Icon (Using the extracted component) */}
          <IconPicker value={icon} onChange={handleIconChange} />

          {/* Model Select */}
          <ModelSelect
            value={model}
            onChange={handleModelChange} // Pass useCallback version
            groupedModels={groupedModels}
            isModelInAvailableList={isModelInAvailableList}
          />

          {/* Max History */}
          <div>
            <Label
              className="mb-1 text-sm font-medium"
              htmlFor="chat-max-history-settings"
            >
              Max History Override
            </Label>
            <Input
              id="chat-max-history-settings"
              min="0"
              step="1"
              placeholder={`Default (${globalDefaultMaxHistory ?? 'Unlimited'})`}
              value={maxHistory} // Bind to string state
              onChange={handleMaxHistoryChange}
              type="number"
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Number of past message pairs sent. Leave blank for global default.
            </p>
          </div>

          {/* System Prompt */}
          <div>
            <Label
              className="mb-1 text-sm font-medium"
              htmlFor="chat-prompt-settings"
            >
              System Prompt Override
            </Label>
            <Textarea
              id="chat-prompt-settings"
              placeholder={'Default system prompt...'} // Show default if available
              rows={6}
              value={systemPrompt}
              onChange={handleSystemPromptChange}
              className="text-sm"
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Instructions for the AI. Leave blank for provider/model default.
            </p>
          </div>

          {/* Temperature */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label htmlFor="chat-temperature-settings">
                Temperature Override
              </Label>
              <span className="text-muted-foreground w-12 rounded-md border bg-transparent px-2 py-0.5 text-right text-sm dark:border-neutral-700">
                {temperature !== null ? temperature.toFixed(1) : 'Def'}
              </span>
            </div>
            <Slider
              id="chat-temperature-settings"
              min={0}
              max={2}
              step={0.1}
              // Provide a sensible fallback value for the slider position if state is null
              value={[temperature ?? sourceDefaults.temperature ?? 0.7]}
              onValueChange={handleTemperatureChange}
              className="my-1"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Default: {sourceDefaults.temperature?.toFixed(1) ?? 'API'}.
              Controls randomness.
              <Tooltip delayDuration={100}>
                <TooltipTrigger className="ml-1 inline-flex align-middle">
                  <LuInfo className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Higher values (e.g., 1.0) make output more random, while lower
                  values (e.g., 0.2) make it more focused and deterministic.
                  Leave blank to use the default.
                </TooltipContent>
              </Tooltip>
            </p>
          </div>

          {/* Max Tokens */}
          <div>
            <Label className="mb-1" htmlFor="chat-maxtokens-settings">
              Max Tokens Override
            </Label>
            <Input
              id="chat-maxtokens-settings"
              type="number"
              min="1"
              step="1"
              placeholder={formatPlaceholder(
                sourceDefaults.maxTokens,
                'API Default',
              )}
              value={maxTokens ?? ''}
              onChange={handleMaxTokensChange}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Max response length. Leave blank for default.
              <Tooltip delayDuration={100}>
                <TooltipTrigger className="ml-1 inline-flex align-middle">
                  <LuInfo className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Maximum number of tokens (words/pieces of words) the AI is
                  allowed to generate in its response.
                </TooltipContent>
              </Tooltip>
            </p>
          </div>

          {/* Top P */}
          <div>
            <Label className="mb-1" htmlFor="chat-topp-settings">
              Top P Override
            </Label>
            <Input
              id="chat-topp-settings"
              type="number"
              min="0"
              max="1"
              step="0.01"
              placeholder={formatPlaceholder(
                sourceDefaults.topP,
                'API Default',
              )}
              value={topP ?? ''}
              onChange={handleTopPChange}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Nucleus sampling. Leave blank for default.
              <Tooltip delayDuration={100}>
                <TooltipTrigger className="ml-1 inline-flex align-middle">
                  <LuInfo className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Alternative to temperature. Considers only tokens comprising
                  the top 'P' probability mass (e.g., 0.1 means only tokens in
                  the top 10% probability are considered). Lower value = less
                  random.
                </TooltipContent>
              </Tooltip>
            </p>
          </div>

          {/* Save Button (Now triggers immediate save + feedback) */}
          {/* <div className="flex justify-end pt-2">
            <Button onClick={handleExplicitSave}>Save Now</Button>
          </div> */}
        </div>
      </div>
    </TooltipProvider>
  );
};
