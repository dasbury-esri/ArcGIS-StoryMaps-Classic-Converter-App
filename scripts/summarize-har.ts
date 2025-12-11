/*
 * Summarize key StoryMaps requests in a HAR file.
 * Usage:
 *   npx tsx scripts/summarize-har.ts test-results/storymaps-edit.har
 */
import fs from 'node:fs';

type Har = { log: { entries: Array<{ request: { url: string; method: string; headers?: Array<{ name: string; value: string }>; }; response: { status: number; headers?: Array<{ name: string; value: string }>; content?: { mimeType?: string; text?: string }; }; }> } };

function getHeader(hs: Array<{ name: string; value: string }> | undefined, name: string): string | undefined {
  if (!hs) return undefined;
  const h = hs.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value;
}

function main() {
  const harPath = process.argv[2];
  if (!harPath) {
    console.error('Usage: npx tsx scripts/summarize-har.ts <path/to.har>');
    process.exit(1);
  }
  const har: Har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
  const targets = [
    '/api/stories/',
    '/api/items/',
    '/stories/',
    '/resources/draft.json',
    '/community/self',
    '/sharing/rest/oauth2/authorize',
    '/oauth-callback'
  ];
  const rows: Array<Record<string, unknown>> = [];
  for (const e of har.log.entries) {
    const url = e.request.url;
    if (!targets.some(t => url.includes(t))) continue;
    const row: Record<string, unknown> = {
      method: e.request.method,
      url,
      status: e.response.status,
      reqAuth: getHeader(e.request.headers, 'Authorization') || undefined,
      reqCookie: getHeader(e.request.headers, 'Cookie') || undefined,
      respCT: getHeader(e.response.headers, 'content-type') || undefined,
    };
    const text = e.response.content?.text;
    if (text) {
      try {
        const j = JSON.parse(text);
        row.sample = {
          keys: Object.keys(j).slice(0, 10),
          message: (j as any).message,
          title: (j as any).title,
          id: (j as any).id,
          status: (j as any).status
        };
      } catch {
        row.textPrefix = text.slice(0, 300);
      }
    }
    rows.push(row);
  }
  console.log(JSON.stringify(rows, null, 2));
}

main();
