import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8765',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'cd kamakazii_3d_aero_comand && python -m http.server 8765',
      url: 'http://localhost:8765',
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    {
      command: 'cd kamakazii_studio3D && python -m http.server 8766',
      url: 'http://localhost:8766',
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    {
      command: 'cd kamasazii_vecter_omega3d && python -m http.server 8767',
      url: 'http://localhost:8767',
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
  ],
});
