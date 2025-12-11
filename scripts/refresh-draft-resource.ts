/*
 * Refresh a StoryMap's draft.json resource and ensure the smdraftresourceid keyword is present.
 * Usage:
 *   ARC_GIS_TOKEN=<token> npx tsx scripts/refresh-draft-resource.ts <itemId> <path/to/draft.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const token = process.env.ARC_GIS_TOKEN || process.env.ARCGIS_TOKEN || process.env.TOKEN;

async function main() {
  const [itemId, draftPath] = process.argv.slice(2);
  if (!itemId || !draftPath) {
    console.error('Usage: ARC_GIS_TOKEN=<token> npx tsx scripts/refresh-draft-resource.ts <itemId> <path/to/draft.json>');
    process.exit(1);
  }
  assert(token, 'ARC_GIS_TOKEN env var is required');
  const abs = path.resolve(draftPath);
  assert(fs.existsSync(abs), `Draft file not found: ${abs}`);
  const data = fs.readFileSync(abs);

  const addRes = await addItemResource(itemId, 'draft.json', data, token);
  if (!addRes || addRes.error) {
    console.error('Failed to upload resource:', JSON.stringify(addRes, null, 2));
    process.exit(2);
  }
  console.log('Uploaded draft.json resource');

  const details = await getItemDetails(itemId, token);
  if (!details) {
    console.error('Failed to fetch item details');
    process.exit(3);
  }
  const existingKeywords: string[] = Array.isArray(details.typeKeywords) ? details.typeKeywords : (typeof details.typeKeywords === 'string' ? details.typeKeywords.split(',') : []);
  const needed = new Set<string>([
    'extent:[]',
    'Story Map',
    'StoryMaps',
    'storymapstemplate:item',
    'storymaps-app',
    'smdraftresourceid:draft.json'
  ]);
  for (const k of needed) existingKeywords.push(k);
  const unique = Array.from(new Set(existingKeywords)).filter(Boolean);

  const upd = await updateItemKeywords(itemId, unique, token);
  if (!upd || upd.error) {
    console.error('Failed to update keywords:', JSON.stringify(upd, null, 2));
    process.exit(4);
  }
  console.log('Keywords refreshed');

  // Inspect initial Builder bootstrap endpoints for hidden errors
  const bootstrap = await inspectBootstrap(itemId, token);
  console.log(JSON.stringify(bootstrap, null, 2));
}

async function addItemResource(itemId: string, name: string, buf: Buffer, token: string) {
  const form = new FormData();
  form.append('f', 'json');
  form.append('name', name);
  form.append('resource', new Blob([buf]), name);
  form.append('token', token);
  const resp = await fetch(`https://www.arcgis.com/sharing/rest/content/items/${itemId}/addResources`, {
    method: 'POST',
    body: form,
  });
  return resp.json();
}

async function updateItemKeywords(itemId: string, keywords: string[], token: string) {
  const form = new URLSearchParams();
  form.set('f', 'json');
  form.set('token', token);
  form.set('typeKeywords', keywords.join(','));
  const resp = await fetch(`https://www.arcgis.com/sharing/rest/content/items/${itemId}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  return resp.json();
}

async function getItemDetails(itemId: string, token: string) {
  const url = `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json&token=${encodeURIComponent(token)}`;
  const resp = await fetch(url);
  if (!resp.ok) return undefined;
  return resp.json();
}

async function inspectBootstrap(itemId: string, token: string) {
  const results: Record<string, unknown> = {};
  // Item details
  results.item = await getItemDetails(itemId, token);
  // draft.json resource
  try {
    const resUrl = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/resources/draft.json?token=${encodeURIComponent(token)}`;
    const r = await fetch(resUrl);
    results.draftStatus = { ok: r.ok, status: r.status, contentType: r.headers.get('content-type') };
    const text = await r.text();
    // Try parse for hidden error fields
    try {
      const j = JSON.parse(text);
      results.draftJsonSample = { keys: Object.keys(j).slice(0, 10), root: (j as any).root, nodes: Array.isArray((j as any).nodes) ? (j as any).nodes.length : undefined };
    } catch {
      results.draftTextPrefix = text.slice(0, 200);
    }
  } catch (e) {
    results.draftFetchError = String(e);
  }
  // Me
  try {
    const meUrl = `https://www.arcgis.com/sharing/rest/community/self?f=json&token=${encodeURIComponent(token)}`;
    const r = await fetch(meUrl);
    results.me = { ok: r.ok, status: r.status, orgId: undefined as string | undefined };
    const j = await r.json();
    results.me.orgId = j?.orgId;
  } catch (e) {
    results.meError = String(e);
  }
  return results;
}

main().catch(err => {
  console.error(err);
  process.exit(99);
});
