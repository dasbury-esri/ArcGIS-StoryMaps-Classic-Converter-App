import type { Handler } from '@netlify/functions';

// Import converter from the app codebase
import { MapJournalConverter } from '../../converter-app/src/refactor/converters/MapJournalConverter';
import type { BaseConverterOptions } from '../../converter-app/src/refactor/converters/BaseConverter';
import { validateWebMaps } from '../../converter-app/src/refactor/services/WebMapValidator';

// Helper: extract webmap IDs from classic JSON and embedded swipe apps
async function collectWebmapIds(classicJson: unknown, token?: string): Promise<string[]> {
  const ids: string[] = [];
  try {
    const cj = classicJson as Record<string, unknown>;
    const cjValues = cj?.values as Record<string, unknown> | undefined;
    const rootWebmap = (cjValues?.webmap as string | undefined);
    if (rootWebmap && typeof rootWebmap === 'string') {
      ids.push(rootWebmap);
      console.log(`[convert-mapjournal] collector: root webmap id=${rootWebmap}`);
    }
    const story = cjValues?.story as Record<string, unknown> | undefined;
    const sectionsCandidate = (story?.sections ?? (cj?.sections as unknown)) as unknown;
    const sections = Array.isArray(sectionsCandidate) ? sectionsCandidate as Array<Record<string, unknown>> : [];
    console.log(`[convert-mapjournal] collector: sections count=${sections.length}`);
    for (const s of sections) {
      const media = s?.media as Record<string, unknown> | undefined;
      const webmap = media?.webmap as Record<string, unknown> | undefined;
      const wmId = webmap?.id as string | undefined;
      if (wmId && typeof wmId === 'string') ids.push(wmId);
      if (wmId) console.log(`[convert-mapjournal] collector: section webmap id=${wmId}`);

      // Also scan contentActions array for nested media blocks
      const contentActions = (s?.contentActions as unknown) as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(contentActions)) {
        for (const ca of contentActions) {
          const caMedia = ca?.media as Record<string, unknown> | undefined;
          const caWebmap = caMedia?.webmap as Record<string, unknown> | undefined;
          const caWmId = caWebmap?.id as string | undefined;
          if (caWmId && typeof caWmId === 'string') ids.push(caWmId);
          if (caWmId) console.log(`[convert-mapjournal] collector: contentAction webmap id=${caWmId}`);
          const caWebpage = caMedia?.webpage as Record<string, unknown> | undefined;
          const caUrl: string = (caWebpage?.url as string | undefined) || '';
          const m2 = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(String(caUrl));
          const caAppId = m2?.[1];
          if (caAppId) {
            console.log(`[convert-mapjournal] collector: found embedded swipe appid=${caAppId} in contentAction`);
            try {
              const base2 = `https://www.arcgis.com/sharing/rest/content/items/${caAppId}/data?f=json`;
              const swipeUrl2 = token ? `${base2}&token=${encodeURIComponent(token)}` : base2;
              if (swipeUrl2) {
                const resp2 = await fetch(swipeUrl2);
                if (resp2.ok) {
                  const swipeJson2 = await resp2.json();
                  const swipeValues2 = (swipeJson2?.values as Record<string, unknown> | undefined);
                  const wmCandidate2 = swipeValues2?.webmaps as unknown;
                  const wm2 = Array.isArray(wmCandidate2) ? wmCandidate2 as string[] : [];
                  for (const wid of wm2) if (typeof wid === 'string') ids.push(wid);
                  if (wm2.length) console.log(`[convert-mapjournal] collector: swipe app webmaps (contentAction) added=${wm2.join(',')}`);
                }
              }
            } catch {
              // ignore
            }
          }
        }
      }

      const webpage = media?.webpage as Record<string, unknown> | undefined;
      const url: string = (webpage?.url as string | undefined) || '';
      const m = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(String(url));
      const appId = m?.[1];
      if (appId) {
        console.log(`[convert-mapjournal] collector: found embedded swipe appid=${appId} in section media`);
        try {
          const base = `https://www.arcgis.com/sharing/rest/content/items/${appId}/data?f=json`;
          const swipeUrl = token ? `${base}&token=${encodeURIComponent(token)}` : base;
          if (swipeUrl) {
            const resp = await fetch(swipeUrl);
            if (resp.ok) {
              const swipeJson = await resp.json();
              const swipeValues = (swipeJson?.values as Record<string, unknown> | undefined);
              const wmCandidate = swipeValues?.webmaps as unknown;
              const wm = Array.isArray(wmCandidate) ? wmCandidate as string[] : [];
              for (const wid of wm) if (typeof wid === 'string') ids.push(wid);
              if (wm.length) console.log(`[convert-mapjournal] collector: swipe app webmaps (section) added=${wm.join(',')}`);
            }
          }
        } catch {
          // ignore individual swipe fetch failures
        }
      }
    }
  } catch {
    console.log(`[convert-mapjournal] collector: threw error ${(e as Error)?.message}`);
    // ignore
  }
  console.log(`[convert-mapjournal] collector: total unique ids=${Array.from(new Set(ids)).length}`);
  return Array.from(new Set(ids));
}

