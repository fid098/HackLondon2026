/**
 * Vite config for the Chrome Extension.
 *
 * Chrome extensions are multi-page apps (popup, content script, background
 * service worker) — each needs its own entry point compiled separately.
 *
 * We use Vite's multi-page build rather than a plugin to keep dependencies
 * minimal and build behaviour transparent.
 *
 * Output: dist/ directory ready to load as an unpacked extension in Chrome.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Popup page
        popup: resolve(__dirname, 'src/popup/index.html'),
        // Content script (injected into web pages)
        content: resolve(__dirname, 'src/content/index.ts'),
        // Background service worker
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        // Flat output structure matching manifest.json paths
        entryFileNames: (chunk) => `${chunk.name}/index.js`,
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
