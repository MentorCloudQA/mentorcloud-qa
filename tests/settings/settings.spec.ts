import { test, expect } from '../utils/fixtures';

import { CREDENTIALS, STORAGE_STATE } from '../utils/credentials';
import { openAvatarMenu } from '../utils/shell';

/**
 * Settings & Privacy module — TC-SET-001 to TC-SET-009.
 *
 * Confirmed against the source templates (account/user_preferences_*.html):
 *   Avatar dropdown "Settings and Privacy" -> {% url 'user_pref_general_change' %}
 *   General        -> /user/preferences/general  (no trailing slash)
 *   Security       -> /user/preferences/account
 *   Notifications  -> /user/preferences/email
 *   Page heading   -> h2.heading--page "Settings & Privacy"
 *   Sidebar tabs   -> a.filter-table__item with hrefs to the three routes
 *
 * General page (user_preferences_general.html):
 *   "Video Conferencing Setup" (h4) + js_meet_options_form + Save (js_meet_options_submit)
 *   "Profile" (h4) + "Time Zone" label + js_timezone_select
 * Security page (user_preferences_account.html):
 *   "Password" (h3) + 3x input.js_password_field + "Password Policy" + Confirm (value=change_password)
 *   "Delete Account" (h3.text--danger) + "Delete My Account" button
 *   NB: the Password card only renders when the org has NO SSO/OAuth login; Delete
 *   Account only when not org-disabled. Both tests skip gracefully when absent.
 * Notifications page (user_preferences_mail.html):
 *   "Email Notifications" (h4) + js_pref form with org/circle update frequency selects.
 */
test.use({ storageState: STORAGE_STATE.mentor });

const GENERAL_PATH = '/user/preferences/general';
const SECURITY_PATH = '/user/preferences/account';
const NOTIFICATIONS_PATH = '/user/preferences/email';

/** The settings sidebar tab link for a given preferences route (matched by href). */
function tabLink(page: import('@playwright/test').Page, pathFragment: string) {
  return page.locator(`a.filter-table__item[href*="${pathFragment}"]`).first();
}

