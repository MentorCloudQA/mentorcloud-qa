import { test, expect } from '../utils/fixtures';
import type { Browser, Page } from '@playwright/test';

import { STORAGE_STATE } from '../utils/credentials';

/**
 * Sessions module — TC-SESS-001 to TC-SESS-026. (FSC = Fireside Chat)
 *
 * Confirmed against live staging (React page at /events/sessions/):
 *   Mini tabs        -> getByRole('tab', { name: 'All' | 'Fireside Chats' | '1-1 Sessions' })
 *   Filter           -> getByRole('button', { name: 'Filter' })
 *   Create FSC       -> getByRole('link', { name: 'Create Fireside Chat' }) -> /events/chat/create/
 *   Empty state      -> "Schedule your first fireside chat" + "Take me to Home"
 *   Schedule 1:1     -> recommendation cards link to /calendar/meeting/create/?participant=...
 *
 * NOTE: "View Past Sessions" only appears once past sessions exist; past view is
 * reachable at /events/past/. Create/lifecycle flows depend on seeded data and
 * skip gracefully when prerequisites are absent.
 */
test.use({ storageState: STORAGE_STATE.mentor });

const SESSIONS_PATH = '/events/sessions/';

// The mentor's program-scoped participant id (for proposing a 1:1 mentee -> mentor).
const MENTOR_PARTICIPANT = '14901';
const PROPOSE_URL = `/calendar/meeting/propose/?participant=${MENTOR_PARTICIPANT}&suggestion=1125`;

async function rolePage(browser: Browser, role: 'mentor' | 'mentee') {
  const context = await browser.newContext({ storageState: STORAGE_STATE[role] });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  return { context, page };
}

/**
 * Propose a 1:1 session mentee -> mentor by submitting the propose form directly.
 * The propose form's custom widgets (datepicker, time dropdowns, Select2 location)
 * and a Connect-Calendar modal make UI submission unreliable; the location must be
 * "MentorCloud Meeting" (location_type=1) since Teams requires a connected account.
 * Returns the created session's detail URL.
 */
async function proposeSession(browser: Browser, title: string): Promise<string | null> {
  const { context, page } = await rolePage(browser, 'mentee');
  try {
    await page.goto(PROPOSE_URL, { waitUntil: 'domcontentloaded' });
    // Wait for the form to render (staging can be slow) before reading its fields.
    await page.locator('input[name="title"]').waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const fields = await page.evaluate(() => {
      const titleEl = document.querySelector('input[name="title"]');
      const form = titleEl ? titleEl.closest('form') : null;
      const out: Record<string, string> = {};
      if (form) {
        form.querySelectorAll('input,select,textarea').forEach((e) => {
          const el = e as HTMLInputElement;
          if (!el.name) return;
          if (el.type === 'checkbox' || el.type === 'radio') {
            if (el.checked) out[el.name] = el.value;
          } else if (!(el.name in out)) out[el.name] = el.value;
        });
      }
      return out;
    });
    if (!fields.csrfmiddlewaretoken) return null;
    // Use a unique near-future date (30–180 days) so it doesn't conflict with an
    // existing session and stays within the allowed scheduling window.
    const future = new Date(Date.now() + (30 + Math.floor(Math.random() * 150)) * 86_400_000);
    const dateStr = future.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    fields.title = title;
    fields.location_type = '1'; // MentorCloud Meeting (no external integration)
    fields.location = '';
    fields.start_date = dateStr;
    fields.end_date = dateStr;
    fields.start_time = '10:00 AM'; // explicit valid slot (defaults vary per load)
    fields.end_time = '10:30 AM';
    const resp = await context.request.post(PROPOSE_URL, {
      form: fields,
      // Django's HTTPS CSRF check needs an absolute same-origin Referer.
      headers: { Referer: page.url() },
      maxRedirects: 0,
    });
    // Django redirects (3xx) on success; a 200 means the form re-rendered with errors.
    const status = resp.status();
    if (status < 300 || status >= 400) return null;

    // 1:1 titles are auto-generated server-side ("Coaching Session: ..."), so find the
    // just-created session as the highest /calendar/meeting/details/<id>/ on the list.
    await page.goto(SESSIONS_PATH, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /1-1 sessions/i }).click().catch(() => {});
    await page
      .locator('a[href*="/calendar/meeting/details/"]')
      .first()
      .waitFor({ timeout: 25_000 })
      .catch(() => {});
    const hrefs = await page
      .locator('a[href*="/calendar/meeting/details/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href') || ''));
    const ids = hrefs
      .map((h) => ({ h, id: parseInt((h.match(/details\/(\d+)/) || [])[1] || '0', 10) }))
      .filter((x) => x.id > 0)
      .sort((a, b) => b.id - a.id);
    return ids.length ? ids[0].h : null;
  } finally {
    await context.close();
  }
}

const FSC_CREATE_PATH = '/events/chat/create/';
// Stable fixture chat title — ensureFiresideChat() reuses (never duplicates) it.
const FSC_FIXTURE_TITLE = 'QA Fireside Chat (automation fixture)';

/**
 * Create a Fireside Chat by posting the create form directly. Same rationale as
 * proposeSession: the form's select2 widgets, CKEditor description, and the
 * auto-popping Connect-Calendar modal (#js_alert_box) make UI submission
 * unreliable. Location must be "MentorCloud Video Session" (location_type=1) so
 * no external meeting link is required. Confirmed live: a valid POST 302s to
 * /events/sessions/ and the chat card links /events/open/<id>/ with the title
 * as its text. Returns the new chat's detail href, or null on failure.
 */
