import { test, expect } from '../utils/fixtures';
import type { Browser, Page } from '@playwright/test';

import { STORAGE_STATE } from '../utils/credentials';

/**
 * Circles module — TC-CIRC-001 to TC-CIRC-006. ("Circles" = roundtables)
 *
 * Confirmed against live staging (React pages):
 *   My Circles        -> /roundtable/          (link "My Circles")
 *   Available Circles -> /roundtable/others/   (link "Available Circles")
 *   Create (admin)    -> /roundtable/create/   topic=input[name="topic"],
 *                        description textbox, category radio, Select2 member
 *                        invite ("Type the first 3 letter of their name"),
 *                        "Create Circle" -> /roundtable/details/<id>/
 *   Invitation        -> invitee's circle details has links "Accept" / "Decline"
 *
 * All circle data stays between the admin (creator/inviter) and the mentee.
 */

const CIRCLES_PATH = '/roundtable/';

async function rolePage(browser: Browser, role: 'mentor' | 'mentee' | 'admin') {
  const context = await browser.newContext({ storageState: STORAGE_STATE[role] });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  return { context, page };
}

/** As admin, create a circle (optionally inviting a member by name). Returns its details URL. */
async function createCircle(page: Page, topic: string, inviteeName?: string): Promise<string> {
  await page.goto('/roundtable/create/');
  await expect(page.getByRole('heading', { name: /create new circle/i })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name="topic"]').fill(topic);
  await page.getByRole('textbox').nth(1).fill('QA automation circle description.');
  if (await page.getByRole('radio').count()) await page.getByRole('radio').first().check({ force: true });

  if (inviteeName) {
    // Select2 member invite — type with key events so its AJAX search fires.
    await page.getByText(/first 3 letter/i).first().click();
    const search = page.locator('input.select2-input:visible').first();
    await search.click();
    await search.pressSequentially('venu', { delay: 80 });
    await expect(page.locator('.select2-results li').first()).toBeVisible({ timeout: 10_000 });
    // "Venu mentee" is distinctive (role suffixes read like "Venu Ratcha Mentee").
    const option = page.locator('.select2-results li').filter({ hasText: new RegExp(inviteeName, 'i') }).first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
  }

  await page.getByRole('button', { name: /create circle/i }).click();
  await expect(page).toHaveURL(/\/roundtable\/details\/\d+/, { timeout: 20_000 });
  return page.url();
}

test.describe('Circles (mentor)', () => {
  test.use({ storageState: STORAGE_STATE.mentor });

  // TC-CIRC-001 — Navigate to Circles page (header, description, content area visible)
  test('TC-CIRC-001 Circles page shows tabs, description, content area', async ({ page }) => {
    await page.goto(CIRCLES_PATH);
    await expect(page.getByRole('link', { name: /my circles/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /available circles/i })).toBeVisible();
    await expect(page.getByText(/circles are designed|no circle found/i).first()).toBeVisible();
  });

  // TC-CIRC-002 — Switch between My Circles and Available Circles tabs
  test('TC-CIRC-002 switch between My Circles and Available Circles', async ({ page }) => {
    await page.goto(CIRCLES_PATH);
    await expect(page.getByRole('link', { name: /my circles/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /available circles/i })).toBeVisible();
    await page.getByRole('link', { name: /available circles/i }).click();
    await expect(page).toHaveURL(/\/roundtable\/others/, { timeout: 20_000 });
    await expect(page.getByText(/peer-to-peer/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /my circles/i })).toHaveAttribute('href', /\/roundtable\/?$/);
  });
});

test.describe('Circles (admin)', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  // TC-CIRC-005 — Create a new Circle with name and description
  test('TC-CIRC-005 create a new Circle with name and description', async ({ page }) => {
    const topic = `QA Automation Circle ${Date.now().toString().slice(-5)}`;
    const url = await createCircle(page, topic);
    expect(url).toMatch(/\/roundtable\/details\/\d+/);
    await expect(page.getByText(topic).first()).toBeVisible({ timeout: 15_000 });
  });
});

/**
 * Invitation lifecycle — admin invites the mentee, who then accepts, views, and
 * leaves. Serial so the steps share one circle. The admin seeds the invite in
 * beforeAll; the mentee acts in order.
 */
test.describe.serial('Circles — invitation lifecycle (admin→mentee)', () => {
  let circleUrl: string | null = null;
  let circleTopic: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const { context, page } = await rolePage(browser, 'admin');
    try {
      circleTopic = `QA Invite Circle ${Date.now().toString().slice(-5)}`;
      circleUrl = await createCircle(page, circleTopic, 'Venu mentee');
    } finally {
      await context.close();
    }
  });

  // TC-CIRC-003 — Accept a pending circle invitation
  test('TC-CIRC-003 accept a pending circle invitation', async ({ browser }) => {
    test.skip(!circleUrl, 'Circle invite was not created.');
    const { context, page } = await rolePage(browser, 'mentee');
    try {
      await page.goto(circleUrl!);
      const accept = page.getByRole('link', { name: /^accept$/i }).or(page.getByRole('button', { name: /^accept$/i })).first();
      await expect(accept).toBeVisible({ timeout: 15_000 });
      await accept.click();
      // Once accepted, the invitation actions disappear (mentee is now a member).
      await expect(page.getByRole('link', { name: /^accept$/i })).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  // TC-CIRC-004 — View circle details (members, description, activity)
  test('TC-CIRC-004 view circle details', async ({ browser }) => {
    test.skip(!circleUrl, 'Circle invite was not created.');
    const { context, page } = await rolePage(browser, 'mentee');
    try {
      await page.goto(circleUrl!);
      // Member view: topic heading + activity feed + Settings (members access).
      await expect(page.getByRole('heading', { name: new RegExp(circleTopic!, 'i') }).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole('button', { name: /settings/i })).toBeVisible();
      await expect(
        page.getByRole('button', { name: /start a post/i }).or(page.getByRole('link', { name: /posts/i })).first()
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  // TC-CIRC-006 — User can leave a Circle they previously joined
  test('TC-CIRC-006 user can leave a previously joined Circle', async ({ browser }) => {
    test.skip(!circleUrl, 'Circle invite was not created.');
    const { context, page } = await rolePage(browser, 'mentee');
    try {
      await page.goto(circleUrl!);
      await page.getByRole('button', { name: /settings/i }).first().click();
      await page.getByRole('link', { name: /^leave$/i }).first().click();
      // Confirm: "Are you sure you want to leave this circle?" -> Yes.
      await page.locator('.js_modal_ok:visible').first().click();
      // Left: the circle now offers to Join again.
      await expect(page.getByRole('link', { name: /join circle/i })).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });
});