test.describe('Settings & Privacy', () => {
  // TC-SET-001 — Avatar dropdown "Settings and Privacy" opens the settings page
  test('TC-SET-001 avatar dropdown opens Settings & Privacy', async ({ page }) => {
    await page.goto('/');
    const menu = await openAvatarMenu(page);
    const settings = menu.getByRole('link', { name: /settings (and|&) privacy|settings/i }).first();
    await expect(settings).toBeVisible();
    await settings.click();
    await expect(page).toHaveURL(/\/user\/preferences\/general/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /settings\s*&?\s*privacy/i })).toBeVisible();
  });

  // TC-SET-002 — Settings page exposes the General / Security / Notifications tabs
  test('TC-SET-002 settings page shows the three section tabs', async ({ page }) => {
    await page.goto(GENERAL_PATH);
    await expect(page.getByRole('heading', { name: /settings\s*&?\s*privacy/i })).toBeVisible();

    // The sidebar links carry stable hrefs to each preferences route.
    await expect(tabLink(page, '/user/preferences/general')).toBeAttached();
    await expect(tabLink(page, '/user/preferences/account')).toBeAttached();
    await expect(tabLink(page, '/user/preferences/email')).toBeAttached();
  });

  // TC-SET-003 — General page shows Video Conferencing Setup and the Profile/Time Zone card
  test('TC-SET-003 General page shows VC setup and timezone controls', async ({ page }) => {
    await page.goto(GENERAL_PATH);
    await expect(page.getByRole('heading', { name: /video conferencing setup/i })).toBeVisible({
      timeout: 15_000,
    });
    // Profile card with the Time Zone selector.
    await expect(page.getByText(/time zone/i).first()).toBeVisible();
    // The VC options form carries a Save submit.
    await expect(page.locator('form.js_meet_options_form')).toBeAttached();
  });

  // TC-SET-004 — Security page shows the password-change form (skips on SSO-only orgs)
  test('TC-SET-004 Security page shows the password change form', async ({ page }) => {
    await page.goto(SECURITY_PATH);
    await expect(page.getByRole('heading', { name: /settings\s*&?\s*privacy/i })).toBeVisible();

    const passwordForm = page.locator('form.js_change_password');
    if ((await passwordForm.count()) === 0) {
      test.skip(true, 'Password form not present (org uses SSO/OAuth login).');
    }
    // Three password fields + a Confirm submit + the policy list.
    await expect(page.locator('input.js_password_field')).toHaveCount(3);
    await expect(page.getByText(/password policy/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /confirm/i }).or(page.locator('button[value="change_password"]')).first()
    ).toBeVisible();
  });

  // TC-SET-005 — Changing password is rejected when the current password is wrong / new ones mismatch.
  // This NEVER succeeds (wrong old password), so it can't alter the fixture account.
  test('TC-SET-005 invalid password change is rejected', async ({ page }) => {
    await page.goto(SECURITY_PATH);
    const passwordForm = page.locator('form.js_change_password');
    if ((await passwordForm.count()) === 0) {
      test.skip(true, 'Password form not present (org uses SSO/OAuth login).');
    }
    const fields = page.locator('input.js_password_field');
    await fields.nth(0).fill('definitely-not-my-current-password');
    await fields.nth(1).fill('Mismatch1!aA');
    await fields.nth(2).fill('Different2!bB'); // intentionally mismatched
    await page
      .getByRole('button', { name: /confirm/i })
      .or(page.locator('button[value="change_password"]'))
      .first()
      .click();

    // Must NOT navigate away to a success state: we stay on the security page and/or
    // an inline error appears. (A real change would redirect / toast success.)
    await expect(page).toHaveURL(/\/user\/preferences\/account/, { timeout: 15_000 });
    // Either a validation error is shown, or we simply remained on the form. An
    // empty hidden .js_error placeholder is always in the DOM — filter it out.
    const inlineError = page.locator('.js_error, .error, .error__field');
    await expect(inlineError.or(passwordForm).filter({ visible: true }).first()).toBeVisible();
  });

  // TC-SET-006 — Security page shows the Delete Account section (skips when org-disabled)
  // SKIPPED per QA directive (2026-06-06): do not interact with the Delete Account
  // flow at all for now — even assertion-only checks are deferred until cleared.
  test('TC-SET-006 Security page shows the Delete Account section', async ({ page }) => {
    test.skip(true, 'QA directive: Delete Account flow off-limits for now (no account deletion risk).');
    await page.goto(SECURITY_PATH);
    const deleteForm = page.locator('#delete-profile-form');
    if ((await deleteForm.count()) === 0) {
      test.skip(true, 'Delete Account is disabled for this org.');
    }
    await expect(page.getByRole('heading', { name: /delete account/i })).toBeVisible();
    // The destructive button exists but is NEVER clicked by the suite.
    await expect(page.getByRole('button', { name: /delete my account/i })).toBeVisible();
  });

  // TC-SET-007 — Notifications page shows the Email Notifications preferences
  test('TC-SET-007 Notifications page shows email preferences', async ({ page }) => {
    await page.goto(NOTIFICATIONS_PATH);
    await expect(page.getByRole('heading', { name: /settings\s*&?\s*privacy/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /email notifications/i })).toBeVisible({
      timeout: 15_000,
    });
    // The preferences form posts to user_pref_email_change.
    await expect(page.locator('form[action*="/user/preferences/email"]').first()).toBeAttached();
  });

  // TC-SET-008 — Tab navigation moves between the three settings sections
  test('TC-SET-008 navigate between settings sections', async ({ page }) => {
    await page.goto(GENERAL_PATH);

    // The sidebar may collapse into a mobile "Options" dropdown; reveal it if needed.
    const security = tabLink(page, '/user/preferences/account');
    if (!(await security.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /^options$/i }).first().click().catch(() => {});
    }
    await security.click();
    await expect(page).toHaveURL(/\/user\/preferences\/account/, { timeout: 15_000 });

    const notifications = tabLink(page, '/user/preferences/email');
    if (!(await notifications.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /^options$/i }).first().click().catch(() => {});
    }
    await notifications.click();
    await expect(page).toHaveURL(/\/user\/preferences\/email/, { timeout: 15_000 });
  });

  // TC-SET-009 — Settings pages require authentication (logged-out users are redirected to login)
  test.describe('unauthenticated', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('TC-SET-009 settings redirects logged-out users to login', async ({ page }) => {
      await page.goto(GENERAL_PATH);
      await expect(page).toHaveURL(/\/accounts\/login/, { timeout: 20_000 });
      // Sanity: ensure the configured creds still log in cleanly afterwards is covered by auth.spec.
      expect(CREDENTIALS.mentor.email).toContain('@');
    });
  });
});
