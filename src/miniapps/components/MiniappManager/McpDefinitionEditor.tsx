// src/miniapps/components/MiniappManager/McpDefinitionEditor.tsx
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ScrollArea } from '@/components/ui/ScrollArea'; // For tool list
import { Textarea } from '@/components/ui/Textarea';
import type { McpToolDefinition, MiniappMcpDefinition } from '@/types';
import Editor from '@monaco-editor/react'; // Use Monaco for JSON schema
import Ajv from 'ajv'; // For schema validation
import { useTheme } from 'next-themes';
import React, { useState } from 'react';
import { LuCirclePlus, LuTrash } from 'react-icons/lu';

const ajv = new Ajv();

interface McpDefinitionEditorProps {
  value: MiniappMcpDefinition | undefined;
  onChange: (value: MiniappMcpDefinition | undefined) => void;
}

// Internal state for a tool being edited
interface EditingTool extends McpToolDefinition {
  id: number; // Temporary ID for list key
  schemaString: string; // Store schema as string for editor
  schemaError?: string | null;
}

export const McpDefinitionEditor: React.FC<McpDefinitionEditorProps> = ({
  value,
  onChange,
}) => {
  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';

  // Initialize internal state
  const [serverName, setServerName] = useState(value?.serverInfo?.name || '');
  const [serverVersion, setServerVersion] = useState(
    value?.serverInfo?.version || '1.0.0',
  );
  const [tools, setTools] = useState<EditingTool[]>(() =>
    (value?.tools || []).map((tool, index) => ({
      ...tool,
      id: index,
      schemaString: JSON.stringify(tool.inputSchema || {}, null, 2),
      schemaError: null,
    })),
  );

  const handleServerInfoChange = (
    field: 'name' | 'version',
    fieldValue: string,
  ) => {
    const newName = field === 'name' ? fieldValue : serverName;
    const newVersion = field === 'version' ? fieldValue : serverVersion;
    setServerName(newName);
    setServerVersion(newVersion);
    triggerOnChange(newName, newVersion, tools);
  };

  const handleToolChange = (
    index: number,
    field: keyof McpToolDefinition | 'schemaString',
    fieldValue: any,
  ) => {
    const newTools = [...tools];
    const tool = newTools[index];
    if (!tool) return;

    if (field === 'schemaString') {
      tool.schemaString = fieldValue;
      try {
        const parsedSchema = JSON.parse(fieldValue || '{}');
        // Basic validation (is object?) and try compiling
        if (
          typeof parsedSchema !== 'object' ||
          parsedSchema === null ||
          Array.isArray(parsedSchema)
        ) {
          throw new Error('Schema must be a JSON object.');
        }
        ajv.compile(parsedSchema); // Check if valid JSON schema
        tool.inputSchema = parsedSchema;
        tool.schemaError = null;
      } catch (e: any) {
        tool.inputSchema = {}; // Reset schema on error? Or keep last valid?
        tool.schemaError = `Invalid JSON Schema: ${e.message}`;
      }
    } else if (field === 'inputSchema') {
      // This case shouldn't be called directly if using schemaString
      return;
    } else {
      // Handle name, description changes
      (tool as any)[field] = fieldValue;
    }

    setTools(newTools);
    triggerOnChange(serverName, serverVersion, newTools);
  };

  const handleAddTool = () => {
    const newTool: EditingTool = {
      id: Date.now(), // Simple unique key for React list
      name: `newTool${tools.length + 1}`,
      description: '',
      inputSchema: {},
      schemaString: '{}',
      schemaError: null,
    };
    const newTools = [...tools, newTool];
    setTools(newTools);
    triggerOnChange(serverName, serverVersion, newTools);
  };

  const handleDeleteTool = (index: number) => {
    const newTools = tools.filter((_, i) => i !== index);
    setTools(newTools);
    triggerOnChange(serverName, serverVersion, newTools);
  };

  // Helper to call props.onChange with the correctly formatted data
  const triggerOnChange = (
    name: string,
    version: string,
    currentTools: EditingTool[],
  ) => {
    if (!name.trim()) {
      // Don't propagate change if server name is empty
      onChange(undefined); // Signal invalid/incomplete state
      return;
    }
    const finalTools: McpToolDefinition[] = currentTools
      .filter((t) => !t.schemaError && t.name.trim()) // Only include tools with valid schema and name
      .map(({ id, schemaString, schemaError, ...rest }) => ({ ...rest })); // Remove internal fields

    onChange({
      serverInfo: { name: name.trim(), version: version.trim() || '1.0.0' },
      tools: finalTools,
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Define the MCP server information and the tools (functions) this Miniapp
        will expose if configured as an MCP server in the host application's
        settings.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Server Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mcp-server-name">Server Name</Label>
            <Input
              id="mcp-server-name"
              value={serverName}
              onChange={(e) => handleServerInfoChange('name', e.target.value)}
              placeholder="My Miniapp Tool Server"
            />
            {!serverName.trim() && (
              <p className="text-xs text-destructive mt-1">
                Server name is required to enable MCP definition.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-server-version">Server Version</Label>
            <Input
              id="mcp-server-version"
              value={serverVersion}
              onChange={(e) =>
                handleServerInfoChange('version', e.target.value)
              }
              placeholder="1.0.0"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Tools</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddTool}
            disabled={!serverName.trim()}
          >
            <LuCirclePlus className="mr-2 h-4 w-4" /> Add Tool
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {tools.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No tools defined yet.
            </p>
          )}
          <ScrollArea className="max-h-[40vh] pr-3">
            {' '}
            {/* Limit height */}
            <div className="space-y-4">
              {tools.map((tool, index) => (
                <Card key={tool.id} className="bg-muted/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">
                      Tool #{index + 1}: {tool.name || '(Unnamed)'}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteTool(index)}
                    >
                      <LuTrash className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor={`tool-name-${index}`}>Name</Label>
                      <Input
                        id={`tool-name-${index}`}
                        value={tool.name}
                        onChange={(e) =>
                          handleToolChange(index, 'name', e.target.value)
                        }
                        placeholder="e.g., calculateSum"
                      />
                      {!tool.name.trim() && (
                        <p className="text-xs text-destructive mt-1">
                          Tool name is required.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`tool-desc-${index}`}>Description</Label>
                      <Textarea
                        id={`tool-desc-${index}`}
                        value={tool.description}
                        onChange={(e) =>
                          handleToolChange(index, 'description', e.target.value)
                        }
                        placeholder="Describe what the tool does"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`tool-schema-${index}`}>
                        Input JSON Schema
                      </Label>
                      <div className="rounded-md border overflow-hidden min-h-[150px]">
                        <Editor
                          height="150px" // Fixed height for schema editor
                          language="json"
                          theme={editorTheme}
                          value={tool.schemaString}
                          onChange={(value) =>
                            handleToolChange(
                              index,
                              'schemaString',
                              value || '{}',
                            )
                          }
                          options={{
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                          }}
                        />
                      </div>
                      {tool.schemaError && (
                        <p className="text-xs text-destructive mt-1">
                          {tool.schemaError}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
