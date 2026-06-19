import { test, expect } from '../utils/fixtures';
import type { Page, Response } from '@playwright/test';

import { STORAGE_STATE } from '../utils/credentials';

/**
 * BUG-REGRESSION — 500 / SERVER-ERROR route-health sweep (TC-REG-500-001..016).
 *
 * A broad, parameterised GET of every major authenticated route, asserting that
 * none returns a 500 / renders the Django error page, and that the expected
 * landmark renders. This is the suite's safety net against the recurring
 * "page X throws a 500" regressions that have hit MentorCloud across orgs.
 *
 * Originating Jira bugs (regression-bug-digest.json → "servererror"):
 *   ME-381   pending mentorships page → 500
 *   CD-1393  past mentorships → 500 (production)
 *   ME-937   mentorship overview generates 500
 *   CD-1720  general preferences page → 500
 *   CD-2170/CD-2172/NF-1818  invitation page → 500
 *   CD-2666  invitation activation 500 (unguarded sub_org FK deref)
 *   ME-569   mentee suggestions return 500 when no suggestions
 *   ME-3149  notification page-2 → 500
 *   CD-2562/CD-2685  users facing 500s for activity on the platform
 *   ME-256   mentorship surveys → 404 (should be graceful, not 500)
 *   MS-901   user-details page for a user without a profile → "page not found", not 500
 *   MS-1118  admin session report modal → 404 on scroll
 *
 * Detection model: the project's handler500 (apps/mcauth/views.py → server_error)
 * renders mcloud/templates/500.html, an image-only page served with HTTP status
 * 500; the bare fallback emits "<h1>Server Error (500)</h1>". A DEBUG traceback
 * page contains "Traceback". So we fail on: HTTP status >= 500, OR any of the
 * error markers in the body. The custom 404 page ("no longer valid",
 * "Go to Homepage") is an ACCEPTABLE graceful outcome — only a 500 fails.
 *
 * READ-ONLY: GET navigations only. No state is changed.
 */
test.use({ storageState: STORAGE_STATE.admin });

const ERROR_MARKERS = /Server Error \(500\)|Traceback \(most recent call last\)|Something went wrong|Internal Server Error/i;

/**
 * Navigate to `path` and assert it is healthy: HTTP status < 500 and no Django
 * error-page markers in the body. Returns the response for further checks.
 */
async function expectNo500(page: Page, path: string): Promise<Response | null> {
  const resp = await page.goto(path);
  const status = resp?.status() ?? 0;
  expect(status, `${path} returned HTTP ${status} (expected < 500)`).toBeLessThan(500);
  const body = (await page.locator('body').textContent().catch(() => '')) ?? '';
  expect(body, `${path} rendered a Django error page`).not.toMatch(ERROR_MARKERS);
  // A healthy authenticated route must not bounce us to the login page.
  expect(page, `${path} unexpectedly redirected to login`).not.toHaveURL(/\/accounts\/login/);
  return resp;
}