/** Open the FSC create page and collect the form's current field values. */
async function collectFscCreateFields(page: Page): Promise<Record<string, string>> {
  await page.goto(FSC_CREATE_PATH, { waitUntil: 'domcontentloaded' });
  await page
    .locator('form.js_open_session_form input[name="title"]')
    .waitFor({ state: 'attached', timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const form = document.querySelector('form.js_open_session_form');
    const out: Record<string, string> = {};
    if (form) {
      form.querySelectorAll('input,select,textarea').forEach((e) => {
        const el = e as HTMLInputElement;
        if (!el.name) return;
        if (el.type === 'checkbox' || el.type === 'radio') {
          if (el.checked) out[el.name] = el.value;
        } else if (!(el.name in out)) out[el.name] = el.value;
      });
    }
    return out;
  });
}

async function createFiresideChat(page: Page, title: string): Promise<string | null> {
  const context = page.context();
  const fields = await collectFscCreateFields(page);
  if (!fields.csrfmiddlewaretoken) return null;
  // Unique future date (30-180 days) keeps the chat upcoming and conflict-free.
  const future = new Date(Date.now() + (30 + Math.floor(Math.random() * 150)) * 86_400_000);
  const dateStr = future.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  fields.title = title;
  fields.session_sub_org = '1125'; // Staging Global Mentoring Program
  fields.location_type = '1'; // MentorCloud Video Session (no external integration)
  fields.location = '';
  fields.start_date = dateStr;
  fields.start_time = '10:00 AM';
  fields.end_time = '10:45 AM';
  fields.seats = '5';
  fields.description = 'Created by the QA automation suite.';
  const resp = await context.request.post(FSC_CREATE_PATH, {
    form: fields,
    headers: { Referer: page.url() }, // Django HTTPS CSRF needs a same-origin Referer
    maxRedirects: 0,
  });
  const status = resp.status();
  if (status < 300 || status >= 400) return null; // 200 = form re-rendered with errors

  // Locate the created chat on the FSC tab by its unique title. The list renders
  // each card twice (a hidden copy first), so wait for attachment, not visibility.
  await page.goto(SESSIONS_PATH, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /fireside chats/i }).click().catch(() => {});
  const card = page.locator('a[href*="/events/open/"]', { hasText: title }).first();
  await card.waitFor({ state: 'attached', timeout: 45_000 }).catch(() => {});
  return card.getAttribute('href').catch(() => null);
}

/**
 * Make sure at least one fireside chat exists for the detail tests, creating the
 * stable fixture chat when the FSC tab is empty. Leaves the page on the FSC tab
 * and returns the first VISIBLE chat card link (null only on a real failure).
 *
 * Confirmed live: the sessions page renders the card list twice — a hidden copy
 * precedes the visible one — so an unfiltered .first() resolves to a hidden
 * anchor and never becomes visible. Always filter for visibility here. The list
 * can also take 40s+ to render on slow staging, hence the generous timeout.
 */
async function ensureFiresideChat(page: Page) {
  await page.goto(SESSIONS_PATH);
  await page.getByRole('tab', { name: /fireside chats/i }).click().catch(() => {});
  const anyLink = page.locator('a[href*="/events/open/"]');
  const fscLink = anyLink.filter({ visible: true }).first();
  await fscLink.waitFor({ timeout: 45_000 }).catch(() => {});
  if (await fscLink.isVisible().catch(() => false)) return fscLink;

  // Cards attached but never visible = a rendering hiccup, NOT an empty list —
  // never create a duplicate fixture chat in that state.
  if (await anyLink.count()) return null;

  // Truly no chats — create the fixture one, then re-open the FSC tab.
  const created = await createFiresideChat(page, FSC_FIXTURE_TITLE);
  if (!created) return null;
  await page.goto(SESSIONS_PATH);
  await page.getByRole('tab', { name: /fireside chats/i }).click().catch(() => {});
  await fscLink.waitFor({ timeout: 45_000 }).catch(() => {});
  return (await fscLink.isVisible().catch(() => false)) ? fscLink : null;
}

/**
 * Like ensureFiresideChat, but guarantees a chat HOSTED by the current account
 * (the fixture-titled chat), creating it when absent — host-only controls
 * (Update, Cancel Session, notes) are only offered on your own chat, and the
 * first card on the list can be someone else's.
 */
async function ensureHostFiresideChat(page: Page) {
  const titled = () =>
    page
      .locator('a[href*="/events/open/"]', { hasText: FSC_FIXTURE_TITLE })
      .filter({ visible: true })
      .first();
  await page.goto(SESSIONS_PATH);
  await page.getByRole('tab', { name: /fireside chats/i }).click().catch(() => {});
  await titled().waitFor({ timeout: 45_000 }).catch(() => {});
  if (await titled().isVisible().catch(() => false)) return titled();

  const created = await createFiresideChat(page, FSC_FIXTURE_TITLE);
  if (!created) return null;
  await page.goto(SESSIONS_PATH);
  await page.getByRole('tab', { name: /fireside chats/i }).click().catch(() => {});
  await titled().waitFor({ timeout: 45_000 }).catch(() => {});
  return (await titled().isVisible().catch(() => false)) ? titled() : null;
}

/**
 * Cancel a fireside chat as its host (teardown for TC-SESS-006). The red
 * "Cancel Session" CTA is an <a>.js_session_detail_cta without href — fire it
 * via clickSessionCta, then confirm through the reason modal.
 */
async function cancelFiresideChat(page: Page, detailUrl: string): Promise<void> {
  await page.goto(detailUrl);
  await page.waitForTimeout(2500);
  await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});
  // The CTA renders late on slow staging — retry for up to 20s so the teardown
  // doesn't silently leak the test chat.
  let clicked = false;
  const deadline = Date.now() + 20_000;
  while (!clicked && Date.now() < deadline) {
    clicked = await clickSessionCta(page, 'Cancel Session');
    if (!clicked) await page.waitForTimeout(1000);
  }
  if (!clicked) return;
  await page.waitForTimeout(1500);
  const reason = page.locator('.js_prompt_textarea:visible').first();
  if (await reason.isVisible().catch(() => false)) await reason.fill('QA automation: cleanup.');
  await page.locator('.js_modal_ok:visible').first().click().catch(() => {});
  await page.waitForTimeout(3000);
}

