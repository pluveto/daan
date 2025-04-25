// src/settings/ApiSettingsTab.tsx (Updated)
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/Accordion';
import { Button } from '@/components/ui/Button';
// Checkbox is used inside ModelEditor now
// Input is replaced by ValidatedInput mostly
// Label is used inside ValidatedInput
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Separator } from '@/components/ui/Separator';
import { Switch } from '@/components/ui/Switch';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { ValidatedInput } from '@/components/ui/ValidatedInput'; // Import the new component

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
import { LuCheck, LuPlus, LuTrash2 } from 'react-icons/lu'; // Added LuCheck, LuRotateCcw potentially if not using ValidatedInput everywhere
import { v4 as uuidv4 } from 'uuid';
import ModelEditor from './ModelEditor'; // Import the updated ModelEditor

// --- Helper/Parsing/Validation functions ---
// Keep these as they are used for numeric inputs or parsing logic in ValidatedInput
const parseNullableNumber = (value: string): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};
const parseNullablePositiveInt = (value: string): number | null => {
  const num = parseNullableNumber(value);
  return num !== null && Number.isInteger(num) && num > 0 ? num : null;
};
const parseFloatInRange = (
  value: string,
  min: number,
  max: number,
  defaultValue: number,
): number => {
  if (value === '' || value === null || value === undefined)
    return defaultValue;
  const num = Number(value);
  if (Number.isNaN(num) || num < min || num > max) return defaultValue;
  return num;
};
// Simpler parser for optional fields returning null if empty
const parseTrimmedStringOrNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
// Basic non-empty validation
const validateNotEmpty = (value: string): string | null => {
  if (!value || !value.trim()) return 'This field cannot be empty.';
  return null;
};
// Basic URL validation (optional enhancement)
const validateUrlFormat = (value: string): string | null => {
  if (!value) return null; // Allow empty if it's optional
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return 'URL should start with http:// or https://';
  }
  // Basic check for domain part, very rudimentary
  try {
    new URL(value); // Check if URL constructor throws
  } catch (e) {
    return 'Invalid URL format.';
  }
  return null;
};
// Validation for numbers within a specific range
const validateNumberRange =
  (min: number, max: number) =>
  (value: string): string | null => {
    if (value === '') return null; // Allow empty for optional numeric fields
    const num = Number(value);
    if (Number.isNaN(num)) return 'Must be a valid number.';
    if (num < min || num > max)
      return `Value must be between ${min} and ${max}.`;
    return null;
  };
