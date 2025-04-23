// src/components/McpToolsPopover.tsx
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Separator } from '@/components/ui/Separator';
import {
  mcpServersAtom,
  mcpServerStatesAtom,
  selectedMcpServerIdsAtom,
} from '@/store/mcp';
import { useAtom, useAtomValue } from 'jotai';
import React from 'react';

export const McpToolsPopover: React.FC = () => {
  const servers = useAtomValue(mcpServersAtom);
  const serverStates = useAtomValue(mcpServerStatesAtom);
  const [selectedServerIds, setSelectedServerIds] = useAtom(
    selectedMcpServerIdsAtom,
  );

  const availableServers = servers.filter((config) => {
    const state = serverStates.get(config.id);
    // Only show servers that are enabled in config AND connected in state
    return config.enabled && state?.isConnected;
  });

  const handleCheckedChange = (serverId: string, checked: boolean | string) => {
    // Type guard for checked state from Shadcn Checkbox
    const isChecked = typeof checked === 'boolean' ? checked : false;
    setSelectedServerIds(
      (prev) =>
        isChecked
          ? [...prev, serverId] // Add server ID if checked
          : prev.filter((id) => id !== serverId), // Remove server ID if unchecked
    );
  };

  return (
    <div className="max-w-xs space-y-3 p-4">
      <h4 className="leading-none font-medium">Available MCP Servers</h4>
      <p className="text-muted-foreground text-sm">
        Select servers whose tools the AI can use in this chat.
      </p>
      <Separator />
      {availableServers.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">
          No enabled and connected MCP servers found. Connect servers in System
          Settings &gt; MCP.
        </p>
      ) : (
        <ScrollArea className="h-[200px] pr-3">
          {' '}
          {/* Limit height and add scroll */}
          <div className="space-y-3">
            {availableServers.map((server) => (
              <div
                key={server.id}
                className="hover:bg-accent hover:text-accent-foreground flex items-start space-x-3 rounded-md border p-3 transition-colors"
              >
                <Checkbox
                  id={`mcp-select-${server.id}`}
                  checked={selectedServerIds.includes(server.id)}
                  onCheckedChange={(checked) =>
                    handleCheckedChange(server.id, checked)
                  }
                  className="mt-1" // Align checkbox better with text
                />
                <div className="grid gap-1.5 leading-snug">
                  <Label
                    htmlFor={`mcp-select-${server.id}`}
                    className="cursor-pointer font-medium"
                  >
                    {server.name}
                  </Label>
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {server.description || 'No description provided.'}
                  </p>
                  {/* Optional: Show some discovered capabilities count */}
                  {/* <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                                           <Badge variant="outline">Tools: {serverStates.get(server.id)?.capabilities?.tools?.length ?? 0}</Badge>
                                           <Badge variant="outline">Resources: {serverStates.get(server.id)?.capabilities?.resources?.length ?? 0}</Badge>
                                      </div> */}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      <Separator />
      <p className="text-muted-foreground text-xs">
        Only enabled and successfully connected servers are shown here. Manage
        servers in System Settings.
      </p>
    </div>
  );
};
