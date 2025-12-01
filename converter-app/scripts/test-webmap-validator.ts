import { execSync } from 'node:child_process';
import { validateWebMaps } from '../src/refactor/services/WebMapValidator.ts';

function curlJson(url: string): any {
  const out = execSync(`curl -sL '${url}'`, { encoding: 'utf-8' });
  return JSON.parse(out);
}

function probeUrl(url: string) {
  const status = execSync(`curl -s -o /dev/null -w '%{http_code}' '${url}'`, { encoding: 'utf-8' }).trim();
  let errMsg = '';
  try {
    const body = execSync(`curl -sL '${url}'`, { encoding: 'utf-8' });
    const json = JSON.parse(body);
    if (json && json.error) errMsg = typeof json.error?.message === 'string' ? json.error.message : JSON.stringify(json.error);
  } catch { /* non-json or parse failure */ }
  return { status, errMsg };
}

function fetchClassic(itemId: string, token?: string): any {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  return curlJson(url);
}

function fetchItemData(itemId: string, token?: string): any {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  return curlJson(url);
}

function collectWebmapsFromSwipe(swipe: any): string[] {
  const ids: string[] = [];
  // Classic Swipe variants
  // 1) values.webmaps: ["<id>", "<id>"]
  if (Array.isArray(swipe?.values?.webmaps)) {
    for (const wid of swipe.values.webmaps) if (typeof wid === 'string') ids.push(wid);
  }
  // 2) values.webmapLeft / values.webmapRight
  if (typeof swipe?.values?.webmapLeft === 'string') ids.push(swipe.values.webmapLeft);
  if (typeof swipe?.values?.webmapRight === 'string') ids.push(swipe.values.webmapRight);
  // 3) values.maps: [{webmap:"id"}, ...]
  if (Array.isArray(swipe?.values?.maps)) {
    for (const m of swipe.values.maps) {
      const wid = m?.webmap || m?.id;
      if (typeof wid === 'string') ids.push(wid);
    }
  }
  // 4) root-level webmap ids
  if (typeof swipe?.webmap === 'string') ids.push(swipe.webmap);
  if (typeof swipe?.webmap2 === 'string') ids.push(swipe.webmap2);
  return Array.from(new Set(ids));
}

function probeWebmapLayers(webmapId: string, token?: string) {
  const wmBase = `https://www.arcgis.com/sharing/rest/content/items/${webmapId}/data?f=json`;
  const wmUrl = token ? `${wmBase}&token=${encodeURIComponent(token)}` : wmBase;
  const webmap = curlJson(wmUrl);
  const opLayers = Array.isArray(webmap?.operationalLayers) ? webmap.operationalLayers : [];
  const bmLayers = Array.isArray(webmap?.baseMap?.baseMapLayers) ? webmap.baseMap.baseMapLayers : [];
  const layerUrls: string[] = [];
  const pushUrl = (u?: string) => { if (u && typeof u === 'string') layerUrls.push(u); };
  for (const l of opLayers) pushUrl(l?.url);
  for (const l of bmLayers) pushUrl(l?.url);
  // Also check tileLayer/resourceInfo if present
  for (const l of [...opLayers, ...bmLayers]) {
    if (typeof l?.tileLayerUrl === 'string') pushUrl(l.tileLayerUrl);
    const ri = l?.resourceInfo;
    if (ri && typeof ri?.url === 'string') pushUrl(ri.url);
  }
  console.log(`  [${webmapId}] Found ${layerUrls.length} layer URL(s) to probe.`);
  for (const u of Array.from(new Set(layerUrls))) {
    const api = u.includes('?') ? `${u}&f=json` : `${u}?f=json`;
    const urlWithToken = token ? `${api}&token=${encodeURIComponent(token)}` : api;
    const { status, errMsg } = probeUrl(urlWithToken);
    console.log(`    ↳ Layer: ${urlWithToken}`);
    console.log(`      Status: ${status}${errMsg ? ` | Error: ${errMsg}` : ''}`);
    // Also probe parent service when layer ends with /<num>
    const m = /\/\d+$/.exec(u);
    if (m) {
      const parent = u.replace(/\/\d+$/, '');
      const parentApi = parent.includes('?') ? `${parent}&f=json` : `${parent}?f=json`;
      const parentUrl = token ? `${parentApi}&token=${encodeURIComponent(token)}` : parentApi;
      const p = probeUrl(parentUrl);
      console.log(`      ↳ Parent: ${parentUrl}`);
      console.log(`        Status: ${p.status}${p.errMsg ? ` | Error: ${p.errMsg}` : ''}`);
    }
  }
}

