// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,          // Puerto fijo
    strictPort: true,    // Si 5173 está ocupado, falla (no cambia de puerto)
    cors: true,
    headers: { 'Cross-Origin-Embedder-Policy': 'credentialless' },
    // host: true,        // Descomenta si quieres acceder desde la red local
    // hmr: { clientPort: 5173 }, // Útil si usas proxy inverso más adelante
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
