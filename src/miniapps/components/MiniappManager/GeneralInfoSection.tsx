// src/miniapps/components/MiniappManager/GeneralInfoSection.tsx
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { IconInput } from './IconInput';

interface GeneralInfoSectionProps {
  name: string;
  icon: string;
  description: string;
  enabled: boolean;
  defaultWindowSize: { width: number; height: number };
  onStateChange: <
    K extends 'name' | 'icon' | 'description' | 'enabled' | 'defaultWindowSize',
  >(
    key: K,
    value: GeneralInfoSectionProps[K],
  ) => void;
}

export function GeneralInfoSection({
  name,
  icon,
  description,
  enabled,
  defaultWindowSize,
  onStateChange,
}: GeneralInfoSectionProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <div className="sm:col-span-1 space-y-2">
          <Label htmlFor="miniapp-icon">Icon</Label>
          <IconInput
            id="miniapp-icon"
            value={icon}
            onChange={(value) => onStateChange('icon', value)}
          />
          <p className="text-muted-foreground mt-1 text-xs">Emoji (e.g., 🚀)</p>
        </div>
        <div className="sm:col-span-5 space-y-2">
          <Label htmlFor="miniapp-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="miniapp-name"
            value={name}
            onChange={(e) => onStateChange('name', e.target.value)}
            required
            placeholder="My Awesome Miniapp"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="miniapp-desc">Description</Label>
        <Textarea
          id="miniapp-desc"
          value={description}
          onChange={(e) => onStateChange('description', e.target.value)}
          rows={3}
          placeholder="Briefly describe what this Miniapp does."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="window-width">Default Window Width</Label>
          <Input
            id="window-width"
            type="number"
            value={defaultWindowSize.width}
            onChange={(e) =>
              onStateChange('defaultWindowSize', {
                ...defaultWindowSize,
                width: parseInt(e.target.value) || 0,
              })
            }
            placeholder="Width in pixels"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="window-height">Default Window Height</Label>
          <Input
            id="window-height"
            type="number"
            value={defaultWindowSize.height}
            onChange={(e) =>
              onStateChange('defaultWindowSize', {
                ...defaultWindowSize,
                height: parseInt(e.target.value) || 0,
              })
            }
            placeholder="Height in pixels"
          />
        </div>
      </div>

      <div className="flex items-center space-x-2 mb-2">
        <Switch
          id="miniapp-enabled"
          checked={enabled}
          onCheckedChange={(checked) => onStateChange('enabled', checked)}
        />
        <Label htmlFor="miniapp-enabled" className="cursor-pointer">
          Enabled
        </Label>
        <p className="text-muted-foreground text-xs">
          (Allows this Miniapp to be activated in the list)
        </p>
      </div>
    </div>
  );
}
