import { test, expect } from '../utils/fixtures';

import { CREDENTIALS, LOGIN_PATH, login } from '../utils/credentials';
import { fetchOtpFromInbox, otpInboxConfigured } from '../utils/otp-inbox';
import { openAvatarMenu } from '../utils/shell';

/**
 * Authentication module — TC-AUTH-001 to TC-AUTH-006.
 *
 * These tests exercise the login UI itself, so they must start from a
 * logged-out browser. We override the project storageState with an empty one.
 *
 * Login page is Django-rendered (mcloud/templates/account/login.html):
 *   email    -> input#id_login
 *   password -> input#id_password
 *   submit   -> button.js_login_btn
 *   OTP CTA  -> button.js_login_with_otp_btn  (+ modal with 6x input.otp__input)
 */
atest.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  // TC-AUTH-001 — Login page loads with email, password, and login button
  test('TC-AUTH-001 login page loads with email, password, and login button', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    await expect(page.locator('#id_login')).toBeVisible();
    await expect(page.locator('#id_password')).toBeVisible();
    await expect(page.locator('button.js_login_btn')).toBeVisible();
    await expect(page.locator('button.js_login_btn')).toContainText(/login/i);
  });

  // TC-AUTH-002 — Login is rejected with invalid credentials
  test('TC-AUTH-002 login is rejected with invalid credentials', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    await page.locator('#id_login').fill('not-a-real-user@example.com');
    await page.locator('#id_password').fill('wrong-password');
    await page.locator('button.js_login_btn').click();

    // We must remain on the login page and a visible error must be surfaced.
    await expect(page).toHaveURL(/\/accounts\/login/);
    await expect(
      page.getByText(/not correct|incorrect|invalid|do not match/i).first()
    ).toBeVisible();
  });

  // TC-AUTH-003 — Login succeeds with valid mentor credentials
  test('TC-AUTH-003 login succeeds with valid mentor credentials', async ({ page }) => {
    const { email, password } = CREDENTIALS.mentor;
    await login(page, email, password);

    // After login we land off the login page (home dashboard).
    await expect(page).not.toHaveURL(/\/accounts\/login/);
  });

  // TC-AUTH-004 — User can log in with a valid OTP (email-based 6-digit code)
  test('TC-AUTH-004 user can log in with a valid OTP', async ({ page }) => {
    test.slow(); // waits on real email delivery
    await page.goto(LOGIN_PATH);

    // The OTP CTA is only present when the org enables login-with-OTP.
    const otpButton = page.locator('button.js_login_with_otp_btn');
    if ((await otpButton.count()) === 0) {
      test.skip(true, 'Login with OTP is not enabled for this org.');
    }
    await otpButton.click();

    // The user to log in as. OTP_TEST_EMAIL is a dedicated staging user whose
    // mailbox the suite can read over IMAP (company 2FA policy blocks app
    // passwords on the venu@ mailbox); it falls back to the mentor fixture.
    const otpUserEmail = process.env.OTP_TEST_EMAIL ?? CREDENTIALS.mentor.email;

    // The OTP modal asks for the email, then reveals 6 single-digit inputs.
    const otpEmail = page.locator('input.login_otp_email_field');
    await expect(otpEmail).toBeVisible();
    await otpEmail.fill(otpUserEmail);
    const requestedAt = new Date();
    await page.locator('button.js_send_otp_for_login_btn').click();

    const otpInputs = page.locator('input.otp__input');
    await expect(otpInputs.first()).toBeVisible();
    await expect(otpInputs).toHaveCount(6);

    // The code arrives by email. Prefer an explicit MENTOR_OTP override; otherwise
    // read it from the QA mailbox over IMAP (see utils/otp-inbox.ts for setup).
    let code = process.env.MENTOR_OTP;
    if ((!code || code.length !== 6) && otpInboxConfigured()) {
      code = (await fetchOtpFromInbox({ to: otpUserEmail, since: requestedAt })) ?? undefined;
    }
    if (!code || code.length !== 6) {
      test.skip(
        true,
        'No OTP available: set MENTOR_OTP or configure OTP_IMAP_USER/OTP_IMAP_PASSWORD in .env.'
      );
    }
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(code![i]);
    }
    await page.locator('button.js_submit_login_otp').click();

    // A success dialog confirms the login; Ok proceeds off the login page.
    await expect(page.getByText(/login successfully via otp/i)).toBeVisible({ timeout: 20_000 });
    await page
      .locator('.js_modal_ok:visible')
      .or(page.getByRole('button', { name: /^ok$/i }))
      .first()
      .click();

    await expect(page).not.toHaveURL(/\/accounts\/login/, { timeout: 20_000 });
  });

  // TC-AUTH-006 — Authenticated deep links are gated: logged-out visitors are
  // redirected to the login page from every module entry point.
  test('TC-AUTH-006 deep links redirect logged-out users to login', async ({ page }) => {
    test.slow(); // several full navigations on slow staging
    const PROTECTED_ROUTES = ['/events/sessions/', '/community/', '/message/', '/profile/update'];
    for (const route of PROTECTED_ROUTES) {
      await page.goto(route);
      await expect(page, `${route} should redirect to login`).toHaveURL(/\/accounts\/login/, {
        timeout: 30_000,
      });
    }
  });

  // TC-AUTH-005 — User can log out successfully from the avatar dropdown
  test('TC-AUTH-005 user can log out from the avatar dropdown', async ({ page }) => {
    const { email, password } = CREDENTIALS.mentor;
    await login(page, email, password);

    // Open the avatar/profile dropdown (button.btn.js_trigger_mixpanel).
    const menu = await openAvatarMenu(page);

    // Logout link -> /accounts/logout/
    const logout = menu.getByRole('link', { name: /logout/i });
    await expect(logout).toBeVisible();
    await logout.click();

    // Django logout may show a confirmation page with a submit button.
    const confirm = page.getByRole('button', { name: /^(log\s?out|sign\s?out)$/i });
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
    }

    await expect(page).toHaveURL(/\/accounts\/login|\/$/);
    // The logged-out home shows the login affordance again.
    await page.goto(LOGIN_PATH);
    await expect(page.locator('button.js_login_btn')).toBeVisible();
  });
});
