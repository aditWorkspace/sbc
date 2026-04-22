import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3010', trace: 'on-first-retry' },
  webServer: { command: 'pnpm run dev', url: 'http://localhost:3010', reuseExistingServer: !process.env.CI },
});
