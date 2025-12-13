/*
 * Authenticated probe of StoryMaps APIs for a story ID using ARC_GIS_TOKEN.
 * Usage:
 *   export ARC_GIS_TOKEN=<token>
 *   npx tsx scripts/inspect-story-auth.ts <storyId>
 */
import assert from 'node:assert';
import { getOrgBase } from './lib/orgBase';

const token = process.env.ARC_GIS_TOKEN || process.env.ARCGIS_TOKEN || process.env.TOKEN;
const storyId = process.argv[2];
assert(token, 'ARC_GIS_TOKEN env var is required');
assert(storyId, 'Provide a StoryMap ID');

async function fetchJson(url: string) {
  const u = url.includes('?') ? `${url}&token=${encodeURIComponent(token!)}` : `${url}?token=${encodeURIComponent(token!)}`;
  const r = await fetch(u);
  const ct = r.headers.get('content-type') || '';
  const text = await r.text();
  let json: unknown = undefined;
  try { json = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, contentType: ct, json, textPrefix: text.slice(0, 400) };
}

const ORG_BASE = getOrgBase();
async function main() {
  const results: Record<string, unknown> = {};
  results.self = await fetchJson(`${ORG_BASE}/sharing/rest/community/self?f=json`);
  results.items = await fetchJson(`https://storymaps.arcgis.com/api/items/${storyId}`);
  results.stories = await fetchJson(`https://storymaps.arcgis.com/api/stories/${storyId}`);
  // ArcGIS item details via sharing REST
  results.arcgisItem = await fetchJson(`${ORG_BASE}/sharing/rest/content/items/${storyId}?f=json`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
