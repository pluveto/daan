// src/components/MiniappWindowManager.tsx
import { activeMiniappInstancesAtom } from '@/store/miniapp';
import { useAtomValue } from 'jotai';
import React from 'react';
import { MiniappWindow } from './MiniappWindow';

export const MiniappWindowManager: React.FC = () => {
  const activeInstances = useAtomValue(activeMiniappInstancesAtom);

  return (
    <>
      {activeInstances.map((instance) => (
        <MiniappWindow key={instance.instanceId} instance={instance} />
      ))}
    </>
  );
};
