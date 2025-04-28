// src/miniapps/components/MiniappRunner/index.tsx
import hostApiScript from '@/hostApi.js?raw';
import { useMiniappBridge } from '@/miniapps/hooks/useMiniappBridge';
import { nightModeAtom } from '@/store';
import type { MiniappDefinitionEntity } from '@/types';
import { useAtom } from 'jotai';
import React, { Component, useMemo, useRef, useState } from 'react';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
  miniappName: string; // To identify which miniapp failed
}
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}
class MiniappErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error
    console.error(
      `Miniapp Runner Error Boundary caught error in "${this.props.miniappName}":`,
      error,
      errorInfo,
    );
    // Optional: Use hostApi or context to report error to the main application UI if possible
    // window.hostApi?.reportError({ message: error.message, stack: error.stack });
  }

  override render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="text-destructive bg-destructive/10 border-destructive flex h-full flex-col items-center justify-center rounded-md border p-4 text-center">
          <h4 className="mb-2 font-semibold">
            Error loading Miniapp: {this.props.miniappName}
          </h4>
          <p className="text-xs">
            {this.state.error?.message || 'An unknown error occurred.'}
          </p>
          {/* You could add a button to try reloading the instance */}
        </div>
      );
    }
    return this.props.children;
  }
}
// --- End Error Boundary ---

// --- Runner Props ---
interface MiniappRunnerProps {
  miniappDefinition: MiniappDefinitionEntity;
  instanceId: string;
}
// --- Runner Component ---
export function MiniappRunner({
  miniappDefinition,
  instanceId,
}: MiniappRunnerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { id: definitionId, name, htmlContent } = miniappDefinition;
  const [, setIsIframeLoaded] = useState(false);
  const [isNightMode] = useAtom(nightModeAtom);

  // Initialize bridge hook
  useMiniappBridge(iframeRef, instanceId); // Pass instanceId (derives definitionId inside hook)

  // Memoize iframe srcDoc content
  const iframeSrcDoc = useMemo(() => {
    // Content Security Policy (adjust as needed)
    const csp = [
      "default-src 'none'",
      // Allow scripts: inline, self, and hostApi.js
      "script-src 'unsafe-inline' 'self'", // Removed /hostApi.js as it's embedded now
      // Allow styles: inline, self, and our injected CSS
      "style-src 'unsafe-inline' 'self' /daan-ui-miniapp.css", // Allow our CSS file
      // Allow fonts: self, and potentially external sources if needed by themes
      "font-src 'self'", // Example: add data: if needed
      // Allow images: data URIs, blobs, self
      "img-src data: blob: 'self'",
      // Disallow connect/fetch by default (use bridge)
      "connect-src 'none'",
      // Prevent framing by others
      "frame-ancestors 'none'",
      // Prevent form submissions to external targets
      "form-action 'self'", // Allow forms to submit to themselves if needed
    ].join('; ');

    const headTag = '<head>';
    const headIndex = htmlContent.toLowerCase().indexOf(headTag);
    let injectedHtml = htmlContent;

    // Inject CSP, CSS Link, and instance ID meta tag into <head>
    const cssLink = `<link rel="stylesheet" href="/daan-ui-miniapp.css">`; // Link to our CSS
    const metaTags =
      `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
      `<meta name="miniapp-definition-id" content="${definitionId}">`;
    `<meta name="miniapp-instance-id" content="${instanceId}">`;

    if (headIndex !== -1) {
      const injectionPoint = headIndex + headTag.length;
      injectedHtml =
        htmlContent.slice(0, injectionPoint) +
        metaTags +
        cssLink + // Inject CSS link
        htmlContent.slice(injectionPoint);
    } else {
      // Fallback if <head> tag is missing
      console.warn(
        `Miniapp "${name}" (Instance: ${instanceId}) HTML missing <head> tag. Injecting basic structure.`,
      );
      injectedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${name}</title>${metaTags}${cssLink}</head><body>${htmlContent}</body></html>`;
    }

    // Ensure hostApi.js script is included (now embedded directly for simplicity)
    const hostApiScriptWrapped = `<script type="text/javascript">${hostApiScript}</script>`;
    const bodyEndIndex = injectedHtml.toLowerCase().lastIndexOf('</body>');
    if (bodyEndIndex !== -1) {
      // Inject before the closing body tag
      injectedHtml =
        injectedHtml.slice(0, bodyEndIndex) +
        hostApiScriptWrapped +
        injectedHtml.slice(bodyEndIndex);
    } else {
      // Append if no body tag found
      injectedHtml += hostApiScriptWrapped;
    }

    // --- Inject base class and initial theme ---
    // Find body tag
    const bodyTagRegex = /<body(.*?)>/i;
    const bodyMatch = injectedHtml.match(bodyTagRegex);
    if (bodyMatch) {
      const existingAttributes = bodyMatch[1] || '';
      // Determine initial theme class
      const initialThemeClass = isNightMode ? 'theme-dark' : 'theme-light';
      // Inject daan-ui and theme class
      const bodyReplacement = `<body class="daan-ui ${initialThemeClass}"${existingAttributes}>`;
      injectedHtml = injectedHtml.replace(bodyTagRegex, bodyReplacement);
    } else {
      console.warn(
        `Miniapp "${name}" (Instance: ${instanceId}) HTML missing <body> tag. Cannot inject base UI/theme classes.`,
      );
      // Might need to wrap the whole content if no body tag exists? Risky.
      // injectedHtml = injectedHtml.replace('<html>', `<html class="daan-ui ${initialThemeClass}">`); // Less ideal fallback
    }

    return injectedHtml;
    // Depend on isNightMode so srcDoc updates if theme changes *before* iframe load
  }, [htmlContent, name, instanceId, hostApiScript, isNightMode]);

  // Handle iframe load event
  const handleIframeLoad = () => {
    console.log(
      `MiniappRunner: Iframe for "${name}" (Instance: ${instanceId}) loaded.`,
    );
    setIsIframeLoaded(true);
    // Bridge initialization is handled by useMiniappBridge hook
    // Send initial theme event AFTER load (useMiniappBridge will handle this)
  };

  return (
    <MiniappErrorBoundary miniappName={name || 'Untitled Miniapp'}>
      <div className="miniapp-instance bg-background flex h-full w-full flex-col overflow-hidden">
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts allow-forms allow-modals allow-popups" // Adjust sandbox as needed
          srcDoc={iframeSrcDoc}
          title={name}
          className="h-full w-full flex-grow border-0"
          onLoad={handleIframeLoad}
          // Optional: Permissions Policy
          // allow="clipboard-read; clipboard-write;"
        />
      </div>
    </MiniappErrorBoundary>
  );
}
