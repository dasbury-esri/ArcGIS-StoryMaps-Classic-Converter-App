import { useEffect, useMemo, useState } from 'react';
import { getOrgBase } from '../lib/orgBase';
import { useAuth } from '../auth/useAuth';
import WebMap from '@arcgis/core/WebMap';
import CSVLayer from '@arcgis/core/layers/CSVLayer';
import esriId from '@arcgis/core/identity/IdentityManager';
import esriConfig from '@arcgis/core/config';

type SaveState =
  | { status: 'idle' }
  | { status: 'running'; step: string }
  | { status: 'success'; webmapId: string; verification?: { titles: string[] }; layerSummary?: { renderer?: any; popupTemplate?: any; layerTitle?: string } }
  | { status: 'error'; message: string; details?: any };

export default function SaveCsvLayer() {
  const { token, userInfo } = useAuth();
  const [state, setState] = useState<SaveState>({ status: 'idle' });

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  // Rehydrate params if missing after Netlify auth redirect to 8888
  const stored = useMemo(() => {
    try {
      const s = localStorage.getItem('pendingSaveCsvLayerParams');
      return s ? JSON.parse(s) as { webmapId?: string; csvItemId?: string } : {};
    } catch {
      return {};
    }
  }, []);
  const webmapId = params.get('webmapId') ?? stored.webmapId ?? '';
  const csvItemId = params.get('csvItemId') ?? stored.csvItemId ?? '';

  // Normalize a webmap JSON renderer into a JS API-friendly renderer
  function normalizeRenderer(renderer: any): any | null {
    if (!renderer) return null;
    // If already has a valid type, pass through
    const type = String(renderer.type || '').toLowerCase();
    const validTypes = ['heatmap', 'simple', 'unique-value', 'class-breaks', 'dot-density', 'dictionary', 'pie-chart'];
    if (validTypes.includes(type)) return renderer;
    // Map Notes usually provide drawingInfo.renderer with symbol having esri* types
    const sym = renderer.symbol || renderer;
    const symType = String(sym.type || sym.style || '').toLowerCase();
    // Convert classic symbol types to JS API autocast symbol types
    function normalizeSymbol(s: any): any | null {
      if (!s) return null;
      const st = String(s.type || s.style || '').toLowerCase();
      const out: any = { ...s };
      // Normalize colors to autocast-friendly RGBA arrays if needed
      const toColor = (c: any) => {
        if (!c) return c;
        if (Array.isArray(c)) return c; // assume [r,g,b,a]
        if (typeof c === 'string') return c; // autocast supports css colors
        if (typeof c === 'object' && 'r' in c && 'g' in c && 'b' in c) {
          return [c.r, c.g, c.b, ('a' in c ? c.a : 255)];
        }
        return c;
      };
      if (out.color) out.color = toColor(out.color);
      if (out.outline) {
        out.outline = { ...out.outline };
        if (out.outline.color) out.outline.color = toColor(out.outline.color);
      }
      if (st === 'esripms' || st === 'picturemarkersymbol') {
        out.type = 'picture-marker';
        // esriPMS may have imageData instead of url; build data URI
        if (!out.url && out.imageData) {
          out.url = `data:image/png;base64,${out.imageData}`;
        }
        // Size normalization: JS API supports width/height or size (point symbols)
        if (!out.width && out.size) out.width = out.size;
        if (!out.height && out.size) out.height = out.size;
        // Strip unsupported legacy properties for picture markers
        const allowed = ['type', 'url', 'width', 'height', 'angle', 'xoffset', 'yoffset'];
        Object.keys(out).forEach((k) => {
          if (!allowed.includes(k)) delete out[k];
        });
        // Remove legacy imageData once url is set
        delete out.imageData;
      } else if (st === 'esrisms' || st === 'simplemarkersymbol') {
        out.type = 'simple-marker';
        const allowed = ['type', 'style', 'color', 'size', 'outline', 'angle', 'xoffset', 'yoffset'];
        Object.keys(out).forEach((k) => {
          if (!allowed.includes(k)) delete out[k];
        });
      } else if (st === 'esrisls' || st === 'simplelinesymbol') {
        out.type = 'simple-line';
        const allowed = ['type', 'style', 'color', 'width'];
        Object.keys(out).forEach((k) => {
          if (!allowed.includes(k)) delete out[k];
        });
      } else if (st === 'esrisfs' || st === 'simplefillsymbol') {
        out.type = 'simple-fill';
        const allowed = ['type', 'style', 'color', 'outline'];
        Object.keys(out).forEach((k) => {
          if (!allowed.includes(k)) delete out[k];
        });
      } else {
        // Default to simple-marker for unknown/point-like symbols
        const fallback: any = {
          type: 'simple-marker',
          color: toColor(out.color) || 'red',
          size: typeof out.size === 'number' ? out.size : 12,
          outline: out.outline ? { color: toColor(out.outline.color) || 'white', width: 1 } : undefined,
        };
        return fallback;
      }
      return out;
    }
    const normSym = normalizeSymbol(sym);
    if (normSym) {
      return { type: 'simple', symbol: normSym };
    }
    // Fallback: if renderer has visualVariables or fields, try simple
    if (renderer.visualVariables) {
      return { type: 'simple', visualVariables: renderer.visualVariables };
    }
    return null;
  }

  // Convert legacy Map Notes popupInfo to JS API popupTemplate
  function toPopupTemplate(popupInfo: any, csvFields: Array<{ name: string }> = []): any | null {
    if (!popupInfo) return null;
    const names = csvFields.map((f) => f.name);
    const has = (candidate: string) => names.includes(candidate);
    // Prefer field names that exist in CSV
    const TITLE = has('TITLE') ? 'TITLE' : (has('Title') ? 'Title' : 'TITLE');
    const DESCRIPTION = has('DESCRIPTION') ? 'DESCRIPTION' : (has('Description') ? 'Description' : 'DESCRIPTION');
    const IMAGE_URL = has('IMAGE_URL') ? 'IMAGE_URL' : (has('Image_URL') ? 'Image_URL' : 'IMAGE_URL');
    const IMAGE_LINK_URL = has('IMAGE_LINK_URL') ? 'IMAGE_LINK_URL' : (has('Image_Link_URL') ? 'Image_Link_URL' : 'IMAGE_LINK_URL');
    const title = popupInfo.title || `{${TITLE}}`;
    const description = popupInfo.description || `{${DESCRIPTION}}`;
    const mediaInfos = Array.isArray(popupInfo.mediaInfos) ? popupInfo.mediaInfos : [];
    const content: any[] = [];
    // Description as text element
    if (description) {
      content.push({ type: 'text', text: description });
    }
    // Media images
    mediaInfos.forEach((m: any) => {
      if (String(m?.type).toLowerCase() === 'image' && m?.value) {
        const v = m.value;
        // JS API image media element
        content.push({
          type: 'media',
          mediaInfos: [{
            type: 'image',
            value: {
              sourceURL: v.sourceURL || `{${IMAGE_URL}}`,
              linkURL: v.linkURL || `{${IMAGE_LINK_URL}}`,
            },
          }],
        });
      }
    });
    return { title, content };
  }

  useEffect(() => {
    async function run() {
      if (!token || !userInfo) return;
      if (!webmapId || !csvItemId) {
        setState({ status: 'error', message: 'Missing webmapId or csvItemId in query params.' });
        return;
      }

      try {
        setState({ status: 'running', step: 'Registering token' });
        // Ensure the JS API knows our portal for item lookups
        esriConfig.portalUrl = getOrgBase();
        esriId.registerToken({
          server: `${getOrgBase()}/sharing/rest`,
          token,
          expires: Date.now() + 60 * 60 * 1000,
          ssl: true,
          userId: userInfo.username,
        } as any);

        setState({ status: 'running', step: 'Loading webmap' });
        const webmap = new WebMap({ portalItem: { id: webmapId } });
        await webmap.load();
        await webmap.when();

        setState({ status: 'running', step: 'Creating CSVLayer' });
        const csvLayer = new CSVLayer({ portalItem: { id: csvItemId } });
        // Be explicit about visibility and title to avoid nulls.
        (csvLayer as any).visible = true;
        (csvLayer as any).title = (csvLayer as any).title ?? 'Converted Map Notes';
        (csvLayer as any).outFields = ['*'];
        // Provide explicit URL to item data to satisfy save serialization requirements
        (csvLayer as any).url = `${getOrgBase()}/sharing/rest/content/items/${csvItemId}/data`;
        await csvLayer.load();
        await (csvLayer as any).when();

        // Try to copy renderer and popup from existing Map Notes layer
        setState({ status: 'running', step: 'Copying renderer/popup from Map Notes' });
        try {
          const wmDataUrl = `${getOrgBase()}/sharing/rest/content/items/${webmapId}/data?f=json&token=${encodeURIComponent(token)}`;
          const wmRes = await fetch(wmDataUrl);
          if (wmRes.ok) {
            const wmJson = await wmRes.json();
            const layers: any[] = wmJson?.operationalLayers || [];
            const mapNotes = layers.find(
              (l) =>
                (String(l?.layerType || l?.type || '').toLowerCase() === 'mapnotes') ||
                (String(l?.title || '').toLowerCase().includes('map notes'))
            );
            const layerDef = mapNotes?.layerDefinition || mapNotes?.featureCollection?.layers?.[0]?.layerDefinition;
            const drawingInfo = layerDef?.drawingInfo || mapNotes?.drawingInfo;
            const popupInfo = mapNotes?.popupInfo;
            if (drawingInfo?.renderer) {
              const safeRenderer = normalizeRenderer(drawingInfo.renderer);
              if (safeRenderer) {
                (csvLayer as any).renderer = safeRenderer;
              }
            }
            if (popupInfo) {
              const tmpl = toPopupTemplate(popupInfo, (csvLayer as any).fields || []);
              if (tmpl) {
                (csvLayer as any).popupEnabled = true;
                (csvLayer as any).popupTemplate = tmpl;
              }
            }
          }
        } catch {
          // Ignore copy failures; layer will still be added
        }
        // Auto-detect lon/lat fields from CSV schema (case-insensitive)
        const fields: Array<{ name: string }> = (csvLayer as any).fields ?? [];
        const names = fields.map(f => f.name.toLowerCase());
        const pick = (candidates: string[]) => candidates.find(c => names.includes(c));
        const lonCandidate = pick(['x', 'longitude', 'lon', 'long']);
        const latCandidate = pick(['y', 'latitude', 'lat']);
        if (lonCandidate && latCandidate) {
          (csvLayer as any).longitudeField = lonCandidate;
          (csvLayer as any).latitudeField = latCandidate;
        } else {
          // fallback to X/Y if present in any case
          (csvLayer as any).longitudeField = (csvLayer as any).longitudeField ?? 'X';
          (csvLayer as any).latitudeField = (csvLayer as any).latitudeField ?? 'Y';
        }

        setState({ status: 'running', step: 'Adding layer to webmap' });
        webmap.add(csvLayer);

        setState({ status: 'running', step: 'Saving webmap' });
        // Save using current credentials in IdentityManager
        const result = await webmap.save({ ignoreUnsupported: true });
        if (result && (result as any).id) {
          // After a successful JS API save, run REST enrichment to ensure renderer/popup persist
          try {
            await fetch('/.netlify/functions/save-csv-layer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token,
                webmapId,
                csvItemId,
                title: (csvLayer as any).title || 'Converted Map Notes',
                visible: true,
                opacity: 1,
                lonField: (csvLayer as any).longitudeField || 'x',
                latField: (csvLayer as any).latitudeField || 'y',
              })
            });
          } catch {}
          // Post-save verification: fetch webmap data and list operationalLayers titles
          const verifyUrl = `${((globalThis as unknown as { __ORG_BASE?: string }).__ORG_BASE || 'https://www.arcgis.com')}/sharing/rest/content/items/${webmapId}/data?f=json&token=${encodeURIComponent(token)}`;
          let titles: string[] = [];
          // Build a quick summary of the CSV layer's renderer and popupTemplate
          let layerSummary: { renderer?: any; popupTemplate?: any; layerTitle?: string } = {
            renderer: (csvLayer as any).renderer,
            popupTemplate: (csvLayer as any).popupTemplate,
            layerTitle: (csvLayer as any).title,
          };
          try {
            const lyr = webmap.layers.find((l: any) => (l.portalItem?.id === csvItemId) || (l.title === (csvLayer as any).title));
            if (lyr) {
              layerSummary = {
                renderer: (lyr as any).renderer,
                popupTemplate: (lyr as any).popupTemplate,
                layerTitle: (lyr as any).title,
              };
            }
          } catch {}
          try {
            const res = await fetch(verifyUrl);
            if (res.ok) {
              const json = await res.json();
              const opLayers = (json?.operationalLayers || []);
              titles = opLayers.map((l: any) => l?.title).filter(Boolean);
              // Try to read renderer/popupInfo from saved webmap JSON for the CSV layer
              const csvOp = opLayers.find((l: any) => (String(l?.layerType || l?.type).toLowerCase() === 'csv') && (l?.itemId === csvItemId || (String(l?.title || '') === String((csvLayer as any).title || 'Converted Map Notes'))));
              const def = csvOp?.layerDefinition;
              const di = def?.drawingInfo || csvOp?.drawingInfo;
              const pi = csvOp?.popupInfo;
              if (di?.renderer || pi) {
                layerSummary = {
                  renderer: di?.renderer,
                  popupTemplate: pi,
                  layerTitle: csvOp?.title || layerSummary.layerTitle,
                };
              }
              // Always include raw opLayers and CSV layer for debug visibility
              (layerSummary as any).allOperationalLayers = opLayers;
              (layerSummary as any).csvOperationalLayer = csvOp;
            }
          } catch {}
          setState({ status: 'success', webmapId, verification: { titles }, layerSummary });
        } else {
          throw new Error('Save did not return success.');
        }
      } catch (err: any) {
        // JS API save failed; fall back to REST function to update WebMap JSON directly
        try {
          setState({ status: 'running', step: 'Fallback: REST update' });
          const res = await fetch('/.netlify/functions/save-csv-layer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              webmapId,
              csvItemId,
              title: 'Converted Map Notes',
              visible: true,
              opacity: 1,
              lonField: 'x',
              latField: 'y'
            })
          });
          let json: any = null;
          let text: string | null = null;
          try { json = await res.json(); } catch { try { text = await res.text(); } catch {} }
          if (res.ok && (json?.success || json?.id)) {
            // Post-save verification via REST path
            const verifyUrl = `${((globalThis as unknown as { __ORG_BASE?: string }).__ORG_BASE || 'https://www.arcgis.com')}/sharing/rest/content/items/${webmapId}/data?f=json&token=${encodeURIComponent(token)}`;
            let titles: string[] = [];
            try {
              const vres = await fetch(verifyUrl);
              if (vres.ok) {
                const vjson = await vres.json();
                titles = (vjson?.operationalLayers || []).map((l: any) => l?.title).filter(Boolean);
              }
            } catch {}
            // Build a summary from REST path not available; skip reading from JS API webmap in fallback
            const layerSummary: { renderer?: any; popupTemplate?: any; layerTitle?: string } = {} as any;
            setState({ status: 'success', webmapId, verification: { titles }, layerSummary });
          } else {
            throw new Error(json?.message || text || 'Fallback update failed');
          }
        } catch (restErr: any) {
          const details = err?.details ?? {};
          const errors = details.errors ? JSON.stringify(details.errors) : '';
          setState({ status: 'error', message: `Save failed: ${err?.message ?? String(err)}${errors ? ` — ${errors}` : ''}. Fallback failed: ${restErr?.message ?? String(restErr)}`, details });
        }
      }
    }
    run();
  }, [token, userInfo, webmapId, csvItemId]);

  // Persist params early so they survive auth redirect
  useEffect(() => {
    const w = params.get('webmapId');
    const c = params.get('csvItemId');
    if (w || c) {
      localStorage.setItem('pendingSaveCsvLayerParams', JSON.stringify({ webmapId: w, csvItemId: c }));
    }
  }, [params]);

  return (
    <div className="page">
      <h2>Save CSV Layer to WebMap</h2>
      <p>
        WebMap ID: <code>{webmapId || '(missing)'}</code>
      </p>
      <p>
        CSV Item ID: <code>{csvItemId || '(missing)'}</code>
      </p>
      {state.status === 'idle' && <p>Waiting for authentication…</p>}
      {state.status === 'running' && <p>Working: {state.step}</p>}
      {state.status === 'success' && (
        <p>
          Success! Layer added and saved to WebMap <code>{state.webmapId}</code>.
        </p>
      )}
      {state.status === 'success' && state.verification && (
        <div>
          <p>Operational layer titles:</p>
          <ul>
            {state.verification.titles.map((t, i) => (
              <li key={i}><code>{t}</code></li>
            ))}
          </ul>
        </div>
      )}
      {state.status === 'success' && state.layerSummary && (
        <div>
          <p>CSV layer summary:</p>
          <p>Layer title: <code>{state.layerSummary.layerTitle || '(unknown)'}</code></p>
          <details>
            <summary>Renderer</summary>
            <pre className="error-details">{JSON.stringify(state.layerSummary.renderer, null, 2)}</pre>
          </details>
          <details>
            <summary>Popup Template</summary>
            <pre className="error-details">{JSON.stringify(state.layerSummary.popupTemplate, null, 2)}</pre>
          </details>
          <details>
            <summary>Raw CSV operationalLayer</summary>
            <pre className="error-details">{JSON.stringify((state.layerSummary as any).csvOperationalLayer, null, 2)}</pre>
          </details>
          <details>
            <summary>All operationalLayers</summary>
            <pre className="error-details">{JSON.stringify((state.layerSummary as any).allOperationalLayers, null, 2)}</pre>
          </details>
        </div>
      )}
      {state.status === 'error' && (
        <div>
          <p className="error">Error: {state.message}</p>
          {state.details && (
            <pre className="error-details">{JSON.stringify(state.details, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
