// Import app version to thread into converter-metadata when created here
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pkg from '../package.json' assert { type: 'json' };

function getAppVersion(): string {
  try {
    const v = (pkg as { version?: string })?.version;
    if (typeof v === 'string' && v.length) return v;
  } catch { /* ignore */ }
  try {
    const m = (typeof import.meta !== 'undefined') ? (import.meta as unknown as { env?: Record<string, string> }) : undefined;
    const v = m?.env?.VITE_APP_VERSION || m?.env?.APP_VERSION || '';
    if (typeof v === 'string' && v.length) return v;
  } catch { /* ignore */ }
  try {
    const p = (typeof process !== 'undefined') ? (process as unknown as { env?: Record<string, string> }) : undefined;
    const v = p?.env?.npm_package_version || p?.env?.APP_VERSION || '';
    if (typeof v === 'string' && v.length) return v;
  } catch { /* ignore */ }
  return '0.0.0';
}
/**
 * ConverterFactory
 *
 * Purpose:
 * - Central factory for creating and running Classic → ArcGIS StoryMaps converters.
 * - Provides a single interface to select the appropriate converter (e.g., MapJournal, Swipe)
 *   based on classic input and return a normalized StoryMap JSON result.
 * - Passes a progress callback through to keep UI updates consistent.
 * - Applies small post-processing steps that are common across converters (metadata, resource checks).
 *
 * Location rationale (src/):
 * - Orchestration logic belongs to core application code, not UI components.
 * - Shared by both UI (React) and non-UI callers (adapters, serverless functions),
 *   keeping dependencies clean and avoiding tight coupling with the component layer.
 * - Converters live in `src/converters/`; the factory sits alongside to coordinate selection and execution.
 */
import type { ClassicStoryMapJSON } from './types/classic';
import { MapJournalConverter } from './converters/MapJournalConverter';
import { MapTourConverter } from './converters/MapTourConverter';
import { MapSeriesConverter } from './converters/MapSeriesConverter';
import { SwipeConverter } from './converters/SwipeConverter';
import type { ConverterResult, StoryMapJSON, ProgressCallback } from './types/core';
import type { StoryMapResource } from './types/core';
import { getOrgBase } from './lib/orgBase';
// Use global fetch in browser/Node 18+; lazy import node-fetch only if needed in older Node environments.
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
// Simplified fetch resolver: in browser and modern Node (>18) global fetch exists; avoid bundling node-fetch.
async function getFetch(): Promise<FetchFn> {
  if (typeof fetch === 'undefined') throw new Error('Global fetch unavailable in this environment');
  return fetch as FetchFn;
}
import { detectClassicTemplate } from './util/detectTemplate';

export interface ConverterFactoryOptions {
  classicJson: ClassicStoryMapJSON;
  themeId: string;
  progress: (e: { stage: 'convert'; message: string }) => void;
  enrichScenes?: boolean; // toggle for web scene enrichment
  enrichMaps?: boolean; // toggle for web map enrichment
  isCancelled?: () => boolean; // optional cancellation callback
  /** Optional AGO item id for the classic app. Enables converters to fetch item info (title fallback, etc.). */
  classicItemId?: string;
}

