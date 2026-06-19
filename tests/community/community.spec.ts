import { test, expect } from '../utils/fixtures';

import { STORAGE_STATE } from '../utils/credentials';

/**
 * Community module — TC-COMM-001 to TC-COMM-008.
 *
 * Confirmed against live staging (React page at /community/):
 *   Heading      -> "Community"
 *   Tabs         -> "All Posts" (/community/), "Saved Posts" (/community/saved/),
 *                   "My Activities" (/community/activity/)
 *   Create post  -> button "Start a post" / "Ask a question" / "Post an Announcement"
 *   Search       -> getByRole('textbox', { name: 'Search for a post' })
 */
test.use({ storageState: STORAGE_STATE.mentor });

const COMMUNITY_PATH = '/community/';

type Pg = import('@playwright/test').Page;

/**
 * Publish a post with the given (unique) body text via the Start-a-post
 * composer. Confirmed live: .js_insight_modal CKEditor + .js_send_post POSTs
 * /library/happening/new/insight/ (200).
 */
async function publishPost(page: Pg, marker: string): Promise<void> {
  await page.getByRole('button', { name: /start a post/i }).click();
  const editor = page.locator('.js_insight_modal [contenteditable="true"]').first();
  await editor.waitFor({ timeout: 20_000 });
  await editor.click();
  await editor.fill(marker);
  const postResp = page.waitForResponse(
    (r) => r.url().includes('/library/happening/new/insight/') && r.request().method() === 'POST',
    { timeout: 20_000 },
  );
  await page.locator('button.js_send_post:visible').first().click();
  expect((await postResp).status()).toBe(200);
}

