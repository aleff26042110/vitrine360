import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Match the local origins permitted by the media gateway.
  server: {
    port: 5188, strictPort: true, open: '/minha-vitrine',
    proxy: { '/api/billing': { target: 'http://127.0.0.1:8787', rewrite: path => path.replace(/^\/api\/billing/, '/billing') } },
  },
})
