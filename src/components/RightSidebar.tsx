// src/components/RightSidebar.tsx
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  availableModelsAtom, // Use available models
  customModelsAtom, // For managing custom models
  defaultMaxHistoryAtom,
  defaultModelAtom,
  defaultPromptAtom,
  defaultSummaryModelAtom,
  generateSummaryAtom,
  nightModeAtom,
  showTimestampsAtom, // Added
} from '@/store/atoms.ts';
import { exampleModels } from '@/types.ts'; // Import example models for grouping
import { useAtom, useAtomValue } from 'jotai';
import React, { useState } from 'react';
import { Button } from './ui/Button.tsx';
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
import { Switch } from './ui/Switch.tsx';
import { Textarea } from './ui/Textarea.tsx';

export const RightSidebar: React.FC = () => {
  const [apiKey, setApiKey] = useAtom(apiKeyAtom);
  const [apiBaseUrl, setApiBaseUrl] = useAtom(apiBaseUrlAtom);
  const [defaultModel, setDefaultModel] = useAtom(defaultModelAtom);
  const [defaultSummaryModel, setDefaultSummaryModel] = useAtom(
    defaultSummaryModelAtom,
  );
  const [defaultPrompt, setDefaultPrompt] = useAtom(defaultPromptAtom);
  const [defaultMaxHistory, setDefaultMaxHistory] = useAtom(
    defaultMaxHistoryAtom,
  );
  const [nightMode, setNightMode] = useAtom(nightModeAtom);
  const [generateSummary, setGenerateSummary] = useAtom(generateSummaryAtom);
  const [showTimestamps, setShowTimestamps] = useAtom(showTimestampsAtom); // Added
  const [customModels, setCustomModels] = useAtom(customModelsAtom); // Added
  const availableModels = useAtomValue(availableModelsAtom); // Use derived atom

  // Local state for the custom models input field
  const [customModelsInput, setCustomModelsInput] = useState(
    customModels.join(', '),
  );

  // Update customModelsAtom when the input changes (e.g., on blur or button click)
  const handleCustomModelsSave = () => {
    const models = customModelsInput
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0); // Split, trim, and remove empty strings
    setCustomModels(models);
  };

  // Apply dark mode class to HTML element
  React.useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', nightMode);
  }, [nightMode]);

  // Filter custom models that are not already in exampleModels for the "Custom" group
  const customOnlyModels = availableModels.filter(
    (m) => !exampleModels.includes(m),
  );

  return (
    <div className="h-full overflow-y-auto border-l border-neutral-200 bg-neutral-100 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-4 text-lg font-semibold text-neutral-950 dark:text-neutral-100">
        Global Settings
      </h2>
      <div className="space-y-5">
        {/* API Key Input */}
        <div>
          <Label htmlFor="apiKey" className="mb-1">
            OpenAI API Key
          </Label>
          <Input
            id="apiKey"
            type="password" // Keep as password
            placeholder="sk-..."
            value={apiKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setApiKey(e.target.value)
            }
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Stored insecurely in browser localStorage.
          </p>
        </div>

        {/* API Base URL Input */}
        <div>
          <Label htmlFor="apiBaseUrl" className="mb-1">
            API Base URL (Optional)
          </Label>
          <Input
            id="apiBaseUrl"
            type="text"
            placeholder="e.g., https://api.openai.com/v1"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
          />
        </div>

        {/* Custom Models Input */}
        <div>
          <Label htmlFor="customModels" className="mb-1">
            Custom Models (comma-separated)
          </Label>
          <div className="flex gap-2">
            <Input
              id="customModels"
              type="text"
              placeholder="model-1, model-2"
              value={customModelsInput}
              onChange={(e) => setCustomModelsInput(e.target.value)}
              onBlur={handleCustomModelsSave} // Save on blur
            />
            <Button
              onClick={handleCustomModelsSave}
              variant="outline"
              size="sm"
            >
              Save
            </Button>
          </div>
        </div>

        {/* Default Model Select */}
        <div>
          <Label htmlFor="defaultModel" className="mb-1">
            Default Chat Model
          </Label>
          <Select value={defaultModel} onValueChange={setDefaultModel}>
            <SelectTrigger id="defaultModel" className="w-full">
              <SelectValue placeholder="Select default model" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Recommended</SelectLabel>
                {exampleModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectGroup>
              {customOnlyModels.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Custom</SelectLabel>
                  {customOnlyModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Default Summary Model Select */}
        <div>
          <Label htmlFor="defaultSummaryModel" className="mb-1">
            Default Summary Model
          </Label>
          <Select
            value={defaultSummaryModel}
            onValueChange={setDefaultSummaryModel}
          >
            <SelectTrigger id="defaultSummaryModel" className="w-full">
              <SelectValue placeholder="Select summary model" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Recommended</SelectLabel>
                {exampleModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectGroup>
              {customOnlyModels.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Custom</SelectLabel>
                  {customOnlyModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Default System Prompt Textarea */}
        <div>
          <Label htmlFor="defaultPrompt" className="mb-1">
            Default System Prompt
          </Label>
          <Textarea
            id="defaultPrompt"
            rows={4}
            value={defaultPrompt}
            onChange={(e) => setDefaultPrompt(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Default Max History Input */}
        <div>
          <Label htmlFor="defaultMaxHistory" className="mb-1">
            Default Max History (Messages)
          </Label>
          <Input
            id="defaultMaxHistory"
            type="number"
            min="0"
            step="1"
            value={defaultMaxHistory}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDefaultMaxHistory(parseInt(e.target.value, 10) || 0)
            }
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Number of past messages sent to the API.
          </p>
        </div>

        {/* UI Toggles */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="nightMode" className="cursor-pointer">
              Night Mode
            </Label>
            <Switch
              id="nightMode"
              checked={nightMode}
              onCheckedChange={setNightMode}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="showTimestamps" className="cursor-pointer">
              Show Timestamps
            </Label>
            <Switch
              id="showTimestamps"
              checked={showTimestamps}
              onCheckedChange={setShowTimestamps} // Use setter directly
            />
          </div>

          <div className="flex items-center justify-between opacity-50">
            <Label htmlFor="generateSummary" className="cursor-not-allowed">
              Generate Chat Summary (WIP)
            </Label>
            <Switch
              id="generateSummary"
              checked={generateSummary}
              onCheckedChange={setGenerateSummary}
              disabled // Feature not fully implemented yet
              title="Summary generation not implemented"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
