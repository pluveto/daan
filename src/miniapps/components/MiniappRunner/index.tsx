// src/miniapps/components/MiniappRunner/index.tsx
import { useMiniappBridge } from '@/miniapps/hooks/useMiniappBridge';
import type { MiniappDefinition } from '@/types';
import React, { Component, useEffect, useMemo, useRef, useState } from 'react';

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
  miniappDefinition: MiniappDefinition;
  instanceId: string; // Unique ID for this running instance
}

// --- Runner Component ---
export function MiniappRunner({
  miniappDefinition,
  instanceId, // Receive instanceId
}: MiniappRunnerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { id: definitionId, name, htmlContent } = miniappDefinition; // Get definition ID here
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);

  // Initialize the bridge hook FOR THIS INSTANCE.
  // This hook handles registering/unregistering the sendMessage function
  // using the MiniappBridgeContext.
  useMiniappBridge(iframeRef, instanceId, definitionId);

  // Memoize iframe srcDoc content, including CSP injection
  const iframeSrcDoc = useMemo(() => {
    // Content Security Policy (Adjust as needed, be restrictive)
    const csp = [
      "default-src 'none'",
      // Allow scripts: inline for simple apps, self, and your hostApi.js path
      "script-src 'unsafe-inline' 'self' /hostApi.js", // Ensure '/hostApi.js' path is correct
      // Allow styles: inline, self, CDNs if necessary (e.g., Tailwind CDN)
      "style-src 'unsafe-inline' 'self' https://cdn.tailwindcss.com",
      // Allow images: data URIs, blobs, self
      "img-src data: blob: 'self'",
      // Allow fonts from self
      "font-src 'self'",
      // Disallow connect/fetch/XHR by default (use bridge)
      "connect-src 'none'",
      // Prevent framing by others
      "frame-ancestors 'none'",
      // Prevent form submissions to external targets
      "form-action 'none'",
      // Allow necessary media sources if applicable
      // "media-src 'self'",
      // Allow web workers if needed
      // "worker-src 'self' blob:",
    ].join('; ');

    const headTag = '<head>';
    const headIndex = htmlContent.toLowerCase().indexOf(headTag);
    let injectedHtml = htmlContent;

    // Inject CSP and instance ID meta tag into <head>
    if (headIndex !== -1) {
      const injectionPoint = headIndex + headTag.length;
      injectedHtml =
        htmlContent.slice(0, injectionPoint) +
        `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
        `<meta name="miniapp-instance-id" content="${instanceId}">` + // For the app's internal use
        htmlContent.slice(injectionPoint);
    } else {
      // Fallback if <head> tag is missing
      console.warn(
        `Miniapp "${name}" (Instance: ${instanceId}) HTML missing <head> tag. Injecting basic structure with CSP.`,
      );
      // Wrap the content in basic HTML structure
      injectedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${name}</title><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="miniapp-instance-id" content="${instanceId}"></head><body>${htmlContent}</body></html>`;
    }

    // Ensure hostApi.js script is included (basic check)
    // Ideally, the miniapp HTML definition should include this script itself.
    const hostApiScriptTag = '<script src="/hostApi.js"></script>';
    if (!injectedHtml.includes('src="/hostApi.js"')) {
      // Check if the script tag exists
      console.warn(
        `Miniapp "${name}" (Instance: ${instanceId}) HTML appears to be missing ${hostApiScriptTag}. Attempting automatic injection before </body>.`,
      );
      const bodyEndIndex = injectedHtml.toLowerCase().lastIndexOf('</body>');
      if (bodyEndIndex !== -1) {
        // Inject before the closing body tag
        injectedHtml =
          injectedHtml.slice(0, bodyEndIndex) +
          hostApiScriptTag +
          injectedHtml.slice(bodyEndIndex);
      } else {
        // Append if no body tag found (less reliable)
        injectedHtml += hostApiScriptTag;
      }
    }

    return injectedHtml;
  }, [htmlContent, name, instanceId]); // Re-generate if these change

  // Handle iframe load event
  const handleIframeLoad = () => {
    console.log(
      `MiniappRunner: Iframe for "${name}" (Instance: ${instanceId}) has loaded.`,
    );
    setIsIframeLoaded(true);
    // Bridge initialization is handled by the useMiniappBridge hook effect
  };

  return (
    // Wrap component content in Error Boundary
    <MiniappErrorBoundary miniappName={name || 'Untitled Miniapp'}>
      <div className="miniapp-instance bg-background flex h-full w-full flex-col overflow-hidden">
        {/* Optional: Add a loading indicator until iframe loads */}
        {/* {!isIframeLoaded && <div className="p-4 text-center text-muted-foreground">Loading {name}...</div>} */}

        {/* Iframe takes remaining space */}
        <iframe
          ref={iframeRef}
          // Security Sandbox (adjust as needed, keep minimal)
          // allow-modals: Needed for alert(), confirm(), prompt()
          // allow-popups: Needed for window.open() (use with caution)
          // allow-downloads: If the app needs to trigger downloads
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          srcDoc={iframeSrcDoc} // Use srcDoc forsandboxing and CSP injection
          title={name} // For accessibility
          className="h-full w-full flex-grow border-0" // Use flex-grow to fill space
          onLoad={handleIframeLoad} // Handle load event
          // Feature Policy / Permissions Policy (Optional, more granular control)
          allow="clipboard-read; clipboard-write; microphone *; camera *;"
        />
      </div>
    </MiniappErrorBoundary>
  );
}