export class ConverterFactory {
  static async create(opts: ConverterFactoryOptions): Promise<ConverterResult> {
    const checkCancelled = () => { if (opts.isCancelled && opts.isCancelled()) throw new Error('Conversion cancelled by user intervention'); };
    const template = detectClassicTemplate(opts.classicJson);
    opts.progress({ stage: 'convert', message: `ConverterFactory detected template: ${template}` });
    checkCancelled();
    switch (template.toLowerCase()) {
      case 'map series':
      case 'series': {
        // Build one draft per entry; UI will present builder links and collection creation
        const resultSeries = MapSeriesConverter.convertSeries({
          classicJson: opts.classicJson,
          themeId: opts.themeId,
          progress: opts.progress as ProgressCallback
        });
        // Return first story as primary for compatibility, plus attach series payload
        const first = resultSeries.storymapJsons[0] || ({ resources: {}, nodes: {} } as StoryMapJSON);
        return {
          ...resultSeries,
          storymapJson: first
        } as unknown as ConverterResult;
      }
      case 'map tour':
      case 'tour': {
        // Prefetch webmap data and layer features for Map Tour to support feature-layer tours
        try {
          const values = (opts.classicJson as { values?: { webmap?: string; sourceLayer?: string } }).values || {};
          const classicWithWebmap = opts.classicJson as { webmap?: string; webmapJson?: WebmapJson; _mapTourFeatures?: PrefetchedFeature[]; sourceLayer?: string };
          const webmapId: string | undefined = values.webmap || classicWithWebmap.webmap;
          if (webmapId && typeof webmapId === 'string') {
            const f = await getFetch();
            const ORG_BASE = getOrgBase();
            const wmUrl = `${ORG_BASE}/sharing/rest/content/items/${webmapId}/data?f=json`;
            const wmResp = await f(wmUrl);
            if (wmResp.ok) {
              const wmJson = await wmResp.json();
              classicWithWebmap.webmapJson = wmJson as WebmapJson;
              // If sourceLayer present, try to extract features; prefer embedded featureCollection
              const sourceLayer: string | undefined = classicWithWebmap.sourceLayer || values.sourceLayer;
              let features: PrefetchedFeature[] | undefined;
              const wm = wmJson as WebmapJson;
              const layers: OperationalLayer[] = Array.isArray(wm.operationalLayers) ? wm.operationalLayers : [];
              const matchLayer = (ly: OperationalLayer) => {
                const id: string = String(ly.id || '');
                return !!sourceLayer && (id === sourceLayer || id.includes(sourceLayer) || sourceLayer.includes(id));
              };
              const targetLayers = layers.filter(ly => matchLayer(ly) || /^maptour-layer/i.test(String(ly.id || '')) || /map\s*tour/i.test(String(ly.title || '').toLowerCase()));
              for (const ly of targetLayers) {
                const fcLayers = ly.featureCollection?.layers || [];
                for (const fc of fcLayers) {
                  const feats = fc.featureSet?.features;
                  if (Array.isArray(feats)) {
                    features = feats as PrefetchedFeature[];
                    break;
                  }
                }
                if (features && features.length) break;
              }
              // If no embedded features, try feature service query on the first target layer with URL (public only)
              if ((!features || !features.length) && targetLayers.length) {
                const urlLayer = targetLayers.find(ly => typeof (ly as unknown as { url?: string; URL?: string }).url === 'string' || typeof (ly as unknown as { url?: string; URL?: string }).URL === 'string') as unknown as { url?: string; URL?: string } | undefined;
                const fsUrl: string | undefined = urlLayer?.url || urlLayer?.URL;
                if (fsUrl) {
                  try {
                    const qUrl = `${fsUrl.replace(/\/$/, '')}/query?where=1%3D1&outFields=*&f=json`;
                    const qResp = await f(qUrl);
                    if (qResp.ok) {
                      const qJson = await qResp.json();
                      const qFeatures = (qJson as { features?: PrefetchedFeature[] }).features;
                      if (Array.isArray(qFeatures)) features = qFeatures;
                    }
                  } catch {/* ignore per-layer */}
                }
              }
              if (features && Array.isArray(features) && features.length) {
                classicWithWebmap._mapTourFeatures = features;
              }
            }
          }
        } catch {/* non-fatal prefetch failure */}
        const result = MapTourConverter.convert({
          classicJson: opts.classicJson,
          themeId: opts.themeId,
          progress: opts.progress as ProgressCallback
        });
        // Determine if tour-map references a minimal webmap resource; enrich only then
          const hasWebMapResource = Object
            .values(result.storymapJson.resources as Record<string, { type?: string }>)
            .some((r) => !!r && r.type === 'webmap');
        if (hasWebMapResource && opts.enrichMaps !== false) {
          checkCancelled();
          await ConverterFactory.enrichWebMaps(result.storymapJson, opts.progress, opts.isCancelled);
        } else if (hasWebMapResource) {
          opts.progress({ stage: 'convert', message: 'Map Tour web map enrichment skipped (enrichMaps=false).' });
        }
        if (opts.enrichScenes !== false) {
          checkCancelled();
          await ConverterFactory.enrichWebScenes(result.storymapJson, opts.progress, opts.isCancelled);
        } else {
          opts.progress({ stage: 'convert', message: 'Map Tour web scene enrichment disabled (enrichScenes=false).' });
        }
        return result;
      }
      case 'swipe': {
        const result = await SwipeConverter.convert({
          classicJson: opts.classicJson,
          themeId: opts.themeId,
          progress: opts.progress as ProgressCallback,
          // Pass through classicItemId so SwipeConverter can prefer item info title fallback
          classicItemId: opts.classicItemId
        });
        // Enrich web maps if present (swipe commonly references Web Maps)
        const hasWebMapResource = Object.values(result.storymapJson.resources).some(r => r.type === 'webmap');
        if (hasWebMapResource && opts.enrichMaps !== false) {
          checkCancelled();
          await ConverterFactory.enrichWebMaps(result.storymapJson, opts.progress, opts.isCancelled);
        } else if (hasWebMapResource) {
          opts.progress({ stage: 'convert', message: 'Swipe web map enrichment skipped (enrichMaps=false).' });
        }
        // Scenes enrichment is generally not applicable to Swipe, but keep consistent behavior
        if (opts.enrichScenes !== false) {
          checkCancelled();
          await ConverterFactory.enrichWebScenes(result.storymapJson, opts.progress, opts.isCancelled);
        } else {
          opts.progress({ stage: 'convert', message: 'Web scene enrichment disabled (enrichScenes=false).' });
        }
        return result;
      }
      case 'map journal':
      case 'journal':
      default: {
        const result = MapJournalConverter.convert({
          classicJson: opts.classicJson,
          themeId: opts.themeId,
          progress: opts.progress as ProgressCallback
        });
        if (opts.enrichMaps !== false) {
          checkCancelled();
          await ConverterFactory.enrichWebMaps(result.storymapJson, opts.progress, opts.isCancelled);
        } else {
          opts.progress({ stage: 'convert', message: 'Web map enrichment disabled (enrichMaps=false).' });
        }
        if (opts.enrichScenes !== false) {
          checkCancelled();
          await ConverterFactory.enrichWebScenes(result.storymapJson, opts.progress, opts.isCancelled);
        } else {
          opts.progress({ stage: 'convert', message: 'Web scene enrichment disabled (enrichScenes=false).' });
        }
        return result;
      }
    }
  }

