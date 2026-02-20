/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MATRIX_USERNAME?: string;
  readonly VITE_MATRIX_PASSWORD?: string;
  readonly VITE_MATRIX_HOMESERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
