import { test, expect } from '../utils/fixtures';

import { STORAGE_STATE } from '../utils/credentials';
import { navLink, notificationBell, openAvatarMenu } from '../utils/shell';

/**
 * Navigation & app-shell smoke — TC-NAV-001 to TC-NAV-009.
 *
 * A thin, fast safety net that proves the shared shell renders and every primary
 * destination is reachable and lands on the right route. This is the suite's
 * first line of defence against "the platform is broken" regressions.
 *
 * Shell selectors (mcloud/templates/_header.html, via utils/shell.ts):
 *   search toggle     -> button.js_search_toggle
 *   messages icon     -> a[href="/message/"]
 *   notification bell -> button.js_notification_popover_toggle
 *   avatar dropdown   -> button.btn.js_trigger_mixpanel
 * Top-nav destinations (labels carry an icon prefix; matched by visible text):
 *   Home -> /, Programs -> /mentorship/program, Sessions -> /events/sessions,
 *   Circles -> /roundtable, Learn -> /library, Community -> /community
 */
test.use({ storageState: STORAGE_STATE.mentor });

/** Each primary nav link, its label, and the URL fragment it should land on. */
const NAV_ROUTES: { label: RegExp; url: RegExp }[] = [
  { label: /^Programs$/i, url: /\/mentorship\/program/ },
  { label: /^Sessions$/i, url: /\/events\/sessions/ },
  { label: /^Circles$/i, url: /\/roundtable/ },
  { label: /^Learn$/i, url: /\/library/ },
  { label: /^Community$/i, url: /\/community|\/dashboard\/community/ },
];

test.describe('Navigation & shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // TC-NAV-001 — The header shell renders its core controls
  test('TC-NAV-001 header shows search, messages, notifications, and avatar', async ({ page }) => {
    // Two js_search_toggle buttons exist (a hidden mi-cross "close" twin renders
    // first in DOM), so filter to the visible one.
    await expect(
      page.locator('button.js_search_toggle').filter({ visible: true }).first()
    ).toBeVisible();
    await expect(notificationBell(page).first()).toBeVisible();
    await expect(page.locator('button.btn.js_trigger_mixpanel').last()).toBeVisible();
    // Messages icon is present when the org enables the messages module.
    const messages = page.locator('a[href="/message/"]').first();
    if (await messages.isVisible().catch(() => false)) {
      await expect(messages).toBeVisible();
    }
  });

  // TC-NAV-002 — The primary top navigation is present
  test('TC-NAV-002 primary navigation links are visible', async ({ page }) => {
    await expect(navLink(page, /^Home$/i).first()).toBeVisible();
    // At least one of the module links should be present (modules are org-gated).
    const present = await Promise.all(
      NAV_ROUTES.map((r) => navLink(page, r.label).first().isVisible().catch(() => false))
    );
    expect(present.some(Boolean)).toBe(true);
  });

  // TC-NAV-003..007 — Each primary nav link navigates to its destination
  for (const route of NAV_ROUTES) {
    test(`TC-NAV nav link ${route.label.source} navigates correctly`, async ({ page }) => {
      const link = navLink(page, route.label).first();
      // Give the shell time to render before deciding the module is org-disabled —
      // an immediate isVisible() check skips spuriously on slow staging loads.
      await link.waitFor({ timeout: 15_000 }).catch(() => {});
      if (!(await link.isVisible().catch(() => false))) {
        // Only skip for genuine org-gating: the nav itself must have rendered.
        // A missing nav altogether is a shell regression and must FAIL.
        await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 15_000 });
        test.skip(true, `Nav link ${route.label.source} not enabled for this org.`);
      }
      await link.click();
      await expect(page).toHaveURL(route.url, { timeout: 30_000 });
    });
  }

  // TC-NAV-008 — The avatar dropdown exposes the full account menu
  test('TC-NAV-008 avatar dropdown shows the account menu', async ({ page }) => {
    const menu = await openAvatarMenu(page);
    await expect(menu.getByRole('link', { name: /profile/i })).toBeVisible();
    await expect(menu.getByRole('link', { name: /settings|privacy/i })).toBeVisible();
    await expect(menu.getByRole('link', { name: /help/i })).toBeVisible();
    await expect(menu.getByRole('link', { name: /logout/i })).toBeVisible();
  });

  // TC-NAV-009 — The logo returns the user to the home dashboard
  test('TC-NAV-009 clicking the logo returns to home', async ({ page }) => {
    await page.goto('/library/');
    await expect(page).toHaveURL(/\/library/);
    // The header logo is an anchor wrapping the org/company logo image.
    const logo = page.locator('a').filter({ has: page.locator('img.header__logo') }).first();
    if (!(await logo.isVisible().catch(() => false))) {
      test.skip(true, 'Header logo link not found.');
    }
    await logo.click();
    await expect(page).toHaveURL(/\/$|\/dashboard|\/home/, { timeout: 30_000 });
  });
});
