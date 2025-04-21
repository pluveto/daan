import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/AlertDialog';
// 假设使用shadcn的alert-dialog
import { apiBaseUrlAtom, apiKeyAtom } from '@/store/index';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export default function FastImport() {
  const [apiKey, setApiKey] = useAtom(apiKeyAtom);
  const [apiBaseUrl, setApiBaseUrl] = useAtom(apiBaseUrlAtom);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importSettings, setImportSettings] = useState<{
    key?: string;
    url?: string;
  } | null>(null);

  useEffect(() => {
    const handleImport = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const settingsString = searchParams.get('settings');

      if (!settingsString) return;

      try {
        // Check if settings string is empty
        if (settingsString === '') {
          // If the settings parameter is present but empty, don't import and just remove the param.
          clearSettingsFromUrl();
          return;
        }
        console.log('Importing settings from URL:', settingsString);
        const settings = JSON.parse(settingsString);

        if (settings && (settings.key || settings.url)) {
          setImportSettings(settings);
          setDialogOpen(true);
        }
      } catch (error) {
        console.error('Error parsing settings from URL:', error);
        toast.error('Error parsing settings from URL');
      }
    };

    handleImport();
  }, []);

  const handleConfirmImport = () => {
    if (importSettings) {
      if (importSettings.key) {
        setApiKey(importSettings.key);
      }
      if (importSettings.url) {
        setApiBaseUrl(importSettings.url);
      }
    }
    clearSettingsFromUrl();
    setDialogOpen(false);
    setImportSettings(null); //reset
  };

  const handleCancelImport = () => {
    clearSettingsFromUrl();
    setDialogOpen(false);
    setImportSettings(null); //reset
  };

  const clearSettingsFromUrl = () => {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.delete('settings');
    const newSearch = searchParams.toString();
    const newUrl =
      window.location.pathname +
      (newSearch ? '?' + newSearch : '') +
      window.location.hash;
    window.history.replaceState({}, '', newUrl);
  };

  return (
    <>
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogTrigger asChild>
          {/* You can use a button or any other trigger, but it will be hidden since we trigger it programmatically */}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Settings</AlertDialogTitle>
            <AlertDialogDescription></AlertDialogDescription>
            <div className="text-neutral-750 space-y-2 text-sm">
              <p>Do you want to import settings from the URL?</p>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left">Setting</th>
                    <th className="py-2 text-left">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {importSettings?.key && (
                    <tr className="border-b">
                      <td className="py-2 font-bold">API Key</td>
                      <td className="py-2">{importSettings.key}</td>
                    </tr>
                  )}
                  {importSettings?.url && (
                    <tr className="border-b">
                      <td className="py-2 font-bold">API Base URL</td>
                      <td className="py-2">{importSettings.url}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {(apiKey || apiBaseUrl) && (
                <span className="mt-2 block text-red-500">
                  Warning: You already have settings in your local storage.
                  Importing will overwrite them.
                </span>
              )}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelImport}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmImport}>
              Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
