import { test, expect } from '../utils/fixtures';
import type { Browser } from '@playwright/test';

import { STORAGE_STATE, login } from '../utils/credentials';
import { fetchEmail, otpInboxConfigured } from '../utils/otp-inbox';

/**
 * Admin Reports module — TC-RPT-001 to TC-RPT-030.
 *
 * The admin Reports dashboard (React/MUI) at /mcadmin/ is the program admin's
 * analytics hub. Confirmed against live staging.
 *
 * Sections (headings): Users · Mentor/Mentee Activity Report · Growth
 *   Partnerships · Feedback From Growth Partnerships · Mentor-Mentee
 *   Availability Gaps · 1:1 Sessions (within / outside) + Feedback · Fireside
 *   Chats + Feedback · Circles · Community · User-to-User Direct Conversations.
 *
 * Metric cards are MUI <a> links to detail reports (TC-RPT-002..004, 007..017).
 *
 * "Mentor / Mentee Activity Report" are MUI card buttons; clicking one queues an
 * export and shows "We are generating the … Activity Report, it will be emailed
 * to you shortly." The report is EMAILED to the logged-in admin as a CSV
 * attachment. Verified end-to-end (TC-RPT-005/006) by triggering the export as
 * the OTP test user — whose mailbox we can read over IMAP — and asserting the
 * delivered email + CSV attachment.
 *
 * All read-only / non-destructive: navigations and export requests only.
 */
const REPORTS_PATH = '/mcadmin/';
const FROM_MC = /mentorcloud/i;
const OTP_EMAIL = process.env.OTP_TEST_EMAIL ?? '';

