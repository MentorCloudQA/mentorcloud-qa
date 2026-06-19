import type { Page } from '@playwright/test';

/**
 * Shared credentials, storage-state paths, and the login helper used by both
 * the auth setup project and the auth spec.
 *
 * Real credentials default to the staging QA accounts but can be overridden
 * via environment variables (e.g. in CI) so they don't have to live in git.
 */

export const STAGING_URL = 'https://staging-global.mentorcloud.com';

export type Role = 'mentor' | 'mentee' | 'admin';

export const CREDENTIALS: Record<Role, { email: string; password: string }> = {
  mentor: {
    email: process.env.MENTOR_EMAIL ?? 'venu+mentorpw@mentorcloud.com',
    password: process.env.MENTOR_PASSWORD ?? 'pw@QAMentor1',
  },
  mentee: {
    email: process.env.MENTEE_EMAIL ?? 'venu+menteepw@mentorcloud.com',
    password: process.env.MENTEE_PASSWORD ?? 'pw@QAMentee1',
  },
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'venu+adminpw@mentorcloud.com',
    password: process.env.ADMIN_PASSWORD ?? 'pw@QAAdmin1',
  },
};

/** Where each role's authenticated session state is persisted by auth.setup.ts. */
export const STORAGE_STATE: Record<Role, string> = {
  mentor: 'playwright/.auth/mentor.json',
  mentee: 'playwright/.auth/mentee.json',
  admin: 'playwright/.auth/admin.json',
};

/** The Django-rendered login page (not part of the React SPA). */
export const LOGIN_PATH = '/accounts/login/';

/**
 * Perform a standard email/password login.
 *
 * Selectors are taken from the live staging login template
 * (mcloud/templates/account/login.html):
 *   - email field    -> input#id_login (name="login")
 *   - password field -> input#id_password (name="password")
 *   - submit button  -> button.js_login_btn ("Login")
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(LOGIN_PATH, { waitUntil: 'domcontentloaded' });
  await page.locator('#id_login').fill(email);
  await page.locator('#id_password').fill(password);
  await page.locator('button.js_login_btn').click();

  // A successful login leaves the login page and lands on the home dashboard.
  // Generous timeout — staging logins can be slow under load. waitUntil 'commit'
  // accepts the redirect as soon as it starts: the default ('load') waits for the
  // full home page to finish loading, which can exceed 60s on slow staging even
  // though the login itself succeeded.
  await page.waitForURL((url) => !url.pathname.includes('/accounts/login'), {
    timeout: 90_000,
    waitUntil: 'commit',
  });
}
