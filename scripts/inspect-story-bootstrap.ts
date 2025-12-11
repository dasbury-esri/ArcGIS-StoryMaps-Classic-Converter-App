/*
 * Try common StoryMaps bootstrap endpoints for a story ID and summarize results.
 * Usage:
 *   npx tsx scripts/inspect-story-bootstrap.ts <storyId>
 */
import assert from 'node:assert';

const storyId = process.argv[2];
assert(storyId, 'Provide a StoryMap ID');

type Check = { url: string; note: string };
const checks: Check[] = [
  { url: `https://storymaps.arcgis.com/stories/${storyId}`, note: 'Story page (HTML)' },
  { url: `https://storymaps.arcgis.com/stories/${storyId}/edit`, note: 'Edit page (HTML)' },
  { url: `https://storymaps.arcgis.com/api/stories/${storyId}`, note: 'API stories JSON' },
  { url: `https://storymaps.arcgis.com/api/items/${storyId}`, note: 'API items JSON' },
  { url: `https://storymaps.arcgis.com/stories/${storyId}/bootstrap.json`, note: 'Bootstrap JSON (if exposed)' },
];

async function tryFetch(u: string) {
  try {
    const r = await fetch(u, { redirect: 'manual' });
    const ct = r.headers.get('content-type') || '';
    let bodyPrefix = '';
    try {
      const t = await r.text();
      bodyPrefix = t.slice(0, 300);
    } catch {}
    return { ok: r.ok, status: r.status, contentType: ct, location: r.headers.get('location') || null, bodyPrefix };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

async function main() {
  const out: Record<string, unknown> = {};
  for (const c of checks) {
    out[c.note] = await tryFetch(c.url);
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
