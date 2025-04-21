// src/settings/ApiSettingsTab.tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/Accordion';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox'; // If needed for flags
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { ScrollArea } from '@/components/ui/ScrollArea'; // For model lists if long
import { Separator } from '@/components/ui/Separator';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea'; // If description is editable
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  apiProvidersAtom,
  defaultMaxTokensAtom,
  defaultTemperatureAtom,
  defaultTopPAtom,
} from '@/store/settings';
import { ApiModelConfig, ApiProviderConfig, NamespacedModelId } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import React, { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import {
  LuFile,
  LuImage,
  LuInfo,
  LuPlus,
  LuSave,
  LuTrash2,
} from 'react-icons/lu';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// --- Zod Schema Definition ---

// Zod schema for a single model within a provider
const modelSchema = z.object({
  id: z.string().min(1) as z.ZodType<NamespacedModelId>, // Enforce format loosely
  name: z.string().min(1, 'Model name cannot be empty'),
  supportsFileUpload: z.boolean().optional(),
  supportsImageUpload: z.boolean().optional(),
  temperature: z.union([z.number().min(0).max(2), z.null()]).optional(),
  maxTokens: z.union([z.number().int().positive(), z.null()]).optional(),
  topP: z.union([z.number().int().positive(), z.null()]).optional(),
});

// Zod schema for a single provider
const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Provider name cannot be empty'),
  description: z.string().optional(),
  enabled: z.boolean(),
  apiKey: z.string().nullable().optional(),
  apiBaseUrl: z.string().nullable().optional(),
  defaultTemperature: z.union([z.number().min(0).max(2), z.null()]).optional(),
  defaultMaxTokens: z.union([z.number().int().positive(), z.null()]).optional(),
  defaultTopP: z.union([z.number().int().positive(), z.null()]).optional(),
  models: z.array(modelSchema),
});

// Zod schema for the entire API settings form
const apiSettingsSchema = z.object({
  globalApiKey: z.string().optional(),
  globalApiBaseUrl: z.string().optional(),
  globalTemperature: z.number().min(0).max(2),
  globalMaxTokens: z
    .union([z.number().int().positive(), z.null()])
    .transform((val) => ((val as any) === '' ? null : val))
    .nullable(), // Allow empty string for null
  globalTopP: z
    .union([z.number().int().positive(), z.null()])
    .transform((val) => ((val as any) === '' ? null : val))
    .nullable(), // Allow empty string for null
  providers: z.array(providerSchema),
});

