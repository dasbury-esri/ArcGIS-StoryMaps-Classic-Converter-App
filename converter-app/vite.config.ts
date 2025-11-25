import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
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
})