  private static async enrichWebScenes(json: StoryMapJSON, progress: (e: { stage: 'convert'; message: string }) => void, isCancelled?: () => boolean): Promise<void> {
    const checkCancelled = () => { if (isCancelled && isCancelled()) throw new Error('Conversion cancelled by user intervention'); };
    const sceneResources: Array<{ id: string; itemId: string; data: Record<string, unknown> }> = [];
    for (const [resId, res] of Object.entries(json.resources)) {
      const data: Record<string, unknown> = (res.data || {}) as Record<string, unknown>;
      if (res.type === 'webmap' && data.itemType === 'Web Scene' && data.type === 'minimal' && typeof data.itemId === 'string') {
        sceneResources.push({ id: resId, itemId: data.itemId, data });
      }
    }
    if (!sceneResources.length) return;
    progress({ stage: 'convert', message: `Enriching ${sceneResources.length} Web Scene resource(s)...` });
    await Promise.all(sceneResources.map(async (scene) => {
      try {
        checkCancelled();
        const ORG_BASE = getOrgBase();
        const url = `${ORG_BASE}/sharing/rest/content/items/${scene.itemId}/data?f=json`;
        const f = await getFetch();
        checkCancelled();
        const resp = await f(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        checkCancelled();
        // Derive simple viewpoint & basemap layer summaries if present
        const vp = (data.view?.camera) ? {
          camera: data.view.camera,
          rotation: data.view.rotation,
          scale: data.view.scale,
          targetGeometry: data.view.targetGeometry
        } : undefined;
        const baseMapLayers = (data.baseMap?.baseMapLayers as Array<{ id?: string; title?: string; url?: string; opacity?: number; visibility?: boolean; layerType?: string; isReference?: boolean }> | undefined)?.map((l) => ({
          id: l.id,
          title: l.title,
          url: l.url,
          opacity: l.opacity,
          visibility: l.visibility,
          layerType: l.layerType,
          isReference: !!l.isReference
        })) || [];
        const operationalLayers = (data.operationalLayers as Array<{ id?: string; title?: string; visibility?: boolean }> | undefined)?.map((l) => ({ id: l.id, title: l.title, visible: l.visibility })) || [];
        // Capture slides (Web Scene presentations) if available
        type Slide = { id?: string; title?: string; name?: string; index?: number; visibleLayers?: Array<{ id?: string }>; viewpoint?: { camera?: unknown; rotation?: unknown; scale?: unknown }; camera?: unknown };
        const slidesSrc = ((data.presentation?.slides as Array<Slide> | undefined) || (data.slides as Array<Slide> | undefined) || []) as Array<Slide>;
        const slides = slidesSrc.map((s: Slide) => ({
          id: s.id,
          title: s.title || s.name || '',
          index: s.index,
          visibleLayers: (s.visibleLayers || []).map((vl: { id?: string }) => ({ id: vl.id })),
          camera: s.viewpoint?.camera || s.camera,
          viewpoint: s.viewpoint ? { camera: s.viewpoint.camera, rotation: s.viewpoint.rotation, scale: s.viewpoint.scale } : undefined
        }));
        const extent = (data.initialState?.view?.extent || data.view?.extent);
        const center = (data.initialState?.view?.center || data.view?.center);
        const lightingDate = (data.environment?.lighting?.date || undefined);
        const weather = (data.environment?.weather ? { type: data.environment.weather.type, cloudCover: data.environment.weather.cloudCover } : undefined);
        const groundOpacity = (data.environment?.ground?.opacity);
        const resource = json.resources[scene.id];
        if (resource) {
          resource.data = {
            itemId: scene.itemId,
            itemType: 'Web Scene',
            type: 'default',
            extent,
            center,
            viewpoint: vp,
            baseMap: { baseMapLayers },
            mapLayers: operationalLayers,
            lightingDate,
            weather,
            ground: { opacity: groundOpacity },
            environment: data.environment || undefined,
            slides,
            raw: { summary: { hasCamera: !!vp, baseMapLayerCount: baseMapLayers.length, operationalLayerCount: operationalLayers.length } }
          } as Record<string, unknown>;
        }
        checkCancelled();
        progress({ stage: 'convert', message: `Enriched Web Scene ${scene.itemId}` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        progress({ stage: 'convert', message: `Web Scene enrichment failed for ${scene.itemId}: ${msg}` });
      }
    }));
  }

  private static async enrichWebMaps(json: StoryMapJSON, progress: (e: { stage: 'convert'; message: string }) => void, isCancelled?: () => boolean): Promise<void> {
    const checkCancelled = () => { if (isCancelled && isCancelled()) throw new Error('Conversion cancelled by user intervention'); };
    const mapResources: Array<{ id: string; itemId: string; data: Record<string, unknown> }> = [];
    for (const [resId, res] of Object.entries(json.resources)) {
      const data: Record<string, unknown> = (res.data || {}) as Record<string, unknown>;
      if (res.type === 'webmap' && data.itemType === 'Web Map' && data.type === 'minimal' && typeof data.itemId === 'string') {
        mapResources.push({ id: resId, itemId: data.itemId, data });
      }
    }
    if (!mapResources.length) return;
    progress({ stage: 'convert', message: `Enriching ${mapResources.length} Web Map resource(s)...` });
    const versionWarnings: Array<{ itemId: string; version: string }> = [];
    const protocolWarnings: Array<{ itemId: string; httpLayerCount: number }> = [];
    await Promise.all(mapResources.map(async (map) => {
      try {
        checkCancelled();
        const ORG_BASE = getOrgBase();
        const url = `${ORG_BASE}/sharing/rest/content/items/${map.itemId}/data?f=json`;
        const f = await getFetch();
        checkCancelled();
        const resp = await f(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        checkCancelled();
        // Version check (<2.0 requires user to update in Classic Map Viewer)
        const rawVersion: unknown = (data.version || data.mapVersion || data.webMapVersion);
        let versionStr: string | undefined;
        if (typeof rawVersion === 'string') versionStr = rawVersion.trim();
        else if (typeof rawVersion === 'number') versionStr = String(rawVersion);
        if (versionStr) {
          const numeric = parseFloat(versionStr);
          if (!isNaN(numeric) && numeric < 2.0) {
            versionWarnings.push({ itemId: map.itemId, version: versionStr });
          }
        }
        // Detect http (non-https) layer URLs in operationalLayers & baseMapLayers
        try {
          const layerDefs: Array<{ url?: string }> = [];
          if (Array.isArray(data.operationalLayers)) layerDefs.push(...data.operationalLayers);
          if (Array.isArray(data.baseMap?.baseMapLayers)) layerDefs.push(...data.baseMap.baseMapLayers);
          const httpCount = layerDefs.filter(l => typeof l?.url === 'string' && /^http:/i.test(l.url)).length;
          if (httpCount > 0) protocolWarnings.push({ itemId: map.itemId, httpLayerCount: httpCount });
        } catch { /* ignore protocol scan errors */ }
        const baseMapLayers = (data.baseMap?.baseMapLayers as Array<{ id?: string; title?: string; url?: string; opacity?: number; visibility?: boolean; layerType?: string; isReference?: boolean }> | undefined)?.map((l) => ({
          id: l.id,
          title: l.title,
          url: l.url,
          opacity: l.opacity,
          visibility: l.visibility,
          layerType: l.layerType,
          isReference: !!l.isReference
        })) || [];
        const operationalLayers = (data.operationalLayers as Array<{ id?: string; title?: string; visibility?: boolean }> | undefined)?.map((l) => ({ id: l.id, title: l.title, visible: l.visibility })) || [];
        // Attempt to derive extent/center from common locations
        const pickExtent = (d: { initialState?: { view?: { extent?: unknown } }; mapOptions?: { extent?: unknown; mapExtent?: unknown }; extent?: unknown }): unknown => d.initialState?.view?.extent || d.mapOptions?.extent || d.extent || d.mapOptions?.mapExtent || undefined;
        const pickCenter = (d: { initialState?: { view?: { center?: unknown } }; mapOptions?: { center?: unknown }; center?: unknown }): unknown => d.initialState?.view?.center || d.mapOptions?.center || d.center || undefined;
        let extent = pickExtent(data);
        let center = pickCenter(data);
        // Normalize center if array [lon,lat]
        const normalizeCenter = (c: unknown): unknown => {
          if (!c) return c;
          if (Array.isArray(c) && c.length >= 2) {
            const [lon, lat] = c;
            return { x: lon, y: lat, spatialReference: { wkid: 4326 } };
          }
          return c;
        };
        center = normalizeCenter(center);
        // Fallback: fetch item details for item-level extent if not found in data
        if (!extent || (typeof extent !== 'object' && !Array.isArray(extent))) {
          const ORG_BASE = getOrgBase();
          const itemUrl = `${ORG_BASE}/sharing/rest/content/items/${map.itemId}?f=json`;
          const itemResp = await f(itemUrl);
          if (itemResp.ok) {
            const item = await itemResp.json();
            // item.extent is [[xmin,ymin],[xmax,ymax]] in WGS84
            if (Array.isArray(item.extent) && item.extent.length === 2 && Array.isArray(item.extent[0]) && Array.isArray(item.extent[1])) {
              const [[xmin,ymin],[xmax,ymax]] = item.extent as [number[], number[]];
              extent = { xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } };
            }
            // item.center may exist in some schemas
            if (!center && item.center && Array.isArray(item.center)) {
              center = normalizeCenter(item.center);
            }
          }
        }
        const resource = json.resources[map.id];
        if (resource) {
          const existing = (resource.data || {}) as Record<string, unknown>;
          const prevRaw = (existing.raw || {}) as Record<string, unknown>;
          resource.data = {
            ...existing,
            itemId: map.itemId,
            itemType: 'Web Map',
            type: 'default',
            // Preserve existing initialState (extent/viewpoint/zoom/scale) while adding top-level summaries
            extent: extent ?? existing.extent,
            center: center ?? existing.center,
            baseMap: { baseMapLayers },
            mapLayers: operationalLayers,
            raw: { ...prevRaw, summary: { baseMapLayerCount: baseMapLayers.length, operationalLayerCount: operationalLayers.length } }
          } as Record<string, unknown>;
          // Instrumentation: log resource placement
          try {
            const rdata = (json.resources[map.id].data || {}) as { extent?: unknown; viewpoint?: unknown; center?: unknown; zoom?: unknown };
            const zoom = rdata.zoom;
            console.info('[ConverterFactory.enrichWebMaps] resource', map.id, 'itemId', map.itemId, 'extent', rdata.extent, 'viewpoint', rdata.viewpoint, 'center', rdata.center, 'zoom', zoom);
          } catch { /* ignore log errors */ }
        }
        checkCancelled();
        progress({ stage: 'convert', message: `Enriched Web Map ${map.itemId}` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        progress({ stage: 'convert', message: `Web Map enrichment failed for ${map.itemId}: ${msg}` });
      }
    }));
    // Propagate resource placement to webmap nodes (if missing) and log
    try {
      for (const [nid, node] of Object.entries(json.nodes)) {
        if (node.type !== 'webmap') continue;
        const nd = (node.data || {}) as { map?: string; extent?: unknown; viewpoint?: unknown };
        const resId: string | undefined = nd.map;
        if (resId && json.resources[resId]?.type === 'webmap') {
          const rdata = (json.resources[resId].data || {}) as { extent?: unknown; viewpoint?: unknown };
          if (rdata.extent && !nd.extent) nd.extent = rdata.extent;
          if (rdata.viewpoint && !nd.viewpoint) nd.viewpoint = rdata.viewpoint;
          console.info('[ConverterFactory.enrichWebMaps] node', nid, 'map', resId, 'extent', nd.extent, 'viewpoint', nd.viewpoint);
        }
      }
    } catch { /* ignore propagation errors */ }
    // Persist version/protocol warnings into converter-metadata resource for downstream visibility.
    if (versionWarnings.length || protocolWarnings.length) {
      let metaEntry = Object.entries(json.resources).find(([, r]) => (r as { type?: string })?.type === 'converter-metadata');
      if (!metaEntry) {
        // Create a minimal converter-metadata resource if missing
        const rid = `r-${Math.random().toString(36).slice(2, 8)}`;
        json.resources[rid] = {
          type: 'converter-metadata',
          data: { typeConvertedTo: 'storymap', converterVersion: getAppVersion(), classicType: 'unknown', classicMetadata: {} }
        } as unknown as StoryMapResource;
        metaEntry = [rid, json.resources[rid] as unknown as { type: string; data: Record<string, unknown> }];
      }
      const [metaId, metaRes] = metaEntry as [string, { type: string; data: Record<string, unknown> }];
      const metaData = (metaRes.data || {}) as Record<string, unknown>;
      const classicMetadata = ((metaData.classicMetadata as Record<string, unknown>) || (metaData.classicMetadata = {} as Record<string, unknown>)) as Record<string, unknown>;
      if (versionWarnings.length) {
        classicMetadata.webmapVersionWarnings = versionWarnings.map(vw => ({
          itemId: vw.itemId,
          message: `Unsupported web map version: You must update the web map to the latest version. Open in <a href="${getOrgBase()}/home/webmap/viewer.html?webmap=${vw.itemId}" target="_blank" rel="noopener">Map Viewer Classic</a> and save it.`,
          version: vw.version,
          type: 'version'
        }));
      }
      if (protocolWarnings.length) {
        classicMetadata.webmapProtocolWarnings = protocolWarnings.map(pw => ({
          itemId: pw.itemId,
          message: `Unsupported protocol: Update layer URLs to HTTPS. Open the web map <a href="${getOrgBase()}/home/item.html?id=${pw.itemId}#settings" target="_blank" rel="noopener">settings page</a> and click "Update layers to HTTPS" in the Web map section.`,
          httpLayerCount: pw.httpLayerCount,
          type: 'protocol'
        }));
      }
      // Force converter-metadata to the end
      delete json.resources[metaId];
      json.resources[metaId] = metaRes as unknown as StoryMapResource;
      if (versionWarnings.length) progress({ stage: 'convert', message: `Detected ${versionWarnings.length} web map(s) requiring version update (<2.0).` });
      if (protocolWarnings.length) progress({ stage: 'convert', message: `Detected ${protocolWarnings.length} web map(s) with http layer(s) requiring HTTPS update.` });
    }
  }
}
