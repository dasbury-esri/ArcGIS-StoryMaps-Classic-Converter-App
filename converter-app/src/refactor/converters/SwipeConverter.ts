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
    this.builder.addCoverNode(v.title || v.name || 'Swipe', v.subtitle as string | undefined);
    this.builder.addNavigationHidden();
    this.builder.addCreditsNode();

    // Create sidecar with a single slide; swipe block goes in media position
    const { immersiveId: sidecarId } = this.builder.addSidecar('docked-panel', 'end', 'medium');
    // Remove the placeholder slide + narrative panel to keep clean structure
    const jsonNow = this.builder.getJson();
    const sidecarNode = jsonNow.nodes[sidecarId];
    if (sidecarNode?.children) {
      for (const childId of [...sidecarNode.children]) this.builder.removeNode(childId);
      this.builder.updateNode(sidecarId, n => { n.children = []; });
    }

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
      const resA = wmA ? this.builder.addWebMapResource(wmA, 'Web Map', {}, 'default') : undefined;
      const resB = wmB ? this.builder.addWebMapResource(wmB, 'Web Map', {}, 'default') : undefined;
      if (resA) contentA = this.builder.createWebMapNode(resA, undefined);
      if (resB) contentB = this.builder.createWebMapNode(resB, undefined);
    } else {
      // TWO_LAYERS: use one base webmap, toggle layer visibility between contents
      const baseId = String(v.webmap || '');
      const res = baseId ? this.builder.addWebMapResource(baseId, 'Web Map', {}, 'default') : undefined;
      if (res) {
        contentA = this.builder.createWebMapNode(res, undefined);
        contentB = this.builder.createWebMapNode(res, undefined);
        // Build visibility overrides from v.layers if present
        const classicLayers: ClassicLayer[] = Array.isArray(v.layers) ? (v.layers as ClassicLayer[]) : [];
        if (classicLayers.length >= 2) {
          const l0 = classicLayers[0];
          const l1 = classicLayers[1];
          // Content A: show layer0, hide layer1
          if (contentA) this.builder.updateNodeData(contentA, (data) => {
            (data as Record<string, unknown>).mapLayers = [
              { id: l0.id, title: l0.title || l0.id, visible: true },
              { id: l1.id, title: l1.title || l1.id, visible: false }
            ];
          });
          // Content B: show layer1, hide layer0
          if (contentB) this.builder.updateNodeData(contentB, (data) => {
            (data as Record<string, unknown>).mapLayers = [
              { id: l0.id, title: l0.title || l0.id, visible: false },
              { id: l1.id, title: l1.title || l1.id, visible: true }
            ];
          });
        }
      }
    }

    // Extent/viewpoint placement: extent for swipe, center for spyglass
    const viewPlacement = this.layout === 'spyglass' ? 'center' : 'extent';
    if (contentA && contentB) {
      const swipeId = this.builder.createSwipeNode(contentA, contentB, viewPlacement);
      // Add a single slide with swipe as media
      const titleTextId = this.builder.createTextNode(v.title || v.name || 'Swipe', 'h3');
      this.builder.addSlideToSidecar(sidecarId, [titleTextId], swipeId);
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
      // Attempt enrichment from base webmap
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
      const res = baseId ? builder.addWebMapResource(baseId, 'Web Map', initialBase as any, 'default') : undefined;
      if (res) {
        contentA = builder.createWebMapNode(res, undefined);
        contentB = builder.createWebMapNode(res, undefined);
        const classicLayers: ClassicLayer[] = Array.isArray(values.layers) ? (values.layers as ClassicLayer[]) : [];
        if (classicLayers.length >= 2) {
          const l0 = classicLayers[0];
          const l1 = classicLayers[1];
          if (contentA) builder.updateNodeData(contentA, (data) => {
            (data as Record<string, unknown>).mapLayers = [
              { id: l0.id, title: l0.title || l0.id, visible: true },
              { id: l1.id, title: l1.title || l1.id, visible: false }
            ];
          });
          if (contentB) builder.updateNodeData(contentB, (data) => {
            (data as Record<string, unknown>).mapLayers = [
              { id: l0.id, title: l0.title || l0.id, visible: false },
              { id: l1.id, title: l1.title || l1.id, visible: true }
            ];
          });
        }
      }
    }
    const viewPlacement = layout === 'spyglass' ? 'center' : 'extent';
    if (!contentA || !contentB) throw new Error('SwipeConverter.buildInlineSwipeBlock: missing content nodes');
    return builder.createSwipeNode(contentA, contentB, viewPlacement);
  }

  private static fetchWebMapInfoSync(itemId: string, token?: string): { extent?: ClassicExtent; center?: { x: number; y: number; spatialReference: { wkid: number } } } | undefined {
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
      return { extent: normExtent, center: normCenter };
    } catch {
      return undefined;
    }
  }
}