async function run() {
  const itemId = process.argv[2] || 'ccd648e8845847d2947cbc7e0c4ec616';
  const token = process.env.ARCGIS_TOKEN || process.argv[3];
  console.log(`[Validator] Fetching classic item ${itemId}...`);
  const classic = fetchClassic(itemId, token);

  const webmapIds: string[] = [];
  if (classic?.values?.webmap) webmapIds.push(classic.values.webmap);
  const sections = (classic?.values?.story?.sections || classic?.sections || []) as unknown as Array<Record<string, unknown>>;
  for (const s of sections) {
    const m = (s as any).media || {};
    if (m?.webmap?.id) webmapIds.push(m.webmap.id);
    const url = m?.webpage?.url || '';
    const mid = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(String(url))?.[1];
    if (mid) {
      try {
        const base = `https://www.arcgis.com/sharing/rest/content/items/${mid}/data?f=json`;
        const swipeUrl = token ? `${base}&token=${encodeURIComponent(token)}` : base;
        const swipe = curlJson(swipeUrl);
        for (const wid of collectWebmapsFromSwipe(swipe)) webmapIds.push(wid);
      } catch { /* ignore */ }
    }
    // Also parse content HTML for embedded swipe iframes
    try {
      const html = String((s as any).content || (s as any).description || '');
      const iframeRe = /<iframe[^>]*src=["']([^"'>]+)["'][^>]*>/gi;
      let mIF: RegExpExecArray | null;
      while ((mIF = iframeRe.exec(html)) !== null) {
        const src = mIF[1];
        const m2 = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(src);
        const appId2 = m2?.[1];
        if (appId2) {
          try {
            const base = `https://www.arcgis.com/sharing/rest/content/items/${appId2}/data?f=json`;
            const swipeUrl2 = token ? `${base}&token=${encodeURIComponent(token)}` : base;
            const swipe2 = curlJson(swipeUrl2);
            for (const wid of collectWebmapsFromSwipe(swipe2)) webmapIds.push(wid);
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  // Also inspect contentActions array for embedded classic swipe in media.webpage
  try {
    for (const s of sections) {
      const actions = Array.isArray((s as any).contentActions) ? (s as any).contentActions : [];
      for (const act of actions) {
        const media = (act as any).media || {};
        const wurl = media?.webpage?.url || '';
        const appId = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(String(wurl))?.[1];
        if (appId) {
          try {
            const base = `https://www.arcgis.com/sharing/rest/content/items/${appId}/data?f=json`;
            const swipeUrl = token ? `${base}&token=${encodeURIComponent(token)}` : base;
            const swipe = curlJson(swipeUrl);
            for (const wid of collectWebmapsFromSwipe(swipe)) webmapIds.push(wid);
          } catch { /* ignore */ }
        }
      }
    }
  } catch { /* ignore */ }

  const uniq = Array.from(new Set(webmapIds));
  console.log(`[Validator] Found ${uniq.length} webmap id(s):`, uniq.join(', '));
  const warnings = await validateWebMaps(uniq, token);
  if (!warnings.length) {
    console.log('[Validator] No warnings detected.');
    return;
  }
  console.log(`[Validator] ${warnings.length} warning(s):`);
  for (const w of warnings) {
    // We’ll verify endpoints first; if all good, suppress the warning output.
    let allOk = true;
    let diagLogs: string[] = [];
    // Verbose diagnostics: print exact URLs and HTTP status for common checks
    try {
      const urls: string[] = [];
      const baseDetails = `https://www.arcgis.com/sharing/rest/content/items/${w.itemId}?f=json`;
      const baseData = `https://www.arcgis.com/sharing/rest/content/items/${w.itemId}/data?f=json`;
      urls.push(token ? `${baseDetails}&token=${encodeURIComponent(token)}` : baseDetails);
      urls.push(token ? `${baseData}&token=${encodeURIComponent(token)}` : baseData);

      for (const u of urls) {
        const { status, errMsg } = probeUrl(u);
        diagLogs.push(`  ↳ URL: ${u}`);
        diagLogs.push(`    Status: ${status}${errMsg ? ` | Error: ${errMsg}` : ''}`);
        if (status !== '200' || errMsg) allOk = false;
      }
      // Probe layer/service URLs inside the webmap
      // Collect statuses to decide suppression
      const wmBase = `https://www.arcgis.com/sharing/rest/content/items/${w.itemId}/data?f=json`;
      const wmUrl = token ? `${wmBase}&token=${encodeURIComponent(token)}` : wmBase;
      const webmap = curlJson(wmUrl);
      const opLayers = Array.isArray(webmap?.operationalLayers) ? webmap.operationalLayers : [];
      const bmLayers = Array.isArray(webmap?.baseMap?.baseMapLayers) ? webmap.baseMap.baseMapLayers : [];
      const layerUrls: string[] = [];
      const pushUrl = (u?: string) => { if (u && typeof u === 'string') layerUrls.push(u); };
      for (const l of opLayers) pushUrl(l?.url);
      for (const l of bmLayers) pushUrl(l?.url);
      for (const l of [...opLayers, ...bmLayers]) {
        if (typeof l?.tileLayerUrl === 'string') pushUrl(l.tileLayerUrl);
        const ri = l?.resourceInfo;
        if (ri && typeof ri?.url === 'string') pushUrl(ri.url);
      }
      diagLogs.push(`  [${w.itemId}] Found ${layerUrls.length} layer URL(s) to probe.`);
      for (const u of Array.from(new Set(layerUrls))) {
        const api = u.includes('?') ? `${u}&f=json` : `${u}?f=json`;
        const urlWithToken = token ? `${api}&token=${encodeURIComponent(token)}` : api;
        const { status, errMsg } = probeUrl(urlWithToken);
        diagLogs.push(`    ↳ Layer: ${urlWithToken}`);
        diagLogs.push(`      Status: ${status}${errMsg ? ` | Error: ${errMsg}` : ''}`);
        if (status !== '200' || errMsg) allOk = false;
        const m = /\/\d+$/.exec(u);
        if (m) {
          const parent = u.replace(/\/\d+$/, '');
          const parentApi = parent.includes('?') ? `${parent}&f=json` : `${parent}?f=json`;
          const parentUrl = token ? `${parentApi}&token=${encodeURIComponent(token)}` : parentApi;
          const p = probeUrl(parentUrl);
          diagLogs.push(`      ↳ Parent: ${parentUrl}`);
          diagLogs.push(`        Status: ${p.status}${p.errMsg ? ` | Error: ${p.errMsg}` : ''}`);
          if (p.status !== '200' || p.errMsg) allOk = false;
        }
      }
    } catch (e) {
      diagLogs.push(`  ↳ Diagnostics failed: ${e?.message || String(e)}`);
      allOk = false;
    }
    if (allOk) {
      console.log(`- [INFO] (${w.itemId}) All endpoints OK. Suppressing validator warning.`);
    } else {
      console.log(`- [${w.level.toUpperCase()}] (${w.itemId}) ${w.message}`);
      for (const line of diagLogs) console.log(line);
    }
  }
}

run().catch(err => {
  console.error('[Validator] Error:', err?.message || String(err));
  process.exit(1);
});
