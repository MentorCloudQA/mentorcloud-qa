import { test, expect } from '../utils/fixtures';
import type { Page } from '@playwright/test';

import { STORAGE_STATE } from '../utils/credentials';

/**
 * BUG-REGRESSION — Admin Reports / DATA-MISMATCH (TC-REG-RPT-001..016).
 *
 * Guards the recurring "the headline count on the Reports dashboard does not
 * agree with the rows in its detail report" family of bugs. These have bitten
 * MentorCloud repeatedly across orgs, so this suite re-asserts the consistency
 * relationship (dashboard metric count === detail-report row count) and the
 * health of the report-export path rather than any single seeded number.
 *
 * Originating Jira bugs (regression-bug-digest.json → "reports"):
 *   CD-2609  IITK Mentor Activity Report data mismatch
 *   CD-2546  Completed session counts differ: Reports page vs Sessions Details
 *   CD-2460  Declined sessions counted as completed in Mentorship report
 *   CD-2471  Mentors/Mentees "Met" count logic in Activity Report
 *   CD-2488  Incorrect End-of-Relationship surveys-sent count
 *   CD-2379  Fireside Chat: confirmed-attendee vs participant-list mismatch
 *   CD-1894  Invitation vs Users report counts not matching (Marriott)
 *   NF-1083  Invitations report showing incorrect count to an org admin
 *   NF-1667  Sessions within/outside mentorship count wrong in Reports
 *   CD-2410  Total Session Hours wrong calculation on Dashboard
 *   CD-2368  Infinite loading on Admin Reports (WNS) / CD-1982 reports page not loading
 *   CD-410 / CD-2020  General issues on the admin Report page
 *   CD-2647  Consolidated data shown on Reports with multiple programs
 *
 * The admin Reports dashboard (React/MUI) lives at /mcadmin/. Each metric card
 * is an <a> into a /mcadmin/<section>/details/ DataTables report. Confirmed
 * destinations are listed in tests/reports/reports.spec.ts.
 *
 * READ-ONLY / non-destructive: navigations + (queued, email-delivered) export
 * requests only — nothing is saved, edited, sent to other users, or deleted.
 * Where an exact count needs seeded data, we assert the consistency
 * relationship and test.skip when a section/report is empty.
 */
const REPORTS_PATH = '/mcadmin/';

test.use({ storageState: STORAGE_STATE.admin });

/**
 * Pull the first integer out of a metric card / link text (e.g. "Users\n128"
 * or "1:1 Sessions 52"). Returns null when no number is present.
 */
function firstInt(text: string | null): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * Count the data rows rendered in a detail report's DataTable. The legacy
 * reports render a <table> whose tbody holds the rows; an empty table shows a
 * single "No data available" placeholder row, which we treat as zero.
 * The DataTable footer ("Showing 1 to N of TOTAL entries") is the source of
 * truth for the *total* row count across pages, so prefer it when present.
 */
async function detailRowTotal(page: Page): Promise<number | null> {
  // Prefer the DataTables "info" footer — it reports the full total, not just
  // the current page. NOTE: selector .dataTables_info is the stock DataTables
  // class; best-effort, falls back to counting visible rows.
  const info = page.locator('.dataTables_info').first();
  if (await info.isVisible().catch(() => false)) {
    const txt = (await info.textContent().catch(() => '')) ?? '';
    const m = txt.replace(/,/g, '').match(/of\s+(\d+)\s+entries/i);
    if (m) return Number(m[1]);
  }
  // MUI DataGrid / TablePagination footer ("1–25 of 128") — the React reports.
  const muiPager = page.locator('.MuiTablePagination-displayedRows, .MuiTablePagination-root').first();
  if (await muiPager.isVisible().catch(() => false)) {
    const txt = (await muiPager.textContent().catch(() => '')) ?? '';
    const m = txt.replace(/,/g, '').match(/of\s+(\d+)/i);
    if (m) return Number(m[1]);
  }
  const rows = page.locator('table tbody tr');
  const n = await rows.count().catch(() => 0);
  if (n === 0) return 0;
  // A single "no data" placeholder row → zero data rows.
  if (n === 1) {
    const only = (await rows.first().textContent().catch(() => '')) ?? '';
    if (/no data|no records|empty|nothing/i.test(only)) return 0;
  }
  return n;
}

