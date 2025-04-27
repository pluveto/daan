// src/miniapps/components/MiniappManager/CodeSection.tsx
import { Label } from '@/components/ui/Label';
import Editor from '@monaco-editor/react';
import { useTheme } from 'next-themes'; // pnpm add next-themes

interface CodeSectionProps {
  htmlContent: string;
  onHtmlChange: (value: string) => void;
}

export function CodeSection({ htmlContent, onHtmlChange }: CodeSectionProps) {
  const { resolvedTheme } = useTheme(); // Get current theme

  return (
    <div className="space-y-2">
      <Label>HTML Content</Label>
      <p className="text-muted-foreground text-sm">
        Edit the HTML, CSS, and JavaScript for your Miniapp here. Ensure you
        include
        <code>&lt;script src="/hostApi.js"&gt;&lt;/script&gt;</code>
        to communicate with the host application.
      </p>
      <div
        className="overflow-hidden rounded-md border"
        // Use viewport height relative units for better responsiveness within dialog
        style={{ height: '60vh' }}
      >
        <Editor
          height="100%"
          language="html"
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'} // Adapt theme
          value={htmlContent}
          onChange={(value) => onHtmlChange(value || '')}
          options={{
            minimap: { enabled: true },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  );
}
