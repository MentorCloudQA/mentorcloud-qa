import { test as setup, expect } from '@playwright/test';

import { CREDENTIALS, STORAGE_STATE, login } from '../utils/credentials';
import { themeProfile } from '../utils/theme-profile';

/**
 * Authentication setup.
 *
 * Logs in once as the mentor and once as the mentee and saves each browser
 * session to disk. Spec files then reuse these states via
 * `test.use({ storageState: STORAGE_STATE.mentor | .mentee })` so they don't
 * have to log in for every test.
 *
 * This file is run by the dedicated `setup` project (see playwright.config.ts),
 * which the `staging` project depends on.
 */

// Staging logins can be slow under load; give auth setup generous headroom.
setup.setTimeout(150_000);

setup('authenticate as mentor', async ({ page }) => {
  const { email, password } = CREDENTIALS.mentor;
  await login(page, email, password);

  // Sanity check: we should no longer be on the login page.
  await expect(page).not.toHaveURL(/\/accounts\/login/);

  await page.context().storageState({ path: STORAGE_STATE.mentor });
  // Re-skin the fixture to a fresh iconic identity for this run (best-effort).
  const name = await themeProfile(page, 'mentor');
  if (name) setup.info().annotations.push({ type: 'identity', description: `mentor → ${name}` });
});

setup('authenticate as mentee', async ({ page }) => {
  const { email, password } = CREDENTIALS.mentee;
  await login(page, email, password);

  await expect(page).not.toHaveURL(/\/accounts\/login/);

  await page.context().storageState({ path: STORAGE_STATE.mentee });
  const name = await themeProfile(page, 'mentee');
  if (name) setup.info().annotations.push({ type: 'identity', description: `mentee → ${name}` });
});

setup('authenticate as admin', async ({ page }) => {
  const { email, password } = CREDENTIALS.admin;
  await login(page, email, password);

  await expect(page).not.toHaveURL(/\/accounts\/login/);

  await page.context().storageState({ path: STORAGE_STATE.admin });
  const name = await themeProfile(page, 'admin');
  if (name) setup.info().annotations.push({ type: 'identity', description: `admin → ${name}` });
});
