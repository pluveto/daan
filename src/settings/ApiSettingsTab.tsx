// src/settings/ApiSettingsTab.tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/Accordion';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox'; // Use Checkbox for flags
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label'; // Use Label for inputs
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Separator } from '@/components/ui/Separator';
import { Switch } from '@/components/ui/Switch';
// import { Textarea } from '@/components/ui/Textarea'; // If needed
import { TooltipProvider } from '@/components/ui/Tooltip';
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  apiProvidersAtom,
  defaultMaxTokensAtom,
  defaultTemperatureAtom,
  defaultTopPAtom,
} from '@/store/settings';
import { ApiModelConfig, ApiProviderConfig, NamespacedModelId } from '@/types';
import { useAtom } from 'jotai';
import React, { useCallback } from 'react';
import { LuFile, LuImage, LuPlus, LuTrash2 } from 'react-icons/lu';
import { v4 as uuidv4 } from 'uuid';

// Helper function to parse number input, returning null for empty/invalid
const parseNullableNumber = (value: string): number | null => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

// Helper function to parse positive integer input, returning null for empty/invalid/non-positive
const parseNullablePositiveInt = (value: string): number | null => {
  const num = parseNullableNumber(value);
  return num !== null && Number.isInteger(num) && num > 0 ? num : null;
};

// Helper function to parse float in range [0, max], returning defaultValue for empty/invalid
const parseFloatInRange = (
  value: string,
  min: number,
  max: number,
  defaultValue: number,
): number => {
  if (value === '' || value === null || value === undefined) {
    return defaultValue;
  }
  const num = Number(value);
  if (Number.isNaN(num) || num < min || num > max) {
    return defaultValue; // Or handle error differently if needed
  }
  return num;
};

