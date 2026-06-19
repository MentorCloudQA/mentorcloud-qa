/* eslint-disable */
/**
 * Generates a PDF catalogue of the newly added MentorCloud QA test cases.
 *
 * Renders a self-contained HTML document to PDF using the Chromium that ships
 * with Playwright (already a dev dependency), so no extra tooling is required.
 *
 *   node scripts/generate-testcases-pdf.cjs
 *
 * Output: ../testing-reports/MentorCloud_New_TestCases_<date>.pdf
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const GENERATED_ON = '2026-06-06';

/** All test cases added in this round, grounded in the Django/React source. */
const MODULES = [
  {
    name: 'Navigation & App-Shell Smoke',
    file: 'tests/navigation/navigation.spec.ts',
    blurb:
      'A fast safety net proving the shared shell renders and every primary destination is reachable. First line of defence against "platform is broken" regressions.',
    cases: [
      {
        id: 'TC-NAV-001',
        title: 'Header shows search, messages, notifications, and avatar',
        route: '/',
        data: 'None',
        steps: 'Load home; assert the search toggle, notification bell, avatar menu (and messages icon when enabled) are visible.',
        expected: 'All core header controls render.',
      },
      {
        id: 'TC-NAV-002',
        title: 'Primary navigation links are visible',
        route: '/',
        data: 'None',
        steps: 'Assert the Home link plus at least one module link (Programs/Sessions/Circles/Learn/Community) is present.',
        expected: 'Top navigation renders with the enabled modules.',
      },
      {
        id: 'TC-NAV-003',
        title: 'Programs nav link navigates correctly',
        route: '→ /mentorship/program',
        data: 'None',
        steps: 'Click the Programs nav link.',
        expected: 'Lands on the Programs route.',
      },
      {
        id: 'TC-NAV-004',
        title: 'Sessions nav link navigates correctly',
        route: '→ /events/sessions',
        data: 'None',
        steps: 'Click the Sessions nav link.',
        expected: 'Lands on the Sessions route.',
      },
      {
        id: 'TC-NAV-005',
        title: 'Circles nav link navigates correctly',
        route: '→ /roundtable',
        data: 'None',
        steps: 'Click the Circles nav link.',
        expected: 'Lands on the Circles route.',
      },
      {
        id: 'TC-NAV-006',
        title: 'Learn nav link navigates correctly',
        route: '→ /library',
        data: 'None',
        steps: 'Click the Learn nav link.',
        expected: 'Lands on the Library/Learn route.',
      },
      {
        id: 'TC-NAV-007',
        title: 'Community nav link navigates correctly',
        route: '→ /community',
        data: 'None',
        steps: 'Click the Community nav link.',
        expected: 'Lands on the Community route.',
      },
      {
        id: 'TC-NAV-008',
        title: 'Avatar dropdown shows the account menu',
        route: '/',
        data: 'None',
        steps: 'Open the avatar dropdown; assert Profile, Settings, Help, and Logout links.',
        expected: 'Full account menu is exposed.',
      },
      {
        id: 'TC-NAV-009',
        title: 'Clicking the logo returns to home',
        route: '/library/ → /',
        data: 'None',
        steps: 'From the Library page, click the header logo.',
        expected: 'Returns to the home dashboard.',
      },
    ],
  },
  {
    name: 'Settings & Privacy',
    file: 'tests/settings/settings.spec.ts',
    blurb:
      'Django-rendered preferences under /user/preferences/{general,account,email}. Org-conditional sections (SSO password form, delete-account toggle) skip gracefully.',
    cases: [
      {
        id: 'TC-SET-001',
        title: 'Avatar dropdown opens Settings & Privacy',
        route: '→ /user/preferences/general',
        data: 'None',
        steps: 'Open avatar menu → click "Settings and Privacy".',
        expected: 'Settings & Privacy page loads (General section).',
      },
      {
        id: 'TC-SET-002',
        title: 'Settings page shows the three section tabs',
        route: '/user/preferences/general',
        data: 'None',
        steps: 'Assert sidebar links to General, Security, and Notifications routes.',
        expected: 'All three section tabs present.',
      },
      {
        id: 'TC-SET-003',
        title: 'General page shows VC setup and timezone controls',
        route: '/user/preferences/general',
        data: 'None',
        steps: 'Assert "Video Conferencing Setup", the Time Zone selector, and the options form.',
        expected: 'General preferences render.',
      },
      {
        id: 'TC-SET-004',
        title: 'Security page shows the password change form',
        route: '/user/preferences/account',
        data: 'Skips on SSO/OAuth-only orgs',
        steps: 'Assert 3 password fields, the Password Policy list, and the Confirm button.',
        expected: 'Password change form renders.',
      },
      {
        id: 'TC-SET-005',
        title: 'Invalid password change is rejected',
        route: '/user/preferences/account',
        data: 'Safe negative (wrong current pw — never succeeds)',
        steps: 'Submit a wrong current password with mismatched new passwords.',
        expected: 'Stays on the security page / shows an error; account unchanged.',
      },
      {
        id: 'TC-SET-006',
        title: 'Security page shows the Delete Account section',
        route: '/user/preferences/account',
        data: 'Skips when org-disabled',
        steps: 'Assert the Delete Account heading and button (never clicked).',
        expected: 'Delete Account section present.',
      },
      {
        id: 'TC-SET-007',
        title: 'Notifications page shows email preferences',
        route: '/user/preferences/email',
        data: 'None',
        steps: 'Assert the "Email Notifications" heading and preferences form.',
        expected: 'Notification preferences render.',
      },
      {
        id: 'TC-SET-008',
        title: 'Navigate between settings sections',
        route: 'general → account → email',
        data: 'None',
        steps: 'Click through the General → Security → Notifications tabs.',
        expected: 'Each section route loads.',
      },
      {
        id: 'TC-SET-009',
        title: 'Settings redirects logged-out users to login',
        route: '/user/preferences/general (logged out)',
        data: 'Empty session',
        steps: 'Visit settings without a session.',
        expected: 'Redirected to /accounts/login.',
      },
    ],
  },
  {
    name: 'Global Search / People',
    file: 'tests/search/search.spec.ts',
    blurb:
      'Header typeahead (js_user_search → JSON global_search endpoint) and the People directory at /usersearch/members/. Assertions tolerate the React community-list variant.',
    cases: [
      {
        id: 'TC-SRCH-001',
        title: 'Header search toggle reveals the search input',
        route: '/',
        data: 'None',
        steps: 'Click the header search icon; assert the search box ("Search users") appears.',
        expected: 'Search input is revealed.',
      },
      {
        id: 'TC-SRCH-002',
        title: 'Typing a name surfaces a matching suggestion',
        route: '/',
        data: 'Skips if no matching users',
        steps: 'Type "venu" into the search box; wait for a matching suggestion.',
        expected: 'A matching user suggestion appears.',
      },
      {
        id: 'TC-SRCH-003',
        title: 'The members directory page loads',
        route: '/usersearch/members/',
        data: 'None',
        steps: 'Visit the directory; assert a People/Members heading or user cards.',
        expected: 'Directory renders (template or React variant).',
      },
      {
        id: 'TC-SRCH-004',
        title: 'The members directory exposes a Filter control',
        route: '/usersearch/members/',
        data: 'Skips on React variant',
        steps: 'Assert the Filter button is present.',
        expected: 'Filter control available.',
      },
    ],
  },
  {
    name: 'Help & FAQ',
    file: 'tests/help/help.spec.ts (extended)',
    blurb: 'Help-hub cards at /organization/help/ and the FAQ page + search at /organization/faq/.',
    cases: [
      {
        id: 'TC-HELP-003',
        title: 'Help & Support hub shows its three cards',
        route: '/organization/help/',
        data: 'None',
        steps: 'Assert Intro Tour, FAQs (→ /organization/faq), Contact Admin (→ /feedback/contact).',
        expected: 'All three hub cards render with correct links.',
      },
      {
        id: 'TC-HELP-004',
        title: 'FAQs card opens the FAQ page',
        route: '→ /organization/faq/',
        data: 'None',
        steps: 'Click the FAQs card.',
        expected: '"Frequently asked questions" page loads.',
      },
      {
        id: 'TC-HELP-005',
        title: 'FAQ search returns results',
        route: '/organization/faq/',
        data: 'None',
        steps: 'Type "mentor" into the FAQ search and submit.',
        expected: 'Results region populates without error.',
      },
    ],
  },
  {
    name: 'Sessions — Fireside Chat Detail',
    file: 'tests/sessions/sessions.spec.ts (extended)',
    blurb: 'The fireside-chat detail page /events/open/<id>/, reached from the FSC tab. Skips when no chat exists.',
    cases: [
      {
        id: 'TC-SESS-017',
        title: 'Fireside chat detail page opens from the FSC tab',
        route: '→ /events/open/<id>/',
        data: 'Skips if no fireside chats',
        steps: 'Open the Fireside Chats tab; click a chat card.',
        expected: 'Detail page loads with breadcrumb + title heading.',
      },
      {
        id: 'TC-SESS-018',
        title: 'Fireside chat detail exposes an attendee action',
        route: '/events/open/<id>/',
        data: 'Skips if no fireside chats',
        steps: 'Open a chat; assert Take Action / Register / Join / Cancel / a status badge.',
        expected: 'An attendee action or status is shown (page never broken).',
      },
    ],
  },
  {
    name: 'Profile — View & Badges',
    file: 'tests/profile/profile.spec.ts (extended)',
    blurb: 'The profile view page reached from the avatar menu, asserting the name heading and earned badges.',
    cases: [
      {
        id: 'TC-PROF-008',
        title: 'Profile view shows name and badges',
        route: '→ /profile/...',
        data: 'Skips if no earned badges',
        steps: 'Avatar → Profile; assert the name heading and badge icons.',
        expected: 'Profile view renders with name and (if any) badges.',
      },
    ],
  },
];

