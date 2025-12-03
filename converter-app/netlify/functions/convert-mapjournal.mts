import type { Context } from "@netlify/functions";

async function fetchClassicItemData(itemId: string, token?: string) {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ArcGIS data fetch failed: ${resp.status} ${resp.statusText} - ${text?.slice(0,200)}`);
  }
  return resp.json();
}

async function collectWebmapIds(classicJson: any, token?: string) {
  const ids = [];
  try {
    const cj = classicJson || {};
    const values = cj.values || {};
    const rootWebmap = values.webmap;
    if (rootWebmap && typeof rootWebmap === 'string') ids.push(rootWebmap);
    const story = values.story || {};
    const sections = Array.isArray(story.sections) ? story.sections : [];
    for (const s of sections) {
      const media = s.media || {};
      const wmId = media?.webmap?.id;
      if (wmId && typeof wmId === 'string') ids.push(wmId);
      const contentActions = Array.isArray(s.contentActions) ? s.contentActions : [];
      for (const ca of contentActions) {
        const caMedia = ca.media || {};
        const caWmId = caMedia?.webmap?.id;
        if (caWmId && typeof caWmId === 'string') ids.push(caWmId);
        const caUrl = caMedia?.webpage?.url || '';
        const m2 = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(String(caUrl));
        const caAppId = m2?.[1];
        if (caAppId) await collectSwipeWebmaps(caAppId, token, ids);
      }
      const url = media?.webpage?.url || '';
      const m = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(String(url));
      const appId = m?.[1];
      if (appId) await collectSwipeWebmaps(appId, token, ids);
    }
  } catch {}
  return Array.from(new Set(ids));
}

async function collectSwipeWebmaps(appId, token, ids) {
  try {
    const base = `https://www.arcgis.com/sharing/rest/content/items/${appId}/data?f=json`;
    const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
    const resp = await fetch(url);
    if (!resp.ok) return;
    const swipeJson = await resp.json();
    const wmArr = Array.isArray(swipeJson?.values?.webmaps) ? swipeJson.values.webmaps : [];
    for (const wid of wmArr) if (typeof wid === 'string') ids.push(wid);
  } catch {}
}

export default async (req: Request, _context: Context) => {
  try {
    const u = new URL(req.url);
    const itemId = (u.searchParams.get('itemId') || '').trim();
    const token = ((u.searchParams.get('token') || '').trim() || process.env.TOKEN || '').trim() || undefined;
    const diagParam = u.searchParams.get('diagnostics');
    const diagnostics = typeof diagParam === 'string' ? ['true','1','yes','y'].includes(diagParam.toLowerCase()) : !!diagParam;
    if (!itemId) {
      return new Response(JSON.stringify({ error: 'Missing itemId parameter' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
    }
    const classicJson = await fetchClassicItemData(itemId, token);
    // Temporarily disabled conversion to unblock local dev: return stub diagnostics only
    let collected: string[] = [];
    try { collected = await collectWebmapIds(classicJson, token); } catch {}
    const response = {
      classicJson: { values: classicJson?.values ? { title: classicJson.values?.title, webmap: classicJson.values?.webmap } : {} },
      validation: diagnostics ? { hasDiagnostics: true, webmapIds: collected } : { hasDiagnostics: false },
      notImplemented: true,
      message: 'Server-side MapJournal conversion temporarily disabled for local dev. Use client-side refactor pipeline.'
    };
    return new Response(JSON.stringify(response), { status: 501, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as any)?.message || 'Unhandled conversion error' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  }
};