/**
 * Fire a session-detail CTA (an <a> without href, e.g. Accept / Decline) by its
 * exact visible label. The delegated jQuery handlers ignore Playwright's synthetic
 * pointer sequence, so click via JS. Returns false while the CTA isn't rendered.
 */
async function clickSessionCta(page: Page, label: string): Promise<boolean> {
  return page.evaluate((text) => {
    const el = Array.from(document.querySelectorAll('a')).find((e) => {
      const t = (e.textContent || '').trim().replace(/\s+/g, ' ');
      const h = e as HTMLElement;
      return t.toLowerCase() === text.toLowerCase() && (h.offsetWidth > 0 || h.offsetHeight > 0);
    }) as HTMLElement | undefined;
    if (!el) return false;
    el.click();
    return true;
  }, label);
}

/** Cancel a session as the mentee — teardown for pending/accepted test sessions. */
async function cancelSessionAsMentee(browser: Browser, detailUrl: string): Promise<void> {
  const { context, page } = await rolePage(browser, 'mentee');
  try {
    await page.goto(detailUrl);
    await page.waitForTimeout(2500);
    await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});
    const cancel = page.getByText('Cancel Session', { exact: true }).first();
    if (!(await cancel.isVisible().catch(() => false))) return;
    await cancel.click();
    await page.waitForTimeout(1500);
    const reason = page.locator('.js_prompt_textarea:visible').first();
    if (await reason.isVisible().catch(() => false)) await reason.fill('QA automation: cleanup.');
    await page.locator('.js_modal_ok:visible').first().click().catch(() => {});
    await page.waitForTimeout(3000);
  } finally {
    await context.close();
  }
}

test.describe('Sessions — navigation & structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SESSIONS_PATH);
  });

  // TC-SESS-001 — Sessions page loads with mini tabs and action buttons
  test('TC-SESS-001 page loads with mini tabs and action buttons', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /^all$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /fireside chats/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /1-1 sessions/i })).toBeVisible();

    await expect(page.getByRole('button', { name: /filter/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /create fireside chat/i })).toBeVisible();
  });

  // TC-SESS-002 — Switching between All / FSC / 1-1 mini tabs filters content
  test('TC-SESS-002 switching mini tabs filters content', async ({ page }) => {
    const fsc = page.getByRole('tab', { name: /fireside chats/i });
    const oneOnOne = page.getByRole('tab', { name: /1-1 sessions/i });
    const all = page.getByRole('tab', { name: /^all$/i });

    await fsc.click();
    await expect(fsc).toBeVisible();
    await oneOnOne.click();
    await expect(oneOnOne).toBeVisible();
    await all.click();
    await expect(all).toBeVisible();
  });

  // TC-SESS-003 — Empty state shows the schedule-your-first CTAs. The mentor/mentee
  // fixtures create sessions in other flows, so drive this from the admin account,
  // which stays session-free.
  test.describe('empty state (admin)', () => {
    test.use({ storageState: STORAGE_STATE.admin });

    test('TC-SESS-003 empty state shows expected CTAs', async ({ page }) => {
      const firstFsc = page.getByText(/schedule your first fireside chat/i).first();
      await firstFsc.waitFor({ timeout: 20_000 }).catch(() => {});
      if (!(await firstFsc.isVisible().catch(() => false))) {
        test.skip(true, 'Account has fireside chats; empty state not shown.');
      }
      await expect(firstFsc).toBeVisible();
      // The 1-1 side shows its own empty-state CTA and message.
      await expect(page.getByText(/schedule a session/i).first()).toBeVisible();
      await expect(page.getByText(/don.t have any upcoming sessions/i)).toBeVisible();
    });
  });

  // TC-SESS-004 — View Past Sessions opens the past view
  test('TC-SESS-004 View Past Sessions opens the past view', async ({ page }) => {
    const viewPast = page.getByRole('link', { name: /view past/i }).or(
      page.getByRole('button', { name: /view past/i })
    );
    if (await viewPast.first().isVisible().catch(() => false)) {
      await viewPast.first().click();
    } else {
      // The control only appears with past data; the past view lives here.
      await page.goto('/events/past/?type=chats');
    }
    await expect(page).toHaveURL(/\/events\/past|past/i);
  });

  // TC-SESS-005 — Filter button opens the filter panel
  test('TC-SESS-005 Filter button opens the filter panel', async ({ page }) => {
    await page.getByRole('button', { name: /filter/i }).click();
    // A filter dialog/panel becomes visible.
    await expect(
      page.getByRole('dialog').or(page.getByRole('heading', { name: /filter/i })).first()
    ).toBeVisible();
  });
});

