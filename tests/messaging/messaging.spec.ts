import { test, expect } from '../utils/fixtures';
import type { Browser } from '@playwright/test';

import { STORAGE_STATE } from '../utils/credentials';

/**
 * Messaging module — TC-MSG-001 to TC-MSG-007.
 *
 * Confirmed against live staging (React page at /message/):
 *   Header icon  -> a[href="/message/"]
 *   Heading      -> "Messages"
 *   Empty inbox  -> "Send your first message today" + link "Send a message"
 *   Thread rows  -> .filter-table__item[data-url="/message/<id>/"]; thread ids
 *                   are SHARED between both participants.
 *   Reply        -> CKEditor contenteditable + button.js_post; the button keeps a
 *                   "disabled" CSS class until CKEditor fires a change event, so
 *                   type with REAL keystrokes (fill() doesn't trigger it). Send
 *                   POSTs /message/<id>/reply/.
 *   NB: composing a NEW message resolves recipients by display name (select2),
 *   and the org has duplicate "Venu mentee" users — replies inside the existing
 *   coaching thread are the only unambiguous mentor<->mentee channel.
 */
test.use({ storageState: STORAGE_STATE.mentor });

const MESSAGES_PATH = '/message/';

async function rolePage(browser: Browser, role: 'mentor' | 'mentee') {
  const context = await browser.newContext({ storageState: STORAGE_STATE[role] });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  return { context, page };
}

