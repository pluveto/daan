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
} from '@/store/index';
import { exampleModels } from '@/types'; // Import example models for grouping
import { useAtom, useAtomValue } from 'jotai';
import React, { useState } from 'react';
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
import { Switch } from './ui/Switch';
import { Textarea } from './ui/Textarea';

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

  const [customModels, setCustomModels] = useAtom(customModelsAtom);
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
          <Label className="mb-1" htmlFor="apiKey">
            OpenAI API Key
          </Label>
          <Input
            id="apiKey"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setApiKey(e.target.value)
            }
            placeholder="sk-..."
            type="password" // Keep as password
            value={apiKey}
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Stored insecurely in browser localStorage.
          </p>
        </div>

        {/* API Base URL Input */}
        <div>
          <Label className="mb-1" htmlFor="apiBaseUrl">
            API Base URL (Optional)
          </Label>
          <Input
            id="apiBaseUrl"
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="e.g., https://api.openai.com/v1"
            type="text"
            value={apiBaseUrl}
          />
        </div>

        {/* Custom Models Input */}
        <div>
          <Label className="mb-1" htmlFor="customModels">
            Custom Models (comma-separated)
          </Label>
          <div className="flex gap-2">
            <Input
              id="customModels"
              onBlur={handleCustomModelsSave} // Save on blur
              onChange={(e) => setCustomModelsInput(e.target.value)}
              placeholder="model-1, model-2"
              type="text"
              value={customModelsInput}
            />
            <Button
              onClick={handleCustomModelsSave}
              size="sm"
              variant="outline"
            >
              Save
            </Button>
          </div>
        </div>

        {/* Default Model Select */}
        <div>
          <Label className="mb-1" htmlFor="defaultModel">
            Default Chat Model
          </Label>
          <Select onValueChange={setDefaultModel} value={defaultModel}>
            <SelectTrigger className="w-full" id="defaultModel">
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
          <Label className="mb-1" htmlFor="defaultSummaryModel">
            Default Summary Model
          </Label>
          <Select
            onValueChange={setDefaultSummaryModel}
            value={defaultSummaryModel}
          >
            <SelectTrigger className="w-full" id="defaultSummaryModel">
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
          <Label className="mb-1" htmlFor="defaultPrompt">
            Default System Prompt
          </Label>
          <Textarea
            className="text-sm"
            id="defaultPrompt"
            onChange={(e) => setDefaultPrompt(e.target.value)}
            rows={4}
            value={defaultPrompt}
          />
        </div>

        {/* Default Max History Input */}
        <div>
          <Label className="mb-1" htmlFor="defaultMaxHistory">
            Default Max History (Messages)
          </Label>
          <Input
            id="defaultMaxHistory"
            min="0"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDefaultMaxHistory(Number.parseInt(e.target.value, 10) || 0)
            }
            step="1"
            type="number"
            value={defaultMaxHistory}
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Number of past messages sent to the API.
          </p>
        </div>
      </div>
    </div>
  );
};
