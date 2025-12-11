import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 120_000,
  use: {
    // Point directly to Vite dev server behind Netlify proxy
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  reporter: [['dot']],
});
