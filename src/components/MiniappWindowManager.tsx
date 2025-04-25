// src/components/MiniappWindowManager.tsx
import { MiniappBridgeProvider } from '@/miniapps/components/MiniappBridgeContext'; // Import the provider
import { activeMiniappInstancesAtom } from '@/store/miniapp';
import { useAtomValue } from 'jotai';
import React from 'react';
import { MiniappWindow } from './MiniappWindow';

export const MiniappWindowManager: React.FC = () => {
  const activeInstances = useAtomValue(activeMiniappInstancesAtom);

  return (
    // Wrap the manager with the bridge provider
    <MiniappBridgeProvider>
      <div
        className="miniapp-window-manager pointer-events-none fixed inset-0"
        // Manager itself doesn't capture events, only the windows do
        style={{ zIndex: 50 }} // Base z-index, windows will be higher
      >
        {activeInstances.map((instance) => (
          <MiniappWindow key={instance.instanceId} instance={instance} />
        ))}
      </div>
    </MiniappBridgeProvider>
  );
};
