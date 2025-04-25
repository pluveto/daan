// src/miniapps/components/MiniappManager/MiniappEditor.tsx
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { miniappsDefinitionAtom } from '@/store/miniapp';
import type { MiniappDefinition, MiniappPermissions } from '@/types'; // Make sure MiniappPermissions is imported
import Editor from '@monaco-editor/react'; // Install: pnpm add @monaco-editor/react
import { useAtom } from 'jotai';
import React, { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid'; // Install: pnpm add uuid @types/uuid

interface MiniappEditorProps {
  miniappId: string | null; // null for create mode
  onSaveSuccess: () => void; // To close the dialog/signal success
}

const DEFAULT_HTML = (await import(`./sample.html?raw`)).default;

export function MiniappEditor({
  miniappId,
  onSaveSuccess,
}: MiniappEditorProps) {
  const [definitions, setDefinitions] = useAtom(miniappsDefinitionAtom);

  // State for form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [htmlContent, setHtmlContent] = useState(DEFAULT_HTML);
  const [configSchemaStr, setConfigSchemaStr] = useState('{}');
  const [defaultConfigStr, setDefaultConfigStr] = useState('{}');
  const [permissionsStr, setPermissionsStr] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const isCreateMode = miniappId === null;

  // Load existing data when editing
  useEffect(() => {
    setJsonError(null); // Reset JSON error on ID change
    if (miniappId) {
      const existing = definitions.find((d) => d.id === miniappId);
      if (existing) {
        setName(existing.name);
        setDescription(existing.description || '');
        setHtmlContent(existing.htmlContent);
        setConfigSchemaStr(
          JSON.stringify(existing.configSchema || {}, null, 2),
        );
        setDefaultConfigStr(
          JSON.stringify(existing.defaultConfig || {}, null, 2),
        );
        setPermissionsStr(JSON.stringify(existing.permissions || {}, null, 2));
      } else {
        console.error(`Miniapp with ID ${miniappId} not found for editing.`);
        // Optionally reset form or show an error message to the user
        onSaveSuccess(); // Close dialog if record is gone
      }
    } else {
      // Reset form for new miniapp
      setName('');
      setDescription('');
      setHtmlContent(DEFAULT_HTML);
      setConfigSchemaStr('{}');
      setDefaultConfigStr('{}');
      setPermissionsStr('{}');
    }
  }, [miniappId, definitions, onSaveSuccess]);

  // Handle saving (Create or Update)
  const handleSave = () => {
    if (!name.trim()) {
      alert('Miniapp name is required.');
      return;
    }

    let configSchema: Record<string, any> | undefined;
    let defaultConfig: Record<string, any> | undefined;
    let permissions: MiniappPermissions | undefined;

    // Validate and parse JSON fields
    try {
      setJsonError(null); // Clear previous error

      configSchema = JSON.parse(configSchemaStr || '{}');
      if (
        typeof configSchema !== 'object' ||
        configSchema === null ||
        Array.isArray(configSchema)
      ) {
        throw new Error('Config Schema must be a valid JSON object.');
      }

      defaultConfig = JSON.parse(defaultConfigStr || '{}');
      if (
        typeof defaultConfig !== 'object' ||
        defaultConfig === null ||
        Array.isArray(defaultConfig)
      ) {
        throw new Error('Default Config must be a valid JSON object.');
      }

      permissions = JSON.parse(permissionsStr || '{}');
      if (
        typeof permissions !== 'object' ||
        permissions === null ||
        Array.isArray(permissions)
      ) {
        throw new Error('Permissions must be a valid JSON object.');
      }
      // Optional: Add more specific validation for the permissions structure here if needed
    } catch (e: any) {
      setJsonError(`Invalid JSON: ${e.message}`);
      console.error('JSON parsing error during save:', e);
      return; // Prevent saving with invalid JSON
    }

    const now = Date.now();

    if (miniappId) {
      // Update existing Miniapp definition
      setDefinitions((prev) =>
        prev.map((d) =>
          d.id === miniappId
            ? {
                ...d, // Spread existing data first
                name,
                description,
                htmlContent,
                configSchema,
                defaultConfig,
                permissions,
                updatedAt: now,
              }
            : d,
        ),
      );
      console.log(`Updated Miniapp: ${miniappId}`);
    } else {
      // Create new Miniapp definition
      const newDefinition: MiniappDefinition = {
        id: uuidv4(),
        name,
        description,
        htmlContent,
        configSchema,
        defaultConfig,
        permissions,
        enabled: false, // Default to disabled
        createdAt: now,
        updatedAt: now,
        // dependencies: [], // Initialize if needed
        // requiredApis: [], // Initialize if needed
      };
      setDefinitions((prev) => [...prev, newDefinition]);
      console.log(`Created new Miniapp: ${newDefinition.id}`);
    }
    onSaveSuccess(); // Signal success (e.g., close dialog)
  };

  return (
    // Added max height and scroll for potentially long forms/editors
    <div className="max-h-[85vh] space-y-4 overflow-y-auto p-1">
      {/* Added padding to the scrollable container if needed, or keep on parent */}
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="miniapp-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="miniapp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="miniapp-desc">Description</Label>
          <Textarea
            id="miniapp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label>HTML Content</Label>
          <div
            className="overflow-hidden rounded-md border"
            style={{ height: '350px' }}
          >
            {' '}
            {/* Adjusted height */}
            <Editor
              height="100%"
              language="html"
              theme="vs-dark" // Or 'light' based on your app theme
              value={htmlContent}
              onChange={(value) => setHtmlContent(value || '')}
              options={{ minimap: { enabled: false }, wordWrap: 'on' }}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="miniapp-schema">Config Schema (JSON)</Label>
            <Textarea
              id="miniapp-schema"
              value={configSchemaStr}
              onChange={(e) => setConfigSchemaStr(e.target.value)}
              rows={8}
              className="font-mono text-sm" // Monospace and smaller font for code
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="miniapp-defaults">Default Config (JSON)</Label>
            <Textarea
              id="miniapp-defaults"
              value={defaultConfigStr}
              onChange={(e) => setDefaultConfigStr(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="miniapp-permissions">Permissions (JSON)</Label>
          <Textarea
            id="miniapp-permissions"
            value={permissionsStr}
            onChange={(e) => setPermissionsStr(e.target.value)}
            rows={6}
            className="font-mono text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Ex:{' '}
            {`{"readConfig": ["id1", "id2"], "callMiniapp": true, "allowedTauriCommands": ["cmd1"]}`}
          </p>
        </div>

        {/* Display JSON parsing errors */}
        {jsonError && (
          <p className="text-destructive text-sm font-medium">{jsonError}</p>
        )}

        <Button onClick={handleSave} disabled={!name.trim()}>
          {isCreateMode ? 'Create Miniapp' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