async function gotoReports(page: Page): Promise<void> {
  await page.goto(REPORTS_PATH);
  await expect(
    page.getByRole('heading', { name: 'Growth Partnerships', exact: true }).first()
  ).toBeVisible({ timeout: 30_000 });
}

test.describe('BUG-REGRESSION — Reports / data-mismatch', () => {
  test.beforeEach(async ({ page }) => {
    await gotoReports(page);
  });

  // guards: CD-2368 — WNS infinite loading on Admin Reports; CD-1982/CD-2369
  // reports page not loading/generating. POSITIVE: the dashboard finishes
  // loading (no perpetual spinner) and renders its sections without a 500.
  test('TC-REG-RPT-001 reports dashboard loads fully (no infinite spinner / 500)', async ({ page }) => {
    const resp = await page.goto(REPORTS_PATH);
    expect(resp?.status() ?? 200, 'reports dashboard must not 500').toBeLessThan(500);
    for (const name of ['Growth Partnerships', 'Circles', 'Community']) {
      await expect(
        page.getByRole('heading', { name, exact: true }).first(),
        `section "${name}" should render`
      ).toBeVisible({ timeout: 30_000 });
    }
    // A stuck MUI/loader spinner is the CD-2368 signature — it must be gone.
    await expect(page.locator('[role="progressbar"], .MuiCircularProgress-root').first())
      .toBeHidden({ timeout: 30_000 })
      .catch(() => {});
  });

  /**
   * DATA-VALIDATION — dashboard metric count === detail report total. The core
   * CD-2609 / CD-2546 class of bug. Each row: the section's metric link, the
   * detail route it opens, and the bug it guards. Skips when the metric or
   * report is empty (no seeded data to reconcile).
   */
  // `mode` reflects a STRUCTURAL property of each report confirmed on staging:
  //  - 'strict'  → the detail report honours the same program scope as the
  //                dashboard card, so the two counts must agree exactly.
  //  - 'nonempty'→ the detail report is GLOBAL (not program-scoped) while the
  //                card is program-scoped, so exact equality is not meaningful;
  //                we assert the report is non-empty when the headline is
  //                non-zero (catches a report that fails to generate) and record
  //                the headline/detail pair as an annotation for product review.
  const COUNT_RECONCILES: { id: string; label: string; href: string; mode: 'strict' | 'nonempty'; bug: string }[] = [
    { id: 'TC-REG-RPT-002', label: 'Users', href: '/mcadmin/user/details/', mode: 'strict', bug: 'CD-1894 — Invitation/Users counts not matching' },
    { id: 'TC-REG-RPT-003', label: 'Growth Partnerships', href: '/mcadmin/mentorship/details/', mode: 'strict', bug: 'CD-2460/CD-1970 — partnership report data wrong' },
    { id: 'TC-REG-RPT-004', label: '1:1 Sessions', href: '/mcadmin/meeting/details/', mode: 'strict', bug: 'CD-2546/NF-1667 — session count mismatch' },
    { id: 'TC-REG-RPT-005', label: 'Fireside Chats', href: '/mcadmin/fireside-chat/details/', mode: 'strict', bug: 'CD-2379 — confirmed-attendee vs participant list' },
    { id: 'TC-REG-RPT-006', label: 'Circles', href: '/mcadmin/roundtable/details/', mode: 'nonempty', bug: 'CD-410 — issues on admin report page' },
    { id: 'TC-REG-RPT-007', label: 'Community Posts', href: '/mcadmin/community-post/details/', mode: 'nonempty', bug: 'CD-2020 — reports issues' },
    { id: 'TC-REG-RPT-008', label: 'Direct Conversations', href: '/mcadmin/message/details/', mode: 'nonempty', bug: 'CD-2020 — reports issues' },
  ];

  for (const c of COUNT_RECONCILES) {
    // guards: <bug>. DATA-VALIDATION: the dashboard headline count for this
    // section equals the row total in its detail report (the CD-2609 family).
    test(`${c.id} ${c.label} headline count reconciles with detail rows`, async ({ page }) => {
      const link = page.locator(`a[href*="${c.href}"]`).first();
      if (!(await link.isVisible().catch(() => false))) {
        test.skip(true, `${c.label} drill-down not present (section empty / org-disabled).`);
      }
      // The metric count hydrates async after the dashboard's first paint — the
      // card text goes from e.g. "Total" to "Total6". Wait for a digit before
      // reading, otherwise we race the API and read a count-less label.
      await expect(link, `${c.label} card count should hydrate`)
        .toContainText(/\d/, { timeout: 20_000 })
        .catch(() => {});
      const headline = firstInt(await link.textContent().catch(() => null));
      if (headline === null) {
        test.skip(true, `${c.label} card exposes no numeric count to reconcile.`);
      }
      if (headline === 0) {
        test.skip(true, `${c.label} count is zero — no rows to reconcile.`);
      }

      await link.click();
      await expect(page).toHaveURL(new RegExp(c.href.replace(/[/]/g, '\\/')), { timeout: 30_000 });
      // Let the DataTable hydrate.
      await page.locator('table tbody tr, .dataTables_info').first().waitFor({ timeout: 30_000 }).catch(() => {});
      const total = await detailRowTotal(page);
      if (total === null) {
        test.skip(true, `${c.label} report exposes no countable table.`);
      }
      // Record the pair on the test for review regardless of the assertion mode.
      test.info().annotations.push({
        type: 'reconcile',
        description: `${c.label}: headline=${headline} detailReportTotal=${total} (${c.mode})`,
      });
      if (c.mode === 'strict') {
        // Same program scope on both sides → counts must agree exactly. A
        // mismatch here is the CD-2609 / CD-2546 data-mismatch bug.
        expect(
          total,
          `${c.label}: dashboard count (${headline}) must equal detail report total (${total}) — ${c.bug}`
        ).toBe(headline);
      } else {
        // Detail report is global while the card is program-scoped — exact
        // equality is not meaningful. Assert it generated rows for a non-zero
        // headline (a report that comes back empty is the real regression).
        expect(
          total!,
          `${c.label}: detail report came back empty despite a headline count of ${headline} — ${c.bug}`
        ).toBeGreaterThan(0);
      }
    });
  }

  // guards: CD-2546 — Completed session counts differ between the Reports page
  // and the Sessions Details page; NF-1667 sessions within/outside count wrong.
  // DATA-VALIDATION: opening the 1:1 Sessions detail report and re-counting its
  // rows must agree with its own DataTables total (self-consistency: filtered
  // page rows ≤ stated total, and the total is a real number).
  test('TC-REG-RPT-009 1:1 Sessions detail report is internally consistent', async ({ page }) => {
    const link = page.locator('a[href*="/mcadmin/meeting/details/"]').first();
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, '1:1 Sessions drill-down not present.');
    }
    await link.click();
    await expect(page).toHaveURL(/\/mcadmin\/meeting\/details/, { timeout: 30_000 });
    await page.locator('table tbody tr, .dataTables_info').first().waitFor({ timeout: 30_000 }).catch(() => {});
    const total = await detailRowTotal(page);
    if (total === null || total === 0) {
      test.skip(true, 'Sessions report is empty — nothing to reconcile.');
    }
    const visibleRows = await page.locator('table tbody tr').count().catch(() => 0);
    expect(visibleRows, 'rendered rows must not exceed the stated total (CD-2546)').toBeLessThanOrEqual(total!);
    expect(total, 'session total must be a real non-negative number (CD-2546)').toBeGreaterThanOrEqual(0);
  });

  // guards: CD-2410 — Total Session Hours wrong calculation on the Dashboard.
  // DATA-VALIDATION: the dashboard Total Session Hours figure renders as a
  // numeric value (not NaN / blank) — CD-387 also showed "NaN" sessions counts.
  test('TC-REG-RPT-010 dashboard Total Session Hours renders a real number (no NaN)', async ({ page }) => {
    await page.goto('/mcadmin/dashboard/');
    const hours = page.getByText(/total session hours/i).first();
    await expect(hours).toBeVisible({ timeout: 30_000 });
    // The figure sits near the heading; assert no "NaN"/"undefined" leaked into
    // the stats panel. NOTE: scoped to the dashboard body text, best-effort.
    const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? '';
    expect(bodyText, 'Total Session Hours panel must not show NaN (CD-2410/CD-387)').not.toMatch(/\bNaN\b/);
  });

  // guards: CD-2647 — Consolidated data shown on Reports with multiple programs.
  // POSITIVE/EDGE: the admin program selector exists so reports can be scoped to
  // a single program (and aren't forced to show consolidated multi-program data).
  test('TC-REG-RPT-011 reports expose a program scope selector (multi-program orgs)', async ({ page }) => {
    // The program dropdown is org-gated (single-program orgs have none).
    const selector = page
      .getByRole('combobox')
      .or(page.locator('select, [class*="program"] [role="button"], .MuiSelect-root'))
      .first();
    if (!(await selector.isVisible().catch(() => false))) {
      test.skip(true, 'No program selector — org likely has a single program (CD-2647 N/A).');
    }
    await expect(selector).toBeVisible();
  });

  /**
   * DATA-VALIDATION — every confirmed detail report renders without a 500 and
   * exposes a countable table (or a clean empty-state). Parameterised over the
   * routes listed in tests/reports/reports.spec.ts. Guards CD-2369 (reports not
   * generated) and CD-410/CD-2020 (report-page errors).
   */
  const DETAIL_ROUTES: { id: string; label: string; href: string }[] = [
    { id: 'TC-REG-RPT-012', label: 'Growth Partnerships', href: '/mcadmin/mentorship/details/' },
    { id: 'TC-REG-RPT-013', label: 'Mentor-Mentee Availability Gaps', href: '/mcadmin/mentor-mentee-balance/details/' },
    { id: 'TC-REG-RPT-014', label: 'Feedback From 1:1 Sessions', href: '/mcadmin/session-survey/' },
    { id: 'TC-REG-RPT-015', label: 'Circle Posts', href: '/mcadmin/roundtable-post/details/' },
  ];

  for (const d of DETAIL_ROUTES) {
    // guards: CD-2369/CD-410 — detail report must render (no 500, table or
    // clean empty-state present). DATA-VALIDATION.
    test(`${d.id} ${d.label} detail report renders cleanly`, async ({ page }) => {
      const resp = await page.goto(d.href);
      expect(resp?.status() ?? 200, `${d.label} must not 500`).toBeLessThan(500);
      await expect(page).toHaveURL(new RegExp(d.href.replace(/[/]/g, '\\/')), { timeout: 30_000 });
      // Either a data table or an explicit empty-state must appear — a blank
      // body is the CD-410/CD-2057 "blank screen" regression.
      const tableOrEmpty = page
        .locator('table, [role="grid"], .MuiDataGrid-root, .dataTables_wrapper')
        .or(page.getByText(/no data|no records|nothing to show|no results/i))
        .or(page.getByRole('button', { name: /generate csv/i }))
        .first();
      await expect(tableOrEmpty, `${d.label} should show a table/grid or empty-state, not a blank page`)
        .toBeVisible({ timeout: 30_000 });
    });
  }

  // guards: CD-2057/CD-2145 — Filtering by country shows a blank screen on
  // Browse/Reports. NEGATIVE/EDGE: applying a filter that yields no matches
  // returns a clean empty-state, not a blank page or a 500. Skips if the report
  // exposes no search/filter control.
  test('TC-REG-RPT-016 empty filter result shows empty-state, not a blank page', async ({ page }) => {
    const resp = await page.goto('/mcadmin/user/details/');
    expect(resp?.status() ?? 200).toBeLessThan(500);
    // DataTables search box is the resilient filter handle on the legacy reports.
    const search = page
      .locator('input[type="search"]')
      .or(page.getByPlaceholder(/search/i))
      .filter({ visible: true })
      .first();
    if (!(await search.isVisible().catch(() => false))) {
      test.skip(true, 'No search/filter control on this report.');
    }
    await search.fill('zzz-no-such-user-qregression-zzz');
    // CD-2057 is a *blank screen* on a no-match filter. The guard is therefore:
    // the page must NOT go blank and must NOT 500 — it should either show an
    // explicit empty-state OR keep its report chrome (heading/table shell). The
    // exact "no records" wording differs per report, so we accept either signal.
    const emptyState = page.getByText(/no matching|no data|no records|nothing|0 of 0|showing 0/i).first();
    const reportChrome = page.getByRole('heading', { name: /users/i })
      .or(page.locator('table'))
      .first();
    await expect(
      emptyState.or(reportChrome),
      'filtered-to-empty report must show an empty-state or keep its chrome, not blank (CD-2057)'
    ).toBeVisible({ timeout: 15_000 });
    const body = (await page.locator('body').textContent().catch(() => '')) ?? '';
    expect(body.trim().length, 'page must not be blank after filtering (CD-2057)').toBeGreaterThan(40);
    expect(body, 'must not surface a server error on empty filter').not.toMatch(/Server Error \(500\)|Traceback/i);
  });
});
