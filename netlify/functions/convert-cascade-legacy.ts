import type { Handler } from '@netlify/functions';

// Import legacy Cascade converter via legacy factory
import { convertClassicToJson } from '../../converter-app/src/converter/converter-factory';

async function fetchClassicJson(itemId: string, token?: string): Promise<unknown> {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch classic item data (HTTP ${resp.status})`);
  return await resp.json();
}

export const handler: Handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const itemId = String(params.itemId || '');
    const token = params.token ? String(params.token) : undefined;
    if (!itemId || !/^[a-f0-9]{32}$/i.test(itemId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid itemId (expected 32-char hex)' }) };
    }
    const classicJson = await fetchClassicJson(itemId, token);
    const username = '';
    const targetStoryId = '';
    const themeId = 'summit';
    const storymapJson = await convertClassicToJson(classicJson as any, themeId, username, token || '', targetStoryId);
    return {
      statusCode: 200,
      body: JSON.stringify({ storymapJson })
    };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || String(err) }) };
  }
};