// Validation for positive integers
const validatePositiveInt = (value: string): string | null => {
  if (value === '') return null; // Allow empty for optional numeric fields
  const num = Number(value);
  if (Number.isNaN(num)) return 'Must be a valid number.';
  if (!Number.isInteger(num)) return 'Must be a whole number.';
  if (num <= 0) return 'Must be a positive number.';
  return null;
};
// --- ---

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

  // --- Atom Update Callbacks (Memoized) ---
  const handleSaveGlobalApiKey = useCallback(
    (value: string | null) => setGlobalApiKey(value),
    [setGlobalApiKey],
  );
  const handleSaveGlobalApiBaseUrl = useCallback(
    (value: string | null) => setGlobalApiBaseUrl(value),
    [setGlobalApiBaseUrl],
  );
  const handleSaveGlobalTemperature = useCallback(
    (value: number) => setGlobalTemperature(value),
    [setGlobalTemperature],
  ); // Assuming parse returns number
  const handleSaveGlobalMaxTokens = useCallback(
    (value: number | null) => setGlobalMaxTokens(value),
    [setGlobalMaxTokens],
  );
  const handleSaveGlobalTopP = useCallback(
    (value: number | null) => setGlobalTopP(value),
    [setGlobalTopP],
  );

  const updateProviderField = useCallback(
    (index: number, field: keyof ApiProviderConfig, value: any) => {
      setProviders((currentProviders) => {
        const newProviders = [...currentProviders];
        if (index < 0 || index >= newProviders.length) return currentProviders;
        newProviders[index] = { ...newProviders[index], [field]: value };
        return newProviders;
      });
    },
    [setProviders],
  );

  // Specific save handlers for provider fields using updateProviderField
  const handleSaveProviderName = useCallback(
    (index: number, value: string) => updateProviderField(index, 'name', value),
    [updateProviderField],
  );
  const handleSaveProviderApiKey = useCallback(
    (index: number, value: string | null) =>
      updateProviderField(index, 'apiKey', value),
    [updateProviderField],
  );
  const handleSaveProviderBaseUrl = useCallback(
    (index: number, value: string | null) =>
      updateProviderField(index, 'apiBaseUrl', value),
    [updateProviderField],
  );

  // updateModelField remains the same, used by ModelEditor's callbacks
  const updateModelField = useCallback(
    (
      providerIndex: number,
      modelIndex: number,
      field: keyof ApiModelConfig,
      value: any,
    ) => {
      setProviders((currentProviders) => {
        const newProviders = [...currentProviders];
        if (providerIndex < 0 || providerIndex >= newProviders.length)
          return currentProviders;
        const providerToUpdate = newProviders[providerIndex];
        const newModels = [...(providerToUpdate.models || [])];
        if (modelIndex < 0 || modelIndex >= newModels.length)
          return currentProviders;
        newModels[modelIndex] = { ...newModels[modelIndex], [field]: value };
        newProviders[providerIndex] = {
          ...providerToUpdate,
          models: newModels,
        };
        return newProviders;
      });
    },
    [setProviders],
  );

  // --- Event Handlers (Add/Remove remain the same) ---
  const handleAddProvider = useCallback(() => {
    // Wrap in useCallback
    const newProviderId = `custom-${uuidv4().slice(0, 8)}`;
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
      models: [],
    };
    setProviders((currentProviders) => [...currentProviders, newProvider]);
  }, [setProviders]);

  const handleRemoveProvider = useCallback(
    (providerId: string) => {
      // Wrap in useCallback
      setProviders((currentProviders) =>
        currentProviders.filter((p) => p.id !== providerId),
      );
    },
    [setProviders],
  );

  const handleAddModel = useCallback(
    (providerIndex: number) => {
      // Wrap in useCallback
      const provider = providers[providerIndex];
      if (!provider) return;
      const tempIdSuffix = uuidv4().slice(0, 8);
      const newModelId: NamespacedModelId = `${provider.id}::new-model-${tempIdSuffix}`;
      const newModel: ApiModelConfig = {
        id: newModelId,
        name: `New Model ${tempIdSuffix}`,
        temperature: null,
        maxTokens: null,
        topP: null,
        supportsFileUpload: false,
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
    },
    [providers, setProviders],
  ); // Add providers dependency

  const handleRemoveModel = useCallback(
    (providerIndex: number, modelIndex: number) => {
      // Wrap in useCallback
      setProviders((currentProviders) => {
        const newProviders = [...currentProviders];
        if (providerIndex < 0 || providerIndex >= newProviders.length)
          return currentProviders;
        const providerToUpdate = newProviders[providerIndex];
        const currentModels = providerToUpdate.models || [];
        if (modelIndex < 0 || modelIndex >= currentModels.length)
          return currentProviders;
        const updatedModels = currentModels.filter(
          (_, index) => index !== modelIndex,
        );
        newProviders[providerIndex] = {
          ...providerToUpdate,
          models: updatedModels,
        };
        return newProviders;
      });
    },
    [setProviders],
  );

  // --- Render Logic ---
  return (
    <TooltipProvider>
      <form className="space-y-6 p-6" onSubmit={(e) => e.preventDefault()}>
        {/* --- Global Fallback Settings --- */}
        <section className="space-y-4 rounded-md border p-4">
          <h4 className="text-base font-semibold">Global Fallbacks</h4>
          <p className="text-muted-foreground text-xs">
            These settings are used if not overridden by a specific provider.
          </p>
          {/* Use ValidatedInput for text/password fields */}
          <ValidatedInput
            id="globalApiKey"
            label="Global API Key"
            type="password"
            placeholder="sk-..."
            initialValue={globalApiKey}
            onSave={handleSaveGlobalApiKey}
            parse={parseTrimmedStringOrNull} // Save null if empty
            optional={true} // API Key can be optional globally
          />
          <ValidatedInput
            id="globalApiBaseUrl"
            label="Global API Base URL (Optional)"
            placeholder="e.g., https://api.openai.com/v1"
            initialValue={globalApiBaseUrl}
            onSave={handleSaveGlobalApiBaseUrl}
            parse={parseTrimmedStringOrNull} // Save null if empty
            validate={validateUrlFormat} // Add URL validation
            optional={true}
          />

          {/* Keep numeric inputs as standard Inputs for now, or convert to ValidatedInput */}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ValidatedInput
              id="globalTemperature"
              label="Temperature"
              type="number"
              initialValue={globalTemperature ?? 0.7}
              onSave={handleSaveGlobalTemperature}
              validate={validateNumberRange(0, 2)}
              parse={(v) => parseFloatInRange(v, 0, 2, 0.7)} // Parse on save
              step="0.1"
              min="0"
              max="2"
              optional={false} // Temperature has a default
            />
            <ValidatedInput
              id="globalMaxTokens"
              label="Max Tokens"
              type="number"
              initialValue={globalMaxTokens}
              onSave={handleSaveGlobalMaxTokens}
              validate={validatePositiveInt}
              parse={parseNullablePositiveInt} // Parse on save
              placeholder="Default (None)"
              step="1"
              min="1"
              optional={true}
            />
            <ValidatedInput
              id="globalTopP"
              label="Top P"
              type="number"
              initialValue={globalTopP}
              onSave={handleSaveGlobalTopP}
              validate={validateNumberRange(0, 1)}
              parse={parseNullableNumber} // Parse on save
              placeholder="Default (None)"
              step="0.01"
              min="0"
              max="1"
              optional={true}
            />
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
                key={provider.id}
                value={provider.id}
                className="bg-background mb-2 rounded-md border"
              >
                {/* Header: Switch, Trigger, Delete Button */}
                <div className="flex items-center p-3">
                  <Switch
                    id={`provider-enabled-${provider.id}`}
                    checked={provider.enabled}
                    onCheckedChange={(checked) =>
                      updateProviderField(providerIndex, 'enabled', checked)
                    }
                    className="mr-4 flex-shrink-0"
                    aria-label={`${provider.name} Enabled`}
                  />
                  <AccordionTrigger className="flex-grow p-0 hover:no-underline">
                    <span className="font-medium">
                      {provider.name || `Provider ${provider.id}`}
                    </span>
                  </AccordionTrigger>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 ml-2 h-6 w-6 flex-shrink-0 p-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveProvider(provider.id);
                    }}
                    aria-label={`Remove ${provider.name || 'provider'}`}
                  >
                    <LuTrash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {/* Content */}
                <AccordionContent className="px-4 pt-0 pb-4">
                  <div className="space-y-4 border-t pt-4">
                    <p className="text-muted-foreground text-xs">
                      {provider.description}
                    </p>

                    {/* Provider Name (Editable) */}
                    <ValidatedInput
                      id={`provider-name-${provider.id}`}
                      label="Provider Name"
                      initialValue={provider.name}
                      onSave={(value) =>
                        handleSaveProviderName(providerIndex, value)
                      }
                      validate={validateNotEmpty}
                      parse={parseTrimmedStringOrNull}
                      optional={false} // Provider name is required
                    />

                    {/* Provider Overrides */}
                    <div className="space-y-3 rounded border p-3">
                      <h5 className="text-muted-foreground text-xs font-semibold">
                        Provider Overrides (Optional)
                      </h5>
                      <ValidatedInput
                        id={`provider-apikey-${provider.id}`}
                        label="API Key Override"
                        type="password"
                        placeholder="Use Global Key"
                        initialValue={provider.apiKey}
                        onSave={(value) =>
                          handleSaveProviderApiKey(providerIndex, value)
                        }
                        parse={parseTrimmedStringOrNull}
                        optional={true}
                      />
                      <ValidatedInput
                        id={`provider-baseurl-${provider.id}`}
                        label="API Base URL Override"
                        placeholder="Use Global URL"
                        initialValue={provider.apiBaseUrl}
                        onSave={(value) =>
                          handleSaveProviderBaseUrl(providerIndex, value)
                        }
                        parse={parseTrimmedStringOrNull}
                        validate={validateUrlFormat}
                        optional={true}
                      />
                      {/* Add Temp/Tokens/TopP overrides here if needed, using ValidatedInput */}
                    </div>

                    {/* --- Model List --- */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold">Models</h5>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => handleAddModel(providerIndex)}
                        >
                          <LuPlus className="mr-1 h-3 w-3" /> Add Model
                        </Button>
                      </div>
                      <ScrollArea className="h-48 rounded-md border">
                        <div className="space-y-2 p-2">
                          {/* Use the Memoized ModelEditor Component */}
                          {(provider.models || []).map((model, modelIndex) => (
                            <ModelEditor
                              key={
                                model.id || `new-${modelIndex}-${providerIndex}`
                              } // More robust key
                              providerId={provider.id}
                              providerIndex={providerIndex}
                              model={model}
                              modelIndex={modelIndex}
                              onUpdateModel={updateModelField} // Pass original callback
                              onRemoveModel={handleRemoveModel} // Pass original callback
                            />
                          ))}
                          {(provider.models || []).length === 0 && (
                            <p className="text-muted-foreground p-2 text-center text-xs">
                              No models defined. Click 'Add Model'.
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
          Click the <LuCheck className="mx-1 inline h-4 w-4" /> icon next to a
          field to save changes.
        </div>
      </form>
    </TooltipProvider>
  );
};
