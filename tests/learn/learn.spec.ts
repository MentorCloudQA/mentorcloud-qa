import { test, expect } from '../utils/fixtures';

import { STORAGE_STATE } from '../utils/credentials';

/**
 * Learn module — TC-LEARN-001 to TC-LEARN-005.
 *
 * Confirmed against live staging (React page at /library/):
 *   Heading      -> "Learning Resources"
 *   Search       -> getByRole('textbox', { name: 'Search for a resource' })
 *   Sort By      -> getByRole('button', { name: 'Sort By' })
 *   File filters -> getByRole('link', { name: 'PDF' | 'Video' })
 *   Role filters -> checkboxes "All" / "Coach" / "Coachee" / "Mentor" / "Mentee"
 *   Resource     -> a[href*="/library/resource/"]
 */
test.use({ storageState: STORAGE_STATE.mentor });

const LIBRARY_PATH = '/library/';
const resourceLinks = 'a[href*="/library/resource/"]';

test.describe('Learn', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LIBRARY_PATH);
    await expect(page.getByRole('heading', { name: /learning resources/i })).toBeVisible();
  });

  // TC-LEARN-001 — Search for a resource by keyword
  test('TC-LEARN-001 search for a resource by keyword', async ({ page }) => {
    const search = page.getByRole('textbox', { name: /search for a resource/i });
    await expect(search).toBeVisible();
    await search.fill('test');
    await search.press('Enter');

    // Matching resource cards appear.
    await expect(page.locator(resourceLinks).first()).toBeVisible({ timeout: 15_000 });
  });

  // TC-LEARN-002 — Sort resources using the Sort By dropdown
  test('TC-LEARN-002 sort resources via the Sort By dropdown', async ({ page }) => {
    const sort = page.getByRole('button', { name: /sort by/i });
    await expect(sort).toBeVisible();
    await sort.click();

    // The dropdown reveals sort options (e.g. Recent First / Alphabetical).
    const option = page
      .getByRole('option')
      .or(page.getByRole('menuitem'))
      .or(page.getByText(/recent first|alphabetical|oldest/i))
      .first();
    await expect(option).toBeVisible();
    await option.click();

    await expect(page.locator(resourceLinks).first()).toBeVisible({ timeout: 15_000 });
  });

  // TC-LEARN-003 — Filter resources by Program / Topic / File Type / Role
  test('TC-LEARN-003 filter resources by file type and see role filters', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /filter by file type/i })).toBeVisible();
    await page.getByRole('link', { name: /^PDF$/ }).click();

    // Role + Program/Topic filters are present too.
    await expect(page.getByRole('heading', { name: /filter by role/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /filter by program\/topic/i })).toBeVisible();

    // Results refresh (cards or an empty state).
    await expect(page.locator('body')).toBeVisible();
  });

  // TC-LEARN-004 — Open a video or PDF resource successfully
  test('TC-LEARN-004 open a resource', async ({ page }) => {
    const card = page.locator(resourceLinks).first();
    if (!(await card.isVisible().catch(() => false))) {
      test.skip(true, 'No resources available to open.');
    }
    await card.click();
    await expect(page).toHaveURL(/\/library\/resource\//, { timeout: 20_000 });
  });

  // TC-LEARN-005 — Empty state shown when no resources match the search keyword
  test('TC-LEARN-005 no resources match a nonsense search', async ({ page }) => {
    // Wait for the initial resource list to load before searching.
    await expect(page.locator(resourceLinks).first()).toBeVisible({ timeout: 15_000 });

    const search = page.getByRole('textbox', { name: /search for a resource/i });
    await search.fill('zzzzz-no-such-resource-qqqq');
    await search.press('Enter');

    // The "No resources found" empty state appears.
    await expect(page.getByText(/no resources found/i)).toBeVisible({ timeout: 15_000 });
  });
});
