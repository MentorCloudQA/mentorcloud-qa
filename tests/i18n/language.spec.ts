import { test, expect } from '../utils/fixtures';
import type { Page } from '@playwright/test';

import { STORAGE_STATE } from '../utils/credentials';
import { navLink } from '../utils/shell';

/**
 * Localization — TC-I18N-001.
 *
 * Confirmed live: the shell offers a language switcher (form.js_change_language_form,
 * rendered in the footer and the mobile nav menu) that posts { language } to
 * /user/preferences/language/update (200 on success). The select is a select2
 * widget, so post the form directly with the page's own CSRF token (same pattern
 * as proposeSession/createFiresideChat). Spanish nav labels confirmed live:
 * Inicio / Programas / Sesiones / Círculos / Aprende / Comunidad.
 * NB: <html lang> does NOT update — assert on the nav labels instead.
 *
 * Runs as the ADMIN fixture (the least-used account) to minimise interference
 * with concurrently running mentor/mentee tests while the account is briefly in
 * Spanish; the language is ALWAYS restored in finally.
 */
test.use({ storageState: STORAGE_STATE.admin });

const LANGUAGE_UPDATE = '/user/preferences/language/update';

/** Post the language form directly; returns the response status. */
async function switchLanguage(page: Page, language: string): Promise<number> {
  const csrf = await page
    .locator('form.js_change_language_form input[name="csrfmiddlewaretoken"]')
    .first()
    .inputValue();
  const resp = await page.context().request.post(LANGUAGE_UPDATE, {
    form: { csrfmiddlewaretoken: csrf, language },
    headers: { Referer: page.url() }, // Django HTTPS CSRF needs a same-origin Referer
    maxRedirects: 0,
  });
  return resp.status();
}

test.describe('Localization', () => {
  // TC-I18N-001 — Switching the UI language to Spanish translates the shell (and back)
  test('TC-I18N-001 switching language to Spanish translates the shell', async ({ page }) => {
    test.slow();
    await page.goto('/');
    await expect(navLink(page, /^Home$/i).first()).toBeVisible({ timeout: 30_000 });

    try {
      expect(await switchLanguage(page, 'es')).toBe(200);
      await page.reload();
      // The primary nav renders in Spanish.
      await expect(navLink(page, /^Inicio$/i).first()).toBeVisible({ timeout: 30_000 });
      await expect(navLink(page, /^Comunidad$/i).first()).toBeVisible();
    } finally {
      // ALWAYS restore English so other admin-context tests are unaffected.
      expect(await switchLanguage(page, 'en-us')).toBe(200);
      await page.reload();
      await expect(navLink(page, /^Home$/i).first()).toBeVisible({ timeout: 30_000 });
    }
  });
});
