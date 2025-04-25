// src/miniapps/components/MiniappManager/ConfigurationSection.tsx
import { Label } from '@/components/ui/Label';
import Editor from '@monaco-editor/react';
import Ajv from 'ajv'; // pnpm add ajv
import { useTheme } from 'next-themes';
import React, { useCallback, useEffect, useState } from 'react';

const ajv = new Ajv();

interface ConfigurationSectionProps {
  configSchema: Record<string, any> | null;
  defaultConfig: Record<string, any> | null;
  onStateChange: (
    key: 'configSchema' | 'defaultConfig',
    value: Record<string, any> | null,
  ) => void;
}

export function ConfigurationSection({
  configSchema,
  defaultConfig,
  onStateChange,
}: ConfigurationSectionProps) {
  const { resolvedTheme } = useTheme();
  const [schemaStr, setSchemaStr] = useState('{}');
  const [defaultsStr, setDefaultsStr] = useState('{}');
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);

  // Update local string state when props change
  useEffect(() => {
    try {
      setSchemaStr(JSON.stringify(configSchema ?? {}, null, 2));
      setSchemaError(null);
    } catch {
      setSchemaStr('{\n  "error": "Invalid source JSON"\n}');
      setSchemaError('Failed to stringify schema from state.');
    }
    try {
      setDefaultsStr(JSON.stringify(defaultConfig ?? {}, null, 2));
      setDefaultsError(null);
    } catch {
      setDefaultsStr('{\n  "error": "Invalid source JSON"\n}');
      setDefaultsError('Failed to stringify defaults from state.');
    }
  }, [configSchema, defaultConfig]);

  // --- Schema Handling ---
  const handleSchemaChange = useCallback(
    (value: string | undefined) => {
      const newValue = value || '{}';
      setSchemaStr(newValue);
      try {
        const parsedSchema = JSON.parse(newValue);
        if (
          typeof parsedSchema !== 'object' ||
          parsedSchema === null ||
          Array.isArray(parsedSchema)
        ) {
          throw new Error('Schema must be a JSON object.');
        }
        // Attempt to compile schema for basic validation
        ajv.compile(parsedSchema);
        onStateChange('configSchema', parsedSchema);
        setSchemaError(null);
      } catch (e: any) {
        // Don't update parent state if invalid
        setSchemaError(`Invalid JSON Schema: ${e.message}`);
        // Keep null in parent state? Or last valid? Let's keep null to signal error
        onStateChange('configSchema', null);
      }
    },
    [onStateChange],
  );

  // --- Defaults Handling ---
  const handleDefaultsChange = useCallback(
    (value: string | undefined) => {
      const newValue = value || '{}';
      setDefaultsStr(newValue);
      let parsedDefaults: Record<string, any> | null = null;
      try {
        parsedDefaults = JSON.parse(newValue);
        if (
          typeof parsedDefaults !== 'object' ||
          parsedDefaults === null ||
          Array.isArray(parsedDefaults)
        ) {
          throw new Error('Defaults must be a JSON object.');
        }
        setDefaultsError(null);
        onStateChange('defaultConfig', parsedDefaults);

        // Optional: Validate defaults against current schema (if schema is valid)
        if (configSchema && !schemaError) {
          try {
            const validate = ajv.compile(configSchema);
            if (!validate(parsedDefaults)) {
              setDefaultsError(
                `Defaults do not match schema: ${ajv.errorsText(validate.errors)}`,
              );
              // Maybe keep parsedDefaults in state but show error?
            }
          } catch (schemaCompileError) {
            // Ignore schema compile error here, it's handled separately
          }
        }
      } catch (e: any) {
        setDefaultsError(`Invalid JSON: ${e.message}`);
        onStateChange('defaultConfig', null); // Signal error
      }
    },
    [onStateChange, configSchema, schemaError],
  ); // Add schema dependencies for validation

  const editorOptions: any = {
    minimap: { enabled: false },
    wordWrap: 'on',
    scrollBeyondLastLine: false,
  };
  const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="miniapp-schema">Config Schema (JSON)</Label>
        <p className="text-muted-foreground text-xs">
          Define the structure and types for this Miniapp's configuration using
          JSON Schema.
        </p>
        <div
          className="overflow-hidden rounded-md border"
          style={{ height: '40vh' }}
        >
          <Editor
            height="100%"
            language="json"
            theme={editorTheme}
            value={schemaStr}
            onChange={handleSchemaChange}
            options={editorOptions}
          />
        </div>
        {schemaError && (
          <p className="text-destructive text-sm">{schemaError}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="miniapp-defaults">Default Config (JSON)</Label>
        <p className="text-muted-foreground text-xs">
          Provide default values for the configuration fields defined in the
          schema.
        </p>
        <div
          className="overflow-hidden rounded-md border"
          style={{ height: '40vh' }}
        >
          <Editor
            height="100%"
            language="json"
            theme={editorTheme}
            value={defaultsStr}
            onChange={handleDefaultsChange}
            options={editorOptions}
          />
        </div>
        {defaultsError && (
          <p className="text-destructive text-sm">{defaultsError}</p>
        )}
      </div>
    </div>
  );
}
