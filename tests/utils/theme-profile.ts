import type { Page } from '@playwright/test';

/**
 * Themed fixture identities. Each fixture account's display profile is re-skinned
 * to a random iconic character on every test run (wired into auth.setup.ts), so
 * the names visibly change each time. Each role draws from its OWN set, so the
 * three fixtures never collide within a run.
 *
 * Only free-text profile fields are touched (name, title, city=street address,
 * state, summary); the required select2 dropdowns (office location, status, zip,
 * country) are left intact so the all-or-nothing profile save still succeeds.
 * The iconic token becomes the first name with a "-qa" suffix (e.g. "Sherlock-qa").
 */
export type FixtureRole = 'mentor' | 'mentee' | 'admin';

export interface Identity {
  first: string; // iconic token — rendered as "<first>-qa"
  last: string;
  title: string;
  city: string; // the free-text City field carries the iconic street address
  state: string;
  summary: string;
}

const POOL: Record<FixtureRole, Identity[]> = {
  mentor: [
    { first: 'Sherlock', last: 'Holmes', title: 'Consulting Detective', city: '221B Baker Street, London', state: 'Greater London', summary: "The world's only consulting detective. (QA fixture)" },
    { first: 'Gandalf', last: 'Grey', title: 'Wizard', city: 'Bag End, Hobbiton', state: 'The Shire', summary: 'A wizard is never late. (QA fixture)' },
    { first: 'Dexter', last: 'Morgan', title: 'Forensic Analyst', city: '8420 Palm Terrace, Miami', state: 'Florida', summary: 'Following the code. (QA fixture)' },
    { first: 'House', last: 'Gregory', title: 'Diagnostician', city: '221B Baker Street, Princeton', state: 'New Jersey', summary: 'Everybody lies. (QA fixture)' },
    { first: 'Gatsby', last: 'Carraway', title: 'Entrepreneur', city: 'West Egg, Long Island', state: 'New York', summary: 'Old sport. (QA fixture)' },
    { first: 'Spock', last: 'Vulcan', title: 'Science Officer', city: 'Starfleet HQ, San Francisco', state: 'California', summary: 'Live long and prosper. (QA fixture)' },
  ],
  mentee: [
    { first: 'Heisenberg', last: 'White', title: 'Chemistry Teacher', city: '308 Negra Arroyo Lane, Albuquerque', state: 'New Mexico', summary: 'I am the one who knocks. (QA fixture)' },
    { first: 'Neo', last: 'Anderson', title: 'Programmer', city: 'Room 101, Heart o the City Hotel', state: 'Mega City', summary: 'There is no spoon. (QA fixture)' },
    { first: 'Marty', last: 'McFly', title: 'Time Traveller', city: '9303 Lyon Drive, Hill Valley', state: 'California', summary: 'Great Scott. (QA fixture)' },
    { first: 'Frodo', last: 'Baggins', title: 'Ring-bearer', city: 'Bagshot Row, Hobbiton', state: 'The Shire', summary: 'I will take the ring. (QA fixture)' },
    { first: 'Katniss', last: 'Everdeen', title: 'Archer', city: 'The Seam, District 12', state: 'Panem', summary: 'The girl on fire. (QA fixture)' },
    { first: 'Maverick', last: 'Mitchell', title: 'Naval Aviator', city: 'Top Gun, Miramar', state: 'California', summary: 'I feel the need for speed. (QA fixture)' },
  ],
  admin: [
    { first: 'Ironman', last: 'Stark', title: 'Genius Billionaire Philanthropist', city: '10880 Malibu Point, Malibu', state: 'California', summary: 'Genius, billionaire, philanthropist. (QA fixture)' },
    { first: 'Batman', last: 'Wayne', title: 'Philanthropist', city: '1007 Mountain Drive, Gotham', state: 'New Jersey', summary: 'I am the night. (QA fixture)' },
    { first: 'Daenerys', last: 'Targaryen', title: 'Breaker of Chains', city: 'Dragonstone Keep', state: 'Westeros', summary: 'Dracarys. (QA fixture)' },
    { first: 'Gandalf', last: 'White', title: 'Wizard', city: 'Isengard Tower', state: 'Middle Earth', summary: 'You shall not pass. (QA fixture)' },
    { first: 'Vader', last: 'Skywalker', title: 'Sith Lord', city: 'Docking Bay 327, Death Star', state: 'Outer Rim', summary: 'The Force is strong. (QA fixture)' },
    { first: 'Hermione', last: 'Granger', title: 'Head Girl', city: 'Gryffindor Tower, Hogwarts', state: 'Scotland', summary: "It's leviOsa, not levioSA. (QA fixture)" },
  ],
};

/** A random identity for a role (changes the name on every run). */
export function pickIdentity(role: FixtureRole): Identity {
  const list = POOL[role];
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Re-skin the currently-logged-in fixture profile to a random themed identity.
 * Best-effort: never throws — a theming hiccup must not fail the auth setup.
 * Returns the applied display name (or null if it couldn't theme).
 */
export async function themeProfile(page: Page, role: FixtureRole): Promise<string | null> {
  const id = pickIdentity(role);
  try {
    await page.goto('/profile/update', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(4_000);
    await page
      .locator('#js_alert_box .js_modal_ok:visible')
      .first()
      .click({ timeout: 3_000 })
      .catch(() => {});

    const applied = await page.evaluate((v) => {
      const setVal = (el: any, val: string) => {
        const proto =
          el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const b = (n: string) => document.querySelector(`[name="${n}"]`) as any;
      if (!b('first_name')) return false;
      setVal(b('first_name'), `${v.first}-qa`);
      if (b('last_name')) setVal(b('last_name'), v.last);
      if (b('special_text_187')) setVal(b('special_text_187'), v.title);
      if (b('state')) setVal(b('state'), v.state);
      if (b('city')) setVal(b('city'), v.city);
      if (b('professional_summary')) setVal(b('professional_summary'), v.summary);
      return true;
    }, id);
    if (!applied) return null;

    await page.getByRole('button', { name: /save my profile/i }).click({ noWaitAfter: true });
    await page.waitForTimeout(5_000);
    return `${id.first}-qa ${id.last}`;
  } catch {
    return null; // best-effort
  }
}