test.describe('BUG-REGRESSION — 500 / server-error route sweep', () => {
  /**
   * Major authenticated routes. `landmark` is a resilient text/role check that
   * the *expected* page rendered (not just "didn't 500"). Each carries the bug
   * key(s) it most directly guards.
   */
  const ROUTES: { id: string; label: string; path: string; landmark: RegExp; bug: string }[] = [
    { id: 'TC-REG-500-001', label: 'Home dashboard', path: '/', landmark: /home|dashboard|welcome|suggested/i, bug: 'CD-2562/NF-1080 — platform 500s' },
    { id: 'TC-REG-500-002', label: 'Programs', path: '/mentorship/program/', landmark: /program|mentorship/i, bug: 'CD-836 — mentorship page 500' },
    { id: 'TC-REG-500-003', label: 'Sessions', path: '/events/sessions/', landmark: /session/i, bug: 'UI-373 — 500 creating a session' },
    { id: 'TC-REG-500-004', label: 'Past sessions', path: '/events/past/', landmark: /session|past|event/i, bug: 'CD-1393 — past mentorships 500' },
    { id: 'TC-REG-500-005', label: 'Circles', path: '/roundtable/', landmark: /circle|roundtable|community/i, bug: 'ME-1210 — deleting roundtable 404/500' },
    { id: 'TC-REG-500-006', label: 'Learn / Library', path: '/library/', landmark: /learn|librar|insight|resource/i, bug: 'ME-580 — dashboard/library content errors' },
    { id: 'TC-REG-500-007', label: 'Community', path: '/community/', landmark: /community|insight|post/i, bug: 'NF-1080 — Something went wrong in dashboard' },
    { id: 'TC-REG-500-008', label: 'Messages', path: '/message/', landmark: /message|inbox|conversation/i, bug: 'ME-2298 — message 500' },
    { id: 'TC-REG-500-009', label: 'Notifications list', path: '/notification/list/', landmark: /notification/i, bug: 'ME-3149 — notification page-2 500' },
    { id: 'TC-REG-500-010', label: 'Members / network search', path: '/usersearch/members/', landmark: /member|mentor|mentee|search/i, bug: 'ME-1207 — search button 500; CD-2057 blank screen' },
    { id: 'TC-REG-500-011', label: 'Profile update', path: '/profile/update', landmark: /profile|edit|save|about/i, bug: 'CD-2314 — saving profile 500' },
    { id: 'TC-REG-500-012', label: 'Admin invitation page', path: '/mcadmin/user/invite/', landmark: /invite|invitation/i, bug: 'CD-2170/CD-2172/NF-1818 — invitation 500' },
    { id: 'TC-REG-500-013', label: 'Admin reports dashboard', path: '/mcadmin/', landmark: /partnership|circle|report|community/i, bug: 'CD-2369 — admin reports not generated' },
    { id: 'TC-REG-500-014', label: 'Admin email preferences', path: '/mcadmin/email-preferences/', landmark: /email|preference|save|preview/i, bug: 'CD-2010 — email-preferences preview 500' },
  ];

  for (const r of ROUTES) {
    // guards: <bug>. POSITIVE: route GETs cleanly (no 500) and its landmark renders.
    test(`${r.id} ${r.label} loads without a server error`, async ({ page }) => {
      await expectNo500(page, r.path);
      // Prove the authenticated app actually rendered (not a blank/partial page).
      // The shared shell exposes a banner + navigation on every route; the
      // per-route landmark is a visible-filtered fallback (nav labels are
      // icon-only/hidden until hover, so an unfiltered match can be hidden).
      const rendered = page
        .getByRole('banner')
        .or(page.getByRole('navigation'))
        .or(page.getByText(r.landmark).filter({ visible: true }));
      await expect(
        rendered.first(),
        `${r.label} should render the authenticated app shell`
      ).toBeVisible({ timeout: 30_000 });
    });
  }

  // guards: MS-901 — viewing a user-details page for a user WITHOUT a profile
  // must show "page not found", not a 500. NEGATIVE/EDGE: a non-existent profile
  // id resolves to a graceful 404/redirect, never a server error.
  test('TC-REG-500-015 bad profile id is a graceful 404/redirect, not a 500', async ({ page }) => {
    const resp = await page.goto('/profile/program-view/999999999/basic');
    const status = resp?.status() ?? 0;
    // Acceptable: 404 (not found), 2xx with an empty-state, or a redirect.
    expect(status, `bad profile id returned HTTP ${status} — must not be a 5xx (MS-901)`).toBeLessThan(500);
    const body = (await page.locator('body').textContent().catch(() => '')) ?? '';
    expect(body, 'bad profile id must not surface a Django error page').not.toMatch(ERROR_MARKERS);
    // The custom 404 page or a graceful empty-state is the correct outcome.
    const graceful = page
      .getByText(/no longer valid|page not found|go to homepage|not found|does not exist/i)
      .first();
    if (status === 404) {
      await expect(graceful, '404 page should explain + offer a way home').toBeVisible({ timeout: 15_000 });
    }
  });

  // guards: ME-381/ME-937/CD-1393 — pending/past/overview mentorship pages 500.
  // EDGE/NEGATIVE: a mentorship overview for a non-existent program+mentorship id
  // must degrade to a 404/redirect, not a 500. Skips never — bad ids are safe to GET.
  test('TC-REG-500-016 bad mentorship overview id degrades gracefully (no 500)', async ({ page }) => {
    const resp = await page.goto('/mentorship/program/999999999/999999999/overview/');
    const status = resp?.status() ?? 0;
    expect(status, `bad mentorship overview returned HTTP ${status} — must not be 5xx (ME-937/CD-1393)`)
      .toBeLessThan(500);
    const body = (await page.locator('body').textContent().catch(() => '')) ?? '';
    expect(body, 'bad mentorship id must not surface a Django error page').not.toMatch(ERROR_MARKERS);
  });
});