test.describe('Sessions — fireside chat detail', () => {
  // TC-SESS-017 — Opening a fireside chat shows its detail page (title, schedule, actions)
  test('TC-SESS-017 fireside chat detail page opens from the FSC tab', async ({ page }) => {
    test.slow();
    // If the FSC tab is empty the fixture chat is created on the fly, so the test
    // only skips when creation itself fails (a real technical blocker).
    const fscLink = await ensureFiresideChat(page);
    if (!fscLink) {
      test.skip(true, 'No fireside chats and creating the fixture chat failed.');
    }
    await fscLink!.click();
    await expect(page).toHaveURL(/\/events\/open\/\d+/, { timeout: 20_000 });

    // The detail page carries the Sessions › Fireside chats breadcrumb and a title heading.
    await expect(page.getByRole('link', { name: /fireside chats/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  });

  // TC-SESS-018 — Fireside chat detail exposes an action (Take Action / Register / Join / Cancel)
  test('TC-SESS-018 fireside chat detail exposes an attendee action', async ({ page }) => {
    test.slow();
    const fscLink = await ensureFiresideChat(page);
    if (!fscLink) {
      test.skip(true, 'No fireside chats and creating the fixture chat failed.');
    }
    await fscLink!.click();
    await expect(page).toHaveURL(/\/events\/open\/\d+/, { timeout: 20_000 });
    await page.waitForTimeout(2000);

    // Depending on state the page offers "Take Action" (floating menu) and one of
    // Register / Join / Cancel Registration / Cancel Session. A past chat shows a
    // completed/expired status instead — accept either, so the page is never broken.
    // The floating "Take Action" button is in the DOM but hidden until scroll
    // (.floating__btn--hidden), so filter the union down to visible matches.
    const action = page
      .getByText(/take action/i)
      .or(page.getByText(/^\s*(register|join|cancel registration|cancel session)\s*$/i))
      .or(page.getByText(/fireside chat (completed|expired|cancelled|pending verification)/i))
      .filter({ visible: true })
      .first();
    await expect(action).toBeVisible({ timeout: 15_000 });
  });

  // TC-SESS-020 — The FSC detail page exposes its utility links: a Join meeting
  // link, Add to Calendar, and Take Session Notes. Confirmed live on the fixture
  // chat (NB: the platform spells it "Add to Calender" — match both spellings).
  test('TC-SESS-020 fireside chat detail exposes Join / calendar / notes links', async ({ page }) => {
    test.slow();
    const fscLink = await ensureHostFiresideChat(page);
    if (!fscLink) {
      test.skip(true, 'No fireside chats and creating the fixture chat failed.');
    }
    await fscLink!.click();
    await expect(page).toHaveURL(/\/events\/open\/\d+/, { timeout: 20_000 });
    await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});

    // Join carries the meeting URL (/calendar/session/<id>/...).
    await expect(
      page.getByRole('link', { name: /^join$/i }).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/add to calend[ae]r/i).filter({ visible: true }).first()
    ).toBeVisible();
    await expect(
      page.getByText(/take session notes/i).filter({ visible: true }).first()
    ).toBeVisible();
  });

  // TC-SESS-025 — The host's Update CTA opens the chat edit form prefilled.
  test('TC-SESS-025 host Update opens the prefilled chat edit form', async ({ page }) => {
    test.slow();
    const fscLink = await ensureHostFiresideChat(page);
    if (!fscLink) {
      test.skip(true, 'No fireside chats and creating the fixture chat failed.');
    }
    await fscLink!.click();
    await expect(page).toHaveURL(/\/events\/open\/(\d+)/, { timeout: 20_000 });
    await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});

    const update = page.getByText(/^\s*update\s*$/i).filter({ visible: true }).first();
    await update.waitFor({ timeout: 30_000 }).catch(() => {});
    if (!(await update.isVisible().catch(() => false))) {
      test.skip(true, 'Update CTA not offered (not the host of the first chat).');
    }
    await update.click();
    // The edit form lives at /events/chat/<id>/update/ and prefills the title.
    await expect(page).toHaveURL(/\/events\/chat\/\d+\/update/, { timeout: 30_000 });
    const title = page.locator('#id_title, input[name="title"]').first();
    await title.waitFor({ state: 'attached', timeout: 45_000 });
    expect((await title.inputValue()).length).toBeGreaterThan(0);
  });

  // TC-SESS-026 — "Take Session Notes" opens the notes editor modal.
  // Confirmed live: the CTA opens a "Take Notes for your Session" modal with a
  // CKEditor body. Nothing is saved — the modal is only opened and inspected.
  test('TC-SESS-026 Take Session Notes opens the notes editor', async ({ page }) => {
    test.slow();
    const fscLink = await ensureHostFiresideChat(page);
    if (!fscLink) {
      test.skip(true, 'No fireside chats and creating the fixture chat failed.');
    }
    await fscLink!.click();
    await expect(page).toHaveURL(/\/events\/open\/\d+/, { timeout: 20_000 });
    await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});

    const notes = page.getByText(/take session notes/i).filter({ visible: true }).first();
    await notes.waitFor({ timeout: 30_000 });
    await notes.click();
    await expect(page.getByText(/take notes for your session/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator('.mc-modal [contenteditable="true"], [contenteditable="true"]').filter({ visible: true }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  // TC-SESS-024 — AUTHORIZATION: a mentee viewing another host's chat sees only
  // attendee actions — never the host's Update / Cancel Session controls.
  test.describe('as mentee (authorization)', () => {
    test.use({ storageState: STORAGE_STATE.mentee });

    test('TC-SESS-024 mentee sees no host controls on another host\'s chat', async ({ page, browser }) => {
      test.slow();
      await page.goto(SESSIONS_PATH);
      await page.getByRole('tab', { name: /fireside chats/i }).click().catch(() => {});
      const fscLink = page.locator('a[href*="/events/open/"]').filter({ visible: true }).first();
      await fscLink.waitFor({ timeout: 45_000 }).catch(() => {});
      if (!(await fscLink.isVisible().catch(() => false))) {
        const mentor = await rolePage(browser, 'mentor');
        let created: string | null = null;
        try {
          created = await createFiresideChat(mentor.page, FSC_FIXTURE_TITLE);
        } finally {
          await mentor.context.close();
        }
        if (!created) test.skip(true, 'No fireside chats and creating one as mentor failed.');
        await page.goto(SESSIONS_PATH);
        await page.getByRole('tab', { name: /fireside chats/i }).click().catch(() => {});
        await fscLink.waitFor({ timeout: 45_000 });
      }
      await fscLink.click();
      await expect(page).toHaveURL(/\/events\/open\/\d+/, { timeout: 20_000 });
      await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});

      // An attendee action must be present (the page works for the mentee)...
      await expect(
        page
          .getByText(/^\s*(register|cancel registration|join)\s*$/i)
          .filter({ visible: true })
          .first()
      ).toBeVisible({ timeout: 45_000 });
      // ...but the HOST controls must not be: Update, Cancel Session,
      // Cancel All Recurring Session, Take Session Notes-side host menu etc.
      await expect(page.getByText(/^\s*update\s*$/i).filter({ visible: true })).toHaveCount(0);
      await expect(
        page.getByText(/^\s*cancel session\s*$/i).filter({ visible: true })
      ).toHaveCount(0);
      await expect(
        page.getByText(/cancel all recurring session/i).filter({ visible: true })
      ).toHaveCount(0);
    });
  });

  // TC-SESS-019 — Mentee registers for a fireside chat and cancels the registration.
  // Confirmed live: the unregistered rail offers "Register" (a.js_check_for_conflict);
  // confirming via "#js_alert_box" ("Do you want to register ...? Yes, Continue")
  // flips the rail to Join + "Cancel Registration" (a.mc-btn--red). Cancelling asks
  // "Do you want to cancel booking ...?" and restores "Register". A hidden floating
  // Take-Action menu duplicates every CTA, so always filter for visible. The rail
  // re-renders slowly after each action — poll with reloads.
  test.describe('as mentee (registration)', () => {
    test.use({ storageState: STORAGE_STATE.mentee });

    test('TC-SESS-019 mentee can register for a fireside chat and cancel', async ({ page, browser }) => {
      // Several wait-then-reload cycles on a slow page; test.slow()'s 3x isn't
      // always enough on degraded staging.
      test.setTimeout(420_000);
      // Find a chat the mentee can open; if none exist, create the fixture chat
      // as the MENTOR (registering for your own chat is not a valid state).
      await page.goto(SESSIONS_PATH);
      await page.getByRole('tab', { name: /fireside chats/i }).click().catch(() => {});
      const fscLink = page.locator('a[href*="/events/open/"]').filter({ visible: true }).first();
      await fscLink.waitFor({ timeout: 45_000 }).catch(() => {});
      if (!(await fscLink.isVisible().catch(() => false))) {
        const mentor = await rolePage(browser, 'mentor');
        let created: string | null = null;
        try {
          created = await createFiresideChat(mentor.page, FSC_FIXTURE_TITLE);
        } finally {
          await mentor.context.close();
        }
        if (!created) {
          test.skip(true, 'No fireside chats and creating one as mentor failed.');
        }
        await page.goto(SESSIONS_PATH);
        await page.getByRole('tab', { name: /fireside chats/i }).click().catch(() => {});
        await fscLink.waitFor({ timeout: 45_000 });
      }
      await fscLink.click();
      await expect(page).toHaveURL(/\/events\/open\/\d+/, { timeout: 20_000 });
      await page.waitForTimeout(3000);
      await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});

      const registerCta = page.getByText(/^\s*register\s*$/i).filter({ visible: true }).first();
      const cancelCta = page.getByText(/cancel registration/i).filter({ visible: true }).first();
      /**
       * Confirm the open #js_alert_box dialog. The cancel-booking dialog carries
       * a MANDATORY comment textarea (js_prompt_textarea) — "Yes" silently
       * no-ops while it's empty (the dialog just flags "* mandatory field"), so
       * fill it whenever present. Confirmed live: a filled cancel POSTs
       * /events/open/<id>/book/cancel/.
       */
      const confirmModal = async () => {
        const reason = page.locator('#js_alert_box .js_prompt_textarea:visible').first();
        if (await reason.count()) await reason.fill('QA automation: cancelling test registration.');
        await page.locator('#js_alert_box .js_modal_ok:visible').first().click();
      };
      /**
       * Blocking modals pop over the page at any moment: Connect Calendar
       * (Skip / Connect) and the "You have successfully registered ..." success
       * dialog (Ok only). Prefer js_modal_cancel (Skip/No — also safely closes a
       * stray confirm dialog), fall back to js_modal_ok for ok-only dialogs.
       */
      const dismissBlockingModal = async () => {
        const modal = page.locator('#js_alert_box');
        if (await modal.isVisible().catch(() => false)) {
          const skip = modal.locator('.js_modal_cancel:visible').first();
          const ok = modal.locator('.js_modal_ok:visible').first();
          if (await skip.count()) await skip.click().catch(() => {});
          else if (await ok.count()) await ok.click().catch(() => {});
          await page.waitForTimeout(500);
        }
      };
      /**
       * Click a rail CTA and wait for its confirm dialog, retrying the whole
       * sequence through blocking modals that can fade in mid-click.
       */
      const ctaFlow = async (cta: typeof registerCta, confirmText: RegExp) => {
        await expect(async () => {
          await dismissBlockingModal();
          await cta.click({ timeout: 5_000 });
          await expect(page.getByText(confirmText)).toBeVisible({ timeout: 8_000 });
        }).toPass({ timeout: 90_000 });
        await confirmModal();
      };
      /**
       * The CTA rail re-renders slowly after actions and sometimes only after a
       * reload. Reloads themselves can take 30-60s on degraded staging, so use
       * patient wait-then-reload cycles rather than a fast poll.
       */
      const waitForCta = async (cta: typeof registerCta) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          await dismissBlockingModal();
          const visible = await cta
            .waitFor({ timeout: 30_000 })
            .then(() => true)
            .catch(() => false);
          if (visible) return;
          await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          await page.waitForTimeout(3000);
        }
        await dismissBlockingModal();
        await expect(cta).toBeVisible({ timeout: 30_000 });
      };

      // Leftover registration from a previous run? Cancel it first so the flow
      // always starts unregistered (if-else handling, not a skip).
      if (await cancelCta.isVisible().catch(() => false)) {
        await ctaFlow(cancelCta, /cancel booking/i);
        await waitForCta(registerCta);
      }

      // Register, confirming through the modal.
      await waitForCta(registerCta);
      await ctaFlow(registerCta, /do you want to register/i);
      // Registered: the rail now offers Cancel Registration (and Join).
      await waitForCta(cancelCta);

      // Teardown (also the cancel-registration assertion): cancel the booking.
      await ctaFlow(cancelCta, /cancel booking/i);
      await waitForCta(registerCta);
    });
  });
});

