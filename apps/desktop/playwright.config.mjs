import { defineConfig } from "@playwright/test";
export default defineConfig({
 testDir: "./tests/browser", fullyParallel: false, workers: 1,
 reporter: "list", use: { baseURL: "http://127.0.0.1:1420", headless: true,
  launchOptions: { executablePath: process.env.CI ? undefined : (process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium"), args: ["--no-sandbox"] } },
 webServer: { command: "npm run dev", url: "http://127.0.0.1:1420", reuseExistingServer: !process.env.CI, timeout: 30000 }
});
