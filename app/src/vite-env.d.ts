/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_LAB_AUTHORITY?: string;
  readonly VITE_PUBLISH_COUNT?: string;
  readonly VITE_DEMO_FUNDER_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
