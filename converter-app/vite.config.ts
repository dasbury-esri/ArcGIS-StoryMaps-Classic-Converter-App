import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    rollupOptions: {
      input: mode === 'development'
        ? {
            main: 'index.html',
            graphview: 'graphview.html'
          }
        : {
            main: 'index.html'
          },
      // Do not bundle ArcGIS JS API (@arcgis/core); keep it external.
      external: [
        '@arcgis/core',
        /^@arcgis\/core\//,
      ],
      output: {
        // Keep vendor libs grouped; avoid creating thousands of small chunks
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@arcgis/core')) return 'arcgis-core';
            return 'vendor';
          }
        }
      }
    },
    chunkSizeWarningLimit: 2000
  },
  resolve: {
    alias: {
      // Prevent client bundle from importing Node APIs; map to browser shim
      'node:child_process': '/src/shims/child_process.ts'
    }
  },
  define: {
    // Provide global alias for libraries that still reference `global`
    global: 'globalThis'
  }
}))