export const ApiSettingsTab: React.FC = () => {
  // --- Jotai State ---
  const [globalApiKey, setGlobalApiKey] = useAtom(apiKeyAtom);
  const [globalApiBaseUrl, setGlobalApiBaseUrl] = useAtom(apiBaseUrlAtom);
  const [globalTemperature, setGlobalTemperature] = useAtom(
    defaultTemperatureAtom,
  );
  const [globalMaxTokens, setGlobalMaxTokens] = useAtom(defaultMaxTokensAtom);
  const [globalTopP, setGlobalTopP] = useAtom(defaultTopPAtom);
  const [providers, setProviders] = useAtom(apiProvidersAtom);

  // --- Helper Functions for Updating Providers/Models Atom ---

  // Update a specific field of a provider
  const updateProviderField = useCallback(
    (index: number, field: keyof ApiProviderConfig, value: any) => {
      setProviders((currentProviders) => {
        const newProviders = [...currentProviders];
        // Ensure the provider exists
        if (index < 0 || index >= newProviders.length) return currentProviders;
        // Create a new object for the updated provider to ensure immutability
        newProviders[index] = {
          ...newProviders[index],
          [field]: value,
        };
        return newProviders;
      });
    },
    [setProviders],
  );

  // Update a specific field of a model within a provider
  const updateModelField = useCallback(
    (
      providerIndex: number,
      modelIndex: number,
      field: keyof ApiModelConfig,
      value: any,
    ) => {
      setProviders((currentProviders) => {
        const newProviders = [...currentProviders];
        // Ensure the provider exists
        if (providerIndex < 0 || providerIndex >= newProviders.length)
          return currentProviders;

        const providerToUpdate = newProviders[providerIndex];
        const newModels = [...(providerToUpdate.models || [])];

        // Ensure the model exists
        if (modelIndex < 0 || modelIndex >= newModels.length)
          return currentProviders;

        // Create a new object for the updated model
        newModels[modelIndex] = {
          ...newModels[modelIndex],
          [field]: value,
        };

        // Create a new object for the updated provider with the new models array
        newProviders[providerIndex] = {
          ...providerToUpdate,
          models: newModels,
        };
        return newProviders;
      });
    },
    [setProviders],
  );

  // --- Event Handlers ---

  const handleAddProvider = () => {
    const newProviderId = `custom-${uuidv4()}`;
    const newProvider: ApiProviderConfig = {
      id: newProviderId,
      name: 'New Custom Provider',
      description: 'Configure your custom API endpoint.',
      enabled: true,
      apiKey: null,
      apiBaseUrl: null,
      defaultTemperature: null,
      defaultMaxTokens: null,
      defaultTopP: null,
      models: [], // Start with no models
    };
    setProviders((currentProviders) => [...currentProviders, newProvider]);
  };

  // Only allow deleting providers with 'custom-' prefix for safety? Or any?
  // This implementation allows deleting any provider.
  const handleRemoveProvider = (providerId: string) => {
    setProviders((currentProviders) =>
      currentProviders.filter((p) => p.id !== providerId),
    );
  };

  const handleAddModel = (providerIndex: number) => {
    const provider = providers[providerIndex];
    if (!provider) return;

    // Generate a unique temporary ID suggestion, user should change it
    const tempIdSuffix = uuidv4().slice(0, 8);
    const newModelId: NamespacedModelId = `${provider.id}::new-model-${tempIdSuffix}`;

    const newModel: ApiModelConfig = {
      id: newModelId,
      name: `New Model ${tempIdSuffix}`,
      temperature: null,
      maxTokens: null,
      topP: null,
      supportsFileUpload: false, // Default flags
      supportsImageUpload: false,
    };

    setProviders((currentProviders) => {
      const newProviders = [...currentProviders];
      if (providerIndex < 0 || providerIndex >= newProviders.length)
        return currentProviders;
      const providerToUpdate = newProviders[providerIndex];
      newProviders[providerIndex] = {
        ...providerToUpdate,
        models: [...(providerToUpdate.models || []), newModel],
      };
      return newProviders;
    });
  };

  const handleRemoveModel = (providerIndex: number, modelIndex: number) => {
    setProviders((currentProviders) => {
      const newProviders = [...currentProviders];
      if (providerIndex < 0 || providerIndex >= newProviders.length)
        return currentProviders;

      const providerToUpdate = newProviders[providerIndex];
      const currentModels = providerToUpdate.models || [];

      if (modelIndex < 0 || modelIndex >= currentModels.length)
        return currentProviders; // Safety check

      const updatedModels = currentModels.filter(
        (_, index) => index !== modelIndex,
      );

      newProviders[providerIndex] = {
        ...providerToUpdate,
        models: updatedModels,
      };
      return newProviders;
    });
  };

  // --- Render Logic ---
  return (
    <TooltipProvider>
      {/* Use a standard form tag to prevent accidental submits, but no RHF logic */}
      <form className="space-y-6 p-6" onSubmit={(e) => e.preventDefault()}>
        {/* --- Global Fallback Settings --- */}
        <section className="space-y-4 rounded-md border p-4">
          <h4 className="text-base font-semibold">Global Fallbacks</h4>
          <p className="text-muted-foreground text-xs">
            These settings are used if not overridden by a specific provider.
          </p>
          <div className="space-y-2">
            <Label htmlFor="globalApiKey">Global API Key</Label>
            <Input
              id="globalApiKey"
              type="password"
              placeholder="sk-..."
              value={globalApiKey ?? ''}
              onChange={(e) => setGlobalApiKey(e.target.value.trim() || null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="globalApiBaseUrl">
              Global API Base URL (Optional)
            </Label>
            <Input
              id="globalApiBaseUrl"
              placeholder="e.g., https://api.openai.com/v1"
              value={globalApiBaseUrl ?? ''}
              onChange={(e) =>
                setGlobalApiBaseUrl(e.target.value.trim() || null)
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="globalTemperature">Temperature</Label>
              <Input
                id="globalTemperature"
                type="number"
                step="0.1"
                min="0"
                max="2"
                // Display the atom value, default to 0.7 if null/undefined for display
                value={globalTemperature ?? 0.7}
                onChange={(e) =>
                  setGlobalTemperature(
                    parseFloatInRange(e.target.value, 0, 2, 0.7),
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="globalMaxTokens">Max Tokens</Label>
              <Input
                id="globalMaxTokens"
                type="number"
                step="1"
                min="1"
                placeholder="Default (None)"
                // Handle null display
                value={globalMaxTokens ?? ''}
                onChange={(e) =>
                  setGlobalMaxTokens(parseNullablePositiveInt(e.target.value))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="globalTopP">Top P</Label>
              <Input
                id="globalTopP"
                type="number"
                step="0.01" // Allow finer control for Top P
                min="0"
                max="1"
                placeholder="Default (None)"
                // Handle null display
                value={globalTopP ?? ''}
                onChange={(e) =>
                  setGlobalTopP(parseNullableNumber(e.target.value))
                }
              />
            </div>
          </div>
        </section>

        <Separator />

        {/* --- API Providers --- */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold">API Providers</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddProvider}
            >
              <LuPlus className="mr-2 h-4 w-4" /> Add New Provider
            </Button>
          </div>
          <Accordion type="multiple" className="w-full">
            {providers.map((provider, providerIndex) => (
              <AccordionItem
                key={provider.id} // Use stable provider ID
                value={provider.id}
                className="bg-background mb-2 rounded-md border"
              >
                <div className="flex items-center p-3">
                  {/* Toggle Switch */}
                  <Switch
                    id={`provider-enabled-${provider.id}`}
                    checked={provider.enabled}
                    onCheckedChange={(checked) =>
                      updateProviderField(providerIndex, 'enabled', checked)
                    }
                    className="mr-4 flex-shrink-0"
                    aria-label={`${provider.name} Enabled`}
                  />
                  {/* Accordion Trigger */}
                  <AccordionTrigger className="flex-grow p-0 hover:no-underline">
                    <span className="font-medium">
                      {provider.name || `Provider ${provider.id}`}{' '}
                      {/* Fallback name */}
                    </span>
                  </AccordionTrigger>
                  {/* Delete Button for Provider */}
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 ml-2 h-6 w-6 flex-shrink-0 p-1"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent accordion toggle
                      // Optional: Add confirmation dialog here
                      handleRemoveProvider(provider.id);
                    }}
                    aria-label={`Remove ${provider.name || 'provider'}`}
                  >
                    <LuTrash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <AccordionContent className="px-4 pt-0 pb-4">
                  <div className="space-y-4 border-t pt-4">
                    <p className="text-muted-foreground text-xs">
                      {provider.description}
                    </p>

                    {/* Provider Name (Editable for custom) */}
                    {/* Let's allow editing name for all for simplicity now */}
                    <div className="space-y-2">
                      <Label htmlFor={`provider-name-${provider.id}`}>
                        Provider Name
                      </Label>
                      <Input
                        id={`provider-name-${provider.id}`}
                        value={provider.name}
                        onChange={(e) =>
                          updateProviderField(
                            providerIndex,
                            'name',
                            e.target.value,
                          )
                        }
                      />
                    </div>

                    {/* Provider Overrides */}
                    <div className="space-y-3 rounded border p-3">
                      <h5 className="text-muted-foreground text-xs font-semibold">
                        Provider Overrides (Optional)
                      </h5>
                      <div className="space-y-2">
                        <Label htmlFor={`provider-apikey-${provider.id}`}>
                          API Key Override
                        </Label>
                        <Input
                          id={`provider-apikey-${provider.id}`}
                          type="password"
                          placeholder="Use Global Key"
                          value={provider.apiKey ?? ''}
                          onChange={(e) =>
                            updateProviderField(
                              providerIndex,
                              'apiKey',
                              e.target.value.trim() || null,
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`provider-baseurl-${provider.id}`}>
                          API Base URL Override
                        </Label>
                        <Input
                          id={`provider-baseurl-${provider.id}`}
                          placeholder="Use Global URL"
                          value={provider.apiBaseUrl ?? ''}
                          onChange={(e) =>
                            updateProviderField(
                              providerIndex,
                              'apiBaseUrl',
                              e.target.value.trim() || null,
                            )
                          }
                        />
                      </div>
                      {/* Add Temp/Tokens/TopP overrides if needed */}
                      {/* Example for Temperature Override */}
                      {/*
                       <div className="space-y-2">
                         <Label htmlFor={`provider-temp-${provider.id}`}>Temperature Override</Label>
                         <Input
                           id={`provider-temp-${provider.id}`}
                           type="number" step="0.1" min="0" max="2"
                           placeholder="Use Global Temp"
                           value={provider.defaultTemperature ?? ''}
                           onChange={(e) => updateProviderField(providerIndex, 'defaultTemperature', parseNullableNumber(e.target.value))}
                         />
                       </div>
                       */}
                    </div>

                    {/* --- Model List --- */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold">Models</h5>
                        {/* Add Model button for *this* provider */}
                        <Button
                          type="button" // Important: prevent form submission
                          size="xs"
                          variant="outline"
                          onClick={() => handleAddModel(providerIndex)}
                        >
                          <LuPlus className="mr-1 h-3 w-3" /> Add Model
                        </Button>
                      </div>

                      <ScrollArea className="h-48 rounded-md border">
                        {' '}
                        {/* Increased height */}
                        <div className="space-y-2 p-2">
                          {(provider.models || []).map((model, modelIndex) => (
                            <div
                              key={model.id || modelIndex} // Prefer stable ID, fallback to index if needed during creation
                              className="bg-muted/30 hover:bg-muted/60 flex flex-col gap-3 rounded p-2 text-xs"
                            >
                              {/* Model Name & ID Inputs */}
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label
                                    htmlFor={`model-name-${provider.id}-${modelIndex}`}
                                    className="text-xs"
                                  >
                                    Display Name
                                  </Label>
                                  <Input
                                    id={`model-name-${provider.id}-${modelIndex}`}
                                    className="h-7 text-xs"
                                    placeholder="Model Display Name"
                                    value={model.name}
                                    onChange={(e) =>
                                      updateModelField(
                                        providerIndex,
                                        modelIndex,
                                        'name',
                                        e.target.value,
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label
                                    htmlFor={`model-id-${provider.id}-${modelIndex}`}
                                    className="text-xs"
                                  >
                                    Model ID (namespace::id)
                                  </Label>
                                  <Input
                                    id={`model-id-${provider.id}-${modelIndex}`}
                                    className="h-7 text-xs"
                                    placeholder={`${provider.id}::your-model-id`}
                                    value={model.id}
                                    onChange={(e) =>
                                      updateModelField(
                                        providerIndex,
                                        modelIndex,
                                        'id',
                                        e.target.value,
                                      )
                                    }
                                  />
                                  {/* Basic validation hint */}
                                  {!/::/.test(model.id) && model.id && (
                                    <p className="text-destructive mt-1 text-[10px]">
                                      ID should contain '::'
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Model Flags & Delete */}
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  {/* File Upload Flag */}
                                  <div className="flex items-center space-x-1.5">
                                    <Checkbox
                                      id={`model-file-${provider.id}-${modelIndex}`}
                                      checked={!!model.supportsFileUpload}
                                      onCheckedChange={(checked) =>
                                        updateModelField(
                                          providerIndex,
                                          modelIndex,
                                          'supportsFileUpload',
                                          !!checked,
                                        )
                                      }
                                    />
                                    <Label
                                      htmlFor={`model-file-${provider.id}-${modelIndex}`}
                                      className="flex cursor-pointer items-center text-xs font-normal"
                                    >
                                      <LuFile className="mr-1 h-3.5 w-3.5 text-green-600" />{' '}
                                      File Upload
                                    </Label>
                                  </div>
                                  {/* Image Upload Flag */}
                                  <div className="flex items-center space-x-1.5">
                                    <Checkbox
                                      id={`model-image-${provider.id}-${modelIndex}`}
                                      checked={!!model.supportsImageUpload}
                                      onCheckedChange={(checked) =>
                                        updateModelField(
                                          providerIndex,
                                          modelIndex,
                                          'supportsImageUpload',
                                          !!checked,
                                        )
                                      }
                                    />
                                    <Label
                                      htmlFor={`model-image-${provider.id}-${modelIndex}`}
                                      className="flex cursor-pointer items-center text-xs font-normal"
                                    >
                                      <LuImage className="mr-1 h-3.5 w-3.5 text-blue-600" />{' '}
                                      Image Upload
                                    </Label>
                                  </div>
                                </div>

                                {/* Delete button for model */}
                                <Button
                                  type="button" // Important
                                  size="xs"
                                  variant="ghost"
                                  className="text-destructive hover:bg-destructive/10 h-6 w-6 p-1"
                                  onClick={() =>
                                    handleRemoveModel(providerIndex, modelIndex)
                                  }
                                  aria-label={`Remove ${model.name || 'custom model'}`}
                                >
                                  <LuTrash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          {/* Message when no models */}
                          {(provider.models || []).length === 0 && (
                            <p className="text-muted-foreground p-2 text-center text-xs">
                              No models defined for this provider. Click 'Add
                              Model' to add one.
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <Separator />

        <div className="text-muted-foreground flex justify-end text-sm">
          Settings are saved automatically when changed.
        </div>
      </form>
    </TooltipProvider>
  );
};
