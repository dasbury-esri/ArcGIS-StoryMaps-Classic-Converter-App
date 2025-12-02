// Cascade legacy converter (folder-based function)
// ESM handler; converts classic Cascade story to StoryMap JSON via legacy factory
// Import from TS source without .js extension so esbuild resolves .ts
import { convertClassicToJson } from '../../../converter-app/src/converter/converter-factory';

async function fetchClassicJson(itemId, token) {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch classic item data (HTTP ${resp.status})`);
  return await resp.json();
}

export async function handler(event) {
  try {
    const params = event.queryStringParameters || {};
    const itemId = String(params.itemId || '').trim();
    const token = params.token ? String(params.token) : undefined;
    if (!itemId || !/^[a-f0-9]{32}$/i.test(itemId)) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing or invalid itemId (expected 32-char hex)' }) };
    }
    const classicJson = await fetchClassicJson(itemId, token);
    const username = '';
    const targetStoryId = '';
    const themeId = 'summit';
    const storymapJson = await convertClassicToJson(classicJson, themeId, username, token || '', targetStoryId);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, storymapJson }) };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: err?.message || String(err) }) };
  }
}

export default handler;
