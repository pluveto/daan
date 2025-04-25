// src/miniapps/components/MiniappManager/DependenciesSection.tsx
import { Label } from '@/components/ui/Label';
import { MultiSelect } from '@/components/ui/MultiSelect'; // Placeholder
import { miniappsDefinitionAtom } from '@/store/miniapp';
import { useAtomValue } from 'jotai';
import React, { useMemo } from 'react';

interface DependenciesSectionProps {
  dependencies: string[];
  currentMiniappId: string | null; // To exclude self from selection
  onDependenciesChange: (value: string[]) => void;
}

export function DependenciesSection({
  dependencies,
  currentMiniappId,
  onDependenciesChange,
}: DependenciesSectionProps) {
  const allDefinitions = useAtomValue(miniappsDefinitionAtom);

  // Filter out the current miniapp itself from the options
  const dependencyOptions = useMemo(() => {
    return allDefinitions
      .filter((d) => d.id !== currentMiniappId) // Exclude self
      .map((d) => ({ value: d.id, label: d.name }));
  }, [allDefinitions, currentMiniappId]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Dependencies</h3>
      <p className="text-muted-foreground text-sm">
        Specify other Miniapps that must be enabled and active for this Miniapp
        to run. The host application will check these dependencies before
        activation.
      </p>
      <div>
        <Label>Required Miniapps</Label>
        <MultiSelect
          placeholder="Select dependencies..."
          options={dependencyOptions}
          value={dependencies}
          onValueChange={onDependenciesChange} // Directly pass the setter
        />
      </div>
    </div>
  );
}
