import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const chromium = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3200",
    viewport: { width: 1366, height: 768 },
    launchOptions: existsSync(chromium) ? { executablePath: chromium } : {},
  },
  webServer: {
    command: "npx next start -p 3200",
    url: "http://localhost:3200/futureshift",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
