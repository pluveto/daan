import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog'; // Only Dialog needed here
import { TooltipProvider } from '@/components/ui/Tooltip';
import {
  addMcpServerAtom,
  connectAllMcpServersAtom,
  connectMcpServerAtom,
  deleteMcpServerAtom,
  disconnectAllMcpServersAtom,
  disconnectMcpServerAtom,
  McpServerConfig,
  McpServerConfigSse, // Import specific types if needed
  McpServerConfigStdio, // Import specific types if needed
  mcpServersAtom,
  mcpServerStatesAtom,
  toggleMcpServerEnabledAtom,
  updateMcpServerConfigAtom,
} from '@/store/mcp';
import { useAtom, useSetAtom } from 'jotai';
import React, { useCallback, useState } from 'react';
// Adjust import path
import { LuPlug, LuPlus, LuUnplug } from 'react-icons/lu';
import { McpServerForm } from './McpServerForm'; // Adjust import path
import { McpServerList } from './McpServerList'; // Adjust import path
import type { McpServerFormData } from './schema'; // Adjust import path

export const McpSettingsTab: React.FC = () => {
  // Atoms for data and basic actions
  const [servers] = useAtom(mcpServersAtom);
  const [serverStates] = useAtom(mcpServerStatesAtom);
  const connectServer = useSetAtom(connectMcpServerAtom);
  const disconnectServer = useSetAtom(disconnectMcpServerAtom);
  const connectAll = useSetAtom(connectAllMcpServersAtom);
  const disconnectAll = useSetAtom(disconnectAllMcpServersAtom);
  const toggleEnabled = useSetAtom(toggleMcpServerEnabledAtom);
  const deleteServer = useSetAtom(deleteMcpServerAtom);
  const addServer = useSetAtom(addMcpServerAtom);
  const updateServer = useSetAtom(updateMcpServerConfigAtom);

  // State for controlling the Add/Edit form dialog
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(
    null,
  );

  // Handler to open the form for adding or editing
  const handleOpenForm = useCallback(
    (server: McpServerConfig | null = null) => {
      // *** Allow opening the form for ALL types ***
      setEditingServer(server);
      setIsFormOpen(true);
    },
    [],
  );

  // Handler for form submission (add or update)
  const handleFormSubmit = useCallback(
    (data: McpServerFormData) => {
      // The data is already validated by the form's Zod schema
      // We just need to call the correct atom action

      // Prepare the configuration payload, excluding the 'id' for adding
      // and ensuring the correct structure based on 'type'
      let configPayload:
        | Omit<McpServerConfigSse, 'id' | 'enabled'>
        | Omit<McpServerConfigStdio, 'id' | 'enabled'>;

      if (data.type === 'sse') {
        configPayload = {
          name: data.name,
          description: data.description || '',
          type: 'sse',
          url: data.url, // Already validated as string
          autoApproveTools: data.autoApproveTools,
        };
      } else if (data.type === 'stdio') {
        configPayload = {
          name: data.name,
          description: data.description || '',
          type: 'stdio',
          command: data.command, // Already validated as string
          args: data.args, // Already validated as string[]
          autoApproveTools: data.autoApproveTools,
        };
      } else {
        // Should not happen if validation and types are correct
        console.error('Invalid server type submitted:', data);
        return; // Or throw an error
      }

      if (editingServer && data.id) {
        // Update existing server - pass the full data including id
        updateServer({ id: data.id, ...configPayload } as
          | Omit<McpServerConfigSse, 'enabled'>
          | Omit<McpServerConfigStdio, 'enabled'>); // Cast needed as updateServer expects ID
      } else {
        // Add new server - pass payload without id (addServer atom should generate it)
        addServer(configPayload);
      }
      setIsFormOpen(false); // Close dialog handled within McpServerForm onSubmit now
      setEditingServer(null); // Clear editing state
    },
    [addServer, updateServer, editingServer],
  );

  return (
    <TooltipProvider>
      <div className="space-y-6 p-6">
        {/* Header and Global Actions */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">MCP Servers</h3>
            <p className="text-muted-foreground text-sm">
              Manage connections to external tools and resources via MCP.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => connectAll()}
              title="Connect to all enabled servers"
            >
              <LuPlug className="mr-2 h-4 w-4" /> Connect All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectAll()}
              title="Disconnect from all servers"
            >
              <LuUnplug className="mr-2 h-4 w-4" /> Disconnect All
            </Button>
            {/* Dialog Trigger using the shared state */}
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <Button size="sm" onClick={() => handleOpenForm()}>
                <LuPlus className="mr-2 h-4 w-4" /> Add Server
              </Button>
              {/* Form is rendered inside the Dialog managed by state */}
              <McpServerForm
                isOpen={isFormOpen}
                onOpenChange={setIsFormOpen}
                onSubmit={handleFormSubmit}
                editingServer={editingServer}
              />
            </Dialog>
          </div>
        </div>

        {/* Server List Table */}
        <McpServerList
          servers={servers}
          serverStates={serverStates}
          onToggleEnabled={toggleEnabled}
          onConnect={connectServer}
          onDisconnect={disconnectServer}
          onEdit={handleOpenForm} // Pass the handler to open the form for editing
          onDelete={deleteServer}
        />
      </div>
    </TooltipProvider>
  );
};
