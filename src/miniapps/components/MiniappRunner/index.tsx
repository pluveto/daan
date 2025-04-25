// src/miniapps/components/MiniappRunner/index.tsx
import { useMiniappBridge } from '@/miniapps/hooks/useMiniappBridge';
import type { MiniappDefinition } from '@/types';
import React, { Component, useEffect, useMemo, useRef, useState } from 'react';

// --- Simple Error Boundary ---
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
    // You can also log the error to an error reporting service
    console.error(
      `Miniapp Runner Error Boundary caught error in "${this.props.miniappName}":`,
      error,
      errorInfo,
    );
    // Optionally report to host using a dedicated logging function if available globally
    // window.host?.logError(...)
  }

  override render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="text-destructive bg-destructive/10 border-destructive flex h-full flex-col items-center justify-center rounded-md border p-4 text-center">
          <h4 className="mb-2 font-semibold">
            Error loading Miniapp: {this.props.miniappName}
          </h4>
          <p className="text-xs">
            {this.state.error?.message || 'An unknown error occurred.'}
          </p>
          {/* You could add a button to try reloading */}
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
  registerSendMessage: (
    id: string,
    sendMessage: (
      type: string,
      payload: any,
      requestId?: string,
      error?: string,
    ) => void,
  ) => void;
  unregisterSendMessage: (id: string) => void;
  getSendMessage: (
    id: string,
  ) =>
    | ((type: string, payload: any, requestId?: string, error?: string) => void)
    | undefined;
}

// --- Runner Component ---
export function MiniappRunner({
  miniappDefinition,
  registerSendMessage,
  unregisterSendMessage,
  getSendMessage,
}: MiniappRunnerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { id, name, htmlContent } = miniappDefinition;
  const [isIframeLoaded, setIsIframeLoaded] = useState(false); // Track iframe load state

  // Initialize the bridge hook
  const { sendMessageToMiniapp } = useMiniappBridge(
    iframeRef, // Pass the ref (type should be React.RefObject<HTMLIFrameElement>)
    id,
    registerSendMessage,
    unregisterSendMessage,
    getSendMessage,
  );

  // Register the sendMessage function for this instance
  // UseEffect runs *after* render, so iframeRef might be set
  useEffect(() => {
    // We could potentially wait for isIframeLoaded === true here if registration
    // absolutely must happen *only* after onload, but often useEffect is sufficient.
    console.log(`MiniappRunner: Registering sendMessage for ${id}`);
    registerSendMessage(id, sendMessageToMiniapp);
    return () => {
      console.log(`MiniappRunner: Unregistering sendMessage for ${id}`);
      unregisterSendMessage(id);
    };
    // Ensure dependencies cover all needed variables from props/state/hooks
  }, [id, sendMessageToMiniapp, registerSendMessage, unregisterSendMessage]);

  // Memoize iframe srcDoc content, potentially injecting CSP
  const iframeSrcDoc = useMemo(() => {
    // --- Content Security Policy (CSP) Example ---
    // Define a restrictive policy. Adjust based on Miniapp needs.
    // 'unsafe-inline' is often needed for simple HTML/JS but reduces security.
    // Consider using nonces or hashes if controlling script generation.
    // Needs careful tuning!
    const csp = [
      "default-src 'none'", // Start restrictive
      "script-src 'unsafe-inline' /hostApi.js", // Allow inline scripts and scripts from your CDN (for hostApi.js)
      "style-src 'unsafe-inline'", // Allow inline styles
      'img-src data:', // Allow data URIs for images if needed
      "font-src 'none'",
      "connect-src 'none'", // Disallow XHR/fetch by default (communication via postMessage)
      "frame-ancestors 'none'", // Prevent clickjacking (iframe cannot be embedded elsewhere)
      "form-action 'none'", // Prevent form submissions to external targets
      // Add other directives as needed (e.g., media-src)
    ].join('; ');

    // Inject CSP meta tag into the <head>
    const headTag = '<head>';
    const headIndex = htmlContent.toLowerCase().indexOf(headTag);
    if (headIndex !== -1) {
      const injectionPoint = headIndex + headTag.length;
      return (
        htmlContent.slice(0, injectionPoint) +
        `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
        htmlContent.slice(injectionPoint)
      );
    } else {
      // Fallback if <head> tag not found (less ideal)
      console.warn(
        `Miniapp "${name}" HTML missing <head> tag. Cannot inject CSP header.`,
      );
      return `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>${htmlContent}</body></html>`; // Basic wrapper
    }
  }, [htmlContent, name]); // Depend on htmlContent and name (for warning)

  // Handle iframe load event
  const handleIframeLoad = () => {
    console.log(`MiniappRunner: Iframe for "${name}" (ID: ${id}) has loaded.`);
    setIsIframeLoaded(true);
    // You could potentially signal readiness to the host here if needed
  };

  return (
    // Wrap component content in Error Boundary
    <MiniappErrorBoundary miniappName={name || 'Untitled'}>
      <div className="miniapp-instance bg-background flex h-full flex-col overflow-hidden">
        {' '}
        {/* Ensure background color */}
        {/* Optional Title Bar */}
        {/* <div className="p-1 bg-muted text-muted-foreground text-xs border-b flex-shrink-0">{name} (ID: {id.substring(0, 6)})</div> */}
        {/* Iframe takes remaining space */}
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts allow-forms allow-popups" // Keep sandbox minimal; consider removing allow-forms/popups if not needed
          srcDoc={iframeSrcDoc}
          title={name}
          className="h-full w-full flex-grow border-0" // Use flex-grow to fill space
          onLoad={handleIframeLoad} // Handle load event
          // allow="clipboard-read; clipboard-write" // Grant specific permissions via 'allow' if required and trusted
        />
      </div>
    </MiniappErrorBoundary>
  );
}
