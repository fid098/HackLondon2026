/// <reference types="vite/client" />

// Extend ImportMeta to type-check VITE_ env vars
interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
