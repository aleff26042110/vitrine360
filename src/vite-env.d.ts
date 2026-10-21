/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_MEDIA_STORAGE?: string
  readonly VITE_R2_GATEWAY_URL?: string
  readonly VITE_BILLING_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
