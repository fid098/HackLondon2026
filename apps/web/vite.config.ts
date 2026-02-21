import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    // host: true allows the dev server to be accessible outside the container
    host: true,
    proxy: {
      // Proxy /api/* to the FastAPI backend during local dev.
      // This way the browser never makes cross-origin requests —
      // everything goes through Vite's dev server.
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },

  // Vitest configuration (co-located here per Vite convention)
  test: {
    globals: true,             // describe/it/expect available without imports
    environment: 'jsdom',      // simulate browser DOM
    setupFiles: ['./src/test/setup.ts'],
    css: false,                // skip CSS processing in tests (faster)
  },
})