/** The feed doesn't live-insert new posts — poll with reloads for the card. */
async function waitForPostCard(page: Pg, marker: string) {
  const card = page.locator('.mc-card--post', { hasText: marker }).first();
  await expect
    .poll(
      async () => {
        if (await card.count()) return true;
        await page.waitForTimeout(2000);
        await page.reload().catch(() => {});
        return (await card.count()) > 0;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return card;
}

/**
 * Delete the post carrying the marker via its card trash icon + confirm modal
 * ("Do you wish to delete this insight?"). The page navigates itself after.
 */
async function deletePost(page: Pg, marker: string): Promise<void> {
  const card = page.locator('.mc-card--post', { hasText: marker }).first();
  await card.locator('a.mi-trash').first().click();
  await expect(page.getByText(/do you wish to delete this (insight|question|post)/i)).toBeVisible({
    timeout: 10_000,
  });
  await page.locator('#js_alert_box .js_modal_ok:visible').first().click();
  await page.waitForTimeout(5000);
}

test.describe('Community', () => {
  // TC-COMM-001 — Navigate to Community page (post feed visible)
  test('TC-COMM-001 Community page shows the post feed', async ({ page }) => {
    await page.goto(COMMUNITY_PATH);
    await expect(page.getByRole('heading', { name: /^community$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /start a post/i })).toBeVisible();
  });

  // TC-COMM-002 — Switch between All / Saved / My Posts tabs
  test('TC-COMM-002 switch between All / Saved / My Activities tabs', async ({ page }) => {
    await page.goto(COMMUNITY_PATH);

    await page.getByRole('link', { name: /saved posts/i }).click();
    await expect(page).toHaveURL(/\/community\/saved/, { timeout: 20_000 });

    await page.getByRole('link', { name: /my activities/i }).click();
    await expect(page).toHaveURL(/\/community\/activity/, { timeout: 20_000 });

    await page.getByRole('link', { name: /all posts/i }).click();
    await expect(page).toHaveURL(/\/community\/?$/, { timeout: 20_000 });
  });

  // TC-COMM-003 — Create a post (Start a Post / Ask a Mentor / Announcement)
  test('TC-COMM-003 open the create-post composer', async ({ page }) => {
    await page.goto(COMMUNITY_PATH);
    await expect(page.getByRole('button', { name: /ask a question/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /post an announcement/i })).toBeVisible();

    await page.getByRole('button', { name: /start a post/i }).click();

    // The composer (modal/editor with a Post action) appears.
    await expect(
      page.getByRole('dialog').or(page.getByRole('button', { name: /^post$/i })).first()
    ).toBeVisible({ timeout: 15_000 });
    // NOTE: type into the CKEditor body and click Post to actually publish.
  });

  // TC-COMM-004 — User can save a post (appears in the Saved tab).
  // Confirmed live: each bookmark button carries data-url="/roundtable/<id>/save/"
  // (POSTing there toggles saved state; saved buttons gain .js_saved +
  // .mi-bookmark-filled). The feed RE-ORDERS after a save and the class only
  // updates on re-render, so position-based clicking + class polling misfires —
  // track the target post by its data-url and assert on the save POST itself.
  test('TC-COMM-004 saving a post adds it to Saved Posts', async ({ page }) => {
    test.slow();
    await page.goto(COMMUNITY_PATH);

    // Post cards load async; gate on a visible bookmark (hidden template cards
    // render js_save buttons too).
    const saveButtons = page.locator('button.js_save[data-url]').filter({ visible: true });
    await saveButtons.first().waitFor({ timeout: 30_000 }).catch(() => {});
    if (!(await saveButtons.first().isVisible().catch(() => false))) {
      test.skip(true, 'No community posts available to save.');
    }

    /**
     * Flip the bookmark for a post (by data-url) to its opposite saved state.
     * Retry-SAFE: each retry only re-clicks while the state still matches the
     * start, so a slow POST response (which would otherwise make a blind retry
     * toggle it back) can't corrupt the result. Success = the .js_saved class
     * flipped; the Saved-tab assertion later is the server-side source of truth.
     * The delegated click handler can bind late, hence the retry at all.
     */
    const toggleSave = async (dataUrl: string) => {
      const btn = page.locator(`button.js_save[data-url="${dataUrl}"]`).filter({ visible: true }).first();
      const isSaved = async () => /(?:^|\s)js_saved(?:\s|$)/.test((await btn.getAttribute('class')) || '');
      const was = await isSaved();
      await expect(async () => {
        if ((await isSaved()) === was) {
          const resp = page
            .waitForResponse((r) => r.url().includes(dataUrl) && r.request().method() === 'POST', {
              timeout: 12_000,
            })
            .catch(() => null);
          await btn.click();
          await resp;
        }
        expect(await isSaved()).toBe(!was);
      }).toPass({ timeout: 45_000 });
    };

    /**
     * Switch community tab by its link text. These are SPA links; on slow
     * staging the post-click navigation wait can exceed the action timeout, so
     * click with noWaitAfter and verify via the URL assertion that follows.
     */
    const gotoTab = async (name: RegExp, url: RegExp) => {
      await page.getByRole('link', { name }).first().click({ noWaitAfter: true });
      await expect(page).toHaveURL(url, { timeout: 30_000 });
    };

    // Clean slate: unsave everything currently saved, each addressed by data-url.
    await gotoTab(/saved posts/i, /\/community\/saved/);
    await page.waitForTimeout(3000);
    for (let guard = 0; guard < 10; guard++) {
      const url = await page
        .locator('button.js_save.js_saved[data-url]')
        .filter({ visible: true })
        .first()
        .getAttribute('data-url')
        .catch(() => null);
      if (!url) break;
      await toggleSave(url);
      await page.waitForTimeout(1000);
    }

    // Save the first unsaved post on the All feed; the awaited 200 on its own
    // /roundtable/<id>/save/ POST proves the save landed server-side.
    await gotoTab(/all posts/i, /\/community\/?$/);
    const target = page.locator('button.js_save[data-url]:not(.js_saved)').filter({ visible: true }).first();
    await target.waitFor({ timeout: 30_000 });
    const targetUrl = (await target.getAttribute('data-url'))!;
    await toggleSave(targetUrl);

    // THAT post (by data-url) shows up under Saved Posts. The saved list can lag
    // on slow staging, so poll with reloads.
    await gotoTab(/saved posts/i, /\/community\/saved/);
    const savedPost = page.locator(`button.js_save[data-url="${targetUrl}"]`);
    await expect
      .poll(
        async () => {
          if (await savedPost.count()) return true;
          await page.waitForTimeout(2000);
          await page.reload().catch(() => {});
          return (await savedPost.count()) > 0;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect(savedPost.filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

    // Cleanup: unsave (same endpoint toggles) so repeated runs start clean.
    await toggleSave(targetUrl);
  });

  // TC-COMM-005 — User can publish a post and delete it (full lifecycle).
  // Confirmed live: "Start a post" opens .js_insight_modal with a CKEditor
  // contenteditable; Post (.js_send_post) POSTs /library/happening/new/insight/
  // (200). The feed does NOT live-insert the new post — reload to see it. The
  // author's own card carries a direct trash link (a.mi-trash); deleting
  // confirms via #js_alert_box ("Do you wish to delete this insight?") and the
  // page navigates itself afterwards.
  test('TC-COMM-005 publishing a post adds it to the feed', async ({ page }) => {
    test.slow();
    await page.goto(COMMUNITY_PATH);
    const marker = `QA automation post ${Date.now().toString().slice(-6)}`;

    await publishPost(page, marker);
    const card = await waitForPostCard(page, marker);
    await expect(card).toBeVisible();

    // Cleanup (and delete-own-post coverage).
    await deletePost(page, marker);
    await page.goto(COMMUNITY_PATH);
    await expect(page.locator('.mc-card--post', { hasText: marker })).toHaveCount(0, {
      timeout: 20_000,
    });
  });

  // TC-COMM-006 — User can like and comment on a post. Runs against its OWN
  // freshly published post so it never touches real users' content; the like
  // and comment are removed with the post afterwards.
  // Confirmed live: like = button.js_like (data-url /content/insight/favorite/<id>/,
  // gains .js_liked/.mi-star-filled on success); comment = textarea.js_comment +
  // Enter (POST /content/insight/comment/<id>/).
  test('TC-COMM-006 user can like and comment on a post', async ({ page }) => {
    test.slow();
    await page.goto(COMMUNITY_PATH);
    const marker = `QA automation post ${Date.now().toString().slice(-6)}`;
    await publishPost(page, marker);
    const card = await waitForPostCard(page, marker);

    try {
      // Like — assert on the favorite POST and the toggled star state.
      const like = card.locator('button.js_like').first();
      const likeUrl = (await like.getAttribute('data-url'))!;
      const likeResp = page.waitForResponse(
        (r) => r.url().includes(likeUrl) && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await like.click();
      expect((await likeResp).status()).toBe(200);
      await expect(card.locator('button.js_like').first()).toHaveClass(
        /js_liked|mi-star-filled/,
        { timeout: 15_000 },
      );

      // Comment — Enter submits; the comment then renders on the card.
      const commentText = `QA automation comment ${Date.now().toString().slice(-6)}`;
      const commentBox = card.locator('textarea.js_comment').first();
      await commentBox.click();
      await commentBox.fill(commentText);
      const commentResp = page.waitForResponse(
        (r) => /\/content\/insight\/comment\//.test(r.url()) && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await commentBox.press('Enter');
      expect((await commentResp).status()).toBe(200);
      await expect(page.getByText(commentText).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      // The like and comment are owned by the post — deleting it removes all.
      await deletePost(page, marker);
    }
  });

  // TC-COMM-008 — "Ask a question" publishes a question post through the same
  // insight pipeline as Start-a-post. Questions additionally REQUIRE a topic
  // (select2, "* Mandatory field" — the send silently no-ops without it).
  // Cleaned up by deleting the post after.
  test('TC-COMM-008 asking a question publishes a question post', async ({ page }) => {
    test.slow();
    await page.goto(COMMUNITY_PATH);
    const marker = `QA automation question ${Date.now().toString().slice(-6)}`;

    await page.getByRole('button', { name: /ask a question/i }).click();
    const editor = page.locator('.js_insight_modal [contenteditable="true"]').first();
    await editor.waitFor({ timeout: 20_000 });

    // Pick the mandatory topic via its select2.
    const topicSelect = page.locator('.js_insight_modal .select2-container').filter({ visible: true }).first();
    await topicSelect.click();
    const topicOption = page.locator('.select2-results li.select2-result-selectable').first();
    await topicOption.waitFor({ timeout: 10_000 }).catch(() => {});
    if (!(await topicOption.isVisible().catch(() => false))) {
      test.skip(true, 'No question topics configured for this org.');
    }
    await topicOption.click();

    await editor.click();
    await editor.fill(marker);
    const postResp = page.waitForResponse(
      (r) => r.url().includes('/library/happening/new/') && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.locator('button.js_send_post:visible').first().click();
    expect((await postResp).status()).toBe(200);

    const card = await waitForPostCard(page, marker);
    await expect(card).toBeVisible();
    await deletePost(page, marker);
  });

  // TC-COMM-007 — Searching surfaces a matching post. Publishes its own uniquely
  // worded post so a match always exists (if-else data strategy, not a skip).
  // Confirmed live: input.js_content_search ("Search for a post").
  test('TC-COMM-007 searching surfaces a matching post', async ({ page }) => {
    test.slow();
    await page.goto(COMMUNITY_PATH);
    const marker = `QA automation search ${Date.now().toString().slice(-6)}`;
    await publishPost(page, marker);
    await waitForPostCard(page, marker);

    try {
      const search = page.locator('input.js_content_search').filter({ visible: true }).first();
      await search.click();
      await search.fill(marker);
      await search.press('Enter');
      // The matching post surfaces in the filtered feed.
      await expect(page.locator('.mc-card--post', { hasText: marker }).first()).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      // Reset the feed (clears any search filter), then delete the post.
      await page.goto(COMMUNITY_PATH);
      await waitForPostCard(page, marker);
      await deletePost(page, marker);
    }
  });
});