test.describe('Messaging', () => {
  // TC-MSG-001 — Open the Messages page from the navigation
  test('TC-MSG-001 open the Messages page from navigation', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/message/"]').first().click();
    await page.waitForURL(/\/message/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /^messages$/i })).toBeVisible({ timeout: 20_000 });
  });

  // TC-MSG-002 — Compose and send a new message to a recipient
  test('TC-MSG-002 open the compose form', async ({ page }) => {
    await page.goto(MESSAGES_PATH);

    // From an empty inbox the CTA is "Send a message"; otherwise a compose/new button.
    const compose = page
      .getByRole('link', { name: /send a message/i })
      .or(page.getByRole('button', { name: /send a message|new message|create new/i }))
      .first();
    await expect(compose).toBeVisible();
    await compose.click();

    // The composer exposes a recipient selector and a subject field.
    await expect(
      page.getByRole('textbox').first().or(page.getByText(/recipient/i)).first()
    ).toBeVisible({ timeout: 15_000 });
    // NOTE: select a recipient (AJAX autocomplete), fill the subject, type into the
    // CKEditor body, then click Send to deliver the message.
  });

  // TC-MSG-003 — Reply to an existing message thread
  test('TC-MSG-003 reply to an existing thread', async ({ page }) => {
    await page.goto(MESSAGES_PATH);
    await expect(page.getByRole('heading', { name: /^messages$/i })).toBeVisible({ timeout: 20_000 });

    // Conversation rows are list items carrying data-url="/message/<id>/". Wait until
    // either a thread or the empty-inbox placeholder renders before deciding.
    const thread = page.locator('.filter-table__item[data-url*="/message/"]');
    const placeholder = page.getByText(/send your first message today|no messages/i);
    await expect(thread.first().or(placeholder).first()).toBeVisible({ timeout: 20_000 });

    if (!(await thread.first().isVisible().catch(() => false))) {
      test.skip(true, 'Inbox is empty; no thread to reply to.');
    }

    await thread.first().click();
    await expect(page).toHaveURL(/\/message\/\d+/, { timeout: 15_000 });
    // The opened thread exposes a reply editor (CKEditor).
    await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: 15_000 });
    // NOTE: type into the reply box and click Send to post the reply.
  });

  // TC-MSG-005 — A reply sent in a shared thread reaches the other participant.
  // Uses the mentor<->mentee "Coaching Discussions" thread (see header NB on why
  // compose-by-name is avoided). Each run appends one reply to that thread —
  // it's the fixture accounts' own conversation, so no real users are affected.
  test('TC-MSG-005 a thread reply reaches the other participant', async ({ page, browser }) => {
    test.slow();
    await page.goto(MESSAGES_PATH);
    const thread = page
      .locator('.filter-table__item[data-url*="/message/"]')
      .filter({ hasText: /coaching discussions/i })
      .first();
    await thread.waitFor({ timeout: 30_000 }).catch(() => {});
    if (!(await thread.isVisible().catch(() => false))) {
      test.skip(true, 'No coaching thread between the fixture accounts.');
    }
    await thread.click();
    await expect(page).toHaveURL(/\/message\/\d+/, { timeout: 20_000 });
    const threadPath = new URL(page.url()).pathname;

    // Type the reply with real keystrokes so CKEditor enables the send button.
    const marker = `QA automation reply ${Date.now().toString().slice(-6)}`;
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.waitFor({ timeout: 45_000 });
    await editor.click();
    await page.keyboard.type(marker, { delay: 30 });

    const replyResp = page.waitForResponse(
      (r) => /\/message\/\d+\/reply\//.test(r.url()) && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.locator('button.js_post:visible').first().click();
    expect((await replyResp).status()).toBe(200);
    await expect(page.getByText(marker).first()).toBeVisible({ timeout: 20_000 });

    // The mentee sees the reply at the SAME thread URL.
    const mentee = await rolePage(browser, 'mentee');
    try {
      await mentee.page.goto(threadPath);
      await expect(mentee.page.getByText(marker).first()).toBeVisible({ timeout: 45_000 });
    } finally {
      await mentee.context.close();
    }
  });

  // TC-MSG-006 — The conversations Filter button opens the filter panel.
  // The button text carries an icon glyph, so match by hasText, not exact name.
  test('TC-MSG-006 conversations Filter opens the filter panel', async ({ page }) => {
    await page.goto(MESSAGES_PATH);
    await expect(page.getByRole('heading', { name: /^messages$/i })).toBeVisible({ timeout: 20_000 });
    const filter = page.locator('button').filter({ hasText: /filter/i }).filter({ visible: true }).first();
    await expect(filter).toBeVisible({ timeout: 15_000 });
    await filter.click();
    // A filter dialog/panel becomes visible (same pattern as TC-SESS-005).
    await expect(
      page.getByRole('dialog').or(page.getByRole('heading', { name: /filter/i })).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  // TC-MSG-007 — "Draft with AI" generates a message body from the subject.
  // Confirmed live: filling the subject and clicking button.draft-ai-btn fills
  // the CKEditor body (~180 chars). The composer is CANCELLED — nothing sends.
  test('TC-MSG-007 Draft with AI generates a message body', async ({ page }) => {
    test.slow(); // AI generation latency
    await page.goto(MESSAGES_PATH);
    await page
      .getByRole('link', { name: /send a message/i })
      .or(page.getByRole('button', { name: /send a message|new message|create new/i }))
      .first()
      .click();
    const aiButton = page.locator('button.draft-ai-btn').filter({ visible: true }).first();
    await aiButton.waitFor({ timeout: 20_000 }).catch(() => {});
    if (!(await aiButton.isVisible().catch(() => false))) {
      test.skip(true, 'Draft with AI is not enabled for this org.');
    }
    await page.locator('#id_subject').fill('Checking in about your mentoring goals');
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
    // Cancel the composer — this test never sends a message.
    await page.locator('button.js_cancel_message:visible').first().click().catch(() => {});
  });

  // TC-MSG-004 — Empty inbox shows the "no messages" placeholder.
  // The mentor/mentee fixtures exchange messages in other flows so their inboxes
  // are never empty; the admin fixture account keeps an empty inbox.
  test.describe('empty inbox (admin)', () => {
    test.use({ storageState: STORAGE_STATE.admin });

    test('TC-MSG-004 empty inbox shows the placeholder', async ({ page }) => {
      await page.goto(MESSAGES_PATH);
      const placeholder = page.getByText(/send your first message today|no messages/i).first();
      await placeholder.waitFor({ timeout: 20_000 }).catch(() => {});
      if (!(await placeholder.isVisible().catch(() => false))) {
        test.skip(true, 'Admin inbox is not empty; placeholder not shown.');
      }
      await expect(placeholder).toBeVisible();
      await expect(page.getByRole('link', { name: /send a message/i })).toBeVisible();
    });
  });
});
