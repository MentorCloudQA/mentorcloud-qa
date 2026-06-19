# MentorCloud QA — Playwright E2E

End-to-end tests for the MentorCloud platform. The original status-report suite
covered 78 test cases (TC-AUTH, TC-PROF, TC-HOME, TC-PROG, TC-SESS, TC-CIRC,
TC-LEARN, TC-COMM, TC-NOTIF, TC-MSG, TC-HELP). It has since been extended by
mining the Django + React source for untested user-facing routes, adding the
**Settings & Privacy**, **Global Search / People** modules and deepening
**Help/FAQ**, **Sessions (fireside-chat detail)**, and **Profile (badges)**.

## Layout

```
tests/
  utils/credentials.ts     # creds (env-overridable), storage-state paths, login() helper
  utils/shell.ts           # header/nav/avatar-menu helpers
  auth/auth.setup.ts       # logs in as mentor + mentee + admin, saves session state
  auth/auth.spec.ts        # TC-AUTH-001..005  (runs logged-out)
  profile/profile.spec.ts  # TC-PROF-001..008  (008 = profile view + badges)
  home/home.spec.ts        # TC-HOME-001..006
  programs/programs.spec.ts# TC-PROG-001..019
  sessions/sessions.spec.ts# TC-SESS-001..018  (017/018 = fireside-chat detail)
  circles/circles.spec.ts  # TC-CIRC-001..006
  learn/learn.spec.ts      # TC-LEARN-001..005
  community/community.spec.ts # TC-COMM-001..004
  notifications/notifications.spec.ts # TC-NOTIF-001..004
  messaging/messaging.spec.ts # TC-MSG-001..004
  help/help.spec.ts        # TC-HELP-001..005  (003..005 = Help hub + FAQ)
  settings/settings.spec.ts# TC-SET-001..009   (Settings & Privacy)
  search/search.spec.ts    # TC-SRCH-001..004  (header search + People directory)
  regression/              # TC-REG-*  bug-regression suite (see below)
```

## Bug-regression suite (`tests/regression/`)

A second layer of **183 cases (`TC-REG-*`)** mined directly from the Jira bug
backlog (2,110 Bug tickets across CD/ME/MS/NF/UI/MMP/DO/CS/MD). Each case guards a
**recurring production-bug class** so a previously-reported defect cannot silently
return; the originating Jira keys are listed in a `// guards:` comment above each
test. Cases are tagged Positive / Negative / Edge / Data-validation / Regression
(shown in the "Data / skip" column of the generated catalog).

| Area | File | IDs | Bug themes guarded |
| --- | --- | --- | --- |
| Auth | `regression/auth.spec.ts` | TC-REG-AUTH-001..017 | login negatives, invite/onboarding, password reset/change, OTP, SSO |
| Permissions | `regression/permissions.spec.ts` | TC-REG-PERM-001..013 | admin-route role gating (redirect vs 403), logged-out deep-links |
| Profile | `regression/profile.spec.ts` | TC-REG-PROF-001..015 | view/edit 500s, field validation, avatar upload, persistence |
| Search | `regression/search.spec.ts` | TC-REG-SRCH-001..013 | directory + typeahead, empty/special/unicode/long queries, paging |
| Programs | `regression/programs.spec.ts` | TC-REG-PROG-001..020 | page 500s, coach list/recommendation, request form, GP lifecycle, goals/tasks |
| Sessions | `regression/sessions.spec.ts` | TC-REG-SESS-001..019 | 500s, date/time/timezone, slot/seat conflict, FSC lifecycle, iCal, propose |
| Reports | `regression/reports.spec.ts` | TC-REG-RPT-001..016 | count↔detail reconciliation (CD-2609 family), empty-state |
| 500 sweep | `regression/smoke500.spec.ts` | TC-REG-500-001..016 | every major route returns no 5xx/error page; bad-id → graceful 404 |
| Email | `regression/email.spec.ts` | TC-REG-EMAIL-001..014 | transactional delivery + body integrity (no placeholder tokens/dead links), opt-out |
| Messaging | `regression/messaging.spec.ts` | TC-REG-MSG-001..014 | inbox/thread 500s, send/reply validation, edge bodies, delivery, unread badge |
| Circles | `regression/circles.spec.ts` | TC-REG-CIRC-001..013 | list/detail 500s, create validation, post rejection, join/leave |
| Learn | `regression/learn.spec.ts` | TC-REG-LEARN-001..013 | CD-8 link-post-spinner, invalid/unicode URL, upload, search/sort/filter |