const totalCases = MODULES.reduce((n, m) => n + m.cases.length, 0);

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function moduleHtml(m, idx) {
  const rows = m.cases
    .map(
      (c) => `
      <tr>
        <td class="id">${esc(c.id)}</td>
        <td class="title">${esc(c.title)}</td>
        <td class="route">${esc(c.route)}</td>
        <td>${esc(c.steps)}</td>
        <td>${esc(c.expected)}</td>
        <td class="data">${esc(c.data)}</td>
      </tr>`
    )
    .join('');
  return `
    <section class="module ${idx > 0 ? 'break' : ''}">
      <h2>${idx + 1}. ${esc(m.name)} <span class="count">${m.cases.length} cases</span></h2>
      <p class="file"><code>${esc(m.file)}</code></p>
      <p class="blurb">${esc(m.blurb)}</p>
      <table>
        <thead>
          <tr>
            <th class="id">ID</th><th>Title</th><th>Route</th>
            <th>Steps</th><th>Expected result</th><th>Data / skip</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1b2733; margin: 0; padding: 0; }
  .cover { padding: 60px 48px 40px; border-bottom: 4px solid #2f6df6; }
  .cover h1 { font-size: 30px; margin: 0 0 6px; color: #15233a; }
  .cover .sub { font-size: 15px; color: #51606f; margin: 0 0 24px; }
  .cover .meta { font-size: 13px; color: #51606f; line-height: 1.7; }
  .badge { display:inline-block; background:#2f6df6; color:#fff; font-size:12px; font-weight:600; padding:3px 10px; border-radius:12px; }
  .summary { padding: 24px 48px; }
  .summary table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
  .summary td, .summary th { border: 1px solid #dde3ea; padding: 7px 10px; text-align: left; }
  .summary th { background: #f3f6fb; }
  section.module { padding: 8px 48px 28px; }
  section.break { page-break-before: always; }
  h2 { font-size: 18px; color: #15233a; border-bottom: 2px solid #e6ebf2; padding-bottom: 6px; margin: 18px 0 6px; }
  h2 .count { font-size: 12px; color:#2f6df6; font-weight:600; }
  .file { margin: 2px 0; }
  .file code, td code { background:#f3f6fb; padding:1px 5px; border-radius:4px; font-size:11.5px; }
  .blurb { font-size: 12px; color:#51606f; margin: 4px 0 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #dde3ea; padding: 6px 8px; vertical-align: top; text-align: left; }
  thead th { background: #f3f6fb; color:#15233a; font-size: 11px; }
  td.id, th.id { white-space: nowrap; font-weight:700; color:#2f6df6; }
  td.title { font-weight:600; }
  td.route { font-family: "SF Mono", Consolas, monospace; font-size: 10px; color:#3a4b5e; }
  td.data { color:#7a3e00; }
  tbody tr:nth-child(even) { background:#fafbfd; }
  .footer { padding: 16px 48px 40px; font-size: 11px; color:#8693a3; }
</style></head>
<body>
  <div class="cover">
    <div class="badge">QA · Playwright E2E</div>
    <h1>MentorCloud — New Automated Test Cases</h1>
    <p class="sub">Coverage added by mining the Django + React source for untested user-facing routes.</p>
    <div class="meta">
      <strong>${totalCases} new test cases</strong> across ${MODULES.length} modules &nbsp;·&nbsp; Generated ${GENERATED_ON}<br/>
      Target: <code>https://staging-global.mentorcloud.com</code> &nbsp;·&nbsp; Run: <code>npx playwright test --project=staging</code><br/>
      Every selector is grounded in the platform templates/components. Seeded-data and org-gated
      cases <code>test.skip(...)</code> with a reason rather than fail spuriously.
    </div>
  </div>

  <div class="summary">
    <table>
      <thead><tr><th>#</th><th>Module</th><th>Spec file</th><th>Cases</th><th>Case IDs</th></tr></thead>
      <tbody>
        ${MODULES.map(
          (m, i) =>
            `<tr><td>${i + 1}</td><td>${esc(m.name)}</td><td><code>${esc(
              m.file
            )}</code></td><td>${m.cases.length}</td><td>${esc(
              m.cases[0].id
            )} – ${esc(m.cases[m.cases.length - 1].id)}</td></tr>`
        ).join('')}
        <tr><td></td><td><strong>Total</strong></td><td></td><td><strong>${totalCases}</strong></td><td></td></tr>
      </tbody>
    </table>
  </div>

  ${MODULES.map(moduleHtml).join('')}

  <div class="footer">
    MentorCloud QA · These specs are validated to compile and be discovered by Playwright; the first
    live staging run will surface any selectors needing tuning against the real DOM. Network
    (following/followers) and the badge-detail page remain deferred pending a stable id selector.
  </div>
</body></html>`;

(async () => {
  const outDir = path.resolve(__dirname, '..', '..', 'testing-reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `MentorCloud_New_TestCases_${GENERATED_ON}.pdf`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({
    path: outPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await browser.close();
  console.log(`PDF written: ${outPath}`);
  console.log(`Modules: ${MODULES.length} · Test cases: ${totalCases}`);
})();
