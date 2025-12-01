import { BaseConverter } from './BaseConverter.ts';
import type { BaseConverterOptions } from './BaseConverter.ts';
import { StoryMapJSONBuilder } from '../schema/StoryMapJSONBuilder.ts';
import type { ConverterResult, StoryMapJSON } from '../types/core.ts';
import type { ClassicValues, ClassicExtent, ClassicLayer } from '../types/classic.ts';
import { determineScaleZoomLevel } from '../../converter/utils.ts';
import { execSync } from 'node:child_process';

type SwipeModel = 'TWO_WEBMAPS' | 'TWO_LAYERS';
type SwipeLayout = 'swipe' | 'spyglass';

export class SwipeConverter extends BaseConverter {
  private builder: StoryMapJSONBuilder;
  private model: SwipeModel = 'TWO_WEBMAPS';
  private layout: SwipeLayout = 'swipe';

  constructor(options: BaseConverterOptions) {
    super(options);
    this.builder = new StoryMapJSONBuilder(options.themeId);
  }

  protected extractStructure(): void {
    const v = this.classicJson.values as ClassicValues;
    // Determine model
    const dm = (v.dataModel || '').toUpperCase();
    if (dm === 'TWO_LAYERS') this.model = 'TWO_LAYERS';
    else this.model = 'TWO_WEBMAPS';
    // Determine layout
    const ly = (v.layout || '').toLowerCase();
    if (ly.includes('spyglass')) this.layout = 'spyglass';
    else this.layout = 'swipe';
    this.emit(`Swipe model=${this.model} layout=${this.layout}`);
  }

