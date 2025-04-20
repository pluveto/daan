import React from 'react';

export const McpSettingsTab: React.FC = () => {
  return (
    <div className="space-y-4 p-4">
            <h3 className="text-lg font-semibold">MCP Settings</h3>     {' '}
      <p className="text-muted-foreground text-sm">
                Manage MCP servers and their tools.      {' '}
      </p>
            {/* TODO: Implement MCP settings UI here */}     {' '}
      <div className="rounded-md border p-4 text-center text-sm">
                MCP settings form and server list go here in a later step.    
         {' '}
      </div>
         {' '}
    </div>
  );
};
