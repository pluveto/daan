import * as app from '@tauri-apps/api';

declare global {
  interface Window {
    __TAURI__: typeof app;
  }
}

/**
 * Checks if the application is running within a Tauri environment.
 */
export function isDesktopEnv(): boolean {
  return app.core.isTauri();
}

console.log(app);
