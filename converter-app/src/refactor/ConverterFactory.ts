import type { ClassicStoryMapJSON } from './types/classic.ts';
import { MapJournalConverter } from './converters/MapJournalConverter.ts';
import type { ConverterResult, StoryMapJSON } from './types/core.ts';
// Use global fetch in browser/Node 18+; lazy import node-fetch only if needed in older Node environments.
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
async function getFetch(): Promise<FetchFn> {
  if (typeof fetch !== 'undefined') return fetch as FetchFn;
  const mod = await import('node-fetch');
  return (mod.default as unknown as FetchFn);
}
import { detectClassicTemplate } from './util/detectTemplate.ts';

export interface ConverterFactoryOptions {
  classicJson: ClassicStoryMapJSON;
  themeId: string;
  progress: (e: { stage: 'convert'; message: string }) => void;
  enrichScenes?: boolean; // toggle for web scene enrichment
}

export class ConverterFactory {
  static async create(opts: ConverterFactoryOptions): Promise<ConverterResult> {
    const template = detectClassicTemplate(opts.classicJson);
    opts.progress({ stage: 'convert', message: `ConverterFactory detected template: ${template}` });
    // Only Map Journal supported currently; extend switch as more converters added
    switch (template.toLowerCase()) {
      case 'map journal':
      case 'journal':
      default:
        const result = MapJournalConverter.convert({
          classicJson: opts.classicJson,
          themeId: opts.themeId,
          progress: opts.progress
        });
        // Enrich any Web Scene resources if enabled
        if (opts.enrichScenes !== false) {
          await ConverterFactory.enrichWebScenes(result.storymapJson, opts.progress);
        } else {
          opts.progress({ stage: 'convert', message: 'Web scene enrichment disabled (enrichScenes=false).' });
        }
        return result;
    }
  }

  private static async enrichWebScenes(json: StoryMapJSON, progress: (e: { stage: 'convert'; message: string }) => void): Promise<void> {
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
        const url = `https://www.arcgis.com/sharing/rest/content/items/${scene.itemId}/data?f=json`;
        const f = await getFetch();
        const resp = await f(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
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
        progress({ stage: 'convert', message: `Enriched Web Scene ${scene.itemId}` });
      } catch (err: any) {
        progress({ stage: 'convert', message: `Web Scene enrichment failed for ${scene.itemId}: ${err.message}` });
      }
    }));
  }
}
