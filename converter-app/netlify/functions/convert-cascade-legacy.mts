import type { Context } from "@netlify/functions";

async function fetchClassicJson(itemId: string, token?: string) {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch classic item data (HTTP ${resp.status})`);
  return await resp.json();
}

export default async (req: Request, _context: Context) => {
  try {
    const u = new URL(req.url);
    const itemId = String(u.searchParams.get('itemId') || '').trim();
    const token = u.searchParams.get('token') || undefined;
    if (!itemId || !/^[a-f0-9]{32}$/i.test(itemId)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid itemId (expected 32-char hex)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const classicJson = await fetchClassicJson(itemId, token || undefined);
    // Temporarily disabled conversion to unblock local dev
    return new Response(JSON.stringify({ ok: false, notImplemented: true, classicJson: { values: classicJson?.values || {} }, message: 'Cascade conversion temporarily disabled for local dev.' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
