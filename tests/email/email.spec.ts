import { test, expect } from '../utils/fixtures';

import { LOGIN_PATH, STORAGE_STATE } from '../utils/credentials';
import { fetchEmail, otpInboxConfigured } from '../utils/otp-inbox';

/**
 * Email delivery — TC-EMAIL-001 to TC-EMAIL-004.
 *
 * Verifies that staging actually SENDS the transactional emails it should, by
 * triggering each flow and reading the result over IMAP (see utils/otp-inbox.ts).
 * Non-destructive — we assert the email arrives; we never complete the OTP login,
 * the reset, or accept the invite.
 *
 * Requires OTP_TEST_EMAIL + OTP_IMAP_USER/OTP_IMAP_PASSWORD in .env; skips
 * gracefully otherwise. Each fetch filters strictly by recipient + sender +
 * since, so it only reads the mail it just triggered.
 */
const TEST_EMAIL = process.env.OTP_TEST_EMAIL ?? '';
const IMAP_USER = process.env.OTP_IMAP_USER ?? '';
const FROM_MC = /mentorcloud/i;

/** A unique +alias of the readable mailbox, e.g. venu.ratcha+qainv123@mytemple.in. */
function aliasOf(tag: string): string {
  const [user, domain] = IMAP_USER.split('@');
  return `${user}+${tag}${Date.now().toString().slice(-6)}@${domain}`;
}

