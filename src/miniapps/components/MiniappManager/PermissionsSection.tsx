// src/miniapps/components/MiniappManager/PermissionsSection.tsx
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';
import { MultiSelect } from '@/components/ui/MultiSelect'; // Placeholder
import { miniappsDefinitionAtom } from '@/store/miniapp';
import { MiniappPermissions } from '@/types';
import { useAtomValue } from 'jotai';

interface PermissionsSectionProps {
  permissions: MiniappPermissions | null;
  onPermissionsChange: (value: MiniappPermissions) => void; // Ensure value is not null when calling back
}

// Define known permissions for easier management
type BooleanPermission = 'useStorage' | 'callMiniapp' | 'llmAccess'; // Added llmAccess
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

  // Ensure permissions object exists when handling changes
  const currentPermissions = permissions ?? {};

  const handleBoolChange = (key: BooleanPermission, checked: boolean) => {
    onPermissionsChange({ ...currentPermissions, [key]: checked });
  };

  const handleArrayChange = (
    key: ArrayPermission,
    selectedValues: string[],
  ) => {
    onPermissionsChange({ ...currentPermissions, [key]: selectedValues });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Host API Permissions</h3>
      <p className="text-muted-foreground text-sm">
        Control which host application features and data this Miniapp can
        access. Review permissions carefully before enabling them.
      </p>

      {/* Boolean Permissions */}
      <div className="space-y-3 rounded-md border p-4">
        <h4 className="mb-2 font-medium">General Permissions</h4>
        {/* --- Storage Permission --- */}
        <div className="flex items-center space-x-3">
          <Checkbox
            id="perm-storage"
            // Default to true unless explicitly false
            checked={currentPermissions.useStorage !== false}
            onCheckedChange={(checked) =>
              handleBoolChange('useStorage', !!checked)
            }
          />
          <Label htmlFor="perm-storage" className="cursor-pointer font-normal">
            Allow Storage Access (`hostApi.storage.*`)
            <p className="text-xs text-muted-foreground">
              Allows the Miniapp to store and retrieve its own data persistently
              using IndexedDB. Generally safe.
            </p>
          </Label>
        </div>
        {/* --- LLM Permission (for Req 2 later) --- */}
        <div className="flex items-center space-x-3">
          <Checkbox
            id="perm-llm"
            checked={currentPermissions.llmAccess === true} // Default to false unless explicitly true
            onCheckedChange={(checked) =>
              handleBoolChange('llmAccess', !!checked)
            }
          />
          <Label htmlFor="perm-llm" className="cursor-pointer font-normal">
            Allow LLM Access (`hostApi.llm.*`)
            <p className="text-xs text-muted-foreground">
              Allows the Miniapp to make calls to configured Language Models via
              the host, potentially incurring costs and accessing sensitive API
              keys managed by the host.
            </p>
          </Label>
        </div>
        {/* Add more boolean permissions here (e.g., generic callMiniapp if desired) */}
      </div>

      {/* Array Permissions */}
      <div className="space-y-4 rounded-md border p-4">
        <h4 className="mb-2 font-medium">Specific Access Permissions</h4>
        {/* Read Config Permission */}
        <div>
          <Label>Allow Reading Config From Specific Miniapps</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Miniapp can call `hostApi.getConfig(targetId)` for selected targets.
            Be cautious about exposing sensitive configurations.
          </p>
          <MultiSelect
            placeholder="Select readable Miniapps..."
            options={miniappOptions}
            value={currentPermissions.readConfig ?? []}
            onValueChange={(selected) =>
              handleArrayChange('readConfig', selected)
            }
          />
        </div>

        {/* Allowed Tauri Commands Permission */}
        {window?.__TAURI__ && ( // Only show if in Tauri environment
          <div>
            <Label>Allow Specific Tauri Commands (Desktop App Only)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Miniapp can call `hostApi.invokeTauri(command)` for selected
              commands. Granting access to Tauri commands can have significant
              security implications.
            </p>
            <MultiSelect
              placeholder="Select allowed commands..."
              options={tauriCommandOptions}
              value={currentPermissions.allowedTauriCommands ?? []}
              onValueChange={(selected) =>
                handleArrayChange('allowedTauriCommands', selected)
              }
            />
          </div>
        )}

        {/* Add more array-based permissions (e.g., call specific miniapps if needed) */}
      </div>
    </div>
  );
}