type ApiSettingsFormData = z.infer<typeof apiSettingsSchema>;

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

  // --- React Hook Form ---
  const form = useForm<ApiSettingsFormData>({
    resolver: zodResolver(apiSettingsSchema),
    defaultValues: {
      // Populate form with current Jotai state
      globalApiKey: globalApiKey || '',
      globalApiBaseUrl: globalApiBaseUrl || '',
      globalTemperature: globalTemperature ?? 0.7, // Provide default if null
      globalMaxTokens: globalMaxTokens ?? null, // Use empty string for null in input
      globalTopP: globalTopP ?? null, // Use empty string for null in input
      providers: providers || [],
    },
    mode: 'onBlur',
  });

  // `useFieldArray` for managing providers
  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'providers',
    keyName: 'fieldId', // Use a different key name than 'id'
  });

  // Field arrays for models *within* each provider
  // We need a way to manage these dynamically. We can pass the provider index to sub-components or manage directly here.
  // For simplicity here, let's manage model addition/removal directly.

  // Update defaultValues when Jotai atoms change externally
  useEffect(() => {
    form.reset({
      globalApiKey: globalApiKey || '',
      globalApiBaseUrl: globalApiBaseUrl || '',
      globalTemperature: globalTemperature ?? 0.7,
      globalMaxTokens: globalMaxTokens ?? null,
      globalTopP: globalTopP ?? null,
      providers: providers || [],
    });
  }, [
    globalApiKey,
    globalApiBaseUrl,
    globalTemperature,
    globalMaxTokens,
    globalTopP,
    providers,
    form,
  ]);

  // --- Event Handlers ---
  const onSubmit = (data: ApiSettingsFormData) => {
    console.log('Saving API Settings:', data);
    try {
      // Update global settings atoms
      setGlobalApiKey(data.globalApiKey || '');
      setGlobalApiBaseUrl(data.globalApiBaseUrl || '');
      setGlobalTemperature(data.globalTemperature);
      // Handle potential null conversion from empty string
      setGlobalMaxTokens(
        typeof data.globalMaxTokens === 'number' ? data.globalMaxTokens : null,
      );
      setGlobalTopP(
        typeof data.globalTopP === 'number' ? data.globalTopP : null,
      );

      // Update providers atom (ensure IDs are consistent if needed, though field array should handle it)
      setProviders(data.providers);

      toast.success('API settings saved successfully!');
      form.reset(data); // Reset form state to match saved data, clearing dirty state
    } catch (error) {
      console.error('Error saving API settings:', error);
      toast.error('Failed to save API settings.');
    }
  };

  // Handler to add a new model to the 'Custom' provider
  const addCustomModel = () => {
    const customProviderIndex = fields.findIndex((p) => p.id === 'custom');
    if (customProviderIndex === -1) {
      toast.error("Could not find the 'Custom' provider to add a model.");
      return;
    }

    const currentModels =
      form.getValues(`providers.${customProviderIndex}.models`) || [];
    const newModelId: NamespacedModelId = `custom::new-model-${uuidv4().slice(0, 4)}`;
    const newModel: ApiModelConfig = {
      id: newModelId,
      name: 'New Custom Model',
      temperature: null,
      maxTokens: null,
      topP: null,
    };

    // Update the specific provider's models in the form state
    form.setValue(
      `providers.${customProviderIndex}.models`,
      [...currentModels, newModel],
      { shouldDirty: true },
    );
  };

  // Handler to remove a model from the 'Custom' provider
  const removeCustomModel = (modelIndex: number) => {
    const customProviderIndex = fields.findIndex((p) => p.id === 'custom');
    if (customProviderIndex === -1) return; // Should not happen

    const currentModels =
      form.getValues(`providers.${customProviderIndex}.models`) || [];
    const updatedModels = currentModels.filter(
      (_, index) => index !== modelIndex,
    );
    form.setValue(`providers.${customProviderIndex}.models`, updatedModels, {
      shouldDirty: true,
    });
  };

  return (
    <TooltipProvider>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-6">
          {/* --- Global Fallback Settings --- */}
          <section className="space-y-4 rounded-md border p-4">
            <h4 className="text-base font-semibold">Global Fallbacks</h4>
            <p className="text-muted-foreground text-xs">
              These settings are used if not overridden by a specific provider.
            </p>
            <FormField
              control={form.control}
              name="globalApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Global API Key</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="sk-..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="globalApiBaseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Global API Base URL (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., https://api.openai.com/v1"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="globalTemperature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperature</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="globalMaxTokens"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Tokens</FormLabel>
                    <FormControl>
                      {/* Handle null representation */}
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="Default"
                        {...field}
                        value={field.value ?? ''} // Ensure value is string or number
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ''
                              ? null
                              : parseInt(e.target.value, 10),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="globalTopP"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Top P</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="Default"
                        {...field}
                        value={field.value ?? ''} // Ensure value is string or number
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ''
                              ? null
                              : parseInt(e.target.value, 10),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>

          <Separator />

          {/* --- API Providers --- */}
          <section className="space-y-4">
            <h4 className="text-base font-semibold">API Providers</h4>
            <Accordion type="multiple" className="w-full">
              {fields.map((field, providerIndex) => (
                <AccordionItem
                  key={field.fieldId}
                  value={field.id}
                  className="bg-background mb-2 rounded-md border"
                >
                  <div className="flex items-center p-3">
                    <FormField
                      control={form.control}
                      name={`providers.${providerIndex}.enabled`}
                      render={({ field: switchField }) => (
                        <FormItem className="mr-4 flex-shrink-0">
                          <FormControl>
                            <Switch
                              checked={switchField.value}
                              onCheckedChange={switchField.onChange}
                              aria-label={`${form.getValues(`providers.${providerIndex}.name`)} Enabled`}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <AccordionTrigger className="flex-grow p-0 hover:no-underline">
                      <span className="font-medium">{field.name}</span>
                    </AccordionTrigger>
                  </div>
                  <AccordionContent className="px-4 pt-0 pb-4">
                    <div className="space-y-4 border-t pt-4">
                      <p className="text-muted-foreground text-xs">
                        {field.description}
                      </p>
                      {/* Provider Name & Description (Readonly for default providers?) */}
                      {field.id === 'custom' ? (
                        <FormField
                          control={form.control}
                          name={`providers.${providerIndex}.name`}
                          render={({ field: nameField }) => (
                            <FormItem>
                              <FormLabel>Provider Name</FormLabel>
                              <FormControl>
                                <Input {...nameField} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <p className="text-sm font-medium">{field.name}</p>
                      )}
                      {/* Provider Overrides */}
                      <div className="space-y-2 rounded border p-3">
                        <h5 className="text-muted-foreground text-xs font-semibold">
                          Provider Overrides (Optional)
                        </h5>
                        <FormField
                          control={form.control}
                          name={`providers.${providerIndex}.apiKey`}
                          render={({ field: keyField }) => (
                            <FormItem>
                              <FormLabel>API Key Override</FormLabel>
                              <FormControl>
                                <Input
                                  type="password"
                                  placeholder="Use Global Key"
                                  {...keyField}
                                  value={keyField.value ?? ''}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`providers.${providerIndex}.apiBaseUrl`}
                          render={({ field: urlField }) => (
                            <FormItem>
                              <FormLabel>API Base URL Override</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Use Global URL"
                                  {...urlField}
                                  value={urlField.value ?? ''}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {/* Add Temp/Tokens/TopP overrides if needed */}
                      </div>

                      {/* Model List */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-semibold">Models</h5>
                          {field.id === 'custom' && (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={addCustomModel}
                            >
                              <LuPlus className="mr-1 h-3 w-3" /> Add Model
                            </Button>
                          )}
                        </div>

                        <ScrollArea className="h-40 rounded-md border">
                          <div className="space-y-1 p-2">
                            {form
                              .watch(`providers.${providerIndex}.models`)
                              ?.map((model, modelIndex) => (
                                <div
                                  key={model.id}
                                  className="hover:bg-muted/50 flex items-center justify-between rounded p-1.5 text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    {/* Custom model inputs */}
                                    {field.id === 'custom' ? (
                                      <>
                                        <FormField
                                          control={form.control}
                                          name={`providers.${providerIndex}.models.${modelIndex}.name`}
                                          render={({ field: nameField }) => (
                                            <Input
                                              className="h-6 text-xs"
                                              placeholder="Model Display Name"
                                              {...nameField}
                                            />
                                          )}
                                        />
                                        <FormField
                                          control={form.control}
                                          name={`providers.${providerIndex}.models.${modelIndex}.id`}
                                          render={({ field: idField }) => (
                                            <Input
                                              className="h-6 text-xs"
                                              placeholder="namespaced::model-id"
                                              {...idField}
                                            />
                                          )}
                                        />
                                      </>
                                    ) : (
                                      <span>
                                        {model.name}{' '}
                                        <span className="text-muted-foreground">
                                          ({model.id})
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {model.supportsImageUpload && (
                                      <Tooltip delayDuration={100}>
                                        <TooltipTrigger>
                                          <LuImage className="h-3.5 w-3.5 text-blue-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Supports Image Upload</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                    {model.supportsFileUpload && (
                                      <Tooltip delayDuration={100}>
                                        <TooltipTrigger>
                                          <LuFile className="h-3.5 w-3.5 text-green-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Supports File Upload</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                    {/* Add model-specific overrides here if implemented */}
                                    {field.id === 'custom' && (
                                      <Button
                                        type="button"
                                        size="xs"
                                        variant="ghost"
                                        className="text-destructive hover:bg-destructive/10 h-6 w-6 p-1"
                                        onClick={() =>
                                          removeCustomModel(modelIndex)
                                        }
                                      >
                                        <LuTrash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            {form.watch(`providers.${providerIndex}.models`)
                              ?.length === 0 && (
                              <p className="text-muted-foreground p-2 text-center text-xs">
                                No models defined for this provider.
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

          {/* --- Save Button --- */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!form.formState.isDirty || !form.formState.isValid}
            >
              <LuSave className="mr-2 h-4 w-4" /> Save API Settings
            </Button>
          </div>
        </form>
      </Form>
    </TooltipProvider>
  );
};
