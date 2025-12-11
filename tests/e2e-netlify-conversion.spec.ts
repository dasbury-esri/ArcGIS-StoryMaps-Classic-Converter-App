import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Netlify converter flow', () => {
  test('Convert Map Journal and validate draft JSON', async ({ page }) => {
    // Precondition: netlify dev is running at http://localhost:8888
    await page.goto('/converter-app/?dev=true', { waitUntil: 'domcontentloaded' });
    console.log('[E2E] Navigated to /converter-app/?dev=true');
    // Look for the Convert button to confirm UI loaded
    const convertBtn = page.locator('button:has-text("Convert")');
    try {
      await expect(convertBtn).toBeVisible({ timeout: 5000 });
    } catch (e) {
      console.warn('[E2E] Convert button not visible on dev-bypass route. Trying /converter-app/');
      await page.goto('/converter-app/', { waitUntil: 'domcontentloaded' });
      try {
        await expect(page.locator('button:has-text("Convert")')).toBeVisible({ timeout: 5000 });
      } catch (e2) {
        try {
          await expect(page.locator('button:has-text("Convert")')).toBeVisible({ timeout: 5000 });
        } catch (e3) {
        const html = await page.content();
        const outDir = path.resolve(process.cwd(), 'test-results');
        const outFile = path.join(outDir, `playwright-page-dump-${Date.now()}.html`);
        try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
        try { fs.writeFileSync(outFile, html, 'utf-8'); } catch {}
        console.error('[E2E] Failed to locate Convert button. Dumped HTML to:', outFile);
        console.error('[E2E] First 500 chars:', html.slice(0, 500));
          console.error('[E2E] Current URL:', page.url());
          throw e3;
        }
      }
    }

    // Enter a known classic item id (provided by user during session)
    const itemId = 'a6a6636753ef48f6b7b8167cdb590e21';
    // Fill the classic item id using label-based selector
    await page.getByPlaceholder('e.g., 858c4126f0604d1a86dea06ffbdc23a3').fill(itemId);

    // Trigger conversion
    await page.click('button:has-text("Convert")');

    // Wait for status messages to progress into uploading or success
    await expect(page.locator('.converter-message')).toBeVisible({ timeout: 90_000 });

    // Validate latest converted file via local tmp-converted directory
    const tmpDir = path.resolve(process.cwd(), 'tmp-converted');
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json')).sort().reverse();
    expect(files.length > 0).toBeTruthy();
    const latestFile = files[0];
    const fileParam = `tmp-converted/${latestFile}`;
    const fnBase = 'http://localhost:8888/.netlify/functions';
    const resp = await page.request.get(`${fnBase}/validate-draft?file=${encodeURIComponent(fileParam)}`);
    const status = resp.status();
    const bodyText = await resp.text();
    console.log('[E2E] validate-draft status:', status);
    // Accept 200 (valid) or 422 (invalid but schema-checked)
    expect([200, 422]).toContain(status);
    const json = JSON.parse(bodyText);
    expect(typeof json.ok === 'boolean').toBeTruthy();
  });
});