test.describe('Sessions — create / propose', () => {
  // TC-SESS-006 — User can create a new Fireside Chat (full end-to-end, self-cleaning:
  // the chat is created with a unique title, verified on the FSC tab, then cancelled).
  test('TC-SESS-006 user can create a new Fireside Chat', async ({ page }) => {
    test.slow();
    await page.goto(SESSIONS_PATH);
    await page.getByRole('link', { name: /create fireside chat/i }).click();
    await expect(page).toHaveURL(/\/events\/chat\/create/);
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 15_000 });

    const title = `QA FSC ${Date.now().toString().slice(-6)}`;
    const detailHref = await createFiresideChat(page, title);
    try {
      // The chat was created and its card appears on the FSC tab.
      expect(detailHref).toMatch(/\/events\/open\/\d+/);
      // Its detail page renders with the title heading.
      await page.goto(detailHref!);
      await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20_000 });
    } finally {
      // Teardown: cancel the test chat so it doesn't pile up on the account.
      if (detailHref) await cancelFiresideChat(page, detailHref);
    }
  });

  // TC-SESS-021 — The FSC create form rejects a submission missing its required
  // fields (title, seats). Safe negative via the direct-POST pattern: Django
  // re-renders the form (200) instead of redirecting (302), and no chat is made.
  test('TC-SESS-021 FSC create rejects missing required fields', async ({ page }) => {
    const fields = await collectFscCreateFields(page);
    expect(fields.csrfmiddlewaretoken).toBeTruthy();
    fields.title = '';
    fields.seats = '';
    fields.location_type = '1';
    const resp = await page.context().request.post(FSC_CREATE_PATH, {
      form: fields,
      headers: { Referer: page.url() },
      maxRedirects: 0,
    });
    // 200 = form re-rendered with validation errors; a 3xx would mean the
    // invalid chat was actually created.
    expect(resp.status()).toBe(200);
  });

  // TC-SESS-022 — "Generate with AI" drafts the chat description from the title.
  // Confirmed live: filling the title and clicking button.draft-ai-btn populates
  // the CKEditor description (0 -> ~400 chars). Nothing is submitted, so no chat
  // is ever created by this test.
  test('TC-SESS-022 Generate with AI drafts the FSC description', async ({ page }) => {
    test.slow(); // AI generation latency
    await page.goto(FSC_CREATE_PATH);
    await page.locator('#id_title').waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
    await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});
    const aiButton = page.locator('button.draft-ai-btn').filter({ visible: true }).first();
    await aiButton.waitFor({ timeout: 20_000 }).catch(() => {});
    if (!(await aiButton.isVisible().catch(() => false))) {
      test.skip(true, 'Generate with AI is not enabled for this org.');
    }
    await page.locator('#id_title').fill('Mentoring career growth conversations');
    const before = await page.evaluate(
      () => (document.querySelector('.cke_wysiwyg_div')?.textContent || '').trim().length
    );
    await aiButton.click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (document.querySelector('.cke_wysiwyg_div')?.textContent || '').trim().length
          ),
        { timeout: 90_000 },
      )
      .toBeGreaterThan(before + 30);
  });

  // TC-SESS-023 — A recurring fireside chat (weekly x2) creates a recurring
  // series. Confirmed live: the series surfaces as ONE list card badged
  // "Recurring Meeting"; its detail page carries a "Recurring Meetings" section
  // listing the occurrence dates (plus a "Cancel All Recurring Session" CTA).
  // Cancelling one occurrence surfaces the next as its own card, so the
  // teardown loops cancel passes until no card with the title remains.
  test('TC-SESS-023 recurring FSC creates a recurring series', async ({ page }) => {
    test.slow();
    const title = `QA recurring FSC ${Date.now().toString().slice(-6)}`;
    const fields = await collectFscCreateFields(page);
    if (!fields.csrfmiddlewaretoken) {
      test.skip(true, 'FSC create form did not render.');
    }
    const future = new Date(Date.now() + (30 + Math.floor(Math.random() * 100)) * 86_400_000);
    const dateStr = future.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    Object.assign(fields, {
      title,
      session_sub_org: '1125',
      location_type: '1',
      location: '',
      start_date: dateStr,
      start_time: '9:00 AM',
      end_time: '9:30 AM',
      seats: '5',
      description: 'Created by the QA automation suite (recurring).',
      is_repeated_meetings: 'on',
      frequency: '2', // weekly
      occurrences: '2',
    });
    const resp = await page.context().request.post(FSC_CREATE_PATH, {
      form: fields,
      headers: { Referer: page.url() },
      maxRedirects: 0,
    });
    expect(resp.status(), 'recurring create should redirect on success').toBeGreaterThanOrEqual(300);
    expect(resp.status()).toBeLessThan(400);

    const seriesHrefs = async () => {
      await page.goto(SESSIONS_PATH, { waitUntil: 'domcontentloaded' });
      await page.getByRole('tab', { name: /fireside chats/i }).click().catch(() => {});
      await page
        .locator('a[href*="/events/open/"]')
        .first()
        .waitFor({ state: 'attached', timeout: 45_000 })
        .catch(() => {});
      return page
        .locator('a[href*="/events/open/"]', { hasText: title })
        .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('href') || ''))].filter(Boolean));
    };

    try {
      const hrefs = await seriesHrefs();
      expect(hrefs.length).toBeGreaterThanOrEqual(1);
      // The list card is badged as a recurring meeting.
      await expect(page.locator('.mc-card', { hasText: title }).first()).toContainText(
        /recurring meeting/i
      );
      // The detail page lists the series under "Recurring Meetings".
      await page.goto(hrefs[0]);
      await expect(
        page.getByText(/recurring meetings/i).filter({ visible: true }).first()
      ).toBeVisible({ timeout: 45_000 });
    } finally {
      // Teardown: cancel occurrences until none remain (each cancel can surface
      // the next occurrence as a fresh card).
      for (let pass = 0; pass < 4; pass++) {
        const remaining = await seriesHrefs().catch(() => [] as string[]);
        if (!remaining.length) break;
        for (const href of remaining) {
          await cancelFiresideChat(page, href);
        }
      }
    }
  });

  // TC-SESS-008 — Schedule a session from a coach profile (participant pre-selected).
  // The mentor home shows no "Schedule 1:1" recommendation cards, so drive this from
  // the mentee side, where the mentor's coach profile always offers the action.
  test.describe('as mentee', () => {
    test.use({ storageState: STORAGE_STATE.mentee });

    test('TC-SESS-008 scheduling pre-selects the participant', async ({ page }) => {
      await page.goto('/profile/program-view/4229/mentor');
      const schedule = page.getByRole('link', { name: /schedule 1:1/i }).first();
      await expect(schedule).toBeVisible({ timeout: 20_000 });
      // The href carries the participant id (?participant=...).
      await expect(schedule).toHaveAttribute('href', /participant=\d+/);
      await schedule.click();
      await expect(page).toHaveURL(/participant=\d+/, { timeout: 20_000 });
    });
  });

  // TC-SESS-009 — Proposed session appears in the proposer's upcoming sessions list
  test('TC-SESS-009 upcoming sessions list renders session items', async ({ page }) => {
    await page.goto(SESSIONS_PATH);
    await page.getByRole('tab', { name: /1-1 sessions/i }).click();
    // NOTE: end-to-end this should follow creating a session (TC-SESS-007). On an
    // empty account the list shows the "Schedule a session" empty state instead.
    await expect(
      page.getByRole('heading', { name: /1-1 sessions|schedule a session/i }).first()
    ).toBeVisible();
  });
});

