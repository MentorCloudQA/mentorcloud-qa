// Regenerate qa-testcases.pdf from the authoritative spec list (HTML -> Chromium PDF).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
try { require('dotenv').config(); } catch {}

/**
 * Copy a generated PDF into the shared "publish" folder so a single shared link
 * (Google Drive / OneDrive synced folder) always shows the latest version.
 * Set PDF_PUBLISH_DIR in .env to the synced folder path; no-op when unset.
 */
function publishPdf(file) {
  const dir = process.env.PDF_PUBLISH_DIR;
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, path.join(dir, path.basename(file)));
    console.log(`📤 Published ${path.basename(file)} -> ${dir}`);
  } catch (e) {
    console.warn(`⚠️ Could not publish ${file} to ${dir}: ${e.message}`);
  }
}

// IDs added in the recent automation waves — badged NEW in the document.
const NEW = new Set([
  'TC-AUTH-006',
  'TC-SESS-019', 'TC-SESS-020', 'TC-SESS-021', 'TC-SESS-022', 'TC-SESS-023',
  'TC-SESS-024', 'TC-SESS-025', 'TC-SESS-026',
  'TC-COMM-005', 'TC-COMM-006', 'TC-COMM-007', 'TC-COMM-008',
  'TC-MSG-005', 'TC-MSG-006', 'TC-MSG-007',
  'TC-HELP-006', 'TC-HELP-007',
  'TC-SRCH-005', 'TC-PROF-009', 'TC-NOTIF-005', 'TC-I18N-001',
  'TC-EMAIL-001', 'TC-EMAIL-002', 'TC-EMAIL-003', 'TC-EMAIL-004',
  'TC-RPT-001', 'TC-RPT-002', 'TC-RPT-003', 'TC-RPT-004', 'TC-RPT-005', 'TC-RPT-006',
  'TC-RPT-007', 'TC-RPT-008', 'TC-RPT-009', 'TC-RPT-010', 'TC-RPT-011', 'TC-RPT-012',
  'TC-RPT-013', 'TC-RPT-014', 'TC-RPT-015', 'TC-RPT-016', 'TC-RPT-017', 'TC-RPT-018',
  'TC-RPT-019', 'TC-RPT-020', 'TC-RPT-021', 'TC-RPT-022', 'TC-RPT-023', 'TC-RPT-024',
  'TC-RPT-025', 'TC-RPT-026', 'TC-RPT-027', 'TC-RPT-028', 'TC-RPT-029', 'TC-RPT-030',
  'TC-ADMIN-001', 'TC-ADMIN-002', 'TC-ADMIN-003', 'TC-ADMIN-004', 'TC-ADMIN-005',
  'TC-ADMIN-006', 'TC-ADMIN-007', 'TC-ADMIN-008', 'TC-ADMIN-009', 'TC-ADMIN-010',
]);

// Bug-regression specs (TC-REG-*) mined from the Jira bug backlog — all badged NEW.
const isNewCase = (id) => NEW.has(id) || /^TC-REG-/.test(id);
// A case "once was a bug": every TC-REG-* case guards a previously-registered
// Jira bug (its originating keys are in the `// guards:` comment in its spec).
const isBugDerived = (id) => /^TC-REG-/.test(id);

// The Jira "Bug" issue-type icon (red rounded square + white bug), inlined as
// SVG so it renders in the PDF without a network/auth fetch of the avatar.
const BUG_ICON =
  '<svg class="bug" viewBox="0 0 16 16" width="11" height="11" role="img" aria-label="Bug">' +
  '<rect width="16" height="16" rx="3.5" fill="#E5493A"/>' +
  '<g stroke="#fff" stroke-width="0.85" stroke-linecap="round">' +
  '<line x1="6.7" y1="3.3" x2="5.8" y2="2.2"/><line x1="9.3" y1="3.3" x2="10.2" y2="2.2"/>' +
  '<line x1="6.1" y1="6" x2="4.2" y2="5.1"/><line x1="5.9" y1="8" x2="3.9" y2="8"/>' +
  '<line x1="6.1" y1="10" x2="4.2" y2="10.9"/><line x1="9.9" y1="6" x2="11.8" y2="5.1"/>' +
  '<line x1="10.1" y1="8" x2="12.1" y2="8"/><line x1="9.9" y1="10" x2="11.8" y2="10.9"/></g>' +
  '<circle cx="8" cy="4.4" r="1.15" fill="#fff"/>' +
  '<rect x="6.3" y="5" width="3.4" height="6.4" rx="1.7" fill="#fff"/></svg>';