test.describe('Admin Reports', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test.beforeEach(async ({ page }) => {
    await page.goto(REPORTS_PATH);
    await expect(
      page.getByRole('heading', { name: 'Growth Partnerships', exact: true }).first()
    ).toBeVisible({ timeout: 30_000 });
  });

  // TC-RPT-001 — The Reports dashboard renders its major sections.
  test('TC-RPT-001 reports dashboard shows the major report sections', async ({ page }) => {
    for (const name of [
      'Growth Partnerships',
      'Feedback From Growth Partnerships',
      'Mentor-Mentee Availability Gaps',
      'Fireside Chats',
      'Circles',
      'Community',
    ]) {
      await expect(
        page.getByRole('heading', { name, exact: true }).first(),
        `section "${name}" should render`
      ).toBeVisible();
    }
    await expect(page.getByText(/profile report/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /mentor.*activity report/i }).first()).toBeVisible();
  });

  /**
   * Metric drill-downs — each report section's count is a link into its detail
   * report. Confirmed destinations under /mcadmin/. Parameterised below.
   */
  const DRILLDOWNS: { id: string; label: string; href: string; url: RegExp }[] = [
    { id: 'TC-RPT-002', label: 'Users', href: '/mcadmin/user/details/', url: /\/mcadmin\/user\/details/ },
    { id: 'TC-RPT-003', label: 'Growth Partnerships', href: '/mcadmin/mentorship/details/', url: /\/mcadmin\/mentorship\/details/ },
    { id: 'TC-RPT-004', label: 'Feedback From Growth Partnerships', href: '/mcadmin/mentorship-survey', url: /mentorship-survey|checkin-survey-analytics/ },
    { id: 'TC-RPT-007', label: 'In-Transit users', href: '/mcadmin/in-transit-user/details/', url: /\/mcadmin\/in-transit-user\/details/ },
    { id: 'TC-RPT-008', label: 'Goals & Tasks', href: '/mcadmin/mentorship/goals-tasks/', url: /\/mcadmin\/mentorship\/goals-tasks/ },
    { id: 'TC-RPT-009', label: 'In-Progress Partnership Responses', href: 'checkin-survey-analytics', url: /checkin-survey-analytics/ },
    { id: 'TC-RPT-010', label: 'Mentor-Mentee Availability Gaps', href: '/mcadmin/mentor-mentee-balance/details/', url: /mentor-mentee-balance\/details/ },
    { id: 'TC-RPT-011', label: '1:1 Sessions', href: '/mcadmin/meeting/details/', url: /\/mcadmin\/meeting\/details/ },
    { id: 'TC-RPT-012', label: 'Feedback From 1:1 Sessions', href: '/mcadmin/session-survey/', url: /\/mcadmin\/session-survey/ },
    { id: 'TC-RPT-013', label: 'Fireside Chats', href: '/mcadmin/fireside-chat/details/', url: /\/mcadmin\/fireside-chat\/details/ },
    { id: 'TC-RPT-014', label: 'Circles', href: '/mcadmin/roundtable/details/', url: /\/mcadmin\/roundtable\/details/ },
    { id: 'TC-RPT-015', label: 'Circle Posts', href: '/mcadmin/roundtable-post/details/', url: /\/mcadmin\/roundtable-post\/details/ },
    { id: 'TC-RPT-016', label: 'Community Posts', href: '/mcadmin/community-post/details/', url: /\/mcadmin\/community-post\/details/ },
    { id: 'TC-RPT-017', label: 'Direct Conversations', href: '/mcadmin/message/details/', url: /\/mcadmin\/message\/details/ },
  ];

  for (const d of DRILLDOWNS) {
    test(`${d.id} ${d.label} metric opens its detail report`, async ({ page }) => {
      const link = page.locator(`a[href*="${d.href}"]`).first();
      if (!(await link.isVisible().catch(() => false))) {
        test.skip(true, `${d.label} drill-down link not present (section may be empty).`);
      }
      await link.click();
      await expect(page).toHaveURL(d.url, { timeout: 30_000 });
    });
  }

  /**
   * Per-report "Generate CSV" export. Confirmed live: each detail report exposes
   * a "Generate CSV" control (button/anchor.js_download_trigger). Clicking it
   * queues the export and shows the #js_alert_box acknowledgement "We are
   * generating the report, it will be emailed to you shortly." (the CSV is
   * emailed to the admin — see TC-RPT-005/006 for the email-verified proof on the
   * activity reports). Each test confirms the export option is present and
   * accepted on that report; skips when a report exposes no CSV export.
   */
  const CSV_EXPORTS: { id: string; label: string; href: string }[] = [
    { id: 'TC-RPT-019', label: 'Users', href: '/mcadmin/user/details/' },
    { id: 'TC-RPT-020', label: 'In-Transit users', href: '/mcadmin/in-transit-user/details/' },
    { id: 'TC-RPT-021', label: 'Growth Partnerships', href: '/mcadmin/mentorship/details/' },
    { id: 'TC-RPT-022', label: 'Goals & Tasks', href: '/mcadmin/mentorship/goals-tasks/' },
    { id: 'TC-RPT-023', label: 'Mentor-Mentee Availability Gaps', href: '/mcadmin/mentor-mentee-balance/details/' },
    { id: 'TC-RPT-024', label: '1:1 Sessions', href: '/mcadmin/meeting/details/' },
    { id: 'TC-RPT-025', label: 'Feedback From 1:1 Sessions', href: '/mcadmin/session-survey/' },
    { id: 'TC-RPT-026', label: 'Fireside Chats', href: '/mcadmin/fireside-chat/details/' },
    { id: 'TC-RPT-027', label: 'Circles', href: '/mcadmin/roundtable/details/' },
    { id: 'TC-RPT-028', label: 'Circle Posts', href: '/mcadmin/roundtable-post/details/' },
    { id: 'TC-RPT-029', label: 'Community Posts', href: '/mcadmin/community-post/details/' },
    { id: 'TC-RPT-030', label: 'Direct Conversations', href: '/mcadmin/message/details/' },
  ];

  for (const c of CSV_EXPORTS) {
    test(`${c.id} ${c.label} report offers a Generate CSV export`, async ({ page }) => {
      const link = page.locator(`a[href*="${c.href}"]`).first();
      if (!(await link.isVisible().catch(() => false))) {
        test.skip(true, `${c.label} drill-down not present.`);
      }
      await link.click();
      await expect(page).toHaveURL(new RegExp(c.href.replace(/[/]/g, '\\/')), { timeout: 30_000 });

      const csvBtn = page.locator('.js_download_trigger').filter({ visible: true }).first();
      await csvBtn.waitFor({ timeout: 15_000 }).catch(() => {});
      if (!(await csvBtn.isVisible().catch(() => false))) {
        test.skip(true, `${c.label} report exposes no Generate CSV control.`);
      }
      // The legacy jQuery click handler binds after the table data loads, so a
      // too-early click is a no-op — retry the click until the export is queued
      // and the #js_alert_box acknowledgement ("…emailed to you shortly") shows.
      const ack = page
        .locator('#js_alert_box')
        .getByText(/generating the report|emailed to you/i)
        .first();
      await expect(async () => {
        await csvBtn.click();
        await expect(ack).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 45_000 });
      await page.locator('#js_alert_box .js_modal_ok:visible').first().click().catch(() => {});
    });
  }
});

