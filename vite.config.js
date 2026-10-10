// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // (10/10/2026) Marca de la publicación: el registro de errores dice de qué versión viene cada uno.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
  server: {
    port: 5173,          // Puerto fijo
    strictPort: true,    // Si 5173 está ocupado, falla (no cambia de puerto)
    cors: true,
    headers: { 'Cross-Origin-Embedder-Policy': 'credentialless' },
    // host: true,        // Descomenta si quieres acceder desde la red local
    // hmr: { clientPort: 5173 }, // Útil si usas proxy inverso más adelante
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