const modules = [
  {
    n: 'Authentication', spec: 'tests/auth/auth.spec.ts',
    blurb: 'Login UI, OTP login, logout, and deep-link auth gating. Runs from a logged-out browser.',
    cases: [
      ['TC-AUTH-001', 'Login page loads with email, password, and login button', '/accounts/login/', ''],
      ['TC-AUTH-002', 'Login is rejected with invalid credentials', '/accounts/login/', 'Safe negative'],
      ['TC-AUTH-003', 'Login succeeds with valid mentor credentials', '/accounts/login/', ''],
      ['TC-AUTH-004', 'User can log in with a valid OTP (email 6-digit code)', '/accounts/login/', 'Reads OTP over IMAP; skips if unconfigured'],
      ['TC-AUTH-005', 'User can log out from the avatar dropdown', '→ /accounts/logout/', ''],
      ['TC-AUTH-006', 'Deep links redirect logged-out users to login', 'sessions / community / message / profile', ''],
    ],
  },
  {
    n: 'Navigation & App-Shell', spec: 'tests/navigation/navigation.spec.ts',
    blurb: 'Smoke net proving the shared shell renders and every primary destination is reachable.',
    cases: [
      ['TC-NAV-001', 'Header shows search, messages, notifications, and avatar', '/', ''],
      ['TC-NAV-002', 'Primary navigation links are visible', '/', ''],
      ['TC-NAV-003', 'Programs nav link navigates correctly', '→ /mentorship/program', 'Skips if org-disabled'],
      ['TC-NAV-004', 'Sessions nav link navigates correctly', '→ /events/sessions', 'Skips if org-disabled'],
      ['TC-NAV-005', 'Circles nav link navigates correctly', '→ /roundtable', 'Skips if org-disabled'],
      ['TC-NAV-006', 'Learn nav link navigates correctly', '→ /library', 'Skips if org-disabled'],
      ['TC-NAV-007', 'Community nav link navigates correctly', '→ /community', 'Skips if org-disabled'],
      ['TC-NAV-008', 'Avatar dropdown shows the account menu', '/', ''],
      ['TC-NAV-009', 'Clicking the logo returns to home', '/library/ → /', ''],
    ],
  },
  {
    n: 'Home Dashboard', spec: 'tests/home/home.spec.ts',
    blurb: 'The mentee home dashboard: header, nav, partnership section, Knowledge Hub, Wall of Fame.',
    cases: [
      ['TC-HOME-001', 'Home shows header, nav, partnership section, and sidebar', '/', ''],
      ['TC-HOME-002', '"Why is this important?" expands with explanation', '/', ''],
      ['TC-HOME-003', 'Knowledge Hub "Browse All Resources" loads the library', '/ → /library', ''],
      ['TC-HOME-004', 'Impact Wall of Fame heading, subtitle, and carousel arrow', '/', ''],
      ['TC-HOME-005', 'Logging a session increments Completed Sessions count', '/', 'Self-cleaning'],
      ['TC-HOME-006', 'Avatar dropdown shows the full menu', '/', ''],
    ],
  },
  {
    n: 'Programs (Mentee) & Partnership Saga', spec: 'tests/programs/programs.spec.ts',
    blurb: 'Recommended coaches, browse/search, and the full mentor↔mentee partnership lifecycle.',
    cases: [
      ['TC-PROG-001', 'Home shows Recommended Coaches and Browse All Coaches', '/', ''],
      ['TC-PROG-002', 'Clicking X removes the first coach card from the carousel', '/', 'Empty rail = pass; backfill-aware'],
      ['TC-PROG-003', 'Next arrow shifts the carousel', '/', ''],
      ['TC-PROG-004', 'Browse All Coaches navigates to the coaches list', '/ → /usersearch/list/', ''],
      ['TC-PROG-005', 'All Coaches page lists coaches', '/usersearch/list/', ''],
      ['TC-PROG-006', 'Searching surfaces the expected coach', '/usersearch/list/', ''],
      ['TC-PROG-007', 'Clicking a coach card opens the coach profile', '→ /profile/program-view/', ''],
      ['TC-PROG-008', 'Coach profile shows the 3 action controls', '/profile/program-view/', ''],
      ['TC-PROG-009', 'Start Growth Partnership opens the request form', 'mentee → mentor', ''],
      ['TC-PROG-010', 'Completing the form submits the request', 'mentee → mentor', 'Saga'],
      ['TC-PROG-011', 'User can edit an existing partnership request', 'mentee', 'Saga'],
      ['TC-PROG-012', 'Mentor can accept a pending partnership request', 'mentor', 'Saga'],
      ['TC-PROG-013', 'User can cancel a pending partnership request', 'mentee', 'Saga'],
      ['TC-PROG-014', 'Mentor can decline a pending partnership request', 'mentor', 'Saga'],
      ['TC-PROG-015', 'View Past Partnerships shows past mentorships', '?pastMentorship=true', ''],
      ['TC-PROG-016', 'Find Coaches navigates to the coaches list', '/mentorship/program/', ''],
      ['TC-PROG-017', 'User can add a Goal to an active partnership', 'overview', 'Saga'],
      ['TC-PROG-018', 'User can add, edit, and delete a Task within a Goal', 'overview', 'Saga'],
      ['TC-PROG-019', 'Accept Pledge works on the partnership dashboard', 'overview', 'Skips: no pledge configured'],
    ],
  },
  {
    n: 'Sessions — Fireside Chats & 1:1', spec: 'tests/sessions/sessions.spec.ts',
    blurb: 'FSC create/register/update/cancel lifecycle, session notes, recurring series, and the 1:1 propose→accept/decline/cancel saga. FSC = Fireside Chat.',
    cases: [
      ['TC-SESS-001', 'Page loads with mini tabs and action buttons', '/events/sessions/', ''],
      ['TC-SESS-002', 'Switching mini tabs filters content', '/events/sessions/', ''],
      ['TC-SESS-003', 'Empty state shows expected CTAs', '/events/sessions/', 'Admin acct; skips if data'],
      ['TC-SESS-004', 'View Past Sessions opens the past view', '/events/past/', ''],
      ['TC-SESS-005', 'Filter button opens the filter panel', '/events/sessions/', ''],
      ['TC-SESS-006', 'User can create a new Fireside Chat (E2E, self-cleaning)', '/events/chat/create/', ''],
      ['TC-SESS-007', 'User can schedule a 1:1 session', 'mentee → mentor', 'Saga'],
      ['TC-SESS-008', 'Scheduling pre-selects the participant', 'coach profile', ''],
      ['TC-SESS-009', 'Upcoming sessions list renders session items', '/events/sessions/', ''],
      ['TC-SESS-010', 'Mentor can accept a pending 1:1 session request', 'mentor', 'Saga'],
      ['TC-SESS-011', 'Mentor can decline a pending 1:1 session request', 'mentor', 'Saga'],
      ['TC-SESS-012', 'Accepted session appears in the mentor list', 'mentor', ''],
      ['TC-SESS-013', 'User can reschedule an upcoming 1:1 session', 'mentor', 'Saga'],
      ['TC-SESS-014', 'User can cancel an upcoming 1:1 session', 'mentee', 'Saga'],
      ['TC-SESS-015', 'Completed sessions appear in the past view', '/events/past/', ''],
      ['TC-SESS-016', 'Calendar-connect modal Skip and Connect both work', 'propose page', ''],
      ['TC-SESS-017', 'Fireside chat detail page opens from the FSC tab', '/events/open/<id>/', 'Creates fixture if empty'],
      ['TC-SESS-018', 'Fireside chat detail exposes an attendee action', '/events/open/<id>/', ''],
      ['TC-SESS-019', 'Mentee can register for a fireside chat and cancel', '/events/open/<id>/', 'Cross-account, self-cleaning'],
      ['TC-SESS-020', 'FSC detail exposes Join / calendar / notes links', '/events/open/<id>/', ''],
      ['TC-SESS-021', 'FSC create rejects missing required fields', '/events/chat/create/', 'Safe negative'],
      ['TC-SESS-022', 'Generate with AI drafts the FSC description', '/events/chat/create/', ''],
      ['TC-SESS-023', 'Recurring FSC creates a recurring series', '/events/chat/create/', 'Cancels every occurrence'],
      ['TC-SESS-024', 'Mentee sees no host controls on another host’s chat', '/events/open/<id>/', 'Authorization negative'],
      ['TC-SESS-025', 'Host Update opens the prefilled chat edit form', '→ /events/chat/<id>/update/', ''],
      ['TC-SESS-026', 'Take Session Notes opens the notes editor', '/events/open/<id>/', ''],
    ],
  },
  {
    n: 'Circles', spec: 'tests/circles/circles.spec.ts',
    blurb: 'Circle tabs, creation, invitation accept, details, and leaving a joined circle.',
    cases: [
      ['TC-CIRC-001', 'Circles page shows tabs, description, content area', '/roundtable', ''],
      ['TC-CIRC-002', 'Switch between My Circles and Available Circles', '/roundtable', ''],
      ['TC-CIRC-003', 'Accept a pending circle invitation', 'admin → mentee', ''],
      ['TC-CIRC-004', 'View circle details', '/roundtable', ''],
      ['TC-CIRC-005', 'Create a new Circle with name and description', '/roundtable', ''],
      ['TC-CIRC-006', 'User can leave a previously joined Circle', 'admin → mentee', ''],
    ],
  },
  {
    n: 'Community', spec: 'tests/community/community.spec.ts',
    blurb: 'Post feed, tabs, publishing posts and questions, save/like/comment, and post search. All write-flows self-clean.',
    cases: [
      ['TC-COMM-001', 'Community page shows the post feed', '/community/', ''],
      ['TC-COMM-002', 'Switch between All / Saved / My Activities tabs', '/community/', ''],
      ['TC-COMM-003', 'Open the create-post composer', '/community/', ''],
      ['TC-COMM-004', 'Saving a post adds it to Saved Posts', '/community/saved/', 'Self-cleaning'],
      ['TC-COMM-005', 'Publishing a post adds it to the feed', '/community/', 'Publish + delete'],
      ['TC-COMM-006', 'User can like and comment on a post', '/community/', 'On own post; self-cleaning'],
      ['TC-COMM-007', 'Searching surfaces a matching post', '/community/', 'Self-cleaning'],
      ['TC-COMM-008', 'Asking a question publishes a question post', '/community/', 'Requires topic; self-cleaning'],
    ],
  },
  {
    n: 'Learn / Library', spec: 'tests/learn/learn.spec.ts',
    blurb: 'Learning resources: search, sort, filters, opening a resource, and the empty state.',
    cases: [
      ['TC-LEARN-001', 'Search for a resource by keyword', '/library/', ''],
      ['TC-LEARN-002', 'Sort resources via the Sort By dropdown', '/library/', ''],
      ['TC-LEARN-003', 'Filter resources by file type and see role filters', '/library/', ''],
      ['TC-LEARN-004', 'Open a video or PDF resource', '→ /library/resource/', ''],
      ['TC-LEARN-005', 'No resources match a nonsense search (empty state)', '/library/', ''],
    ],
  },
  {
    n: 'Messaging', spec: 'tests/messaging/messaging.spec.ts',
    blurb: 'Inbox, compose, reply, cross-account delivery, conversations filter, and AI draft.',
    cases: [
      ['TC-MSG-001', 'Open the Messages page from navigation', '/message/', ''],
      ['TC-MSG-002', 'Open the compose form', '/message/', ''],
      ['TC-MSG-003', 'Reply to an existing message thread', '/message/<id>/', 'Skips on empty inbox'],
      ['TC-MSG-004', 'Empty inbox shows the placeholder', '/message/', 'Admin acct'],
      ['TC-MSG-005', 'A thread reply reaches the other participant', '/message/<id>/', 'Cross-account'],
      ['TC-MSG-006', 'Conversations Filter opens the filter panel', '/message/', ''],
      ['TC-MSG-007', 'Draft with AI generates a message body', '/message/', 'Never sends'],
    ],
  },
  {
    n: 'Notifications', spec: 'tests/notifications/notifications.spec.ts',
    blurb: 'Header bell, dropdown, View All, mark-read behaviors, and mark-all-read.',
    cases: [
      ['TC-NOTIF-001', 'Open the notifications panel from the bell', '/', ''],
      ['TC-NOTIF-002', 'View All opens the full notifications list', '→ /notification/list/', ''],
      ['TC-NOTIF-003', 'Marking a notification as read decreases the badge', '/', 'Skips if none unread'],
      ['TC-NOTIF-004', 'Clicking a notification navigates to the related item', '/', 'Skips if none'],
      ['TC-NOTIF-005', 'Mark All as Read clears the unread badge', '/notification/list/', 'Skips if none unread'],
    ],
  },
  {
    n: 'Profile — View & Edit', spec: 'tests/profile/profile.spec.ts',
    blurb: 'Profile view/edit form: fields, save round-trips, photo control, working hours, validation, badges.',
    cases: [
      ['TC-PROF-001', 'Edit page loads with main form fields', '/profile/update', ''],
      ['TC-PROF-002', 'Avatar dropdown navigates to the profile page with Edit', '→ /profile/', ''],
      ['TC-PROF-003', 'User can save profile changes', '/profile/update', ''],
      ['TC-PROF-004', 'User can upload a profile photo (control present)', '/profile/update', ''],
      ['TC-PROF-005', 'Working hours change persists after save', '/profile/update', 'Restores original'],
      ['TC-PROF-006', 'Country and postal code controls are present', '/profile/update', ''],
      ['TC-PROF-007', 'Empty First Name blocks save with a validation error', '/profile/update', 'Safe negative'],
      ['TC-PROF-008', 'Profile view shows name and (if any) badges', '/profile/', 'Skips if no badges'],
      ['TC-PROF-009', 'Title change persists after save', '/profile/update', 'Restores original'],
    ],
  },
  {
    n: 'Settings & Privacy', spec: 'tests/settings/settings.spec.ts',
    blurb: 'Preferences under /user/preferences/{general,account,email}. Org-conditional sections skip gracefully.',
    cases: [
      ['TC-SET-001', 'Avatar dropdown opens Settings & Privacy', '→ /user/preferences/general', ''],
      ['TC-SET-002', 'Settings page shows the three section tabs', '/user/preferences/general', ''],
      ['TC-SET-003', 'General page shows VC setup and timezone controls', '/user/preferences/general', ''],
      ['TC-SET-004', 'Security page shows the password change form', '/user/preferences/account', 'Skips on SSO orgs'],
      ['TC-SET-005', 'Invalid password change is rejected', '/user/preferences/account', 'Safe negative'],
      ['TC-SET-006', 'Security page shows the Delete Account section', '/user/preferences/account', 'SKIPPED per QA directive'],
      ['TC-SET-007', 'Notifications page shows email preferences', '/user/preferences/email', ''],
      ['TC-SET-008', 'Navigate between settings sections', 'general → account → email', ''],
      ['TC-SET-009', 'Settings redirects logged-out users to login', '(logged out)', ''],
    ],
  },
  {
    n: 'Global Search / People', spec: 'tests/search/search.spec.ts',
    blurb: 'Header typeahead and the People directory at /usersearch/members/.',
    cases: [
      ['TC-SRCH-001', 'Header search toggle reveals the search input', '/', ''],
      ['TC-SRCH-002', 'Typing a name surfaces a matching suggestion', '/', 'Skips if no match'],
      ['TC-SRCH-003', 'The members directory page loads', '/usersearch/members/', ''],
      ['TC-SRCH-004', 'The members directory exposes a Filter control', '/usersearch/members/', 'Skips on React variant'],
      ['TC-SRCH-005', 'Clicking a suggestion opens the profile', '/ → /profile/', 'Skips if no match'],
    ],
  },
  {
    n: 'Help & FAQ', spec: 'tests/help/help.spec.ts',
    blurb: 'Help hub cards, Contact Admin, FAQ page, search, accordion, and contact validation.',
    cases: [
      ['TC-HELP-001', 'Navigate to the Help & Support page', '/organization/help/', ''],
      ['TC-HELP-002', 'Submit a Contact Admin form successfully', '/feedback/contact/', ''],
      ['TC-HELP-003', 'Help & Support hub shows its three cards', '/organization/help/', ''],
      ['TC-HELP-004', 'FAQs card opens the FAQ page', '→ /organization/faq/', ''],
      ['TC-HELP-005', 'FAQ search returns results', '/organization/faq/', ''],
      ['TC-HELP-006', 'FAQ accordion expands a question', '/organization/faq/', ''],
      ['TC-HELP-007', 'Contact Admin rejects an empty submission', '/feedback/contact/', 'Safe negative'],
    ],
  },
  {
    n: 'Localization', spec: 'tests/i18n/language.spec.ts',
    blurb: 'UI language switcher (shell translation), always restored to English.',
    cases: [
      ['TC-I18N-001', 'Switching language to Spanish translates the shell', '/', 'Restores English'],
    ],
  },
  {
    n: 'Email Delivery', spec: 'tests/email/email.spec.ts',
    blurb: 'Transactional emails verified end-to-end: trigger the flow on staging, then read the result in the QA mailbox over IMAP. Non-destructive; skips gracefully when IMAP is unconfigured.',
    cases: [
      ['TC-EMAIL-001', 'Login OTP request delivers an OTP email (6-digit code)', '/accounts/login/', 'IMAP; skips if unconfigured'],
      ['TC-EMAIL-002', 'Forgot-password is accepted and sends a reset email', '/accounts/password/reset/', 'Email best-effort (rate-limited)'],
      ['TC-EMAIL-003', 'Inviting a user delivers a welcome / invitation email', '/mcadmin/user/invite/', 'Admin; verifies delivered email'],
      ['TC-EMAIL-004', 'Resend Code delivers another OTP email', '/accounts/login/', 'IMAP'],
    ],
  },
  {
    n: 'Admin Panel', spec: 'tests/admin/admin.spec.ts',
    blurb: 'Read-only structural coverage of the program-admin panel (/mcadmin/): Dashboard, Emails, Settings, Tools, Engage Users, User Segments, Invitation. Strictly non-destructive — nothing is saved, sent, invited, edited, or deleted; no action touches another account.',
    cases: [
      ['TC-ADMIN-001', 'Admin nav shows all primary sections', '/mcadmin/', ''],
      ['TC-ADMIN-002', 'Dashboard shows Overall Stats and stat sections', '/mcadmin/dashboard/', ''],
      ['TC-ADMIN-003', 'Dashboard session-hours tabs switch', '/mcadmin/dashboard/', ''],
      ['TC-ADMIN-004', 'Dashboard leaderboard tabs switch (Mentors/Mentees)', '/mcadmin/dashboard/', ''],
      ['TC-ADMIN-005', 'Email preferences page shows its controls', '/mcadmin/email-preferences/', 'Presence only'],
      ['TC-ADMIN-006', 'Settings page loads', '/mcadmin/settings/', ''],
      ['TC-ADMIN-007', 'Tools page shows its categories', '/mcadmin/tools/', 'Presence only'],
      ['TC-ADMIN-008', 'Engage Users composer renders', '/mcadmin/dynamic-message', 'Presence only (no send)'],
      ['TC-ADMIN-009', 'User Segments list renders', '/user-segment/list/', ''],
      ['TC-ADMIN-010', 'Invitation page shows its invitation tabs', '/mcadmin/user/invite/', 'Presence only'],
    ],
  },
  {
    n: 'Admin Reports', spec: 'tests/reports/reports.spec.ts',
    blurb: 'The program admin analytics dashboard (/mcadmin/): report sections, 14 metric drill-downs, partnership/session/circle feedback, and activity-report exports verified end-to-end (the export CSV is read from the delivered email). Admin account; read-only / non-destructive.',
    cases: [
      ['TC-RPT-001', 'Reports dashboard shows the major report sections', '/mcadmin/', ''],
      ['TC-RPT-002', 'Users metric opens its detail report', '→ /mcadmin/user/details/', ''],
      ['TC-RPT-003', 'Growth Partnerships metric opens its detail report', '→ /mcadmin/mentorship/details/', ''],
      ['TC-RPT-004', 'Feedback From Growth Partnerships opens survey analytics', '→ /mcadmin/mentorship-survey', ''],
      ['TC-RPT-005', 'Export Mentor Activity Report delivers the CSV by email', '/mcadmin/', 'Verifies emailed CSV'],
      ['TC-RPT-006', 'Export Mentee Activity Report delivers the CSV by email', '/mcadmin/', 'Verifies emailed CSV'],
      ['TC-RPT-007', 'In-Transit users metric opens its detail report', '→ /mcadmin/in-transit-user/details/', ''],
      ['TC-RPT-008', 'Goals & Tasks metric opens its detail report', '→ /mcadmin/mentorship/goals-tasks/', ''],
      ['TC-RPT-009', 'In-Progress Partnership Responses opens analytics', '→ checkin-survey-analytics', ''],
      ['TC-RPT-010', 'Mentor-Mentee Availability Gaps opens its report', '→ /mcadmin/mentor-mentee-balance/details/', ''],
      ['TC-RPT-011', '1:1 Sessions metric opens its detail report', '→ /mcadmin/meeting/details/', ''],
      ['TC-RPT-012', 'Feedback From 1:1 Sessions opens its report', '→ /mcadmin/session-survey/', ''],
      ['TC-RPT-013', 'Fireside Chats metric opens its detail report', '→ /mcadmin/fireside-chat/details/', ''],
      ['TC-RPT-014', 'Circles metric opens its detail report', '→ /mcadmin/roundtable/details/', ''],
      ['TC-RPT-015', 'Circle Posts metric opens its detail report', '→ /mcadmin/roundtable-post/details/', ''],
      ['TC-RPT-016', 'Community Posts metric opens its detail report', '→ /mcadmin/community-post/details/', ''],
      ['TC-RPT-017', 'Direct Conversations metric opens its detail report', '→ /mcadmin/message/details/', ''],
      ['TC-RPT-018', 'Export Profile Report is accepted', '/mcadmin/', ''],
      ['TC-RPT-019', 'Users report offers a Generate CSV export', '/mcadmin/user/details/', 'Emailed CSV'],
      ['TC-RPT-020', 'In-Transit users report offers a Generate CSV export', '/mcadmin/in-transit-user/details/', 'Emailed CSV'],
      ['TC-RPT-021', 'Growth Partnerships report offers a Generate CSV export', '/mcadmin/mentorship/details/', 'Emailed CSV'],
      ['TC-RPT-022', 'Goals & Tasks report offers a Generate CSV export', '/mcadmin/mentorship/goals-tasks/', 'Emailed CSV'],
      ['TC-RPT-023', 'Availability Gaps report offers a Generate CSV export', '/mcadmin/mentor-mentee-balance/details/', 'Emailed CSV'],
      ['TC-RPT-024', '1:1 Sessions report offers a Generate CSV export', '/mcadmin/meeting/details/', 'Emailed CSV'],
      ['TC-RPT-025', 'Feedback From 1:1 Sessions offers a Generate CSV export', '/mcadmin/session-survey/', 'Emailed CSV'],
      ['TC-RPT-026', 'Fireside Chats report offers a Generate CSV export', '/mcadmin/fireside-chat/details/', 'Emailed CSV'],
      ['TC-RPT-027', 'Circles report offers a Generate CSV export', '/mcadmin/roundtable/details/', 'Emailed CSV'],
      ['TC-RPT-028', 'Circle Posts report offers a Generate CSV export', '/mcadmin/roundtable-post/details/', 'Emailed CSV'],
      ['TC-RPT-029', 'Community Posts report offers a Generate CSV export', '/mcadmin/community-post/details/', 'Emailed CSV'],
      ['TC-RPT-030', 'Direct Conversations report offers a Generate CSV export', '/mcadmin/message/details/', 'Emailed CSV'],
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-REGRESSION SUITE (TC-REG-*) — derived from the Jira bug backlog.
  // Each case guards a recurring production-bug class; the Jira keys it guards
  // are in a `// guards:` comment above the test in its spec file.
  // ───────────────────────────────────────────────────────────────────────────
  {
    n: 'Authentication — Bug Regression', spec: 'tests/regression/auth.spec.ts',
    blurb: 'Regression guards for recurring login, invite/onboarding, password-reset/change, OTP and SSO bugs. Runs logged-out and as mentor; negatives never create data.',
    cases: [
      ['TC-REG-AUTH-001', 'Wrong password stays on login with a visible error', '/accounts/login/', 'Negative'],
      ['TC-REG-AUTH-002', 'Unknown email is rejected (no enumeration, no 500)', '/accounts/login/', 'Negative'],
      ['TC-REG-AUTH-003', 'Invalid login preserves the ?next= redirect target', '/accounts/login/?next=', 'Regression'],
      ['TC-REG-AUTH-004', 'Login page renders both credential fields and submit', '/accounts/login/', 'Positive'],
      ['TC-REG-AUTH-005', 'Forgot Password link opens a working reset request form', '/accounts/login/ → /password/reset/', 'Regression · skips if SSO-only org'],
      ['TC-REG-AUTH-006', 'Reset request rejects a malformed email', '/password/reset/', 'Data-validation · skips if form absent'],
      ['TC-REG-AUTH-007', 'Reset request page is reachable directly', '/password/reset/', 'Positive · skips if form absent'],
      ['TC-REG-AUTH-008', 'Used/invalid reset-key link shows graceful expiry, not a 500', '/password/reset/key/<bad>/', 'Regression'],
      ['TC-REG-AUTH-009', 'Invalid invitation activation key returns 404, not 500', '/invitation/<bad>/activate/', 'Regression'],
      ['TC-REG-AUTH-010', 'Open self-signup page loads when enabled', '/invitation/open-user-invite/', 'Edge · skips if open signup disabled'],
      ['TC-REG-AUTH-011', 'Google sign-in entry point is not a 404', '/accounts/login/ → /accounts/google/login/', 'Regression · skips if social login off'],
      ['TC-REG-AUTH-012', 'SAML SSO login endpoint does not 500', '/sso/saml/login/', 'Regression · skips if unreachable'],
      ['TC-REG-AUTH-013', 'Login-failed page renders gracefully', '/accounts/login/failed', 'Edge'],
      ['TC-REG-AUTH-014', 'Password change with wrong current password is rejected', '/user/preferences/account', 'Negative · skips if SSO-only org'],
      ['TC-REG-AUTH-015', 'Password change with mismatched new passwords is rejected', '/user/preferences/account', 'Data-validation · skips if SSO-only org'],
      ['TC-REG-AUTH-016', 'Security preferences page is not blank for a logged-in user', '/user/preferences/account', 'Regression'],
      ['TC-REG-AUTH-017', 'OTP login modal exposes 6 inputs and a gated submit', '/accounts/login/ (OTP modal)', 'Edge · skips if OTP disabled'],
    ],
  },
  {
    n: 'Permissions — Bug Regression', spec: 'tests/regression/permissions.spec.ts',
    blurb: 'Role-gating guards: mentees redirected/403d from admin routes, logged-out deep links gated, admin retains access. Verified against mcauth mixins (redirect vs 403).',
    cases: [
      ['TC-REG-PERM-001', 'Mentee is redirected away from Admin home/dashboard', '/mcadmin/', 'Regression'],
      ['TC-REG-PERM-002', 'Mentee is redirected away from Admin React dashboard', '/mcadmin/dashboard/', 'Regression'],
      ['TC-REG-PERM-003', 'Mentee is redirected away from Admin user invitation', '/mcadmin/user/invite/', 'Regression'],
      ['TC-REG-PERM-004', 'Mentee is redirected away from Admin tools', '/mcadmin/tools/', 'Regression'],
      ['TC-REG-PERM-005', 'Mentee gets 403 on Admin settings dashboard', '/mcadmin/settings/', 'Negative'],
      ['TC-REG-PERM-006', 'Mentee gets 403 on Admin email preferences', '/mcadmin/email-preferences/', 'Negative'],
      ['TC-REG-PERM-007', 'Mentee sees no admin email-preferences content', '/mcadmin/email-preferences/', 'Regression'],
      ['TC-REG-PERM-008', 'Mentee cannot pull admin user-details datatable', '/mcadmin/user/details/', 'Negative'],
      ['TC-REG-PERM-009', 'Mentee avatar menu hides admin-only entries', '/', 'Regression · skips if fixture is admin'],
      ['TC-REG-PERM-010', 'Logged-out admin deep-link redirects to login (no 500)', '/mcadmin/', 'Regression'],
      ['TC-REG-PERM-011', 'Logged-out admin-settings deep-link redirects to login', '/mcadmin/settings/', 'Edge'],
      ['TC-REG-PERM-012', 'Admin can reach the admin home without error', '/mcadmin/', 'Positive · skips if fixture lacks admin'],
      ['TC-REG-PERM-013', 'Admin can reach email preferences', '/mcadmin/email-preferences/', 'Positive · skips if fixture lacks admin'],
    ],
  },
  {
    n: 'Profile — Bug Regression', spec: 'tests/regression/profile.spec.ts',
    blurb: 'Profile view/edit guards: pages render without a 500, field validation (empty/long/special), avatar upload type checks, timezone and preference persistence.',
    cases: [
      ['TC-REG-PROF-001', 'Own profile view loads without a server error', 'avatar menu → /profile/basic-view/<id>/', 'Regression'],
      ['TC-REG-PROF-002', 'Edit form loads with name fields and Save', '/profile/update', 'Positive'],
      ['TC-REG-PROF-003', 'Mandatory fields show a required asterisk', '/profile/update', 'Data-validation'],
      ['TC-REG-PROF-004', 'Empty First Name blocks save with validation', '/profile/update', 'Negative'],
      ['TC-REG-PROF-005', 'Over-long name is rejected or truncated, never a 500', '/profile/update', 'Edge'],
      ['TC-REG-PROF-006', 'Special-character name does not break save', '/profile/update', 'Edge'],
      ['TC-REG-PROF-007', 'Title change persists after save', '/profile/update', 'Regression · skips if title field not enabled'],
      ['TC-REG-PROF-008', 'Edit form renders even when title is empty', '/profile/update', 'Edge'],
      ['TC-REG-PROF-009', 'Invalid website URL is rejected on save', '/profile/update', 'Negative · skips if URL fields not enabled'],
      ['TC-REG-PROF-010', 'Photo upload control is present', '/profile/update', 'Regression'],
      ['TC-REG-PROF-011', 'Disallowed file type is rejected', '/profile/update', 'Data-validation · skips if no accept hint'],
      ['TC-REG-PROF-012', 'Country and postal controls render', '/profile/update', 'Regression'],
      ['TC-REG-PROF-013', 'Working-hours timezone hint is shown', '/profile/update', 'Regression · skips if working hours not enabled'],
      ['TC-REG-PROF-014', 'First-name change persists after save', '/profile/update', 'Positive'],
      ['TC-REG-PROF-015', 'Mentee profile view renders, badges optional', 'avatar menu → /profile/ (mentee)', 'Edge'],
    ],
  },
  {
    n: 'Search / People — Bug Regression', spec: 'tests/regression/search.spec.ts',
    blurb: 'Directory and header-typeahead guards: results, empty/no-match states, special/unicode/long queries, filter combos and pagination edges. ES-backed cases skip without Elasticsearch.',
    cases: [
      ['TC-REG-SRCH-001', 'Header search toggle reveals the input', 'header js_search_toggle → js_user_search', 'Positive'],
      ['TC-REG-SRCH-002', 'Members directory loads without a server error', '/usersearch/members/', 'Regression'],
      ['TC-REG-SRCH-003', 'Directory shows at least one member by default', '/usersearch/members/', 'Positive · skips if directory empty'],
      ['TC-REG-SRCH-004', 'Name filter narrows the directory', '/usersearch/members/?name=venu&filter=True', 'Positive · skips if no matching members'],
      ['TC-REG-SRCH-005', 'No-match query shows a clean empty state', '/usersearch/members/?name=<nomatch>', 'Negative'],
      ['TC-REG-SRCH-006', 'Empty query falls back to the full directory', '/usersearch/members/?name=&filter=True', 'Data-validation'],
      ['TC-REG-SRCH-007', 'Special characters in query do not 500', '/usersearch/members/?name=<special>', 'Edge'],
      ['TC-REG-SRCH-008', 'Unicode query is handled gracefully', '/usersearch/members/?name=<unicode>', 'Edge'],
      ['TC-REG-SRCH-009', 'Very long query does not break the page', '/usersearch/members/?name=<500 chars>', 'Edge'],
      ['TC-REG-SRCH-010', 'Name + sort filter combination renders results or empty', '/usersearch/members/?name=a&sort=fname&filter=True', 'Regression'],
      ['TC-REG-SRCH-011', 'Out-of-range page does not 500', '/usersearch/members/?page=99999', 'Edge'],
      ['TC-REG-SRCH-012', 'Directory exposes a Filter control', '/usersearch/members/', 'Regression · skips if React variant'],
      ['TC-REG-SRCH-013', 'Header typeahead surfaces a matching suggestion', 'header typeahead → /usersearch/user/search/?term=', 'Regression · skips if ES typeahead empty'],
    ],
  },
  {
    n: 'Programs / Mentorship — Bug Regression', spec: 'tests/regression/programs.spec.ts',
    blurb: 'Largest bug surface (562 tickets): page 500s/blank screens, coach list and recommendation rendering, request-form validation, accept/decline/cancel lifecycle, goals and tasks. Lifecycle steps skip without seed data.',
    cases: [
      ['TC-REG-PROG-001', 'Programs landing renders without a 500', '/mentorship/program/', 'Regression'],
      ['TC-REG-PROG-002', 'Program list deep-link is not a blank screen', '/mentorship/program/ → first program', 'Regression'],
      ['TC-REG-PROG-003', 'View Past Partnerships loads without a 500', '?pastMentorship=true', 'Regression · skips if no toggle'],
      ['TC-REG-PROG-004', 'Home shows Recommended Coaches + Browse link', '/', 'Positive'],
      ['TC-REG-PROG-005', 'Browse All Coaches lists coaches (no blank screen)', '/usersearch/list/', 'Regression'],
      ['TC-REG-PROG-006', 'Filtering the coach list does not blank the results', '/usersearch/list/ filter', 'Edge · skips if no filter control'],
      ['TC-REG-PROG-007', 'Coach match metric is a sane value when shown', '/usersearch/list/ card metric', 'Data-validation · skips if no metric'],
      ['TC-REG-PROG-008', 'Opening a coach profile from the list does not error', '/usersearch/list/ → /profile/', 'Regression'],
      ['TC-REG-PROG-009', 'Coach profile shows the relationship CTA', '/profile/program-view/<id>/mentor', 'Positive'],
      ['TC-REG-PROG-010', 'Mentor mentorship page renders without a 500', '/mentorship/program/ (mentor)', 'Regression'],
      ['TC-REG-PROG-011', 'Viewing a pending request does not 500', 'mentor pending-request detail', 'Regression · skips if no pending request'],
      ['TC-REG-PROG-012', 'Admin programs view renders without a 500', '/mentorship/program/ (admin)', 'Regression'],
      ['TC-REG-PROG-013', 'Admin browse-all coaches renders without a 500', '/usersearch/list/ (admin)', 'Regression'],
      ['TC-REG-PROG-014', 'Start Growth Partnership opens the multi-step request form', 'request-as-mentee form', 'Positive · skips if not in request state'],
      ['TC-REG-PROG-015', 'Request form blocks Next with no focus area selected', 'request-as-mentee step 1', 'Negative · skips if not in request state'],
      ['TC-REG-PROG-016', 'A pending request can be opened for editing', 'request → /request/edit', 'Regression · skips if not in request state'],
      ['TC-REG-PROG-017', 'Cancelling a pending request withdraws it', 'pending request → Cancel', 'Regression · skips if no pending request'],
      ['TC-REG-PROG-018', 'Mentor decline returns to a valid page', 'seed request → mentor Decline', 'Edge · skips if cannot seed request'],
      ['TC-REG-PROG-019', 'Active partnership goals tab renders Add Goal', 'overview/?category=goals', 'Regression · skips if no active partnership'],
      ['TC-REG-PROG-020', 'Task due-date picker opens without breaking', 'overview goals → Add Task → due date', 'Edge · skips if no active partnership/goal'],
    ],
  },
  {
    n: 'Sessions / Meetings — Bug Regression', spec: 'tests/regression/sessions.spec.ts',
    blurb: 'Scheduling guards mined from 389 tickets: page 500s, date/time/timezone validation, slot/seat conflicts, fireside lifecycle, iCal invites, propose validation and past-session integrity.',
    cases: [
      ['TC-REG-SESS-001', 'Sessions hub loads without a server error', '/events/sessions/', 'Regression'],
      ['TC-REG-SESS-002', 'Create Fireside Chat opens the create form (no 500)', '/events/chat/create/', 'Regression'],
      ['TC-REG-SESS-003', 'Propose-session page renders without a 500', '/calendar/meeting/propose/ (mentee)', 'Regression'],
      ['TC-REG-SESS-004', 'Past view (chats & sessions) loads without a 500', '/events/past/?type={chats,sessions}', 'Regression'],
      ['TC-REG-SESS-005', 'FSC create rejects a start date in the past', 'POST /events/chat/create/', 'Data-validation'],
      ['TC-REG-SESS-006', 'FSC create rejects end time before start time', 'POST /events/chat/create/', 'Data-validation'],
      ['TC-REG-SESS-007', 'FSC create accepts a valid future date', 'POST /events/chat/create/ (self-clean)', 'Positive'],
      ['TC-REG-SESS-008', 'Session detail shows a consistent, non-warning time', '/calendar/meeting/details/<id>/', 'Edge · skips if no upcoming 1:1'],
      ['TC-REG-SESS-009', 'Conflict-check endpoint responds without erroring', '/events/check-conflict/', 'Edge'],
      ['TC-REG-SESS-010', 'FSC create rejects invalid seats (0 / blank)', 'POST /events/chat/create/', 'Data-validation'],
      ['TC-REG-SESS-011', 'Propose New Time opens the reschedule form', '/calendar/meeting/details/<id>/', 'Positive · skips if no upcoming 1:1'],
      ['TC-REG-SESS-012', 'FSC detail exposes an Add to Calendar / invite option', '/events/open/<id>/', 'Regression · skips if no fireside chat'],
      ['TC-REG-SESS-013', 'FSC detail body renders no raw HTML tags', '/events/open/<id>/', 'Data-validation · skips if no fireside chat'],
      ['TC-REG-SESS-014', 'Cancelled fireside chat leaves the upcoming list', '/events/chat/create/ → /events/open/<id>/ (self-clean)', 'Regression'],
      ['TC-REG-SESS-015', 'Propose rejects a request with no date/time', 'POST /calendar/meeting/propose/ (mentee)', 'Negative'],
      ['TC-REG-SESS-016', 'Propose rejects a past date/time', 'POST /calendar/meeting/propose/ (mentee)', 'Data-validation'],
      ['TC-REG-SESS-017', 'Propose accepts a valid future request and self-cleans', 'POST /calendar/meeting/propose/ (mentee, self-clean)', 'Positive'],
      ['TC-REG-SESS-018', 'Past sessions are not editable', '/events/past/?type=sessions', 'Regression · skips if no past session'],
      ['TC-REG-SESS-019', 'Mentee cannot silently create a chat without permission', '/events/chat/create/ (mentee)', 'Negative · skips if form not served to mentee'],
    ],
  },
  {
    n: 'Reports / Data-Mismatch — Bug Regression', spec: 'tests/regression/reports.spec.ts',
    blurb: 'Data-validation that dashboard headline counts reconcile with detail-report rows (the CD-2609 count-mismatch family), reports render without a 500 and empty states are graceful. Admin; read-only.',
    cases: [
      ['TC-REG-RPT-001', 'Reports dashboard loads fully (no infinite spinner / 500)', '/mcadmin/', 'Regression'],
      ['TC-REG-RPT-002', 'Users headline count reconciles with detail rows', '/mcadmin/user/details/', 'Data-validation · skips if empty'],
      ['TC-REG-RPT-003', 'Growth Partnerships count reconciles with detail rows', '/mcadmin/mentorship/details/', 'Data-validation · skips if empty'],
      ['TC-REG-RPT-004', '1:1 Sessions count reconciles with detail rows', '/mcadmin/meeting/details/', 'Data-validation · skips if empty'],
      ['TC-REG-RPT-005', 'Fireside Chats count reconciles with detail rows', '/mcadmin/fireside-chat/details/', 'Data-validation · skips if empty'],
      ['TC-REG-RPT-006', 'Circles count reconciles with detail rows', '/mcadmin/roundtable/details/', 'Data-validation · skips if empty'],
      ['TC-REG-RPT-007', 'Community Posts count reconciles with detail rows', '/mcadmin/community-post/details/', 'Data-validation · skips if empty'],
      ['TC-REG-RPT-008', 'Direct Conversations count reconciles with detail rows', '/mcadmin/message/details/', 'Data-validation · skips if empty'],
      ['TC-REG-RPT-009', '1:1 Sessions detail report is internally consistent', '/mcadmin/meeting/details/', 'Data-validation · skips if empty'],
      ['TC-REG-RPT-010', 'Dashboard Total Session Hours renders a real number (no NaN)', '/mcadmin/dashboard/', 'Data-validation'],
      ['TC-REG-RPT-011', 'Reports expose a program scope selector (multi-program orgs)', '/mcadmin/', 'Edge · skips if single-program org'],
      ['TC-REG-RPT-012', 'Growth Partnerships detail report renders cleanly', '/mcadmin/mentorship/details/', 'Data-validation'],
      ['TC-REG-RPT-013', 'Availability Gaps detail report renders cleanly', '/mcadmin/mentor-mentee-balance/details/', 'Data-validation'],
      ['TC-REG-RPT-014', 'Feedback From 1:1 Sessions detail report renders cleanly', '/mcadmin/session-survey/', 'Data-validation'],
      ['TC-REG-RPT-015', 'Circle Posts detail report renders cleanly', '/mcadmin/roundtable-post/details/', 'Data-validation'],
      ['TC-REG-RPT-016', 'Empty filter result shows empty-state, not a blank page', '/mcadmin/user/details/', 'Negative · skips if no filter control'],
    ],
  },
  {
    n: '500 / Server-Error Sweep — Bug Regression', spec: 'tests/regression/smoke500.spec.ts',
    blurb: 'Parameterized GET of every major authenticated route asserting no 5xx / Django error page and that the expected landmark renders, plus bad-id negatives that must degrade to a graceful 404, not a 500.',
    cases: [
      ['TC-REG-500-001', 'Home dashboard loads without a server error', '/', 'Positive'],
      ['TC-REG-500-002', 'Programs loads without a server error', '/mentorship/program/', 'Positive'],
      ['TC-REG-500-003', 'Sessions loads without a server error', '/events/sessions/', 'Positive'],
      ['TC-REG-500-004', 'Past sessions loads without a server error', '/events/past/', 'Positive'],
      ['TC-REG-500-005', 'Circles loads without a server error', '/roundtable/', 'Positive'],
      ['TC-REG-500-006', 'Learn / Library loads without a server error', '/library/', 'Positive'],
      ['TC-REG-500-007', 'Community loads without a server error', '/community/', 'Positive'],
      ['TC-REG-500-008', 'Messages loads without a server error', '/message/', 'Positive'],
      ['TC-REG-500-009', 'Notifications list loads without a server error', '/notification/list/', 'Positive'],
      ['TC-REG-500-010', 'Members / network search loads without a server error', '/usersearch/members/', 'Positive'],
      ['TC-REG-500-011', 'Profile update loads without a server error', '/profile/update', 'Positive'],
      ['TC-REG-500-012', 'Admin invitation page loads without a server error', '/mcadmin/user/invite/', 'Positive'],
      ['TC-REG-500-013', 'Admin reports dashboard loads without a server error', '/mcadmin/', 'Positive'],
      ['TC-REG-500-014', 'Admin email preferences loads without a server error', '/mcadmin/email-preferences/', 'Positive'],
      ['TC-REG-500-015', 'Bad profile id is a graceful 404/redirect, not a 500', '/profile/program-view/999999999/basic', 'Negative'],
      ['TC-REG-500-016', 'Bad mentorship overview id degrades gracefully (no 500)', '/mentorship/program/999999999/999999999/overview/', 'Edge'],
    ],
  },
  {
    n: 'Email / Notifications — Bug Regression', spec: 'tests/regression/email.spec.ts',
    blurb: 'Transactional-email delivery and body integrity verified over IMAP: no placeholder tokens, broken salutations or dead links, opt-out respected. Skips when IMAP is unconfigured.',
    cases: [
      ['TC-REG-EMAIL-001', 'Forgot-password accepted and sends reset email', '/accounts/password/reset/ → IMAP', 'Positive · skips if IMAP unconfigured'],
      ['TC-REG-EMAIL-002', 'Reset email contains a concrete non-broken reset link', '/accounts/password/reset/ → IMAP', 'Data-validation · skips if mail not delivered'],
      ['TC-REG-EMAIL-003', 'Reset for unknown address sends no mail to that alias', '/accounts/password/reset/ → IMAP', 'Negative · skips if IMAP unconfigured'],
      ['TC-REG-EMAIL-004', 'OTP login email: clean body, 6-digit code, valid From', '/accounts/login/ OTP → IMAP', 'Positive · skips if OTP/IMAP unconfigured'],
      ['TC-REG-EMAIL-005', 'Inviting a user delivers welcome/invitation email', '/mcadmin/user/invite/ → IMAP', 'Positive · skips if IMAP unconfigured'],
      ['TC-REG-EMAIL-006', 'Invitation body: no placeholder tokens / broken salutation', '/mcadmin/user/invite/ → IMAP', 'Data-validation · skips if mail not delivered'],
      ['TC-REG-EMAIL-007', 'Invitation email contains a concrete activate link', '/mcadmin/user/invite/ → IMAP', 'Data-validation · skips if mail not delivered'],
      ['TC-REG-EMAIL-008', 'Re-inviting same address does not spam duplicate welcomes', '/mcadmin/user/invite/ → IMAP', 'Negative · skips if first invite not delivered'],
      ['TC-REG-EMAIL-009', 'Message reply triggers a notification email', '/message/<id>/reply/ → IMAP', 'Regression · skips if no thread / IMAP'],
      ['TC-REG-EMAIL-010', 'Message-notification email: no raw HTML / broken links', '/message/<id>/reply/ → IMAP', 'Data-validation · skips if no thread / mail'],
      ['TC-REG-EMAIL-011', 'Notification-preferences page loads without a 500', '/user_profile/notification-settings/', 'Regression'],
      ['TC-REG-EMAIL-012', 'Toggling an email preference persists (opt-out respected)', 'notification-settings page', 'Negative · skips if no toggles found'],
      ['TC-REG-EMAIL-013', 'Special-char invitee name renders a safe clean salutation', '/mcadmin/user/invite/ → IMAP', 'Edge · skips if mail not delivered'],
      ['TC-REG-EMAIL-014', 'Invite with empty email rejected, not silently mailed', '/mcadmin/user/invite/', 'Negative · skips if IMAP unconfigured'],
    ],
  },
  {
    n: 'Messaging / Chat — Bug Regression', spec: 'tests/regression/messaging.spec.ts',
    blurb: 'Inbox/thread loads without a 500, send/reply validation, edge bodies (long/special/emoji), cross-participant delivery, unread badge and message-notification generation.',
    cases: [
      ['TC-REG-MSG-001', 'Messages inbox loads without a server error', '/message/', 'Positive'],
      ['TC-REG-MSG-002', 'Opening a thread renders reply editor without error', '/message/ → /message/<id>/', 'Regression · skips if inbox empty'],
      ['TC-REG-MSG-003', 'Compose form opens with recipient + subject fields', '/message/ → /message/create/', 'Positive'],
      ['TC-REG-MSG-004', 'Reply posts (200) and editor is cleared afterwards', '/message/<id>/reply/', 'Positive · skips if no thread'],
      ['TC-REG-MSG-005', 'Empty reply cannot be posted', '/message/<id>/', 'Negative · skips if no thread'],
      ['TC-REG-MSG-006', 'Whitespace-only reply rejected as empty', '/message/<id>/', 'Data-validation · skips if no thread'],
      ['TC-REG-MSG-007', 'Reply with very long message round-trips safely', '/message/<id>/reply/', 'Edge · skips if no thread'],
      ['TC-REG-MSG-008', 'Reply with special characters/symbols round-trips safely', '/message/<id>/reply/', 'Edge · skips if no thread'],
      ['TC-REG-MSG-009', 'Reply with emoji round-trips safely', '/message/<id>/reply/', 'Edge · skips if no thread'],
      ['TC-REG-MSG-010', 'Reply reaches the other participant', '/message/<id>/reply/ (mentor→mentee)', 'Regression · skips if no thread'],
      ['TC-REG-MSG-011', 'New message generates in-app notification for recipient', '/message/<id>/reply/ → /notification/list/', 'Regression · skips if no thread'],
      ['TC-REG-MSG-012', 'Unread message badge is a sane non-negative count', '/ (header message icon)', 'Data-validation · skips if no badge'],
      ['TC-REG-MSG-013', 'Filtering the inbox does not time out', '/message/ filter panel', 'Edge · skips if no Filter control'],
      ['TC-REG-MSG-014', 'Empty inbox shows placeholder, not an error', '/message/ (admin)', 'Positive · skips if admin inbox not empty'],
    ],
  },
  {
    n: 'Circles — Bug Regression', spec: 'tests/regression/circles.spec.ts',
    blurb: 'Roundtable guards: list/detail render without a 500, create-form validation, post and empty-post rejection, invitation trigger, members render, join/leave lifecycle.',
    cases: [
      ['TC-REG-CIRC-001', 'My Circles list loads without a server error', '/roundtable/', 'Positive'],
      ['TC-REG-CIRC-002', 'Available Circles list loads without a server error', '/roundtable/others/', 'Positive'],
      ['TC-REG-CIRC-003', 'Switching My/Available Circles tabs keeps routes alive', '/roundtable/ ↔ /others/', 'Regression'],
      ['TC-REG-CIRC-004', 'Circle detail renders members without a 500', '/roundtable/details/<id>/', 'Regression · skips if in no circle'],
      ['TC-REG-CIRC-005', 'Mentee My Circles loads without a server error', '/roundtable/ (mentee)', 'Positive'],
      ['TC-REG-CIRC-006', 'Mentee does not see a Create-session button in a circle', '/roundtable/details/<id>/ (mentee)', 'Negative · skips if in no circle'],
      ['TC-REG-CIRC-007', 'Creating a circle succeeds and lands on detail', '/roundtable/create/ (admin)', 'Positive'],
      ['TC-REG-CIRC-008', 'Create circle rejects an empty topic name', '/roundtable/create/ (admin)', 'Negative'],
      ['TC-REG-CIRC-009', 'Create circle with only a topic does not 500', '/roundtable/create/ (admin)', 'Edge'],
      ['TC-REG-CIRC-010', 'Inviting a member to a circle seeds an invitation', 'create+invite → mentee detail', 'Regression · skips if seed not created'],
      ['TC-REG-CIRC-011', 'Member can post a message to the circle', 'POST /library/happening/new/insight/<id>/', 'Positive · skips if seed not created'],
      ['TC-REG-CIRC-012', 'Empty circle post is rejected', 'circle composer (mentee)', 'Data-validation · skips if seed not created'],
      ['TC-REG-CIRC-013', 'Member can leave the circle (cleanup)', '/roundtable/leave/<id>/', 'Regression · skips if seed not created'],
    ],
  },
  {
    n: 'Learn / Library — Bug Regression', spec: 'tests/regression/learn.spec.ts',
    blurb: 'Library guards centered on the CD-8 link-post-spins-forever class: posting does not hang, invalid/unicode URL and empty-form rejection, unsupported upload handling, search/sort/filter.',
    cases: [
      ['TC-REG-LEARN-001', 'Library loads without a server error', '/library/', 'Positive'],
      ['TC-REG-LEARN-002', 'Library text search returns results or empty-state', '/library/ search', 'Positive'],
      ['TC-REG-LEARN-003', 'Nonsense search shows the no-results empty state', '/library/ search', 'Edge'],
      ['TC-REG-LEARN-004', 'Filter by file type refreshes results without a 500', '/library/ filters', 'Regression · skips if filters absent'],
      ['TC-REG-LEARN-005', 'Clearing a filter restores the full list', '/library/ filters (X/clear)', 'Regression · skips if clear control absent'],
      ['TC-REG-LEARN-006', 'Resource detail page renders', '/library/resource/<id>/', 'Positive · skips if no resources'],
      ['TC-REG-LEARN-007', 'Sort By re-orders the list without a 500', '/library/ Sort By', 'Positive · skips if Sort By absent'],
      ['TC-REG-LEARN-008', 'Posting a link resource does not hang on a spinner (CD-8)', 'POST /library/resource/create (admin)', 'Regression · skips if composer not exposed'],
      ['TC-REG-LEARN-009', 'Invalid resource URL is rejected without a 500', 'POST /library/resource/create (admin)', 'Negative · skips if composer not exposed'],
      ['TC-REG-LEARN-010', 'Resource form rejects empty url and message', 'POST /library/resource/create (admin)', 'Data-validation · skips if composer not exposed'],
      ['TC-REG-LEARN-011', 'Unsupported file upload is rejected gracefully', 'resource composer upload (admin)', 'Negative · skips if file input not exposed'],
      ['TC-REG-LEARN-012', 'Unicode resource URL does not raise a UnicodeError', 'POST /library/resource/create (admin)', 'Edge · skips if composer not exposed'],
      ['TC-REG-LEARN-013', 'Mentee library renders scoped resources without a 500', '/library/ (mentee)', 'Data-validation'],
    ],
  },
];

const total = modules.reduce((s, m) => s + m.cases.length, 0);
const newCount = modules.reduce((s, m) => s + m.cases.filter((c) => isNewCase(c[0])).length, 0);
const bugCount = modules.reduce((s, m) => s + m.cases.filter((c) => isBugDerived(c[0])).length, 0);
const skipNotes = modules.reduce(
  (s, m) => s + m.cases.filter((c) => /skip/i.test(c[3] || '')).length,
  0
);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const today = process.argv[2] || '2026-06-08';
const reporter = process.argv[3] || 'Venu';

// Embed the official MentorCloud logo as a data URI so the PDF is self-contained.
const LOGO_PATH = 'C:/projects/mentorcloud/Assets/Square_Image_Logo.png';
let logoSrc = '';
try {
  logoSrc = 'data:image/png;base64,' + fs.readFileSync(LOGO_PATH).toString('base64');
} catch (e) {
  console.warn('Logo not found at', LOGO_PATH, '— rendering without it.');
}

// Per-module accent — cycles through the brand secondary palette.
const ACCENTS = ['--royal-blue', '--shamrock', '--electric-violet', '--fuel-yellow', '--mandy'];
const accentOf = (i) => `var(${ACCENTS[i % ACCENTS.length]})`;

const summaryRows = modules
  .map(
    (m, i) =>
      `<tr><td><span class="snum" style="background:${accentOf(i)}">${i + 1}</span></td><td class="mod">${esc(
        m.n
      )}</td><td><code>${esc(m.spec)}</code></td><td class="num"><span class="pill">${m.cases.length}</span></td><td class="ids">${esc(
        m.cases[0][0]
      )} – ${esc(m.cases[m.cases.length - 1][0])}</td></tr>`
  )
  .join('');

const moduleSections = modules
  .map((m, i) => {
    const accent = accentOf(i);
    const newInMod = m.cases.filter((c) => isNewCase(c[0])).length;
    const rows = m.cases
      .map((c) => {
        const isNew = isNewCase(c[0]);
        const isBug = isBugDerived(c[0]);
        return `<tr class="${isNew ? 'new' : ''}"><td class="id">${
          isBug ? BUG_ICON + ' ' : ''
        }${esc(c[0])}${
          isNew ? ' <span class="badge">NEW</span>' : ''
        }</td><td>${esc(c[1])}</td><td><code>${esc(c[2] || '')}</code></td><td class="skip">${esc(c[3] || '')}</td></tr>`;
      })
      .join('');
    return `<section class="card" style="--accent:${accent}">
      <div class="card-head">
        <span class="cnum">${String(i + 1).padStart(2, '0')}</span>
        <div class="card-title">
          <h2>${esc(m.n)}</h2>
          <p class="spec"><code>${esc(m.spec)}</code></p>
        </div>
        <span class="count">${m.cases.length} case${m.cases.length > 1 ? 's' : ''}${
      newInMod ? ` · ${newInMod} new` : ''
    }</span>
      </div>
      <p class="blurb">${esc(m.blurb)}</p>
      <table class="cases"><thead><tr><th>ID</th><th>Title</th><th>Route</th><th>Data / skip</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
  })
  .join('');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  /* MentorCloud brand palette */
  :root {
    --black-pearl: #06222E;
    --pearl-2: #0c3344;
    --shamrock: #35E19D;
    --royal-blue: #485DD8;
    --electric-violet: #9727E7;
    --mandy: #E24B4C;
    --fuel-yellow: #EBB12D;
    --ink: #233640;
    --muted: #6c7e87;
    --line: #e4ecf0;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink); font-size: 10.5px; line-height: 1.45; margin: 0;
    background:
      radial-gradient(60% 32% at 88% 0%, rgba(53,225,157,.06), transparent 70%),
      radial-gradient(50% 28% at 5% 4%, rgba(151,39,231,.05), transparent 70%),
      #ffffff;
  }

  /* ── Futuristic hero ───────────────────────────── */
  .hero {
    position: relative; overflow: hidden;
    border-radius: 22px; padding: 26px 28px 22px;
    color: #eaf6f1;
    background:
      radial-gradient(120% 140% at 100% 0%, rgba(72,93,216,.55), transparent 55%),
      radial-gradient(130% 150% at 0% 100%, rgba(53,225,157,.42), transparent 55%),
      radial-gradient(90% 120% at 80% 110%, rgba(151,39,231,.40), transparent 60%),
      linear-gradient(135deg, var(--black-pearl), var(--pearl-2));
    box-shadow: 0 18px 40px -18px rgba(6,34,46,.55);
  }
  .hero::after {
    content: ""; position: absolute; inset: 0; border-radius: 22px;
    border: 1px solid rgba(255,255,255,.10); pointer-events: none;
  }
  .hero-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .logo-wrap { background: #fff; border-radius: 14px; padding: 8px 14px; display: inline-flex; box-shadow: 0 8px 20px -10px rgba(0,0,0,.4); }
  .logo { height: 30px; width: auto; display: block; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); color: #d7fff0; font-weight: 600; font-size: 8.5px; letter-spacing: .12em; padding: 6px 12px; border-radius: 999px; text-transform: uppercase; }
  .chip .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--shamrock); box-shadow: 0 0 8px var(--shamrock); }
  h1 { font-size: 30px; line-height: 1.05; margin: 18px 0 6px; color: #fff; letter-spacing: -.5px; font-weight: 800; }
  h1 .grad { background: linear-gradient(90deg, var(--shamrock), #8ad9ff 45%, var(--fuel-yellow)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .sub { color: #b9cfd6; margin: 0 0 16px; font-size: 11px; max-width: 70%; }

  .stats { display: flex; gap: 10px; flex-wrap: wrap; }
  .stat { flex: 1; min-width: 96px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14); border-radius: 14px; padding: 10px 12px; }
  .stat .v { font-size: 20px; font-weight: 800; color: #fff; line-height: 1; white-space: nowrap; }
  .stat .v.accent { color: var(--shamrock); }
  .stat .v.txt { font-size: 14px; letter-spacing: .01em; }
  .stat .l { font-size: 8px; letter-spacing: .08em; text-transform: uppercase; color: #9fb6bd; margin-top: 5px; }
  .runline { margin: 14px 0 0; font-size: 9px; color: #9fb6bd; }
  .runline code { background: rgba(255,255,255,.10); color: #d7fff0; border-radius: 6px; padding: 2px 6px; }

  /* ── Section heading ───────────────────────────── */
  .seclabel { display: flex; align-items: center; gap: 10px; margin: 22px 0 12px; }
  .seclabel h2 { font-size: 13px; color: var(--black-pearl); margin: 0; letter-spacing: .02em; text-transform: uppercase; }
  .seclabel .rule { flex: 1; height: 2px; border-radius: 2px; background: linear-gradient(90deg, var(--shamrock), transparent); }

  /* ── Summary table ─────────────────────────────── */
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  .summary { border-radius: 16px; overflow: hidden; box-shadow: 0 10px 26px -18px rgba(6,34,46,.4); }
  .summary th { background: var(--black-pearl); color: #bfeede; text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: .06em; padding: 9px 12px; }
  .summary td { padding: 8px 12px; border-bottom: 1px solid var(--line); }
  .summary tbody tr:nth-child(even) td { background: #f5f9fb; }
  .summary .mod { font-weight: 600; color: var(--black-pearl); }
  .summary .ids { color: var(--muted); font-size: 9px; }
  .snum { display: inline-flex; align-items: center; justify-content: center; width: 19px; height: 19px; border-radius: 7px; color: #fff; font-weight: 700; font-size: 9px; }
  .pill { display: inline-block; min-width: 22px; text-align: center; background: #eaf2f6; color: var(--black-pearl); font-weight: 700; border-radius: 999px; padding: 2px 8px; font-size: 9px; }
  td.num, th.num { text-align: center; }
  .total-row td { font-weight: 700; background: var(--black-pearl) !important; color: #fff; border: none; }
  .total-row .pill { background: var(--shamrock); color: var(--black-pearl); }

  code { font-family: "SF Mono", Consolas, "Liberation Mono", monospace; font-size: 9px; background: #eef4f7; padding: 1px 5px; border-radius: 5px; color: #0d3a4d; }

  .legend { color: var(--muted); font-size: 9px; margin: 10px 2px 0; }

  /* ── Module cards ──────────────────────────────── */
  .card {
    position: relative; margin: 14px 0; padding: 14px 16px 6px;
    background: #fff; border: 1px solid var(--line); border-radius: 16px;
    box-shadow: 0 10px 26px -20px rgba(6,34,46,.45);
    page-break-inside: avoid; overflow: hidden;
  }
  .card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--accent); }
  .card-head { display: flex; align-items: center; gap: 12px; }
  .cnum {
    flex: none; width: 34px; height: 34px; border-radius: 11px;
    display: inline-flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 13px; color: #fff; background: var(--accent);
    box-shadow: 0 6px 14px -7px var(--accent);
  }
  .card-title { flex: 1; }
  .card-title h2 { font-size: 14px; color: var(--black-pearl); margin: 0; font-weight: 700; }
  .card-title .spec { margin: 2px 0 0; }
  .count { flex: none; background: #eef4f7; color: var(--black-pearl); font-weight: 700; font-size: 9px; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
  .blurb { color: #51626b; margin: 8px 0 8px; }

  .cases { border-radius: 12px; overflow: hidden; border: 1px solid var(--line); }
  .cases th { background: #f3f7f9; text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #46606b; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  .cases td { padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .cases tbody tr:last-child td { border-bottom: none; }
  .cases tbody tr:nth-child(even) td { background: #f9fcfd; }
  .cases td.id { font-weight: 700; color: var(--royal-blue); white-space: nowrap; }
  .cases td.skip { color: var(--muted); font-size: 9px; }
  tr.new td.id { color: var(--electric-violet); }
  tr.new td { background: rgba(151,39,231,.045) !important; }
  .badge { background: linear-gradient(90deg, var(--electric-violet), var(--royal-blue)); color: #fff; font-size: 7px; font-weight: 800; padding: 2px 6px; border-radius: 999px; vertical-align: middle; letter-spacing: .06em; }
  .bug { font-size: 10px; vertical-align: middle; line-height: 1; }
  tr.new td.id .bug { filter: none; }

  .footer { margin-top: 18px; padding: 14px 16px; border-radius: 14px; background: #f4f8fa; border: 1px solid var(--line); color: #5d6e76; font-size: 8.5px; }
  .footer b { color: var(--black-pearl); }
</style></head><body>

  <div class="hero">
    <div class="hero-top">
      <span class="logo-wrap"><img class="logo" src="${logoSrc}" alt="MentorCloud"></span>
      <span class="chip"><span class="dot"></span>QA · Playwright E2E</span>
    </div>
    <h1>Automated Test Case <span class="grad">Catalog</span></h1>
    <p class="sub">Full inventory of the MentorCloud staging end-to-end suite — generated directly from the source spec files.</p>
    <div class="stats">
      <div class="stat"><div class="v">${total}</div><div class="l">Test cases</div></div>
      <div class="stat"><div class="v">${modules.length}</div><div class="l">Modules</div></div>
      <div class="stat"><div class="v accent">100%</div><div class="l">Automated</div></div>
      <div class="stat"><div class="v">${BUG_ICON} ${bugCount}</div><div class="l">Bug-guarded</div></div>
      <div class="stat"><div class="v txt">${esc(reporter)}</div><div class="l">Reporter</div></div>
      <div class="stat"><div class="v txt">${today}</div><div class="l">Report updated on</div></div>
    </div>
    <p class="runline">Target <code>staging-global.mentorcloud.com</code> &nbsp;·&nbsp; Framework <code>Playwright · Chromium</code> &nbsp;·&nbsp; Run <code>npx playwright test --project=staging</code></p>
  </div>

  <div class="seclabel"><h2>Module Summary</h2><span class="rule"></span></div>
  <table class="summary"><thead><tr><th>#</th><th>Module</th><th>Spec file</th><th class="num">Cases</th><th>Case IDs</th></tr></thead>
  <tbody>${summaryRows}<tr class="total-row"><td></td><td>Total</td><td></td><td class="num"><span class="pill">${total}</span></td><td></td></tr></tbody></table>
  <p class="legend"><span class="badge">NEW</span> marks cases added in the latest automation waves — including the <b>Bug-Regression suite</b> (<code>TC-REG-*</code>), 183 cases mined from the Jira bug backlog (positive / negative / edge / data-validation / regression) so previously-reported defects cannot silently return. &nbsp;${BUG_ICON} marks a case that guards a previously-registered Jira bug (all ${bugCount} <code>TC-REG-*</code> cases); the originating Jira keys are in each test's <code>// guards:</code> comment.</p>

  <div class="seclabel"><h2>Modules &amp; Cases</h2><span class="rule"></span></div>
  ${moduleSections}

  <p class="footer"><b>MentorCloud QA</b> · Every selector is grounded in the live staging DOM. Data-dependent scenarios are handled with conditional logic (empty state = pass) or by creating &amp; cleaning up their own fixtures; tests skip only on a genuine technical blocker. Network (following/followers) and the badge-detail page remain deferred pending a stable id selector.</p>
</body></html>`;

(async () => {
  fs.writeFileSync('qa-testcases.html', html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({
    path: 'qa-testcases.pdf',
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
  });
  await browser.close();
  console.log('wrote qa-testcases.pdf —', total, 'cases,', newCount, 'new');
  publishPdf('qa-testcases.pdf');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