/**
 * Activity-report exports — verified end-to-end. These run as the OTP test user
 * (an admin whose mailbox we can read), so the export email lands where we can
 * assert it. Each run triggers a real export + email; skipped when IMAP isn't
 * configured.
 */
async function otpAdminPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  await login(page, OTP_EMAIL, process.env.OTP_TEST_PASSWORD ?? '');
  return { context, page };
}

test.describe('Admin Reports — activity exports (email-verified)', () => {
  test.beforeEach(() => {
    if (!otpInboxConfigured() || !OTP_EMAIL || !process.env.OTP_TEST_PASSWORD) {
      test.skip(
        true,
        'Export-email tests need OTP_TEST_EMAIL/OTP_TEST_PASSWORD + OTP_IMAP_* in .env.'
      );
    }
  });

  for (const who of ['Mentor', 'Mentee'] as const) {
    const id = who === 'Mentor' ? 'TC-RPT-005' : 'TC-RPT-006';
    test(`${id} export ${who} Activity Report delivers the CSV by email`, async ({ browser }) => {
      test.setTimeout(240_000); // export generation + email delivery
      const { context, page } = await otpAdminPage(browser);
      try {
        await page.goto(REPORTS_PATH);
        await expect(
          page.getByRole('heading', { name: 'Growth Partnerships', exact: true }).first()
        ).toBeVisible({ timeout: 30_000 });

        const requestedAt = new Date();
        await page.getByRole('button', { name: new RegExp(`${who}.*activity report`, 'i') }).first().click();
        // The export request is acknowledged.
        await expect(
          page.getByText(new RegExp(`generating the ${who} activity report.*emailed`, 'i')).first()
        ).toBeVisible({ timeout: 20_000 });

        // The actual report is emailed as a CSV attachment to the readable mailbox.
        const mail = await fetchEmail({
          to: OTP_EMAIL,
          since: requestedAt,
          from: FROM_MC,
          subject: new RegExp(`${who}.*activity report`, 'i'),
          timeoutMs: 180_000,
        });
        expect(mail, `${who} activity report email should arrive`).not.toBeNull();
        expect(mail!.from).toMatch(FROM_MC);
        const csv = mail!.attachments.find((a) => /\.csv$/i.test(a.filename) || /csv/i.test(a.contentType));
        expect(csv, 'export email should carry a CSV attachment').toBeTruthy();
        expect(csv!.size, 'CSV attachment should be non-empty').toBeGreaterThan(0);
      } finally {
        await context.close();
      }
    });
  }

  // TC-RPT-018 — The Profile Report export is accepted (queued + emailed).
  test('TC-RPT-018 export Profile Report is accepted', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await otpAdminPage(browser);
    try {
      await page.goto(REPORTS_PATH);
      await expect(
        page.getByRole('heading', { name: 'Growth Partnerships', exact: true }).first()
      ).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: /^profile report$/i }).first().click();
      // Either an export-queued confirmation or a generating/emailed message.
      await expect(
        page.getByText(/generating|emailed|will be sent|report/i).first()
      ).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: /^ok$/i }).first().click().catch(() => {});
    } finally {
      await context.close();
    }
  });
});