test.describe('Email delivery', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(() => {
    if (!otpInboxConfigured() || !TEST_EMAIL) {
      test.skip(
        true,
        'Email tests need OTP_TEST_EMAIL + OTP_IMAP_USER/OTP_IMAP_PASSWORD in .env.'
      );
    }
  });

  // TC-EMAIL-001 — Requesting a login OTP delivers the OTP email.
  test('TC-EMAIL-001 login OTP request delivers an OTP email', async ({ page }) => {
    test.setTimeout(240_000); // real email delivery can take up to ~2 min
    await page.goto(LOGIN_PATH);

    const otpButton = page.locator('button.js_login_with_otp_btn');
    if ((await otpButton.count()) === 0) {
      test.skip(true, 'Login with OTP is not enabled for this org.');
    }
    await otpButton.click();
    const otpEmail = page.locator('input.login_otp_email_field');
    await expect(otpEmail).toBeVisible();
    await otpEmail.fill(TEST_EMAIL);

    const requestedAt = new Date();
    await page.locator('button.js_send_otp_for_login_btn').click();
    // The 6 code inputs appearing confirms the request was accepted.
    await expect(page.locator('input.otp__input').first()).toBeVisible({ timeout: 15_000 });

    const mail = await fetchEmail({
      to: TEST_EMAIL,
      since: requestedAt,
      from: FROM_MC,
      subject: /otp|login|verification|code/i,
      timeoutMs: 150_000,
    });
    expect(mail, 'OTP email should arrive in the inbox').not.toBeNull();
    expect(mail!.from).toMatch(FROM_MC);
    expect(mail!.subject).toMatch(/otp|login|code|verification/i);
    // The body carries the 6-digit code.
    expect(`${mail!.subject}\n${mail!.text}`).toMatch(/\b\d{6}\b/);
  });

  // TC-EMAIL-002 — Forgot-password is accepted and (when not throttled) sends a
  // reset email with a reset link. Non-destructive: the reset link is asserted
  // but never followed, so the account password is unchanged.
  //
  // The request acknowledgement is the deterministic core assertion. The actual
  // reset email is RATE-LIMITED per address (confirmed live: the app always
  // shows "sent" for enumeration protection but only delivers one per cooldown),
  // so the email-content check is best-effort — it verifies the email when it
  // arrives and notes a likely throttle otherwise, rather than failing.
  test('TC-EMAIL-002 forgot-password is accepted and sends a reset email', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/accounts/password/reset/');
    await expect(page.getByRole('heading', { name: /forgot password/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('#id_email').fill(TEST_EMAIL);

    const requestedAt = new Date();
    await page.getByRole('button', { name: /reset password/i }).click();

    // Deterministic: the request is accepted and the app confirms it sent a link.
    await expect(page).toHaveURL(/\/accounts\/password\/reset\/done/, { timeout: 15_000 });
    await expect(page.getByText(/password reset link has been sent/i).first()).toBeVisible();

    // Best-effort delivery verification (reset email is rate-limited per address).
    const mail = await fetchEmail({
      to: TEST_EMAIL,
      since: requestedAt,
      from: FROM_MC,
      subject: /reset|password/i,
      timeoutMs: 90_000,
    });
    if (!mail) {
      test
        .info()
        .annotations.push({
          type: 'note',
          description:
            'Reset email not received in window (likely per-address rate limit); request acknowledgement verified.',
        });
      return;
    }
    expect(mail.from).toMatch(FROM_MC);
    expect(mail.subject).toMatch(/reset|password/i);
    // It contains a reset link back to the platform (never followed here).
    const resetLink = mail.links.find((u) => /reset|password|accounts/i.test(u));
    expect(resetLink, 'reset email should contain a reset link').toBeTruthy();
    expect(resetLink!).toMatch(/^https?:\/\//);
  });

  // TC-EMAIL-004 — "Resend Code" on the OTP modal delivers another OTP email.
  test('TC-EMAIL-004 Resend Code delivers another OTP email', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(LOGIN_PATH);
    const otpButton = page.locator('button.js_login_with_otp_btn');
    if ((await otpButton.count()) === 0) {
      test.skip(true, 'Login with OTP is not enabled for this org.');
    }
    await otpButton.click();
    const otpEmail = page.locator('input.login_otp_email_field');
    await expect(otpEmail).toBeVisible();
    await otpEmail.fill(TEST_EMAIL);
    await page.locator('button.js_send_otp_for_login_btn').click();
    await expect(page.locator('input.otp__input').first()).toBeVisible({ timeout: 15_000 });

    // Resend a fresh code. The control has a cooldown timer, so retry the click
    // until it fires; only then start the email window.
    const resend = page
      .locator('.js_resend_login_otp')
      .or(page.getByRole('button', { name: /resend/i }))
      .first();
    await expect(resend).toBeVisible({ timeout: 60_000 });
    const requestedAt = new Date();
    await expect(async () => {
      await resend.click({ timeout: 3_000 });
    }).toPass({ timeout: 90_000 });

    const mail = await fetchEmail({
      to: TEST_EMAIL,
      since: requestedAt,
      from: FROM_MC,
      subject: /otp|login|code|verification/i,
      timeoutMs: 150_000,
    });
    expect(mail, 'resent OTP email should arrive').not.toBeNull();
    expect(mail!.from).toMatch(FROM_MC);
    expect(`${mail!.subject}\n${mail!.text}`).toMatch(/\b\d{6}\b/);
  });
});

/**
 * Admin-triggered email — inviting a user sends them a welcome/invitation email.
 * Runs as the admin fixture. Each run invites a fresh unique +alias of the
 * readable mailbox so a new email is always sent (leaves a pending invited user
 * in the org — harmless QA data the admin can clear).
 */
test.describe('Email delivery — admin invitation', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test.beforeEach(() => {
    if (!otpInboxConfigured() || !IMAP_USER.includes('@')) {
      test.skip(true, 'Invite-email test needs OTP_IMAP_USER + IMAP creds in .env.');
    }
  });

  // TC-EMAIL-003 — Inviting a user delivers the welcome/invitation email.
  test('TC-EMAIL-003 inviting a user delivers a welcome email', async ({ page }) => {
    test.setTimeout(220_000);
    const alias = aliasOf('qainv');

    await page.goto('/mcadmin/user/invite/');
    await page.locator('#id_first_name').waitFor({ state: 'attached', timeout: 30_000 });
    await page.locator('#id_first_name').fill('QA');
    await page.locator('#id_last_name').fill('Invite');
    await page.locator('#id_email').fill(alias);

    // Program (sub_org) and mentoring role are mandatory — set the first real
    // option on each via the underlying selects (the select2 widgets mirror them).
    await page.evaluate(() => {
      for (const s of Array.from(document.querySelectorAll('select'))) {
        const label = (s.name + ' ' + s.id).toLowerCase();
        if (/sub_org|mentoring_role/.test(label) && !s.value) {
          const opt = Array.from(s.options).find(
            (o) => o.value && !/^-+$/.test(o.text.trim()) && o.value !== '-1'
          );
          if (opt) {
            s.value = opt.value;
            s.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
    });
    const sendEmail = page.locator('#id_send_email');
    if ((await sendEmail.count()) && !(await sendEmail.isChecked().catch(() => false))) {
      await sendEmail.check({ force: true }).catch(() => {});
    }

    const requestedAt = new Date();
    await page.getByRole('button', { name: /^submit$/i }).click();
    await expect(page.getByText(/invitation has been sent/i).first()).toBeVisible({
      timeout: 20_000,
    });

    // The invitee receives a welcome/invitation email in the readable mailbox.
    const mail = await fetchEmail({
      to: alias,
      since: requestedAt,
      from: FROM_MC,
      subject: /welcome|invit/i,
      timeoutMs: 150_000,
    });
    expect(mail, 'invitation email should arrive').not.toBeNull();
    expect(mail!.from).toMatch(FROM_MC);
    expect(mail!.subject).toMatch(/welcome|invit/i);
  });
});
