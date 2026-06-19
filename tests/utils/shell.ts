import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Helpers for the shared app shell (header + nav), confirmed against the live
 * staging DOM. The shell keeps legacy `js_*` classes while rendering React
 * content below it.
 *
 *   search toggle    -> button.js_search_toggle
 *   notification bell -> button.js_notification_popover_toggle
 *   avatar dropdown   -> button.btn.js_trigger_mixpanel  (opens role="menu")
 *   messages icon     -> a[href="/message/"]
 *   top nav           -> <nav> with links: Home, Programs, Sessions, Circles, Learn, Community
 */

/**
 * A top-navigation link by its visible label. Confirmed live: the accessible
 * name carries an icon-font glyph prefix (e.g. " Home") and may carry a count
 * badge suffix (e.g. "Sessions 10"), so anchored patterns like /^Home$/ never
 * match — rebuild the pattern to allow both.
 */
export function navLink(page: Page, name: string | RegExp): Locator {
  const source = typeof name === 'string' ? name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : name.source.replace(/^\^|\$$/g, '');
  const pattern = new RegExp(`^[^a-z0-9]*${source}(\\s+\\d+)?\\s*$`, 'i');
  return page.getByRole('navigation').getByRole('link', { name: pattern });
}

/**
 * Open the avatar/profile dropdown and return its menu locator. On a fresh
 * login an announcement modal (e.g. "Mission Karmayogi") can overlay the shell
 * and intercept the first click, so dismiss any open modal and retry the toggle
 * until the role="menu" actually appears.
 */
export async function openAvatarMenu(page: Page): Promise<Locator> {
  const toggle = page.locator('button.btn.js_trigger_mixpanel').last();
  const menu = page.getByRole('menu');
  await expect(async () => {
    // Close a blocking announcement/intro modal if one is up.
    const closeX = page
      .locator('.mc-modal__cross:visible, [class*="modal"] .mi-cross:visible, [aria-label="Close"]:visible')
      .first();
    if (await closeX.isVisible().catch(() => false)) {
      await closeX.click().catch(() => {});
      await page.waitForTimeout(300);
    }
    await toggle.click({ timeout: 5_000 });
    await expect(menu).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  return menu;
}

/** The header notification bell trigger. */
export function notificationBell(page: Page): Locator {
  return page.locator('button.js_notification_popover_toggle');
}
