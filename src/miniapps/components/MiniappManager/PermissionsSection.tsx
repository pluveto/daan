// src/miniapps/components/MiniappManager/PermissionsSection.tsx
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';
// Assume MultiSelect component exists or use shadcn Combobox multi-select pattern
import { MultiSelect } from '@/components/ui/MultiSelect'; // Placeholder
import { miniappsDefinitionAtom } from '@/store/miniapp';
import { MiniappPermissions } from '@/types';
import { useAtomValue } from 'jotai';
import React from 'react';

interface PermissionsSectionProps {
  permissions: MiniappPermissions | null;
  onPermissionsChange: (value: MiniappPermissions | null) => void;
}

// Define known permissions for easier management
type BooleanPermission = 'useStorage' | 'callMiniapp'; // Add others if needed
type ArrayPermission = 'readConfig' | 'allowedTauriCommands'; // | 'callMiniapp' if specific targets are needed

export function PermissionsSection({
  permissions,
  onPermissionsChange,
}: PermissionsSectionProps) {
  const allDefinitions = useAtomValue(miniappsDefinitionAtom);
  const miniappOptions = allDefinitions.map((d) => ({
    value: d.id,
    label: d.name,
  }));
  // Define allowed Tauri commands (ideally from a central config)
  const tauriCommandOptions = [
    { value: 'get_system_info', label: 'Get System Info' },
    // Add other allowed commands here
  ];

  const handleBoolChange = (key: BooleanPermission, checked: boolean) => {
    onPermissionsChange({ ...(permissions ?? {}), [key]: checked });
  };

  const handleArrayChange = (
    key: ArrayPermission,
    selectedValues: string[],
  ) => {
    onPermissionsChange({ ...(permissions ?? {}), [key]: selectedValues });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Host API Permissions</h3>
      <p className="text-muted-foreground text-sm">
        Control which host application features and data this Miniapp can
        access.
      </p>

      {/* Boolean Permissions */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="perm-storage"
            checked={permissions?.useStorage ?? true} // Default true?
            onCheckedChange={(checked) =>
              handleBoolChange('useStorage', !!checked)
            }
          />
          <Label htmlFor="perm-storage" className="cursor-pointer font-normal">
            Allow Storage Access (`hostApi.storage.*`)
          </Label>
        </div>
        {/* Example for a global callMiniapp permission */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="perm-call-any"
            checked={permissions?.callMiniapp === undefined} // Check for explicit true
            onCheckedChange={(checked) =>
              handleBoolChange('callMiniapp', !!checked)
            }
          />
          <Label htmlFor="perm-call-any" className="cursor-pointer font-normal">
            Allow Calling *Any* Other Active Miniapp (`hostApi.callMiniapp`)?
            <span className="text-destructive ml-2 text-xs">
              (Potentially insecure)
            </span>
          </Label>
        </div>
        {/* Add more boolean permissions here */}
      </div>

      <hr />

      {/* Array Permissions */}
      <div className="space-y-4">
        {/* Read Config Permission */}
        <div>
          <Label>Allow Reading Config From Specific Miniapps</Label>
          <MultiSelect
            placeholder="Select Miniapps..."
            options={miniappOptions}
            value={permissions?.readConfig ?? []}
            onValueChange={(selected) =>
              handleArrayChange('readConfig', selected)
            }
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Miniapp can call `hostApi.getConfig(targetId)` for selected targets.
          </p>
        </div>

        {/* Allowed Tauri Commands Permission */}
        <div>
          <Label>Allow Specific Tauri Commands</Label>
          <MultiSelect
            placeholder="Select Commands..."
            options={tauriCommandOptions}
            value={permissions?.allowedTauriCommands ?? []}
            onValueChange={(selected) =>
              handleArrayChange('allowedTauriCommands', selected)
            }
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Miniapp can call `hostApi.invokeTauri(command)` for selected
            commands.
          </p>
        </div>

        {/* Add more array-based permissions (e.g., call specific miniapps) */}
      </div>
    </div>
  );
}

// NOTE: Requires a MultiSelect component implementation.
// You can adapt the Combobox component from shadcn/ui documentation:
// https://ui.shadcn.com/docs/components/combobox#multiple-select
