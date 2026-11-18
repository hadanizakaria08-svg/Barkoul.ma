interface ImportMetaEnv {
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
