export interface WebMapWarning {
  itemId: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

export interface EndpointCheck {
  webmapId: string;
  webmapTitle?: string;
  layerTitle?: string;
  layerItemId?: string;
  url: string;
  status?: number;
  ok: boolean; // healthy endpoint determination
  errorCategory?: string; // token-required|permission-denied|http-failure|json-error|mixed-content|non-json|other
  errorMessage?: string;
}

export async function validateWebMaps(webmapIds: string[], token?: string): Promise<{ warnings: WebMapWarning[]; endpointChecks: EndpointCheck[]; endpointCategorySummary: Record<string, number> }> {
  const warnings: WebMapWarning[] = [];
  const endpointChecks: EndpointCheck[] = [];
  const uniqueIds = Array.from(new Set(webmapIds.filter(id => /^[a-f0-9]{32}$/i.test(id))));
  for (const id of uniqueIds) {
    try {
      const base = `https://www.arcgis.com/sharing/rest/content/items/${id}`;
      const dataUrl = `${base}/data?f=json${token ? `&token=${encodeURIComponent(token)}` : ''}`;
      const detailsUrl = `${base}?f=json${token ? `&token=${encodeURIComponent(token)}` : ''}`;
      const [webmapData, details] = await Promise.all([
        fetchJson(dataUrl).catch(() => null),
        fetchJson(detailsUrl).catch(() => null)
      ]);
      if (!details) {
        warnings.push({ itemId: id, level: 'error', message: 'Webmap item not accessible (404 or permission). Please verify the item exists and you have access.' });
        continue;
      }
      const webmapTitle = details?.title || details?.name || '';
      const failures: Array<{ url: string; status?: number; error?: string; title?: string; layerItemId?: string; layerTitle?: string }> = [];
      // Version check (classic viewer upgrade requirement)
      const version = (webmapData && (webmapData.version || webmapData.itemVersion)) || (details && (details.itemVersion || details.version));
      if (version && typeof version === 'string') {
        const vNum = parseFloat(version);
        if (!Number.isNaN(vNum) && vNum < 2.0) {
          warnings.push({ itemId: id, level: 'warning', message: `Webmap version ${version} < 2.0. Open in Classic Map Viewer and save to upgrade.` });
        }
      }
      // Layer URL scheme + availability check
      const layers: Array<{ id?: string; url?: string; title?: string; itemId?: string }> = (webmapData?.operationalLayers || []);
      const basemapLayers: Array<{ id?: string; url?: string; title?: string }> = (webmapData?.baseMap?.baseMapLayers || []);
      const toCheck: Array<{ url: string; title?: string; layerItemId?: string; layerTitle?: string }> = [];
      for (const l of layers) if (l?.url) toCheck.push({ url: l.url, title: l.title, layerItemId: l.itemId, layerTitle: l.title });
      for (const bl of basemapLayers) if (bl?.url) toCheck.push({ url: bl.url, title: bl.title });
      for (const { url, title, layerItemId, layerTitle } of toCheck) {
        if (/^http:\/\//i.test(url)) {
          failures.push({ url, error: 'HTTP URL (use HTTPS)', title, layerItemId, layerTitle });
          endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url, ok: false, errorCategory: 'mixed-content', errorMessage: 'HTTP URL (use HTTPS)' });
          if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
            failures.push({ url, error: 'Mixed content risk on HTTPS', title, layerItemId, layerTitle });
            endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url, ok: false, errorCategory: 'mixed-content', errorMessage: 'Mixed content risk on HTTPS' });
          }
        }
        const isLocal = (typeof window !== 'undefined' && window.location?.hostname)
          ? /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
          : false;
        const cleanUrl = url.split('?')[0];
        const layerJsonUrl = `${cleanUrl}${cleanUrl.includes('?') ? '' : '?'}${cleanUrl.includes('?') ? '&' : ''}f=json`;
        const parentServiceUrl = /(FeatureServer|MapServer)\/\d+$/i.test(cleanUrl)
          ? cleanUrl.replace(/\/(FeatureServer|MapServer)\/\d+$/i, '/$1')
          : cleanUrl;
        const parentJsonUrl = `${parentServiceUrl}${parentServiceUrl.includes('?') ? '' : '?'}${parentServiceUrl.includes('?') ? '&' : ''}f=json`;
        // Use Netlify function proxy for local development to avoid CORS; direct URL otherwise
        const netlifyProxy = (u: string) => `/.netlify/functions/proxy-feature?url=${encodeURIComponent(u)}`;
        const probeUrl = isLocal ? netlifyProxy(layerJsonUrl) : layerJsonUrl;
        const probeParentUrl = isLocal ? netlifyProxy(parentJsonUrl) : parentJsonUrl;

        const tryFetchJson = async (u: string) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const r = await fetch(u, { method: 'GET' });
              if (!r.ok) return { ok: false, resp: r, json: null } as const;
              const ct = r.headers.get('content-type') || '';
              const isJson = /application\/(?:json|pjson)/i.test(ct);
              const j = isJson ? await r.clone().json().catch(() => null) : null;
              return { ok: true, resp: r, json: j } as const;
            } catch {
              if (attempt === 1) return { ok: false, resp: undefined, json: null } as const;
              await new Promise(res => setTimeout(res, 150));
            }
          }
          return { ok: false, resp: undefined, json: null } as const;
        };

        const layerRes = await tryFetchJson(probeUrl);
        const parentRes = await tryFetchJson(probeParentUrl);
        // Treat any HTTP 200 as reachable even if JSON missing/parsing failed
        const layerHttpOk = !!layerRes.resp && layerRes.resp.ok;
        const parentHttpOk = !!parentRes.resp && parentRes.resp.ok;
        // Stricter: require valid JSON with no error to deem endpoint healthy
        const layerOk = layerHttpOk && !!layerRes.json && !layerRes.json?.error;
        const parentOk = parentHttpOk && !!parentRes.json && !parentRes.json?.error;

        if (layerRes.ok && layerRes.json) {
          const errMsg = layerRes.json?.error?.message || layerRes.json?.message || '';
          const requiresToken = /token/i.test(errMsg) || layerRes.json?.error?.code === 499;
          const permissionDenied = /permission|privilege|authorized|do not have permissions|not permitted/i.test(errMsg) || layerRes.json?.error?.code === 403;
          if (requiresToken) failures.push({ url, status: layerRes.resp?.status, error: 'Token required', title, layerItemId, layerTitle });
          if (permissionDenied) failures.push({ url, status: layerRes.resp?.status, error: 'Permissions denied or item private', title, layerItemId, layerTitle });
          const looksLayer = typeof layerRes.json?.type === 'string' || typeof layerRes.json?.geometryType === 'string' || Array.isArray(layerRes.json?.fields) || Array.isArray(layerRes.json?.layers);
          const hasError = !!layerRes.json?.error;
          if (!looksLayer && !hasError && !parentOk) failures.push({ url, status: layerRes.resp?.status, error: 'Invalid layer definition', title, layerItemId, layerTitle });
          if (hasError) failures.push({ url, status: layerRes.resp?.status, error: 'Layer error JSON', title, layerItemId, layerTitle });
          const ct = layerRes.resp?.headers?.get('content-type') || '';
          if (!/application\/(?:json|pjson)/i.test(ct)) {
            failures.push({ url, status: layerRes.resp?.status, error: 'Non-JSON response', title, layerItemId, layerTitle });
            endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url, status: layerRes.resp?.status, ok: false, errorCategory: 'non-json', errorMessage: 'Non-JSON response' });
          }
          if (!layerRes.json) {
            failures.push({ url, status: layerRes.resp?.status, error: 'JSON parse failed', title, layerItemId, layerTitle });
            endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url, status: layerRes.resp?.status, ok: false, errorCategory: 'json-error', errorMessage: 'JSON parse failed' });
          }
        }
        // If layer endpoint is not OK, flag it even if parent is OK
        if (!layerOk) {
          const status = layerRes.resp?.status;
          const explicitErr = layerRes.json?.error ? (layerRes.json.error.message || 'Layer error JSON') : undefined;
          failures.push({ url, status, error: explicitErr || 'Layer endpoint not healthy', title, layerItemId, layerTitle });
          endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url, status, ok: false, errorCategory: explicitErr ? 'json-error' : 'other', errorMessage: explicitErr || 'Layer endpoint not healthy' });
        }
        if (parentRes.ok && parentRes.json?.error) {
          const pErrMsg = parentRes.json?.error?.message || parentRes.json?.message || '';
          const pPermissionDenied = /permission|privilege|authorized|do not have permissions|not permitted/i.test(pErrMsg) || parentRes.json?.error?.code === 403;
          failures.push({ url: parentServiceUrl, status: parentRes.resp?.status, error: pPermissionDenied ? 'Service permissions denied or item private' : 'Service error JSON', title, layerItemId, layerTitle });
          endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url: parentServiceUrl, status: parentRes.resp?.status, ok: false, errorCategory: pPermissionDenied ? 'permission-denied' : 'json-error', errorMessage: pPermissionDenied ? 'Service permissions denied or item private' : 'Service error JSON' });
        }
        // Explicitly flag HTTP failures (4xx/5xx)
        if (!layerHttpOk) {
          failures.push({ url, status: layerRes.resp?.status, error: 'Layer HTTP failure', title, layerItemId, layerTitle });
          endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url, status: layerRes.resp?.status, ok: false, errorCategory: 'http-failure', errorMessage: 'Layer HTTP failure' });
        }
        if (!parentHttpOk) {
          failures.push({ url: parentServiceUrl, status: parentRes.resp?.status, error: 'Service HTTP failure', title, layerItemId, layerTitle });
          endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url: parentServiceUrl, status: parentRes.resp?.status, ok: false, errorCategory: 'http-failure', errorMessage: 'Service HTTP failure' });
        }
        if (parentRes.ok && parentRes.json && !parentRes.json.error) {
          const svc = parentRes.json;
          const hasVersion = typeof svc.currentVersion === 'number' || typeof svc.currentVersion === 'string';
          const hasCapabilities = typeof svc.capabilities === 'string' || Array.isArray(svc.capabilities);
          if (!hasVersion || !hasCapabilities) {
            failures.push({ url: parentServiceUrl, status: parentRes.resp?.status, error: 'Service missing capabilities/version', title, layerItemId, layerTitle });
            endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url: parentServiceUrl, status: parentRes.resp?.status, ok: false, errorCategory: 'other', errorMessage: 'Service missing capabilities/version' });
          }
        }
        // Success records (layer + parent) if healthy and not already marked failing
        if (layerOk) {
          endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url, status: layerRes.resp?.status, ok: true, errorCategory: 'ok' });
        }
        if (parentOk) {
          endpointChecks.push({ webmapId: id, webmapTitle, layerTitle, layerItemId, url: parentServiceUrl, status: parentRes.resp?.status, ok: true, errorCategory: 'ok' });
        }
      }
      // Optional: check referenced layer itemIds resolve and classify private vs deleted
      for (const l of layers) {
        if (l?.itemId && /^[a-f0-9]{32}$/i.test(l.itemId)) {
          const itemUrl = `https://www.arcgis.com/sharing/rest/content/items/${l.itemId}?f=json${token ? `&token=${encodeURIComponent(token)}` : ''}`;
          try {
            const itemResp = await fetch(itemUrl);
            if (!itemResp.ok) {
              const status = itemResp.status;
              const classification = status === 404 ? 'Layer item deleted' : status === 403 ? 'Layer item private or permission denied' : 'Layer item not accessible';
              failures.push({ url: itemUrl, status, error: classification, title: l.title, layerItemId: l.itemId, layerTitle: l.title });
            } else {
              const itemJson = await itemResp.json();
              if (itemJson.error) {
                const code = itemJson.error?.code;
                const msg = itemJson.error?.message || '';
                const isPrivate = code === 403 || /permission|privilege|authorized|not permitted/i.test(msg);
                failures.push({ url: itemUrl, status: itemResp.status, error: isPrivate ? 'Layer item private or permission denied' : 'Layer item error JSON', title: l.title, layerItemId: l.itemId, layerTitle: l.title });
              }
            }
          } catch {
            failures.push({ url: itemUrl, error: 'Layer item unreachable', title: l.title, layerItemId: l.itemId, layerTitle: l.title });
          }
        }
      }
      // If all endpoints OK, suppress generic warning; otherwise surface consolidated details
      if (failures.length) {
        warnings.push({
          itemId: id,
          level: 'warning',
          message: `Webmap ${webmapTitle ? '"' + webmapTitle + '" ' : ''}has ${failures.length} failing endpoint(s).`,
          details: {
            webmapTitle,
            failures
          }
        });
      }
    } catch (e) {
      warnings.push({ itemId: id, level: 'warning', message: 'Failed to validate webmap. Proceeding, but please check the item manually.' });
    }
  }
  // Build category summary counts (including successes as 'ok')
  const endpointCategorySummary: Record<string, number> = {};
  for (const ec of endpointChecks) {
    const cat = ec.errorCategory || (ec.ok ? 'ok' : 'other');
    endpointCategorySummary[cat] = (endpointCategorySummary[cat] || 0) + 1;
  }
  return { warnings, endpointChecks, endpointCategorySummary };
}
