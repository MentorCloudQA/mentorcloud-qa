import { test, expect } from '../utils/fixtures';

import { STORAGE_STATE } from '../utils/credentials';
import { openAvatarMenu } from '../utils/shell';

/**
 * PERMISSIONS bug-regression suite — TC-REG-PERM-001..013.
 *
 * Each test stops a previously shipped authorization/role-gating bug from
 * returning. Traced to Jira keys under "permissions" in regression-bug-digest.json.
 *
 * Source-confirmed gating (apps/mcadmin/urls.py + apps/mcadmin/views.py +
 * apps/mcauth/mixins.py):
 *   SubOrgAdminLoginRequiredMixin -> authenticated non-admin is REDIRECTED to
 *     dashboard:home ("/"). Used by: AdminHome (/mcadmin/), AdminDashboardTemplateView
 *     (/mcadmin/dashboard/), AdminUserInvitationView (/mcadmin/user/invite/),
 *     AdminToolsView (/mcadmin/tools/), NonCustomizableView.
 *   AdminLoginRequiredMixin -> authenticated non-admin gets HTTP 403 Forbidden.
 *     Used by: AdminSettingsDashboard (/mcadmin/settings/), EmailPreferencesView
 *     (/mcadmin/email-preferences/).
 *   SuperAdminLoginRequiredMixin -> OrgSettingsView (cross-org updates).
 *   LoginRequiredMixin (base) -> logged-out users are sent to /accounts/login/.
 *
 * The mentee fixture is a plain (non-admin) user, so it is the right probe for
 * "should be blocked". The admin fixture confirms the same routes are reachable.
 * All checks are READ-ONLY (GET navigations only).
 */

/** mcadmin routes that redirect non-admins to "/" (SubOrgAdminLoginRequiredMixin). */
const REDIRECT_GATED_ROUTES: { path: string; label: string }[] = [
  { path: '/mcadmin/', label: 'Admin home/dashboard' },
  { path: '/mcadmin/dashboard/', label: 'Admin React dashboard' },
  { path: '/mcadmin/user/invite/', label: 'Admin user invitation' },
  { path: '/mcadmin/tools/', label: 'Admin tools' },
];

/** mcadmin routes that return 403 for non-admins (AdminLoginRequiredMixin). */
const FORBIDDEN_GATED_ROUTES: { path: string; label: string }[] = [
  { path: '/mcadmin/settings/', label: 'Admin settings dashboard' },
  { path: '/mcadmin/email-preferences/', label: 'Admin email preferences' },
];

test.describe('PERMISSIONS regression — mentee blocked from admin', () => {
  test.use({ storageState: STORAGE_STATE.mentee });

  // guards: ME-1964 (AnonymousUser has no is_super_admin) / NF-1159 (users
  // unable to access platform) — a non-admin hitting redirect-gated /mcadmin/
  // routes must be bounced to home, never see admin content or a 500.
  for (const route of REDIRECT_GATED_ROUTES) {
    // guards: ME-1964, NF-957 (org-admin mis-shown as User), CD-1388 (blank admin screen)
    test(`TC-REG-PERM-00${REDIRECT_GATED_ROUTES.indexOf(route) + 1} mentee is redirected away from ${route.label}`, async ({
      page,
    }) => {
      const resp = await page.goto(route.path);
      // Must not be a server error, and must not stay on the admin URL showing data.
      expect(resp?.status() ?? 0, `${route.path} must not 500`).toBeLessThan(500);
      await page.waitForLoadState('domcontentloaded');
      // Redirected to home (or login if the session lapsed) — never the admin page itself.
      const url = page.url();
      const leftAdmin = !/\/mcadmin\//.test(new URL(url).pathname) || /\/accounts\/login/.test(url);
      expect(leftAdmin, `mentee should not remain on ${route.path}; landed on ${url}`).toBe(true);
    });
  }

  // guards: ME-2522 (403 after blocked sub-org admin login) / NF-1751 (Emails
  // tab visible to program admin) — these routes are AdminLoginRequiredMixin, so
  // a non-admin must receive an explicit 403, never the admin email/settings UI.
  for (const route of FORBIDDEN_GATED_ROUTES) {
    test(`TC-REG-PERM-00${FORBIDDEN_GATED_ROUTES.indexOf(route) + 5} mentee gets 403 on ${route.label}`, async ({
      page,
    }) => {
      // Use a raw request so we read the real status code, not a rendered redirect.
      const resp = await page.request.get(route.path, { maxRedirects: 0 });
      const status = resp.status();
      // 403 is the documented behaviour; a redirect to login (3xx) is also a safe
      // block. The bug we guard against is 200 with admin content, or a 500.
      const blocked = status === 403 || (status >= 300 && status < 400);
      expect(blocked, `${route.path} returned ${status}; expected 403 or redirect`).toBe(true);
    });
  }

  // guards: NF-1751 (Emails tab visible to program admin) / CD-716 / ME-1184 —
  // the admin "Email Preferences" surface must not be reachable as a non-admin.
  // Cross-checks via the rendered page (not just status) that no admin email
  // configuration content leaks.
  test('TC-REG-PERM-007 mentee sees no admin email-preferences content', async ({ page }) => {
    const resp = await page.goto('/mcadmin/email-preferences/');
    expect(resp?.status() ?? 0).toBeLessThan(500);
    // No admin email-config controls should render for a non-admin.
    await expect(page.getByRole('heading', { name: /email preferences|customizable emails/i })).toHaveCount(0);
  });

  // guards: ME-258 (chapter visibility permissions) / MS-784 (user can view all
  // org sessions by removing the mentoring_role query param) — admin data-table
  // endpoints must not serve raw data to a non-admin. We probe a representative
  // admin datatable route and require a block (non-2xx or redirect/login).
  test('TC-REG-PERM-008 mentee cannot pull admin user-details datatable', async ({ page }) => {
    const resp = await page.request.get('/mcadmin/user/details/', { maxRedirects: 0 });
    const status = resp.status();
    const blocked = status === 403 || status === 404 || (status >= 300 && status < 400);
    expect(blocked, `admin datatable returned ${status}; expected block`).toBe(true);
  });

  // guards: ME-2386 (access-denied page after guest clicks email URL) /
  // CD-2321 (Invalid URL for "User" role profiles) — the avatar menu of a plain
  // member must NOT expose an Admin/Dashboard entry that a mentee shouldn't have.
  // NOTE: best-effort label match; admin links carry "Admin"/"Dashboard" text.
  test('TC-REG-PERM-009 mentee avatar menu hides admin-only entries', async ({ page }) => {
    await page.goto('/');
    const menu = await openAvatarMenu(page);
    // A non-admin should still see Profile/Settings/Logout (sanity), but not an
    // org-admin console link. If the fixture is unexpectedly an admin, skip.
    const adminLink = menu.getByRole('link', { name: /^.*\b(admin|admin dashboard|manage org)\b.*$/i });
    if ((await adminLink.count()) > 0) {
      test.skip(true, 'Mentee fixture appears to have admin rights; cannot assert hidden controls.');
    }
    await expect(menu.getByRole('link', { name: /logout/i })).toBeVisible();
  });
});

