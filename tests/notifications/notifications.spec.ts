import { test, expect } from '../utils/fixtures';

import { STORAGE_STATE } from '../utils/credentials';

/**
 * Notifications module — TC-NOTIF-001 to TC-NOTIF-005.
 *
 * Header bell + dropdown are Django shell elements (mcloud/templates/_header.html):
 *   Bell trigger -> .js_notification_popover_toggle (icon .mi-bell)
 *   Dropdown     -> .js_notification_popover_dropdown / .js_notification_popover
 *   View All     -> link to /notification/list/
 *   Unread badge -> .bubble.bubble--danger
 */
test.use({ storageState: STORAGE_STATE.mentor });

test.describe('Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // TC-NOTIF-001 — Open the notifications panel from the bell icon
  test('TC-NOTIF-001 open the notifications panel from the bell', async ({ page }) => {
    const bell = page.locator('.js_notification_popover_toggle').first();
    await expect(bell).toBeVisible();
    await bell.click();

    await expect(
      page.locator('.js_notification_popover_dropdown, .js_notification_popover').first()
    ).toBeVisible();
  });

  // TC-NOTIF-002 — View All opens the full notifications list page
  test('TC-NOTIF-002 View All opens the full notifications list', async ({ page }) => {
    await page.locator('.js_notification_popover_toggle').first().click();

    const viewAll = page.getByRole('link', { name: /view all/i }).first();
    await expect(viewAll).toBeVisible();
    await viewAll.click();

    await expect(page).toHaveURL(/\/notification\/list/);
  });

  // TC-NOTIF-003 — Mark a notification as read (badge count decreases)
  test('TC-NOTIF-003 marking a notification as read decreases the badge', async ({ page }) => {
    const badge = page.locator('.bubble.bubble--danger').first();
    if ((await badge.count()) === 0 || !(await badge.isVisible().catch(() => false))) {
      test.skip(true, 'No unread notifications to mark as read.');
    }
    const before = parseInt((await badge.innerText()).replace(/\D+/g, '') || '0', 10);

    await page.locator('.js_notification_popover_toggle').first().click();
    // Clicking an unread notification marks it read.
    await page.locator('.js_notification_popover a, .js_notification_popover li').first().click();

    // Re-read the badge; it should decrease (or disappear).
    await expect
      .poll(async () => {
        const b = page.locator('.bubble.bubble--danger').first();
        if (!(await b.isVisible().catch(() => false))) return 0;
        return parseInt((await b.innerText()).replace(/\D+/g, '') || '0', 10);
      })
      .toBeLessThan(before);
  });

  // TC-NOTIF-004 — Clicking a notification navigates to the related item
  test('TC-NOTIF-004 clicking a notification navigates to the related item', async ({ page }) => {
    await page.locator('.js_notification_popover_toggle').first().click();
    // Notification items (a.notification__item-content) are fetched after the
    // popover opens — wait for them before deciding there are none.
    const firstItem = page
      .locator('.js_notification_popover a.notification__item-content, .js_notification_popover_dropdown a.notification__item-content')
      .first();
    await firstItem.waitFor({ timeout: 15_000 }).catch(() => {});
    if (!(await firstItem.isVisible().catch(() => false))) {
      test.skip(true, 'No notifications available to click.');
    }
    await firstItem.click();
    // Navigates away from home to the related item.
    await expect(page).not.toHaveURL(/\/$/);
  });

  // TC-NOTIF-005 — "Mark All as Read" clears the unread badge. Lives on the
  // full list page (/notification/list/). Runs LAST in this file so the earlier
  // tests still find unread items; the fixture account accumulates new
  // notifications constantly, so this never starves future runs.
  test('TC-NOTIF-005 Mark All as Read clears the unread badge', async ({ page }) => {
    const badge = page.locator('.bubble.bubble--danger').first();
    if (!(await badge.isVisible().catch(() => false))) {
      test.skip(true, 'No unread notifications to mark as read.');
    }
    await page.goto('/notification/list/');
    const markAll = page
      .getByRole('button', { name: /mark all as read/i })
      .filter({ visible: true })
      .first();
    await markAll.waitFor({ timeout: 20_000 });
    await markAll.click();
    // Confirm if a dialog pops, then the unread badge clears.
    await page.locator('#js_alert_box .js_modal_ok:visible').first().click().catch(() => {});
    await expect
      .poll(
        async () => {
          const b = page.locator('.bubble.bubble--danger').first();
          if (!(await b.isVisible().catch(() => false))) return 0;
          return parseInt((await b.innerText()).replace(/\D+/g, '') || '0', 10);
        },
        { timeout: 30_000 },
      )
      .toBe(0);
  });
});
