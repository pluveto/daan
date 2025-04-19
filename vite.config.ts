import { execSync } from 'node:child_process';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function getGitCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'UNKNOWN';
  }
}

function getGitTag() {
  try {
    return execSync('git describe --tags --abbrev=0').toString().trim();
  } catch {
    return 'UNKNOWN';
  }
}

export default defineConfig({
  base: process.env.WEBSITE_URL || '/',
  define: {
    'import.meta.env.VITE_APP_COMMIT_HASH': JSON.stringify(getGitCommitHash()),
    'import.meta.env.VITE_APP_TAG': JSON.stringify(getGitTag()),
  },
  plugins: [react(), tailwindcss()],
  publicDir: 'assets',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
