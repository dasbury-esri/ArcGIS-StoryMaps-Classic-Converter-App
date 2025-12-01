import type { ClassicStoryMapJSON } from './types/classic.ts';
import { MapJournalConverter } from './converters/MapJournalConverter.ts';
import { MapTourConverter } from './converters/MapTourConverter';
import { SwipeConverter } from './converters/SwipeConverter.ts';
import type { ConverterResult, StoryMapJSON } from './types/core.ts';
// Use global fetch in browser/Node 18+; lazy import node-fetch only if needed in older Node environments.
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
// Simplified fetch resolver: in browser and modern Node (>18) global fetch exists; avoid bundling node-fetch.
async function getFetch(): Promise<FetchFn> {
  if (typeof fetch === 'undefined') throw new Error('Global fetch unavailable in this environment');
  return fetch as FetchFn;
}
import { detectClassicTemplate } from './util/detectTemplate.ts';

export interface ConverterFactoryOptions {
  classicJson: ClassicStoryMapJSON;
  themeId: string;
  progress: (e: { stage: 'convert'; message: string }) => void;
  enrichScenes?: boolean; // toggle for web scene enrichment
  enrichMaps?: boolean; // toggle for web map enrichment
  isCancelled?: () => boolean; // optional cancellation callback
}

export class ConverterFactory {
  static async create(opts: ConverterFactoryOptions): Promise<ConverterResult> {
    const checkCancelled = () => { if (opts.isCancelled && opts.isCancelled()) throw new Error('Conversion cancelled by user intervention'); };
    const template = detectClassicTemplate(opts.classicJson);
    opts.progress({ stage: 'convert', message: `ConverterFactory detected template: ${template}` });
    checkCancelled();
    switch (template.toLowerCase()) {
      case 'map tour':
      case 'tour': {
        const result = MapTourConverter.convert({
          classicJson: opts.classicJson,
          themeId: opts.themeId,
          progress: opts.progress
        });
        // Determine if tour-map references a minimal webmap resource; enrich only then
        const hasWebMapResource = Object.values(result.storymapJson.resources).some(r => r.type === 'webmap');
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
        const result = SwipeConverter.convert({
          classicJson: opts.classicJson,
          themeId: opts.themeId,
          progress: opts.progress
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
          progress: opts.progress
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
    const sceneResources: Array<{ id: string; itemId: string; data: any }> = [];
    for (const [resId, res] of Object.entries(json.resources)) {
      const data: any = res.data || {};
      if (res.type === 'webmap' && data.itemType === 'Web Scene' && data.type === 'minimal' && typeof data.itemId === 'string') {
        sceneResources.push({ id: resId, itemId: data.itemId, data });
      }
    }
    if (!sceneResources.length) return;
    progress({ stage: 'convert', message: `Enriching ${sceneResources.length} Web Scene resource(s)...` });
    await Promise.all(sceneResources.map(async (scene) => {
      try {
        checkCancelled();
        const url = `https://www.arcgis.com/sharing/rest/content/items/${scene.itemId}/data?f=json`;
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
        const baseMapLayers = data.baseMap?.baseMapLayers?.map((l: any) => ({
          id: l.id,
          title: l.title,
          url: l.url,
          opacity: l.opacity,
          visibility: l.visibility,
          layerType: l.layerType,
          isReference: !!l.isReference
        })) || [];
        const operationalLayers = data.operationalLayers?.map((l: any) => ({ id: l.id, title: l.title, visible: l.visibility })) || [];
        // Capture slides (Web Scene presentations) if available
        const slidesSrc = (data.presentation?.slides || data.slides || []) as any[];
        const slides = slidesSrc.map(s => ({
          id: s.id,
          title: s.title || s.name || '',
          index: s.index,
          visibleLayers: (s.visibleLayers || []).map((vl: any) => ({ id: vl.id })),
          camera: s.viewpoint?.camera || s.camera,
          viewpoint: s.viewpoint ? { camera: s.viewpoint.camera, rotation: s.viewpoint.rotation, scale: s.viewpoint.scale } : undefined
        }));
        const extent = data.initialState?.view?.extent || data.view?.extent;
        const center = data.initialState?.view?.center || data.view?.center;
        const lightingDate = data.environment?.lighting?.date || undefined;
        const weather = data.environment?.weather ? { type: data.environment.weather.type, cloudCover: data.environment.weather.cloudCover } : undefined;
        const groundOpacity = data.environment?.ground?.opacity;
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
          } as any;
        }
        checkCancelled();
        progress({ stage: 'convert', message: `Enriched Web Scene ${scene.itemId}` });
      } catch (err: any) {
        progress({ stage: 'convert', message: `Web Scene enrichment failed for ${scene.itemId}: ${err.message}` });
      }
    }));
  }

  private static async enrichWebMaps(json: StoryMapJSON, progress: (e: { stage: 'convert'; message: string }) => void, isCancelled?: () => boolean): Promise<void> {
    const checkCancelled = () => { if (isCancelled && isCancelled()) throw new Error('Conversion cancelled by user intervention'); };
    const mapResources: Array<{ id: string; itemId: string; data: any }> = [];
    for (const [resId, res] of Object.entries(json.resources)) {
      const data: any = res.data || {};
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
        const url = `https://www.arcgis.com/sharing/rest/content/items/${map.itemId}/data?f=json`;
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
          const layerDefs: any[] = [];
          if (Array.isArray(data.operationalLayers)) layerDefs.push(...data.operationalLayers);
          if (Array.isArray(data.baseMap?.baseMapLayers)) layerDefs.push(...data.baseMap.baseMapLayers);
          const httpCount = layerDefs.filter(l => typeof l?.url === 'string' && /^http:/i.test(l.url)).length;
          if (httpCount > 0) protocolWarnings.push({ itemId: map.itemId, httpLayerCount: httpCount });
        } catch { /* ignore protocol scan errors */ }
        const baseMapLayers = data.baseMap?.baseMapLayers?.map((l: any) => ({
          id: l.id,
          title: l.title,
          url: l.url,
          opacity: l.opacity,
          visibility: l.visibility,
          layerType: l.layerType,
          isReference: !!l.isReference
        })) || [];
        const operationalLayers = data.operationalLayers?.map((l: any) => ({ id: l.id, title: l.title, visible: l.visibility })) || [];
        // Attempt to derive extent/center from common locations
        const pickExtent = (d: any): any => d?.initialState?.view?.extent || d?.mapOptions?.extent || d?.extent || d?.mapOptions?.mapExtent || undefined;
        const pickCenter = (d: any): any => d?.initialState?.view?.center || d?.mapOptions?.center || d?.center || undefined;
        let extent = pickExtent(data);
        let center = pickCenter(data);
        // Normalize center if array [lon,lat]
        const normalizeCenter = (c: any): any => {
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
          const itemUrl = `https://www.arcgis.com/sharing/rest/content/items/${map.itemId}?f=json`;
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
          const existing: any = resource.data || {};
          const prevRaw: any = existing.raw || {};
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
          } as any;
        }
        checkCancelled();
        progress({ stage: 'convert', message: `Enriched Web Map ${map.itemId}` });
      } catch (err: any) {
        progress({ stage: 'convert', message: `Web Map enrichment failed for ${map.itemId}: ${err.message}` });
      }
    }));
    // Persist version warnings into converter-metadata resource so UI can surface them.
    if (versionWarnings.length || protocolWarnings.length) {
      const metaEntry = Object.entries(json.resources).find(([, r]) => r.type === 'converter-metadata');
      if (metaEntry) {
        const [metaId, metaRes] = metaEntry as [string, { type: string; data: any }];
        const metaData = (metaRes.data || {}) as any;
        const classicMetadata = (metaData.classicMetadata || (metaData.classicMetadata = {}));
        if (versionWarnings.length) {
          classicMetadata.webmapVersionWarnings = versionWarnings.map(vw => ({
            itemId: vw.itemId,
            message: `Unsupported web map version: You must update the web map to the latest version. You can do this by opening the map in <a href="https://<org_url>.arcgis.com/home/webmap/viewer.html?webmap=${vw.itemId}">Map Viewer Classic</a> and save it. No other changes are necessary.`,
            version: vw.version,
            type: 'version'
          }));
        }
        if (protocolWarnings.length) {
          classicMetadata.webmapProtocolWarnings = protocolWarnings.map(pw => ({
            itemId: pw.itemId,
            message: `Unsupported protocol: You must update the web map to use https service urls. You can do this by opening the web map item's <a href="https://<org_url>.arcgis.com/home/item.html?id=${pw.itemId}#settings">settings page</a> scrolling down to the Web map section and clicking the "Update layers to HTTPS" button`,
            httpLayerCount: pw.httpLayerCount,
            type: 'protocol'
          }));
        }
        json.resources[metaId] = metaRes;
        if (versionWarnings.length) progress({ stage: 'convert', message: `Detected ${versionWarnings.length} web map(s) requiring version update (<2.0).` });
        if (protocolWarnings.length) progress({ stage: 'convert', message: `Detected ${protocolWarnings.length} web map(s) with http layer(s) requiring HTTPS update.` });
      }
    }
  }
}