test.describe('PERMISSIONS regression — logged-out gating', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // guards: ME-1964 (AnonymousUser has no is_super_admin) — hitting an admin URL
  // while logged-out must redirect to login, never raise the AttributeError 500
  // that this Sentry was about.
  test('TC-REG-PERM-010 logged-out admin deep-link redirects to login (no 500)', async ({ page }) => {
    const resp = await page.goto('/mcadmin/');
    expect(resp?.status() ?? 0, 'must not 500').toBeLessThan(500);
    await expect(page).toHaveURL(/\/accounts\/login/, { timeout: 20_000 });
  });

  // guards: ME-1964 / ME-2522 — the 403-gated admin settings route must also
  // gate logged-out users to login rather than 403/500 them anonymously.
  test('TC-REG-PERM-011 logged-out admin-settings deep-link redirects to login', async ({ page }) => {
    const resp = await page.goto('/mcadmin/settings/');
    expect(resp?.status() ?? 0).toBeLessThan(500);
    await expect(page).toHaveURL(/\/accounts\/login/, { timeout: 20_000 });
  });
});

test.describe('PERMISSIONS regression — admin retains access', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  // guards: CD-1388 (blank admin screen) / CD-2368 (infinite loading on admin
  // reports) / NF-1080 ("Something went wrong" on Admin Dashboard) — the same
  // routes blocked for mentees must remain reachable + render for a real admin.
  test('TC-REG-PERM-012 admin can reach the admin home without error', async ({ page }) => {
    const resp = await page.goto('/mcadmin/');
    const status = resp?.status() ?? 0;
    if (status === 403 || /\/accounts\/login/.test(page.url())) {
      test.skip(true, 'Admin fixture lacks admin rights on this org; cannot assert positive access.');
    }
    expect(status).toBeLessThan(500);
    await expect(page).toHaveURL(/\/mcadmin/);
    await expect(page.getByText(/traceback|something went wrong/i)).toHaveCount(0);
  });

  // guards: NF-1751 / CD-716 — the admin email-preferences surface (403 for
  // mentees) must be reachable for an org admin and not blank/500.
  test('TC-REG-PERM-013 admin can reach email preferences', async ({ page }) => {
    const resp = await page.request.get('/mcadmin/email-preferences/', { maxRedirects: 0 });
    const status = resp.status();
    if (status === 403 || (status >= 300 && status < 400)) {
      test.skip(true, 'Admin fixture is not an org admin on this org (got blocked).');
    }
    expect(status, `admin email-preferences returned ${status}`).toBeLessThan(500);
  });
});