These follow the same conventions as the status-report suite (grounded role/text/`js_*`
selectors, `test.skip` on missing seed data, self-cleaning writes, `// NOTE:` on any
unconfirmed selector). They have **not** been executed against live staging — only
validated to compile and be discovered (`npx playwright test --list`); the first real
run will surface selectors that need tuning to the live DOM.

```bash
# Run only the bug-regression suite against staging
npx playwright test --project=staging tests/regression
```

### Newly added coverage (grounded in the source templates)

| Module | File | Routes exercised |
| --- | --- | --- |
| Settings & Privacy | `settings/settings.spec.ts` | `/user/preferences/{general,account,email}` — nav from avatar, tab switching, VC/timezone, password form + invalid-change rejection, delete-account presence, email prefs, logged-out redirect |
| Global Search / People | `search/search.spec.ts` | header `js_search_toggle` → `js_user_search` typeahead; `/usersearch/members/` directory + filter |
| Help / FAQ | `help/help.spec.ts` | `/organization/help/` hub cards; `/organization/faq/` + FAQ search |
| Fireside-chat detail | `sessions/sessions.spec.ts` | `/events/open/<id>/` — opened from the FSC tab, title/breadcrumb + attendee action |
| Profile badges | `profile/profile.spec.ts` | profile view page name heading + `js_badge_icon` chips |

**Known gap — Network (following/followers) and the badge-detail page**
(`/network/<userId>/{following,followers}/`, `/badge/user-badges/<userId>/`) need a
real **OrgUser id**, which can't be derived from the front end without a hardcoded
value or a fragile hover-popup (`data-nw-home` lives only in the profile popup).
Like TC-PROG-002's icon-only blocker, these are deferred until the product exposes
a stable selector/entry point; the profile-badges test (TC-PROF-008) covers what
is reachable today.

## Running

The `staging` project depends on the `setup` project, which logs in and writes
session state to `playwright/.auth/{mentor,mentee}.json`. Spec files reuse that
state via `test.use({ storageState })`, so login happens once.

```bash
# Full suite against staging (recommended)
npx playwright test --project=staging

# A single module
npx playwright test --project=staging tests/home

# Headed is the default (headless:false in playwright.config.ts).
```

The `local` project (http://localhost:3000) is for local dev and does **not**
run the auth setup — point it at a running local app and supply your own session.

## Credentials

Defaults are the staging QA accounts. Override via env vars (recommended for CI):

```
MENTOR_EMAIL / MENTOR_PASSWORD
MENTEE_EMAIL / MENTEE_PASSWORD
MENTOR_OTP            # 6-digit code for TC-AUTH-004 (otherwise that test skips)
```

`playwright/.auth/` is git-ignored — saved sessions contain live tokens.

## Important caveats

The app is **hybrid**: login and several modules (Sessions `/events/`, Circles
`/roundtable/`, Learn `/library/`, Community `/dashboard/community/`, Messaging
`/message/`, Help `/organization/help/`) are Django-rendered; Home, the coaches
list, and the profile form are React. There are **no `data-testid` attributes**,
so selectors use roles / visible text / `js_*` CSS classes pulled from the
templates and live HTML.

Selectors for **login, the header/nav/avatar dropdown, notifications, Home,
Learn, Community, Messaging, and Help** are grounded in actual templates/live
markup. A few **deep, data-dependent flows** — the 4-step Growth Partnership form
(TC-PROG-009/010), goals & tasks (TC-PROG-017/018), coach-profile action buttons
(TC-PROG-008), Accept Pledge (TC-PROG-019) — could not be fully confirmed from the
code and use **best-effort selectors flagged with `NOTE:` comments**; expect to
tune these against the live UI.

Many lifecycle tests (accept/decline/cancel/reschedule, reply, leave circle,
mark-as-read) require **seeded data** (a pending request, an existing thread,
an unread notification, etc.). When the prerequisite isn't present they
`test.skip(...)` with an explanatory reason rather than fail spuriously.

These tests have **not** been executed against live staging — only validated to
compile and be discovered by Playwright (`npx playwright test --list`). The first
real run will surface selectors that need adjusting to the live DOM.
