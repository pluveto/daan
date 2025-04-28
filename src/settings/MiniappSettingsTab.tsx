import { Button } from '@/components/ui/Button';
import { importMiniappFromFile } from '@/lib/miniappImportExport'; // Import the function
import { MiniappList } from '@/miniapps/components/MiniappManager/MiniappList';
import { miniappDataServiceAtom } from '@/store/miniapp'; // Import atom
import { useAtomValue } from 'jotai'; // Import useSetAtom, useAtomValue
import React, { useRef } from 'react';
import { LuUpload } from 'react-icons/lu'; // Import icon
import { toast } from 'sonner';

export function MiniappSettingsTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const miniappDataService = useAtomValue(miniappDataServiceAtom);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Reset file input to allow selecting the same file again
    event.target.value = '';

    if (!file.name.endsWith('.json')) {
      toast.error('Import failed: Please select a valid .json file.');
      return;
    }

    toast.info(`Importing Miniapp from "${file.name}"...`);
    try {
      // Pass the getter and setter to the import function
      await importMiniappFromFile(file, miniappDataService);
      // Success message is handled within importMiniappFromFile
    } catch (error) {
      // Error toast is handled within importMiniappFromFile
      console.error('Import process failed:', error);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">
          Miniapp Management
        </h2>
        {/* Install Button */}
        <Button onClick={triggerFileInput} variant="outline" size="sm">
          <LuUpload className="mr-2 h-4 w-4" /> Install from File...
        </Button>
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".json,application/json" // Accept only .json files
          style={{ display: 'none' }}
        />
      </div>
      <p className="text-muted-foreground text-sm">
        Add, remove, configure, and enable/disable Miniapps that extend Daan's
        functionality. You can import Miniapps shared by others or export your
        own.
      </p>
      <MiniappList />
    </div>
  );
}
