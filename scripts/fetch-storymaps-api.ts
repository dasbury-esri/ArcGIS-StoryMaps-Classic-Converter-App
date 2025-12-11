/*
 * Playwright script: login to StoryMaps and fetch api/stories/{id} JSON.
 * Usage:
 *   export SM_USERNAME="<username>"
 *   export SM_PASSWORD="<password>"
 *   npx tsx scripts/fetch-storymaps-api.ts <storyId>
 */
import { chromium } from 'playwright';

async function main() {
  const storyId = process.argv[2];
  if (!storyId) {
    console.error('Usage: SM_USERNAME=<user> SM_PASSWORD=<pass> npx tsx scripts/fetch-storymaps-api.ts <storyId>');
    process.exit(1);
  }
  const username = process.env.SM_USERNAME || process.env.ARCGIS_USERNAME;
  const password = process.env.SM_PASSWORD || process.env.ARCGIS_PASSWORD;
  if (!username || !password) {
    console.error('Set SM_USERNAME and SM_PASSWORD environment variables.');
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    recordHar: { path: 'test-results/storymaps-edit.har', content: 'embed' }
  });
  const page = await context.newPage();

  const homeUrl = `https://storymaps.arcgis.com/`;
  const editUrl = `https://storymaps.arcgis.com/stories/${storyId}/edit`;
  // Retry navigation to handle transient DNS/network issues
  async function gotoWithRetry(url: string, attempts = 3) {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return;
      } catch (e) {
        lastErr = e;
        await page.waitForTimeout(1000);
      }
    }
    throw lastErr;
  }
  // First open home to establish app session
  await gotoWithRetry(homeUrl, 3);

  // Handle OAuth redirect to ArcGIS Online login
  if (page.url().includes('/sharing/rest/oauth2/authorize') || page.url().includes('/login')) {
    // ArcGIS Online modern login form
    // Try common selectors; adapt if login page differs
    try {
      await page.waitForSelector('input[name="username"], input#user_username, input#username', { timeout: 15000 });
    } catch {}
    const userSel = await page.$('input[name="username"], input#user_username, input#username');
    const passSel = await page.$('input[name="password"], input#user_password, input#password');
    if (!userSel || !passSel) {
      console.error('Login form not found. Current URL:', page.url());
      await browser.close();
      process.exit(3);
    }
    // Fill via Playwright API and also inject via DOM in case of masked fields
    await userSel.fill(username);
    await passSel.fill(password);
    await page.evaluate(({ username, password }) => {
      const u = document.querySelector<HTMLInputElement>('input[name="username"], #user_username, #username');
      const p = document.querySelector<HTMLInputElement>('input[name="password"], #user_password, #password');
      if (u) { u.value = username; u.dispatchEvent(new Event('input', { bubbles: true })); }
      if (p) { p.value = password; p.dispatchEvent(new Event('input', { bubbles: true })); }
    }, { username, password });
    // Submit
    const submitBtn = await page.$('button[type="submit"], button[name="login"], input[type="submit"]');
    if (submitBtn) await submitBtn.click(); else await passSel.press('Enter');
    // Wait for redirect back to StoryMaps app
    await page.waitForLoadState('domcontentloaded');
    // Wait until we return to StoryMaps domain
    await page.waitForURL('**storymaps.arcgis.com/**', { timeout: 30000 });
  }

  // Ensure we’re at edit or preview page in StoryMaps
  const finalUrl = page.url();
  if (!finalUrl.includes('storymaps.arcgis.com')) {
    console.error('Not in StoryMaps domain after login. URL:', finalUrl);
    await browser.close();
    process.exit(4);
  }

  // Navigate to edit URL to allow app bootstrap and session initialization
  await gotoWithRetry(`https://storymaps.arcgis.com/stories/${storyId}/edit`, 3);
  // Give the app time to initialize auth context
  await page.waitForTimeout(20000);

  // Also open edit in a new tab within the same context and capture API responses
  const editPage = await context.newPage();
  await gotoWithRetry(editUrl, 3);
  await editPage.goto(editUrl, { waitUntil: 'domcontentloaded' });
  await editPage.waitForTimeout(20000);
  const storiesApiUrl = `https://storymaps.arcgis.com/api/stories/${storyId}`;
  const itemsApiUrl = `https://storymaps.arcgis.com/api/items/${storyId}`;
  let tappedStories: unknown = undefined;
  let tappedItems: unknown = undefined;
  editPage.on('response', async (resp) => {
    const url = resp.url();
    if (url.startsWith(storiesApiUrl) || url.startsWith(itemsApiUrl)) {
      try {
        const ct = resp.headers()['content-type'] || '';
        const text = await resp.text();
        if (ct.includes('application/json')) {
          const j = JSON.parse(text);
          if (url.startsWith(storiesApiUrl)) tappedStories = j; else tappedItems = j;
        } else {
          if (url.startsWith(storiesApiUrl)) tappedStories = text; else tappedItems = text;
        }
      } catch { /* ignore */ }
    }
  });
  await editPage.evaluate(async ({ storiesApiUrl, itemsApiUrl }) => {
    try { await fetch(storiesApiUrl); } catch {}
    try { await fetch(itemsApiUrl); } catch {}
  }, { storiesApiUrl, itemsApiUrl });
  await editPage.waitForTimeout(5000);

  // Extract access_token from oauth-callback fragment if present
  let bearer: string | undefined;
  try {
    const urlObj = new URL(finalUrl);
    const hash = urlObj.hash || '';
    if (hash.startsWith('#')) {
      const params = new URLSearchParams(hash.slice(1));
      bearer = params.get('access_token') || undefined;
    }
  } catch {}

  const apiStoriesUrl = `https://storymaps.arcgis.com/api/stories/${storyId}`;
  const apiItemsUrl = `https://storymaps.arcgis.com/api/items/${storyId}`;
  const apiStoriesUrlWithToken = bearer ? `${apiStoriesUrl}?token=${encodeURIComponent(bearer)}` : apiStoriesUrl;
  const apiItemsUrlWithToken = bearer ? `${apiItemsUrl}?token=${encodeURIComponent(bearer)}` : apiItemsUrl;

  // Perform in-page fetch so cookies/session are used; attach bearer if available
  const result = await page.evaluate(async ({ apiStoriesUrl, apiItemsUrl, apiStoriesUrlWithToken, apiItemsUrlWithToken, bearer }) => {
    const headers: Record<string,string> = {};
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
    const fetchOpts: RequestInit = headers.Authorization ? { headers } : {};
    // Try with headers first, then fall back to query param token
    let rStories = await fetch(apiStoriesUrl, fetchOpts);
    let rItems = await fetch(apiItemsUrl, fetchOpts);
    if (rStories.status === 401 || rStories.status === 403) rStories = await fetch(apiStoriesUrlWithToken);
    if (rItems.status === 401 || rItems.status === 403) rItems = await fetch(apiItemsUrlWithToken);
    let jStories: unknown; let jItems: unknown;
    try { jStories = await rStories.json(); } catch { jStories = await rStories.text(); }
    try { jItems = await rItems.json(); } catch { jItems = await rItems.text(); }
    return {
      stories: { ok: rStories.ok, status: rStories.status, contentType: rStories.headers.get('content-type'), json: jStories },
      items: { ok: rItems.ok, status: rItems.status, contentType: rItems.headers.get('content-type'), json: jItems }
    };
  }, { apiStoriesUrl, apiItemsUrl, apiStoriesUrlWithToken, apiItemsUrlWithToken, bearer });

  const out: Record<string, unknown> = {
    location: finalUrl,
    stories: result.stories,
    items: result.items,
    tapped: { stories: tappedStories, items: tappedItems }
  };

  console.log(JSON.stringify(out, null, 2));
  // Save tapped payloads if present
  try {
    const fs = await import('node:fs');
    if (tappedStories) fs.writeFileSync(`test-results/api-stories-${storyId}.json`, typeof tappedStories === 'string' ? String(tappedStories) : JSON.stringify(tappedStories, null, 2));
    if (tappedItems) fs.writeFileSync(`test-results/api-items-${storyId}.json`, typeof tappedItems === 'string' ? String(tappedItems) : JSON.stringify(tappedItems, null, 2));
  } catch {}
  // Ensure HAR is written
  try { await context.close(); } catch { /* ignore */ }
  await browser.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(99);
});
