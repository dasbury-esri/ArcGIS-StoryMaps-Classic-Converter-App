import type { Context } from "@netlify/functions";
import { MapJournalConverter } from 'converter-app/src/refactor/converters/MapJournalConverter';
import { validateWebMaps } from 'converter-app/src/refactor/services/WebMapValidator';

async function fetchClassicItemData(itemId, token) {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ArcGIS data fetch failed: ${resp.status} ${resp.statusText} - ${text?.slice(0,200)}`);
  }
  return resp.json();
}

async function collectWebmapIds(classicJson, token) {
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
    const themeId = (u.searchParams.get('themeId') || '').trim() || 'obsidian';
    const diagParam = u.searchParams.get('diagnostics');
    const diagnostics = typeof diagParam === 'string' ? ['true','1','yes','y'].includes(diagParam.toLowerCase()) : !!diagParam;
    if (!itemId) {
      return new Response(JSON.stringify({ error: 'Missing itemId parameter' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
    }
    const classicJson = await fetchClassicItemData(itemId, token);

    let diagnosticsPayload;
    if (diagnostics) {
      let collected = [];
      try { collected = await collectWebmapIds(classicJson, token); } catch {}
      try {
        const validationResult = await validateWebMaps(collected, token);
        diagnosticsPayload = {
          hasDiagnostics: true,
          webmapIds: collected,
          warnings: validationResult.warnings,
          endpointChecks: validationResult.endpointChecks || [],
          endpointCategorySummary: validationResult.endpointCategorySummary || null
        };
      } catch (e) {
        diagnosticsPayload = { hasDiagnostics: true, error: 'Validation failed', message: e?.message, webmapIds: collected };
      }
    }

    const opts = { themeId, classicJson, token, progress: (ev) => console.log(`[convert-mapjournal] ${ev.stage}: ${ev.message}`) };
    let result; let conversionError;
    try { result = MapJournalConverter.convert(opts); } catch (convErr) { conversionError = convErr?.message || 'Unknown conversion error'; }
    const storymapJson = result && result.storymapJson ? result.storymapJson : result;

    const response = {
      storymapJson,
      mediaUrls: result?.mediaUrls || [],
      classicJson,
      conversionError: conversionError || undefined,
      validation: diagnostics ? (diagnosticsPayload || { hasDiagnostics: true, error: 'Diagnostics unavailable' }) : { hasDiagnostics: false }
    };

    // Post-conversion webmap validation augmentation
    try {
      if (diagnostics && storymapJson?.resources) {
        const resources = storymapJson.resources || {};
        const convertedWebmapIds = Object.values(resources)
          .filter(r => r?.type === 'webmap')
          .map(r => r.data?.itemId)
          .filter(id => id && /^[a-f0-9]{32}$/i.test(id));
        const diagObj = response.validation;
        const existingIds = Array.isArray(diagObj.webmapIds) ? diagObj.webmapIds : [];
        const newIds = convertedWebmapIds.filter(id => !existingIds.includes(id));
        if (newIds.length) {
          const validationResult2 = await validateWebMaps(newIds, token);
          const allIds = Array.from(new Set([...existingIds, ...newIds]));
          diagObj.webmapIds = allIds;
          diagObj.warnings = [...(Array.isArray(diagObj.warnings)?diagObj.warnings:[]), ...validationResult2.warnings];
          diagObj.endpointChecks = [...(Array.isArray(diagObj.endpointChecks)?diagObj.endpointChecks:[]), ...(validationResult2.endpointChecks||[])];
          if (diagObj.endpointCategorySummary && validationResult2.endpointCategorySummary) {
            const merged = { ...diagObj.endpointCategorySummary };
            for (const [k,v] of Object.entries(validationResult2.endpointCategorySummary)) merged[k] = (merged[k]||0) + v;
            diagObj.endpointCategorySummary = merged;
          } else if (validationResult2.endpointCategorySummary) {
            diagObj.endpointCategorySummary = validationResult2.endpointCategorySummary;
          }
        }
      }
    } catch {}

    return new Response(JSON.stringify(response), { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as any)?.message || 'Unhandled conversion error' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  }
};
