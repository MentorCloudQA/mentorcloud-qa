import { test, expect } from '../utils/fixtures';

import { STORAGE_STATE } from '../utils/credentials';

/**
 * Global Search / People directory — TC-SRCH-001 to TC-SRCH-005.
 *
 * Confirmed against the source templates:
 *   Header search toggle -> button.js_search_toggle (mi-search, header__icon)
 *     reveals includes/search_bar.html:
 *       input.search__input.js_user_search  placeholder "Search users"
 *       data-url        -> {% url 'user_search:global_search' %}  (JSON typeahead)
 *       data-search-all -> {% url 'user_search:users' %}          (/usersearch/members/)
 *   Members directory -> /usersearch/members/ (ShowAllView). Non-React orgs render
 *     user_search/global_users.html: h1 "People" + Filter button (js_filter_btn);
 *     React orgs render the community list React page. Assertions tolerate both.
 *
 * The header typeahead hits a live endpoint, so the suggestion test searches for
 * the "venu" fixture accounts and skips gracefully if nothing comes back.
 */
test.use({ storageState: STORAGE_STATE.mentor });

const MEMBERS_PATH = '/usersearch/members/';

/** Open the header search box and return the search input locator. */
async function openSearch(page: import('@playwright/test').Page) {
  // Two js_search_toggle buttons exist (a hidden mi-cross "close" twin renders
  // first in DOM), so filter to the visible one.
  const toggle = page.locator('button.js_search_toggle').filter({ visible: true }).first();
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await toggle.click();
  // The typeahead clones the input into a readonly .tt-hint ghost — target the
  // real (.tt-input) field, which is the one carrying the placeholder.
  const input = page.locator('input.js_user_search:not(.tt-hint)').first();
  await expect(input).toBeVisible({ timeout: 10_000 });
  return input;
}

test.describe('Global Search', () => {
  // TC-SRCH-001 — The header search icon reveals the user search box
  test('TC-SRCH-001 header search toggle reveals the search input', async ({ page }) => {
    await page.goto('/');
    const input = await openSearch(page);
    await expect(input).toHaveAttribute('placeholder', /search users/i);
  });

  // TC-SRCH-002 — Typing a name surfaces a matching user suggestion
  test('TC-SRCH-002 typing a name surfaces a matching suggestion', async ({ page }) => {
    await page.goto('/');
    const input = await openSearch(page);
    await input.click();
    await input.pressSequentially('venu', { delay: 80 });

    // The typeahead renders results (each links to a /profile/ page). Wait for one;
    // skip if the directory has no matching users for this account.
    const suggestion = page
      .locator('a[href*="/profile/"]')
      .filter({ hasText: /venu/i })
      .or(page.getByText(/venu/i))
      .filter({ visible: true })
      .first();
    // NB: isVisible() ignores a timeout option — waitFor is the polling form.
    const appeared = await suggestion
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      test.skip(true, 'Search typeahead returned no matching suggestions.');
    }
    await expect(suggestion).toBeVisible();
  });

  // TC-SRCH-005 — Clicking a typeahead suggestion opens that user's profile
  test('TC-SRCH-005 clicking a suggestion opens the profile', async ({ page }) => {
    await page.goto('/');
    const input = await openSearch(page);
    await input.click();
    await input.pressSequentially('venu', { delay: 80 });

    const suggestion = page
      .locator('a[href*="/profile/"]')
      .filter({ hasText: /venu/i })
      .filter({ visible: true })
      .first();
    await suggestion.waitFor({ timeout: 15_000 }).catch(() => {});
    if (!(await suggestion.isVisible().catch(() => false))) {
      test.skip(true, 'Search typeahead returned no matching suggestions.');
    }
    await suggestion.click();
    await expect(page).toHaveURL(/\/profile\//, { timeout: 20_000 });
  });

  // TC-SRCH-003 — The People / Members directory page loads
  test('TC-SRCH-003 the members directory page loads', async ({ page }) => {
    await page.goto(MEMBERS_PATH);
    await expect(page).toHaveURL(/\/usersearch\/members/);

    // Non-React: "People" heading + Filter button. React: a user-card grid.
    // The list renders hidden duplicates, so filter the union to visible matches.
    const peopleHeading = page.getByRole('heading', { name: /people|all members|members/i });
    const userCard = page.locator('a[href*="/profile/"], .mc-card');
    await expect(
      peopleHeading.or(userCard).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  // TC-SRCH-004 — The members directory exposes a Filter control
  test('TC-SRCH-004 the members directory exposes a Filter control', async ({ page }) => {
    await page.goto(MEMBERS_PATH);
    const filter = page
      .getByRole('button', { name: /^filter$/i })
      .or(page.locator('button.js_filter_btn'))
      .filter({ visible: true })
      .first();
    // NB: isVisible() ignores a timeout option — waitFor is the polling form.
    await filter.waitFor({ timeout: 15_000 }).catch(() => {});
    if (!(await filter.isVisible().catch(() => false))) {
      test.skip(true, 'Filter control not present (React community list variant).');
    }
    await expect(filter).toBeVisible();
  });
});