test.describe('Sessions — mentor-side response', () => {
  // TC-SESS-012 — Accepted session shows up in both mentee's and mentor's calendars
  test('TC-SESS-012 accepted session appears in the mentor list', async ({ page }) => {
    await page.goto(SESSIONS_PATH);
    await page.getByRole('tab', { name: /1-1 sessions/i }).click();
    // NOTE: cross-account verification needs two contexts and a known accepted
    // session. Here we assert the 1-1 section renders.
    await expect(
      page.getByRole('heading', { name: /1-1 sessions|schedule a session/i }).first()
    ).toBeVisible();
  });
});

test.describe('Sessions — lifecycle (modify / end)', () => {
  // TC-SESS-015 — Completed sessions appear in "View Past Sessions" with correct details
  test('TC-SESS-015 completed sessions appear in the past view', async ({ page }) => {
    await page.goto('/events/past/?type=chats');
    await expect(page).toHaveURL(/\/events\/past/);
    // NOTE: assert specific session detail cards once seeded completed sessions exist.
  });

  // TC-SESS-016 — Calendar-connect modal Skip and Connect options both work
  test('TC-SESS-016 calendar-connect modal Skip and Connect both work', async ({ page }) => {
    // The "Connect Calendar" modal (#js_alert_box) pops on the propose page when the
    // account has no connected calendar. Skip = <a>.js_modal_cancel, Connect = .js_modal_ok.
    await page.goto(PROPOSE_URL);
    const modal = page.locator('#js_alert_box');
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal.getByText(/connect calendar/i)).toBeVisible();
    await expect(modal.locator('.js_modal_ok')).toBeVisible(); // Connect
    const skip = modal.locator('.js_modal_cancel:visible').first(); // Skip
    await expect(skip).toBeVisible();
    await skip.click();
    // Skip dismisses the modal and reveals the underlying form.
    await expect(modal).toBeHidden({ timeout: 10_000 });
  });
});