  protected convertContent(): void {
    const v = this.classicJson.values as ClassicValues;
    this.builder.createStoryRoot();
    // Title fallback: use classic title/name else fetch item details title
    const coverTitle = v.title || v.name || this.fetchItemTitleFallback() || 'Swipe';
    this.builder.addCoverNode(coverTitle, v.subtitle as string | undefined);
    this.builder.addNavigationHidden();
    this.builder.addCreditsNode();

    // For Swipe stories, place swipe block directly under root (no sidecar)

    // Build webmap content nodes depending on model
    let contentA: string | undefined;
    let contentB: string | undefined;

    if (this.model === 'TWO_WEBMAPS') {
      const wmIds: string[] = [];
      if (Array.isArray(v.webmaps)) {
        for (const entry of v.webmaps) {
          if (typeof entry === 'string') wmIds.push(entry);
          else if (entry && typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
            wmIds.push(String((entry as Record<string, unknown>).id));
          }
        }
      } else if (v.webmap) {
        // Some payloads may use webmap + another field
        wmIds.push(String(v.webmap));
      }
      const [wmA, wmB] = wmIds;
      // Attempt enrichment for extent/center/zoom
      const infoA = wmA ? SwipeConverter.fetchWebMapInfoSync(wmA, this.token) : undefined;
      const infoB = wmB ? SwipeConverter.fetchWebMapInfoSync(wmB, this.token) : undefined;
      const initialA: Record<string, unknown> = {};
      const initialB: Record<string, unknown> = {};
      if (infoA?.extent) {
        (initialA as { extent?: unknown }).extent = infoA.extent;
        const sz = determineScaleZoomLevel(infoA.extent as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialA as { viewpoint?: unknown }).viewpoint = { targetGeometry: infoA.center ?? infoA.extent, scale: sz.scale };
          (initialA as { zoom?: number }).zoom = sz.zoom;
        }
      }
      if (infoB?.extent) {
        (initialB as { extent?: unknown }).extent = infoB.extent;
        const sz = determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialB as { viewpoint?: unknown }).viewpoint = { targetGeometry: infoB.center ?? infoB.extent, scale: sz.scale };
          (initialB as { zoom?: number }).zoom = sz.zoom;
        }
      }
      const resA = wmA ? this.builder.addWebMapResource(wmA, 'Web Map', initialA as any, 'default') : undefined;
      const resB = wmB ? this.builder.addWebMapResource(wmB, 'Web Map', initialB as any, 'default') : undefined;
      if (resA) contentA = this.builder.createWebMapNode(resA, undefined);
      if (resB) contentB = this.builder.createWebMapNode(resB, undefined);
      // Also mirror extent/viewpoint at node level for downstream consumers
      if (contentA && infoA?.extent) this.builder.updateNodeData(contentA, (data) => {
        (data as Record<string, unknown>).extent = infoA.extent;
        const sz = determineScaleZoomLevel(infoA.extent as unknown as { ymax: number; ymin: number });
        if (sz) (data as Record<string, unknown>).viewpoint = { targetGeometry: infoA.center ?? infoA.extent, scale: sz.scale };
      });
      if (contentB && infoB?.extent) this.builder.updateNodeData(contentB, (data) => {
        (data as Record<string, unknown>).extent = infoB.extent;
        const sz = determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number });
        if (sz) (data as Record<string, unknown>).viewpoint = { targetGeometry: infoB.center ?? infoB.extent, scale: sz.scale };
      });
    } else {
      // TWO_LAYERS: duplicate base webmap as two distinct resources; preserve original layer visibilities, override classic layer list
      const baseId = String(v.webmap || '');
      if (baseId) {
        // Attempt enrichment (extent/viewpoint) once and apply to both resources
        const baseInfo = SwipeConverter.fetchWebMapInfoSync(baseId, this.token);
        const initialState: Record<string, unknown> = {};
        if (baseInfo?.extent) {
          (initialState as { extent?: unknown }).extent = baseInfo.extent;
          const sz = determineScaleZoomLevel(baseInfo.extent as unknown as { ymax: number; ymin: number });
          if (sz) {
            (initialState as { viewpoint?: unknown }).viewpoint = { targetGeometry: baseInfo.center ?? baseInfo.extent, scale: sz.scale };
            (initialState as { zoom?: number }).zoom = sz.zoom;
          }
        }
        const resA = this.builder.addWebMapResource(baseId, 'Web Map', initialState as any, 'default');
        const resB = this.builder.addWebMapResource(baseId, 'Web Map', initialState as any, 'default');
        contentA = this.builder.createWebMapNode(resA, undefined);
        contentB = this.builder.createWebMapNode(resB, undefined);
        // Normalize classic layers array (entries may be objects or raw string ids)
        const rawLayers = Array.isArray(v.layers) ? v.layers : [];
        const classicLayers: Array<{ id: string; title?: string }> = rawLayers.map((entry: unknown) => {
          if (entry && typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
            const obj = entry as ClassicLayer;
            return { id: obj.id, title: obj.title || obj.id };
          }
          return { id: String(entry), title: String(entry) };
        }).filter(l => l.id);
        // Source webmap operational layer visibilities
        const sourceLayers: Array<{ id: string; title: string; visible: boolean }> = (baseInfo?.operationalLayers || []).map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
        if (contentA && contentB) {
          // Build left/right layer arrays starting from sourceLayers
          const leftLayers: Array<{ id: string; title: string; visible: boolean }> = [...sourceLayers];
          const rightLayers: Array<{ id: string; title: string; visible: boolean }> = [...sourceLayers];
          const toggleIds = classicLayers.map(l => l.id);
          // Ensure toggle layers exist (prepend) and apply visibility overrides
          for (const cl of classicLayers) {
            // Remove if already present to re-prepend
            for (const arr of [leftLayers, rightLayers]) {
              const idx = arr.findIndex(x => x.id === cl.id);
              if (idx > -1) arr.splice(idx, 1);
            }
            leftLayers.unshift({ id: cl.id, title: cl.title || cl.id, visible: true });
            rightLayers.unshift({ id: cl.id, title: cl.title || cl.id, visible: false });
          }
          // Single classic layer case already handled by loop
          this.builder.updateNodeData(contentA, (data) => {
            (data as Record<string, unknown>).mapLayers = leftLayers;
          });
          this.builder.updateNodeData(contentB, (data) => {
            (data as Record<string, unknown>).mapLayers = rightLayers;
          });
        }
      }
    }

    // Extent/viewpoint placement: extent for swipe, center for spyglass
    const viewPlacement = this.layout === 'spyglass' ? 'center' : 'extent';
    // Derive caption: prefer popupTitles, otherwise fall back to layer names
    let leftLabel: string | undefined;
    let rightLabel: string | undefined;
    const popupTitles = Array.isArray((v as Record<string, unknown>)['popupTitles']) ? (v as Record<string, unknown>)['popupTitles'] as string[] : [];
    if (popupTitles.length >= 2) {
      [rightLabel, leftLabel] = popupTitles; // classic order appears to be [Occupation, Degree]
    } else {
      const classicLayers: ClassicLayer[] = Array.isArray(v.layers) ? (v.layers as ClassicLayer[]) : [];
      if (classicLayers.length >= 2) {
        leftLabel = classicLayers[0]?.title || classicLayers[0]?.id;
        rightLabel = classicLayers[1]?.title || classicLayers[1]?.id;
      }
    }
    const caption = (leftLabel && rightLabel)
      ? `Left side—${leftLabel}, Right side—${rightLabel}`
      : undefined;
    if (contentA && contentB) {
      const swipeId = this.builder.createSwipeNode(contentA, contentB, viewPlacement, caption);
      // Legend migration: if classic had legend=true, pin legend referencing left content
      if (v.legend) {
        this.builder.updateNodeData(swipeId, (data) => {
          (data as Record<string, unknown>).legendPinned = true;
          (data as Record<string, unknown>).legend = [contentA];
        });
      }
      const rootId = this.builder.getStoryRootId();
      if (rootId) this.builder.addChild(rootId, swipeId);
    }

    // Converter metadata
    this.builder.addConverterMetadata('Swipe', { classicMetadata: { layout: this.layout, model: this.model } });
    this.emit('Built swipe block');
  }

  protected applyTheme(): void {
    // Theme applied via builder initialization; no overrides yet
  }

  protected collectMedia(): string[] {
    return [];
  }

  protected getStoryMapJson(): StoryMapJSON {
    return this.builder.getJson();
  }

  static convert(opts: BaseConverterOptions): ConverterResult {
    const conv = new SwipeConverter(opts);
    return conv.convert();
  }

  // Inline swipe block builder for embedding into other converters
  static buildInlineSwipeBlock(
    builder: StoryMapJSONBuilder,
    values: ClassicValues,
    layout: SwipeLayout = 'swipe',
    token?: string
  ): string {
    // Helper extent normalization (WGS84 -> WebMercator)
    const normalizeExtent = (ex?: ClassicExtent) => {
      if (!ex) return undefined;
      const sr = (ex.spatialReference as { wkid?: number; latestWkid?: number } | undefined)?.wkid
        ?? (ex.spatialReference as { latestWkid?: number } | undefined)?.latestWkid
        ?? undefined;
      const is4326 = sr === 4326;
      const toX = (lon: number) => lon * 20037508.34 / 180;
      const toY = (lat: number) => {
        const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
        return y * 20037508.34 / 180;
      };
      if (is4326) {
        return {
          xmin: toX(ex.xmin), ymin: toY(ex.ymin), xmax: toX(ex.xmax), ymax: toY(ex.ymax),
          spatialReference: { wkid: 102100 }
        } as ClassicExtent;
      }
      return ex;
    };

    const dm = String(values.dataModel || '').toUpperCase() as SwipeModel;
    let contentA: string | undefined;
    let contentB: string | undefined;

    if (dm === 'TWO_WEBMAPS') {
      const ids: string[] = [];
      if (Array.isArray(values.webmaps)) {
        for (const entry of values.webmaps) {
          if (typeof entry === 'string') ids.push(entry);
          else if (entry && typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) ids.push(String((entry as Record<string, unknown>).id));
        }
      } else if (values.webmap) {
        ids.push(String(values.webmap));
      }
      const [wmA, wmB] = ids;
      const initialA: Record<string, unknown> = {};
      const initialB: Record<string, unknown> = {};
      // Fetch extent/center from webmap data/item when available
      const infoA = wmA ? SwipeConverter.fetchWebMapInfoSync(wmA, token) : undefined;
      const infoB = wmB ? SwipeConverter.fetchWebMapInfoSync(wmB, token) : undefined;
      if (infoA?.extent) {
        (initialA as { extent?: unknown }).extent = infoA.extent;
        const sz = determineScaleZoomLevel(infoA.extent as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialA as { viewpoint?: unknown }).viewpoint = { targetGeometry: infoA.center ?? infoA.extent, scale: sz.scale };
          (initialA as { zoom?: number }).zoom = sz.zoom;
        }
      }
      if (infoB?.extent) {
        (initialB as { extent?: unknown }).extent = infoB.extent;
        const sz = determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialB as { viewpoint?: unknown }).viewpoint = { targetGeometry: infoB.center ?? infoB.extent, scale: sz.scale };
          (initialB as { zoom?: number }).zoom = sz.zoom;
        }
      }
      const resA = wmA ? builder.addWebMapResource(wmA, 'Web Map', initialA as any, 'default') : undefined;
      const resB = wmB ? builder.addWebMapResource(wmB, 'Web Map', initialB as any, 'default') : undefined;
      if (resA) contentA = builder.createWebMapNode(resA, undefined);
      if (resB) contentB = builder.createWebMapNode(resB, undefined);
    } else {
      const baseId = String(values.webmap || '');
      // Attempt enrichment from base webmap (collect extent + operational layer visibilities)
      const baseInfo = baseId ? SwipeConverter.fetchWebMapInfoSync(baseId, token) : undefined;
      const initialBase: Record<string, unknown> = {};
      if (baseInfo?.extent) {
        (initialBase as { extent?: unknown }).extent = baseInfo.extent;
        const sz = determineScaleZoomLevel(baseInfo.extent as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialBase as { viewpoint?: unknown }).viewpoint = { targetGeometry: baseInfo.center ?? baseInfo.extent, scale: sz.scale };
          (initialBase as { zoom?: number }).zoom = sz.zoom;
        }
      }
      const resA = baseId ? builder.addWebMapResource(baseId, 'Web Map', initialBase as any, 'default') : undefined;
      const resB = baseId ? builder.addWebMapResource(baseId, 'Web Map', initialBase as any, 'default') : undefined;
      if (resA && resB) {
        contentA = builder.createWebMapNode(resA, undefined);
        contentB = builder.createWebMapNode(resB, undefined);
        const rawLayers = Array.isArray(values.layers) ? values.layers : [];
        const classicLayers: Array<{ id: string; title?: string }> = rawLayers.map((entry: unknown) => {
          if (entry && typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
            const obj = entry as ClassicLayer;
            return { id: obj.id, title: obj.title || obj.id };
          }
          return { id: String(entry), title: String(entry) };
        }).filter(l => l.id);
        const sourceLayers: Array<{ id: string; title: string; visible: boolean }> = (baseInfo?.operationalLayers || []).map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
        const leftLayers: Array<{ id: string; title: string; visible: boolean }> = [...sourceLayers];
        const rightLayers: Array<{ id: string; title: string; visible: boolean }> = [...sourceLayers];
        for (const cl of classicLayers) {
          // remove existing occurrences
          for (const arr of [leftLayers, rightLayers]) {
            const idx = arr.findIndex(x => x.id === cl.id);
            if (idx > -1) arr.splice(idx, 1);
          }
          leftLayers.unshift({ id: cl.id, title: cl.title || cl.id, visible: true });
          rightLayers.unshift({ id: cl.id, title: cl.title || cl.id, visible: false });
        }
        builder.updateNodeData(contentA, (data) => {
          (data as Record<string, unknown>).mapLayers = leftLayers;
        });
        builder.updateNodeData(contentB, (data) => {
          (data as Record<string, unknown>).mapLayers = rightLayers;
        });
      }
    }
    const viewPlacement = layout === 'spyglass' ? 'center' : 'extent';
    if (!contentA || !contentB) throw new Error('SwipeConverter.buildInlineSwipeBlock: missing content nodes');
    return builder.createSwipeNode(contentA, contentB, viewPlacement);
  }

  private static fetchWebMapInfoSync(itemId: string, token?: string): { extent?: ClassicExtent; center?: { x: number; y: number; spatialReference: { wkid: number } }; operationalLayers?: Array<{ id: string; title?: string; visibility?: boolean }> } | undefined {
    try {
      const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
      const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
      const out = execSync(`curl -sL '${url}'`, { encoding: 'utf-8' });
      const data = JSON.parse(out);
      const pickExtent = (d: any): any => d?.initialState?.view?.extent || d?.mapOptions?.extent || d?.extent || d?.mapOptions?.mapExtent || undefined;
      const pickCenter = (d: any): any => d?.initialState?.view?.center || d?.mapOptions?.center || d?.center || undefined;
      let extent = pickExtent(data);
      let center = pickCenter(data);
      // If missing extent, fallback to item details extent array [[xmin,ymin],[xmax,ymax]] (WGS84)
      if (!extent || (typeof extent !== 'object' && !Array.isArray(extent))) {
        const itemUrl = `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`;
        const itemOut = execSync(`curl -sL '${itemUrl}'`, { encoding: 'utf-8' });
        const item = JSON.parse(itemOut);
        if (Array.isArray(item.extent) && item.extent.length === 2 && Array.isArray(item.extent[0]) && Array.isArray(item.extent[1])) {
          const [[xmin,ymin],[xmax,ymax]] = item.extent as [number[], number[]];
          extent = { xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } } as ClassicExtent;
        }
        if (!center && Array.isArray(item.center) && item.center.length >= 2) {
          const [lon, lat] = item.center;
          center = { x: lon, y: lat, spatialReference: { wkid: 4326 } };
        }
      }
      // Normalize extent/center to WebMercator if coming in WGS84
      const toX = (lon: number) => lon * 20037508.34 / 180;
      const toY = (lat: number) => {
        const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
        return y * 20037508.34 / 180;
      };
      let normExtent: ClassicExtent | undefined = undefined;
      if (extent && extent.spatialReference && (extent.spatialReference.wkid === 4326 || extent.spatialReference.latestWkid === 4326)) {
        normExtent = { xmin: toX(extent.xmin), ymin: toY(extent.ymin), xmax: toX(extent.xmax), ymax: toY(extent.ymax), spatialReference: { wkid: 102100 } } as ClassicExtent;
      } else if (extent && typeof extent === 'object' && 'xmin' in extent) {
        normExtent = extent as ClassicExtent;
      }
      let normCenter: { x: number; y: number; spatialReference: { wkid: number } } | undefined = undefined;
      if (center && center.spatialReference && center.spatialReference.wkid === 4326) {
        normCenter = { x: toX(center.x), y: toY(center.y), spatialReference: { wkid: 102100 } };
      } else if (center && center.spatialReference && (center.spatialReference.wkid === 102100 || center.spatialReference.latestWkid === 3857)) {
        normCenter = center;
      }
      const operationalLayers = Array.isArray(data.operationalLayers) ? data.operationalLayers.filter((l: any) => l && l.id).map((l: any) => ({ id: l.id, title: l.title, visibility: l.visibility })) : [];
      return { extent: normExtent, center: normCenter, operationalLayers };
    } catch {
      return undefined;
    }
  }

  private fetchItemTitleFallback(): string | undefined {
    try {
      const classicId = (this.options as any).classicItemId as string | undefined;
      if (!classicId) return undefined;
      const base = `https://www.arcgis.com/sharing/rest/content/items/${classicId}?f=json`;
      const out = execSync(`curl -sL '${base}'`, { encoding: 'utf-8' });
      const item = JSON.parse(out);
      if (item && typeof item.title === 'string' && item.title.trim().length) return item.title.trim();
    } catch { /* ignore */ }
    return undefined;
  }
}