// Utility: fetch classic Map Journal JSON from ArcGIS Sharing API
async function fetchClassicItemData(itemId: string, token?: string): Promise<unknown> {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ArcGIS data fetch failed: ${resp.status} ${resp.statusText} - ${text?.slice(0,200)}`);
  }
  return resp.json();
}

export const handler: Handler = async (event) => {
  try {
    console.log('[convert-mapjournal] using TS handler');
    const itemId = (event.queryStringParameters?.itemId || '').trim();
    const token = ((event.queryStringParameters?.token || '').trim() || process.env.TOKEN || '').trim() || undefined;
    const themeId = (event.queryStringParameters?.themeId || '').trim() || 'obsidian';
    const diagParam = event.queryStringParameters?.diagnostics;
    const diagnostics = typeof diagParam === 'string'
      ? ['true','1','yes','y'].includes(diagParam.toLowerCase())
      : !!diagParam;

    if (!itemId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing itemId parameter' })
      };
    }

    const classicJson = await fetchClassicItemData(itemId, token);
    try {
      const topKeys = classicJson && typeof classicJson === 'object' ? Object.keys(classicJson as Record<string, unknown>) : [];
      console.log('[convert-mapjournal] classic top-level keys:', topKeys.join(','));
      const valuesObj = (classicJson as Record<string, unknown>)?.values as Record<string, unknown> | undefined;
      const storyObj = valuesObj?.story as Record<string, unknown> | undefined;
      const sectionsPreview = storyObj?.sections as unknown;
      if (Array.isArray(sectionsPreview)) {
        console.log('[convert-mapjournal] classic sections count:', sectionsPreview.length);
        const firstWithWebmap = sectionsPreview.find((s: Record<string, unknown>) => {
          const mediaObj = s?.media as Record<string, unknown> | undefined;
          const wmObj = mediaObj?.webmap as Record<string, unknown> | undefined;
          return !!wmObj?.id;
        });
        if (firstWithWebmap) {
          const mediaObj = firstWithWebmap.media as Record<string, unknown> | undefined;
          const wmObj = mediaObj?.webmap as Record<string, unknown> | undefined;
          console.log('[convert-mapjournal] example section webmap id:', wmObj?.id);
        } else {
          console.log('[convert-mapjournal] no section webmap id found in initial scan');
        }
      } else {
        console.log('[convert-mapjournal] sections structure missing or not array');
      }
    } catch (e) {
      console.log('[convert-mapjournal] classic introspection failed:', (e as Error)?.message);
    }

    // Prepare diagnostics early so they can still be returned if conversion fails
    let diagnosticsPayload: Record<string, unknown> | undefined;
    if (diagnostics) {
      const rawClassic = classicJson as Record<string, unknown>;
      const valuesObj = rawClassic?.values as Record<string, unknown> | undefined;
      const storyObj = valuesObj?.story as Record<string, unknown> | undefined;
      const sectionsArr = Array.isArray(storyObj?.sections) ? storyObj?.sections as Array<Record<string, unknown>> : [];
      const sampleMediaTypes = sectionsArr.slice(0,5).map((s, i) => {
        const media = s?.media as Record<string, unknown> | undefined;
        const type = media?.type || (media?.webmap ? 'webmap' : media?.webpage ? 'webpage' : 'unknown');
        const wmId = (media?.webmap as Record<string, unknown> | undefined)?.id;
        const pageUrl = (media?.webpage as Record<string, unknown> | undefined)?.url;
        return { index: i, type, wmId: wmId || null, pageUrl: pageUrl || null };
      });
      let collected: string[] = [];
      try {
        collected = await collectWebmapIds(classicJson as unknown, token);
      } catch (collectorErr) {
        console.log('[convert-mapjournal] collector failed:', (collectorErr as Error)?.message);
      }
      try {
        const validationResult = await validateWebMaps(collected, token);
        const warnings = validationResult.warnings;
        const endpointChecks = validationResult.endpointChecks || [];
        const endpointCategorySummary = validationResult.endpointCategorySummary || null;
        console.log(`[convert-mapjournal] diagnostics pre-conversion. ids=${collected.length}, warnings=${warnings.length}, endpoints=${endpointChecks.length}`);
        diagnosticsPayload = {
          hasDiagnostics: true,
          webmapIds: collected,
          warnings,
          endpointChecks,
          endpointCategorySummary,
          debugCollector: {
            sectionsCount: sectionsArr.length,
            tokenPresent: !!token,
            sampleMedia: sampleMediaTypes,
            firstIds: collected.slice(0,5)
          }
        } as Record<string, unknown>;
      } catch (e) {
        const errObj = e as Error;
        console.log('[convert-mapjournal] diagnostics (validator) failed message:', errObj?.message);
        if (errObj?.stack) console.log('[convert-mapjournal] diagnostics (validator) failed stack:', errObj.stack);
        diagnosticsPayload = {
          hasDiagnostics: true,
          error: 'Validation failed',
          message: errObj?.message,
          debugCollector: {
            sectionsCount: sectionsArr.length,
            tokenPresent: !!token,
            sampleMedia: sampleMediaTypes,
            firstIds: collected.slice(0,5)
          }
        } as Record<string, unknown>;
      }
    }

    // Build converter options with proper progress callback
    const opts: BaseConverterOptions = {
      themeId,
      classicJson: classicJson as any,
      token,
      progress: (ev) => {
        console.log(`[convert-mapjournal] ${ev.stage}: ${ev.message}`);
      }
    };

    let result: Record<string, unknown> | undefined;
    let conversionError: string | undefined;
    try {
      result = MapJournalConverter.convert(opts) as Record<string, unknown>;
    } catch (convErr) {
      conversionError = (convErr as Error)?.message || 'Unknown conversion error';
      console.log('[convert-mapjournal] conversion failed:', conversionError);
    }

    // Post-process: enrich storymapJson with image dimensions and summaries
    const storymapJson = result && 'storymapJson' in result ? (result as Record<string, unknown>).storymapJson as Record<string, unknown> : (result as Record<string, unknown> | null);

    // (Removed server-side image dimension enrichment; handled client-side.)

    // Build explicit theme/layout summaries for UI consumers
    let themeSummary: Record<string, unknown> | undefined;
    let layoutSummary: Record<string, unknown> | undefined;
    try {
      if (storymapJson && storymapJson.resources && typeof storymapJson.resources === 'object') {
        const resources = storymapJson.resources as Record<string, { type: string; data: Record<string, unknown> }>;
        const themeEntry = Object.values(resources).find(r => r?.type === 'story-theme');
        if (themeEntry) {
          const tdata = themeEntry.data || {};
          themeSummary = {
            themeId: (tdata as { themeId?: string }).themeId || null,
            overrides: (tdata as { themeBaseVariableOverrides?: Record<string, unknown> }).themeBaseVariableOverrides || null
          };
        }
      }
    } catch { /* ignore */ }
    try {
      if (storymapJson && storymapJson.nodes && typeof storymapJson.nodes === 'object') {
        const nodes = storymapJson.nodes as Record<string, { type: string; data?: Record<string, unknown> }>;
        const immersive = Object.values(nodes).find(n => n?.type === 'immersive');
        const idata = immersive?.data || {};
        if (idata && idata['type'] === 'sidecar') {
          layoutSummary = {
            subtype: idata['subtype'] || null,
            narrativePanelPosition: idata['narrativePanelPosition'] || null,
            narrativePanelSize: idata['narrativePanelSize'] || null
          } as Record<string, unknown>;
        }
      }
    } catch { /* ignore */ }

    const response: Record<string, unknown> = {
      storymapJson,
      mediaUrls: result && 'mediaUrls' in result ? (result as Record<string, unknown>).mediaUrls : [],
      classicJson,
      conversionError: conversionError || undefined,
      summaries: {
        theme: themeSummary || null,
        layout: layoutSummary || null
      }
    };

    if (diagnostics) {
      response.validation = diagnosticsPayload || { hasDiagnostics: true, error: 'Diagnostics unavailable' };
    } else {
      response.validation = { hasDiagnostics: false } as Record<string, unknown>;
    }

    // Augment diagnostics post-conversion with any webmap resources introduced during conversion (e.g. swipe action)
    try {
      if (diagnostics && storymapJson && storymapJson.resources && typeof storymapJson.resources === 'object') {
        const resources = storymapJson.resources as Record<string, { type: string; data: Record<string, unknown> }>;
        const convertedWebmapIds = Object.values(resources)
          .filter(r => r?.type === 'webmap')
          .map(r => (r.data?.itemId as string | undefined))
          .filter(id => id && /^[a-f0-9]{32}$/i.test(id)) as string[];
        const diagObj = response.validation as Record<string, unknown>;
        const existingIds = Array.isArray(diagObj?.webmapIds) ? diagObj.webmapIds as string[] : [];
        const newIds = convertedWebmapIds.filter(id => !existingIds.includes(id));
        if (newIds.length) {
          const allIds = Array.from(new Set([...existingIds, ...newIds]));
          try {
            const validationResult = await validateWebMaps(newIds, token);
            const warnings2 = validationResult.warnings || [];
            const endpointChecks2 = validationResult.endpointChecks || [];
            const endpointCategorySummary2 = validationResult.endpointCategorySummary || null;
            (diagObj.webmapIds as unknown) = allIds;
            if (Array.isArray(diagObj.warnings)) (diagObj.warnings as unknown as any[]).push(...warnings2); else (diagObj.warnings as unknown) = warnings2;
            if (Array.isArray(diagObj.endpointChecks)) (diagObj.endpointChecks as unknown as any[]).push(...endpointChecks2); else (diagObj.endpointChecks as unknown) = endpointChecks2;
            if (diagObj.endpointCategorySummary && endpointCategorySummary2) {
              const merged: Record<string, number> = { ...(diagObj.endpointCategorySummary as Record<string, number>) };
              for (const [k,v] of Object.entries(endpointCategorySummary2 as Record<string, number>)) {
                merged[k] = (merged[k] || 0) + v;
              }
              (diagObj.endpointCategorySummary as unknown) = merged;
            } else if (endpointCategorySummary2) {
              (diagObj.endpointCategorySummary as unknown) = endpointCategorySummary2;
            }
          } catch (e2) {
            console.log('[convert-mapjournal] post-conversion validation failed:', (e2 as Error)?.message);
          }
        }
      }
    } catch (eAug) {
      console.log('[convert-mapjournal] diagnostics augmentation error:', (eAug as Error)?.message);
    }

    // If conversion failed but diagnostics succeeded, still return 200 so client can inspect.
    const statusCode = conversionError ? 200 : 200;
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(response)
    };
  } catch (err) {
    const message = (err as Error)?.message || 'Unhandled conversion error';
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: message })
    };
  }
};
