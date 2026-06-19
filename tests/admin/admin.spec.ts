import { test, expect } from '../utils/fixtures';

import { STORAGE_STATE } from '../utils/credentials';

/**
 * Admin Panel module — TC-ADMIN-001 to TC-ADMIN-010.
 *
 * Read-only structural coverage of the program-admin panel (/mcadmin/). Confirmed
 * against live staging. STRICTLY non-destructive: every test only loads a section
 * and asserts its controls render — nothing is saved, sent, invited, edited, or
 * deleted, and no action touches any other account.
 *
 * Sections: Dashboard · Reports (see reports.spec) · Invitation · Emails
 *   (preferences) · Settings · Tools · Engage Users · User Segments.
 */
test.use({ storageState: STORAGE_STATE.admin });

test.describe('Admin Panel', () => {
  // TC-ADMIN-001 — The admin panel nav exposes every primary section.
  test('TC-ADMIN-001 admin nav shows all primary sections', async ({ page }) => {
    await page.goto('/mcadmin/');
    const nav = page.getByRole('navigation').first();
    for (const name of [/dashboard/i, /reports/i, /invitation/i, /emails/i, /settings/i, /tools/i, /engage users/i]) {
      await expect(
        page.getByRole('link', { name }).first(),
        `nav link ${name} should be present`
      ).toBeVisible({ timeout: 20_000 });
    }
    await expect(nav).toBeVisible();
  });

  // TC-ADMIN-002 — The Dashboard renders Overall Stats and its stat sections.
  test('TC-ADMIN-002 dashboard shows Overall Stats and stat sections', async ({ page }) => {
    await page.goto('/mcadmin/dashboard/');
    await expect(page.getByText(/overall stats/i).first()).toBeVisible({ timeout: 30_000 });
    // Scope to visible matches — these words also exist in the hidden main-app nav.
    for (const name of ['Users', 'Sessions', 'Growth Partnerships', 'Growth Topics']) {
      await expect(
        page.getByText(name, { exact: true }).filter({ visible: true }).first(),
        `${name} stat`
      ).toBeVisible();
    }
  });

  // TC-ADMIN-003 — The "Total Session Hours" report toggles its session-type tabs.
  test('TC-ADMIN-003 dashboard session-hours tabs switch', async ({ page }) => {
    await page.goto('/mcadmin/dashboard/');
    await expect(page.getByText(/total session hours/i).first()).toBeVisible({ timeout: 30_000 });
    const fsc = page.getByRole('tab', { name: /fireside chats/i }).or(page.getByText(/fireside chats/i)).first();
    const oneOne = page.getByRole('tab', { name: /1-1 sessions/i }).or(page.getByText(/1-1 sessions/i)).first();
    await expect(oneOne).toBeVisible();
    await fsc.click();
    await expect(fsc).toBeVisible();
    await oneOne.click();
    await expect(oneOne).toBeVisible();
  });

  // TC-ADMIN-004 — The Dashboard leaderboard toggles between Mentors and Mentees.
  test('TC-ADMIN-004 dashboard leaderboard tabs switch', async ({ page }) => {
    await page.goto('/mcadmin/dashboard/');
    const mentors = page.getByRole('tab', { name: /^mentors$/i }).or(page.getByText(/^mentors$/i)).first();
    const mentees = page.getByRole('tab', { name: /^mentees$/i }).or(page.getByText(/^mentees$/i)).first();
    await expect(mentors).toBeVisible({ timeout: 30_000 });
    await mentees.click();
    await expect(mentees).toBeVisible();
    await mentors.click();
    await expect(mentors).toBeVisible();
  });

  // TC-ADMIN-005 — The Emails (preferences) page renders its template editor controls.
  // Presence only — the Save action is never clicked (it would change org settings).
  test('TC-ADMIN-005 email preferences page shows its controls', async ({ page }) => {
    await page.goto('/mcadmin/email-preferences/');
    await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^preview$/i }).first()).toBeVisible();
  });

  // TC-ADMIN-006 — The Settings page loads without error.
  test('TC-ADMIN-006 settings page loads', async ({ page }) => {
    const resp = await page.goto('/mcadmin/settings/');
    expect(resp?.status() ?? 200).toBeLessThan(400);
    await expect(page).toHaveURL(/\/mcadmin\/settings/);
    // The shared admin shell renders (Reports nav link is always present).
    await expect(page.getByRole('link', { name: /reports/i }).first()).toBeVisible({ timeout: 20_000 });
  });

  // TC-ADMIN-007 — The Tools page shows its tool categories. Presence only — no
  // tool is run (several are bulk/destructive operations).
  test('TC-ADMIN-007 tools page shows its categories', async ({ page }) => {
    await page.goto('/mcadmin/tools/');
    // Scope to visible matches — "Sessions" etc. also exist in the hidden main nav.
    for (const name of [/partnerships/i, /sessions/i, /groups/i, /manage/i]) {
      await expect(
        page.getByText(name).filter({ visible: true }).first(),
        `tools category ${name}`
      ).toBeVisible({ timeout: 30_000 });
    }
  });

  // TC-ADMIN-008 — The Engage Users composer renders. Presence only — neither
  // "Send Email" (a broadcast to a user segment) nor any send is triggered.
  test('TC-ADMIN-008 Engage Users composer renders', async ({ page }) => {
    test.slow();
    // The Engage Users page is a heavy React/MUI app that can exceed the 45s
    // nav timeout under full-suite load; accept the navigation as soon as it
    // commits and wait on the rendered content below.
    await page.goto('/mcadmin/dynamic-message', { waitUntil: 'commit', timeout: 90_000 });
    await expect(page.getByText(/engage users/i).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/user segment/i).first()).toBeVisible();
    await expect(page.getByText(/subject/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /send email/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /send test email to myself/i }).first()).toBeVisible();
  });

  // TC-ADMIN-009 — The User Segments list renders with its controls. Presence only.
  test('TC-ADMIN-009 user segments list renders', async ({ page }) => {
    await page.goto('/user-segment/list/');
    await expect(page).toHaveURL(/\/user-segment\/list/);
    // "Create User Segment" is unique to this page (matched by text — it renders
    // as a styled <a>, not a <button>).
    await expect(
      page.getByText(/create user segment/i).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/sort by/i).filter({ visible: true }).first()
    ).toBeVisible();
  });

  // TC-ADMIN-010 — The Invitation page exposes its three invitation modes.
  // Presence only — no invitation is submitted here (see TC-EMAIL-003 for the send).
  test('TC-ADMIN-010 invitation page shows its invitation tabs', async ({ page }) => {
    await page.goto('/mcadmin/user/invite/');
    await expect(page.getByText(/invite user/i).first()).toBeVisible({ timeout: 30_000 });
    for (const name of [/new user invitation/i, /program invitation/i, /bulk invitation/i]) {
      await expect(page.getByText(name).first(), `invitation tab ${name}`).toBeVisible();
    }
  });
});
