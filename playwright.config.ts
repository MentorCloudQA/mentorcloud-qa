import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from the (gitignored) .env file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * MentorCloud QA automation config.
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  /*
   * Cap concurrency. Staging is a shared, network-bound environment; running
   * many headed browsers at once causes slow page loads and flaky timeouts.
   */
  workers: process.env.CI ? 1 : 3,
  /* Per-test timeout — staging pages (home recommendations, messages) load slowly. */
  timeout: 60_000,
  /* More generous assertion timeout for async-loaded React content. */
  expect: { timeout: 10_000 },
  /*
   * Reporters: console list + the HTML report, plus a custom reporter that
   * writes TEST-RUN-REPORT.md after every run so the report always reflects the
   * most recent invocation. See reporters/run-report.ts.
   */
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./reporters/run-report.ts'],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Headless by default; set HEADED=1 to watch the browser while testing. */
    headless: !process.env.HEADED,
    /* Capture a screenshot only when a test fails. */
    screenshot: 'only-on-failure',
    /* Retain video only for failed tests. */
    video: 'retain-on-failure',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Allow time for slow staging actions/navigations (staging can be overloaded). */
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },

  /* Configure projects for each environment. */
  projects: [
    /*
     * Auth setup: logs in as mentor + mentee and writes session state to
     * playwright/.auth/*.json. The `staging` project depends on it so the
     * states exist before the suites run. See tests/auth/auth.setup.ts.
     */
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        baseURL: 'https://staging-global.mentorcloud.com',
      },
    },

    {
      name: 'staging',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://staging-global.mentorcloud.com',
      },
      dependencies: ['setup'],
    },

    {
      name: 'local',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
