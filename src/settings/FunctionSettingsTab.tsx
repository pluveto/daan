// src/components/settings/FunctionSettingsTab.tsx
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { generateSummaryAtom } from '@/store/index';
import { useAtom } from 'jotai';
import React from 'react';

export const FunctionSettingsTab: React.FC = () => {
  const [generateSummary, setGenerateSummary] = useAtom(generateSummaryAtom);

  return (
    <div className="space-y-4 p-4">
            <h3 className="text-lg font-semibold">Function Settings</h3>     {' '}
      <div className="space-y-3">
                {/* Summary Chat Title Toggle */}       {' '}
        <div className="flex items-center justify-between">
                   {' '}
          <Label className="cursor-not-allowed" htmlFor="generateSummary">
                        Summary Chat Title          {' '}
          </Label>
                   {' '}
          <Switch
            checked={generateSummary}
            id="generateSummary"
            onCheckedChange={setGenerateSummary}
            title="Summary generation not implemented"
          />
                 {' '}
        </div>
                {/* Add other function settings here */}     {' '}
      </div>
         {' '}
    </div>
  );
};
