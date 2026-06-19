import { test as base, expect } from '@playwright/test';

/**
 * Shared test fixture.
 *
 * Staging pages frequently keep loading subresources (analytics, sockets, lazy
 * media), so the default `page.goto` wait-until "load" can hang and time out.
 * We patch `goto` to default to "domcontentloaded", which is reliable here and
 * still overridable per call.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    page.goto = (url, options) =>
      originalGoto(url, { waitUntil: 'domcontentloaded', ...options });
    await use(page);
  },
});

export { expect };