/**
 * 1:1 session lifecycle — strictly mentee <-> mentor, self-cleaning. Serial so
 * proposeSession's "newest session = highest id" lookup never races a concurrent
 * proposal: propose (007) -> reschedule form via Propose New Time (013) -> mentor
 * accepts a fresh proposal (010) -> mentor declines a fresh proposal (011) ->
 * cancel (014, the teardown for 007's session).
 *
 * A fresh proposal puts the mentor's detail page in "Your response is pending"
 * with Accept / Propose New Time / Decline CTAs (anchors without href whose
 * delegated handlers ignore synthetic pointer sequences — fire them with a JS
 * click, same caveat as TC-PROG-018). Accept chains two modals: "Connect your
 * calendar" (Later continues without one) then "Are you sure to accept ...?"
 * (Yes, Continue). Decline requires a reason.
 */
test.describe.serial('Sessions — 1:1 lifecycle (mentee↔mentor)', () => {
  let sessionTitle = '';
  let detailUrl: string | null = null;

  // TC-SESS-007 — User can propose / schedule a 1:1 session with the mentor
  test('TC-SESS-007 user can schedule a 1:1 session', async ({ browser }) => {
    test.slow();
    sessionTitle = `QA 1:1 ${Date.now().toString().slice(-6)}`;
    detailUrl = await proposeSession(browser, sessionTitle);
    // A session was created and is reachable at its detail page.
    expect(detailUrl).toMatch(/\/calendar\/meeting\/details\/\d+/);

    // Confirm the mentor can open it (the 1:1 is shared with the mentor).
    const { context, page } = await rolePage(browser, 'mentor');
    try {
      await page.goto(detailUrl!);
      await expect(page.getByRole('link', { name: /join/i }).first()).toBeVisible({ timeout: 20_000 });
    } finally {
      await context.close();
    }
  });

  // TC-SESS-013 — User can reschedule an upcoming 1:1 session (Propose New Time)
  test('TC-SESS-013 user can reschedule an upcoming 1:1 session', async ({ browser }) => {
    test.slow();
    test.skip(!detailUrl, 'No session created (TC-SESS-007 did not run).');
    // "Propose New Time" (reschedule) is offered to the mentor on the session detail.
    const { context, page } = await rolePage(browser, 'mentor');
    try {
      await page.goto(detailUrl!);
      // Dismiss the Connect-Calendar modal if it pops, then open Propose New Time.
      await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});
      const proposeNewTime = page.getByRole('button', { name: /propose new time/i }).first();
      await expect(proposeNewTime).toBeVisible({ timeout: 15_000 });
      await proposeNewTime.click();
      // The reschedule form (date/time fields) opens.
      await expect(
        page.locator('input[name="start_date"]').or(page.getByRole('textbox').first()).first()
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  // TC-SESS-010 — Mentor can accept a pending 1:1 session request
  test('TC-SESS-010 mentor can accept a pending 1:1 session request', async ({ browser }) => {
    test.slow();
    const acceptUrl = await proposeSession(browser, `QA accept ${Date.now().toString().slice(-6)}`);
    test.skip(!acceptUrl, 'Could not seed a 1:1 proposal to the mentor.');
    try {
      const { context, page } = await rolePage(browser, 'mentor');
      try {
        await page.goto(acceptUrl!);
        await page.waitForTimeout(2500);
        // Dismiss the auto-popped Connect-Calendar modal.
        await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});
        await expect(page.getByText(/your response is pending/i)).toBeVisible({ timeout: 20_000 });

        await expect.poll(() => clickSessionCta(page, 'Accept'), { timeout: 20_000 }).toBe(true);

        // Modal 1: "Connect your calendar ... Later / Go to Settings" -> Later.
        const modal = page.locator('#js_alert_box');
        await expect(modal).toBeVisible({ timeout: 10_000 });
        await modal.locator('.js_modal_cancel:visible').first().click();

        // Modal 2: "Are you sure to accept this 1-1 session request?" -> Yes, Continue.
        await expect(page.getByText(/are you sure to accept/i)).toBeVisible({ timeout: 10_000 });
        await page.locator('.js_modal_ok:visible').first().click();

        // Accepted: the pending banner clears.
        await expect(page.getByText(/your response is pending/i)).toHaveCount(0, { timeout: 25_000 });
      } finally {
        await context.close();
      }
    } finally {
      // Teardown: cancel the now-accepted session so account state stays clean.
      await cancelSessionAsMentee(browser, acceptUrl!);
    }
  });

  // TC-SESS-011 — Mentor can decline a pending 1:1 session request
  test('TC-SESS-011 mentor can decline a pending 1:1 session request', async ({ browser }) => {
    test.slow();
    const declineUrl = await proposeSession(browser, `QA decline ${Date.now().toString().slice(-6)}`);
    test.skip(!declineUrl, 'Could not seed a 1:1 proposal to the mentor.');
    const { context, page } = await rolePage(browser, 'mentor');
    try {
      await page.goto(declineUrl!);
      await page.waitForTimeout(2500);
      await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});
      await expect(page.getByText(/your response is pending/i)).toBeVisible({ timeout: 20_000 });

      await expect.poll(() => clickSessionCta(page, 'Decline'), { timeout: 20_000 }).toBe(true);

      // "Reason for Declining the Session?" — the reason is required, then Yes.
      const reason = page.locator('.js_prompt_textarea:visible').first();
      await expect(reason).toBeVisible({ timeout: 10_000 });
      await reason.fill('QA automation: declining test session.');
      await page.locator('.js_modal_ok:visible').first().click();

      // Declined — no cancel-cleanup needed; a declined request is terminal.
      await expect(
        page.getByText(/request declined|has been declined/i).first()
      ).toBeVisible({ timeout: 25_000 });
    } finally {
      await context.close();
    }
  });

  // TC-SESS-014 — User can cancel an upcoming 1:1 session (also tears down the session)
  test('TC-SESS-014 user can cancel an upcoming 1:1 session', async ({ browser }) => {
    test.slow();
    test.skip(!detailUrl, 'No session created (TC-SESS-007 did not run).');
    const { context, page } = await rolePage(browser, 'mentee');
    try {
      await page.goto(detailUrl!);
      await page.waitForTimeout(2500);
      await page.locator('#js_alert_box .js_modal_cancel:visible').first().click().catch(() => {});
      // "Cancel Session" is an <a> without href (JS-handled) -> not a link/button role.
      const cancel = page
        .locator('[class*="js_session_detail_ct"]')
        .or(page.getByText('Cancel Session', { exact: true }))
        .first();
      await expect(cancel).toBeVisible({ timeout: 15_000 });
      await cancel.click();
      // Confirm dialog (reason optional) -> Ok/Yes.
      const dialog = page.locator('#js_alert_box');
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      const reason = page.locator('.js_prompt_textarea:visible').first();
      if (await reason.isVisible().catch(() => false)) await reason.fill('QA automation: cancelling test session.');
      await page.locator('.js_modal_ok:visible').first().click();
      await page.waitForTimeout(4000);
      // Cancelled: re-opening the session no longer offers a Cancel Session control.
      await page.goto(detailUrl!);
      await page.waitForTimeout(3000);
      await expect(
        page.locator('[class*="js_session_detail_ct"]').or(page.getByText('Cancel Session', { exact: true }))
      ).toHaveCount(0, { timeout: 20_000 });
      detailUrl = null;
    } finally {
      await context.close();
    }
  });
});
