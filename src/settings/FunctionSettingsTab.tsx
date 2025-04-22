// src/components/settings/FunctionSettingsTab.tsx
import { Label } from '@/components/ui/Label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import {
  defaultModelAtom,
  defaultSummaryModelAtom,
  generateSummaryAtom,
  groupedAvailableModelsAtom, // Import atom to get available models
} from '@/store/index';
import { NamespacedModelId } from '@/types'; // Import the necessary type
import { useAtom, useAtomValue } from 'jotai'; // Import useAtomValue
import React from 'react';

export const FunctionSettingsTab: React.FC = () => {
  const [generateSummary, setGenerateSummary] = useAtom(generateSummaryAtom);
  // Use useAtom to get both the value and the setter for the default summary model
  const [defaultSummaryModel, setDefaultSummaryModel] = useAtom(
    defaultSummaryModelAtom,
  );
  const [defaultModel, setDefaultModel] = useAtom(defaultModelAtom);
  // Get the list of available models using useAtomValue, similar to RightSidebar[1][2]
  const groupedModels = useAtomValue(groupedAvailableModelsAtom);

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Function Settings</h3>
      {/* Increased vertical spacing for better separation */}
      <div className="space-y-5">
        {/* Summary Chat Title Toggle */}
        <div className="flex items-center justify-between">
          <Label className="cursor-not-allowed" htmlFor="generateSummary">
            Summary Chat Title
          </Label>
          <Switch
            checked={generateSummary}
            id="generateSummary"
            onCheckedChange={setGenerateSummary}
            title="Summary generation not implemented" // Tooltip text
          />
        </div>
        {/* Default  Model Select */}
        <div className="flex items-center justify-between">
          <Label htmlFor="defaultModelSelect">Default Model</Label>
          {/* Use the Select component, similar to RightSidebar[1] */}
          <Select
            // Use the value from the atom, provide empty string fallback for Select[1]
            value={defaultModel ?? ''}
            // Update the atom when a new value is selected[2][4]
            onValueChange={
              (value) => setDefaultModel(value as NamespacedModelId) // Update atom state
            }
          >
            <SelectTrigger className="w-[250px]" id="defaultModelSelect">
              {' '}
              {/* Added ID and adjust width as needed */}
              <SelectValue placeholder="Select default model" />{' '}
              {/* Placeholder text */}
            </SelectTrigger>
            <SelectContent>
              {/* Check if there are models available */}
              {groupedModels.length > 0 ? (
                // Map through grouped models, similar to RightSidebar[1]
                groupedModels.map((group) => (
                  <SelectGroup key={group.providerName}>
                    <SelectLabel>{group.providerName}</SelectLabel>{' '}
                    {/* Display provider name */}
                    {group.models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {' '}
                        {/* Use model ID as value, display model name */}
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))
              ) : (
                // Display if no models are configured/available
                <SelectItem value="none" disabled>
                  No models available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        {/* Default Summary Model Select */}
        <div className="flex items-center justify-between">
          <Label htmlFor="defaultSummaryModelSelect">
            Default Summary Model
          </Label>
          {/* Use the Select component, similar to RightSidebar[1] */}
          <Select
            // Use the value from the atom, provide empty string fallback for Select[1]
            value={defaultSummaryModel ?? ''}
            // Update the atom when a new value is selected[2][4]
            onValueChange={
              (value) => setDefaultSummaryModel(value as NamespacedModelId) // Update atom state
            }
          >
            <SelectTrigger className="w-[250px]" id="defaultSummaryModelSelect">
              {' '}
              {/* Added ID and adjust width as needed */}
              <SelectValue placeholder="Select default model" />{' '}
              {/* Placeholder text */}
            </SelectTrigger>
            <SelectContent>
              {/* Check if there are models available */}
              {groupedModels.length > 0 ? (
                // Map through grouped models, similar to RightSidebar[1]
                groupedModels.map((group) => (
                  <SelectGroup key={group.providerName}>
                    <SelectLabel>{group.providerName}</SelectLabel>{' '}
                    {/* Display provider name */}
                    {group.models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {' '}
                        {/* Use model ID as value, display model name */}
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))
              ) : (
                // Display if no models are configured/available
                <SelectItem value="none" disabled>
                  No models available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Add other function settings here */}
      </div>
    </div>
  );
};
