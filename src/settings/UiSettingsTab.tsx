// src/components/settings/UiSettingsTab.tsx
import {
  nightModeAtom,
  showEstimatedTokensAtom,
  showTimestampsAtom,
} from '@/store/index';
import { useAtom } from 'jotai';
import React from 'react';
import { Label } from '../components/ui/Label';
import { Switch } from '../components/ui/Switch';

export const UiSettingsTab: React.FC = () => {
  const [nightMode, setNightMode] = useAtom(nightModeAtom);
  const [showTimestamps, setShowTimestamps] = useAtom(showTimestampsAtom);
  const [showEstimatedTokens, setShowEstimatedTokens] = useAtom(
    showEstimatedTokensAtom,
  ); // Apply dark mode class to HTML element
  // This effect should probably live higher up, e.g., in App.tsx or a root layout.
  // Moving it here means it only runs when this tab is mounted, which might not be desired.
  // Let's keep it in App.tsx for now as it affects the whole app.
  /*
      React.useEffect(() => {
        const root = window.document.documentElement;
        root.classList.toggle('dark', nightMode);
      }, [nightMode]);
      */

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">UI Settings</h3>
      <div className="space-y-5">
        {/* Night Mode Toggle */}
        <div className="flex items-center justify-between h-8">
          <Label className="cursor-pointer" htmlFor="nightMode">
            Night Mode
          </Label>

          <Switch
            checked={nightMode}
            id="nightMode"
            onCheckedChange={setNightMode}
          />
        </div>
        {/* Show Timestamps Toggle */}
        <div className="flex items-center justify-between h-8">
          <Label className="cursor-pointer" htmlFor="showTimestamps">
            Show Timestamps
          </Label>

          <Switch
            checked={showTimestamps}
            id="showTimestamps"
            onCheckedChange={setShowTimestamps}
          />
        </div>
        {/* Show Estimated Tokens Toggle */}
        <div className="flex items-center justify-between h-8">
          <Label className="cursor-pointer" htmlFor="showEstimatedTokens">
            Show Estimated Tokens
          </Label>

          <Switch
            checked={showEstimatedTokens}
            id="showEstimatedTokens"
            onCheckedChange={setShowEstimatedTokens}
          />
        </div>
      </div>
    </div>
  );
};
