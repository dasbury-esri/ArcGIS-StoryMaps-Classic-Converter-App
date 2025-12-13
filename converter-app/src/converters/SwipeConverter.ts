/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * SwipeConverter
 *
 * Role:
 * - Implements Classic Swipe → ArcGIS StoryMaps conversion.
 * - Reads classic swipe layers/webmaps and builds StoryMap JSON nodes/resources.
 * - Emits progress events and writes converter metadata used by UI diagnostics.
 *
 * Placement (src/converters/):
 * - Co-located with other converters to keep strategy implementations modular.
 * - Invoked via `ConverterFactory` to abstract selection and execution.
 */
import { BaseConverter } from './BaseConverter';
import type { BaseConverterOptions } from './BaseConverter';
import { StoryMapJSONBuilder } from '../schema/StoryMapJSONBuilder';
import type { ConverterResult, StoryMapJSON } from '../types/core';
import type { ClassicValues, ClassicExtent, ClassicLayer } from '../types/classic';
// duplicate imports removed
import { determineScaleZoomLevel } from '../utils/scale';
import { fetchJsonWithCache } from '../utils/fetchCache';
import { sanitizeBasicHtml } from '../utils/htmlSanitizer';
import { execSync } from 'node:child_process';
import { detectClassicTemplate } from '../utils/detectTemplate';
import { computeTheme } from '../utils/classicTheme';

type SwipeModel = 'TWO_WEBMAPS' | 'TWO_LAYERS';
type SwipeLayout = 'swipe' | 'spyglass';

export class SwipeConverter extends BaseConverter {
  private builder: StoryMapJSONBuilder;
  private model: SwipeModel = 'TWO_WEBMAPS';
  private layout: SwipeLayout = 'swipe';
  public options?: { classicItemId?: string };

  constructor(options: BaseConverterOptions) {
    super(options);
    this.builder = new StoryMapJSONBuilder(options.themeId);
    // Capture non-Base options passed by callers (e.g., classicItemId)
    const maybeClassicId = (options as unknown as { classicItemId?: string }).classicItemId;
    if (maybeClassicId) this.options = { classicItemId: maybeClassicId };
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

  // Override BaseConverter.convert to ensure async content work completes
  public async convert(): Promise<ConverterResult> {
    this.emit('Beginning conversion');
    this.extractStructure();
    await this.convertContent();
    this.applyTheme();
    const mediaUrls = this.collectMedia();
    return { storymapJson: this.getStoryMapJson(), mediaUrls } as ConverterResult;
  }

  protected async convertContent(): Promise<void> {
    this.emit('SwipeConverter.convertContent used');
    const v = this.classicJson.values as ClassicValues;
    this.builder.createStoryRoot();
    let swipeIdCreated: string | undefined;
    // Capture caption for swipe block when available (TWO_WEBMAPS or TWO_LAYERS)
    let derivedCaption: string | undefined;
    // Title priority: prefer AGO item info title when classic title is generic or missing
    // Previous: values.title → fetched item info title → values.name → default
    // Updated: if values.title is empty or a generic template label (e.g., "Swipe"),
    // and we have a classicItemId, prefer the fetched AGO item title.
    let coverTitle: string = v.title || '';
    this.emit(`[CoverTitle] initial from classic values.title='${(v.title || '').trim()}'`);
    const isGenericTitle = (coverTitle || '').trim().toLowerCase() === 'swipe' || (coverTitle || '').trim().toLowerCase() === 'spyglass';
    if (!coverTitle || isGenericTitle) {
      const itemId = (this.options as any)?.classicItemId as string | undefined;
      this.emit(`[CoverTitle] genericOrEmpty=${!coverTitle || isGenericTitle}, classicItemId='${itemId || ''}'`);
      if (itemId) {
        const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`;
        try {
          const url = this.token ? `${base}&token=${encodeURIComponent(this.token)}` : base;
          const item = await fetchJsonWithCache<any>(url, undefined, 10 * 60 * 1000);
          const t = (item && typeof item.title === 'string') ? item.title.trim() : '';
          this.emit(`[CoverTitle] fetched AGO item.title='${t}'`);
          if (t) coverTitle = t;
        } catch { /* ignore */ }
      } else {
        // Node-only fallback
        const nodeTitle = this.fetchItemTitleFallback() || '';
        this.emit(`[CoverTitle] Node-only fallback title='${nodeTitle}'`);
        coverTitle = nodeTitle;
      }
    }
    if (!coverTitle) {
      this.emit(`[CoverTitle] falling back to values.name='${(v.name || '').trim()}' or default 'Swipe'`);
      coverTitle = v.name || 'Swipe';
    }
    this.emit(`[CoverTitle] final coverTitle='${coverTitle}'`);
    this.builder.addCoverNode(coverTitle, v.subtitle as string | undefined);
    this.builder.addNavigationHidden();
    this.builder.addCreditsNode();

    // If classic swipe has sidePanelDescription, inject as a rich text block before the swipe block
    try {
      const rawDesc = (v as unknown as { sidePanelDescription?: unknown }).sidePanelDescription as unknown;
      const sideText = typeof rawDesc === 'string' ? rawDesc : (rawDesc ? String(rawDesc) : '');
      const trimmed = sideText.trim();
      if (trimmed) {
        // Decide if content is HTML-like; basic heuristic: contains any tag brackets
        const looksHtml = /<[^>]+>/.test(trimmed);
        this.emit(`[SwipeConverter] sidePanelDescription detected; looksHtml=${looksHtml}`);
        if (looksHtml) {
          // Heuristic sanitizer: allow basic tags (strong/em/a[href]), strip styling and other tags
          const { sanitizedHtml, inlineStyles } = sanitizeBasicHtml(trimmed);
          // If inline styles exist, surface a converter-metadata entry to trigger UI download message
          if (inlineStyles.length) {
            try {
              this.builder.addConverterMetadata('Swipe', {
                classicMetadata: {
                  mappingDecisions: {
                    customCss: {
                      combined: inlineStyles.join('\n')
                    }
                  }
                }
              } as any);
            } catch { /* ignore metadata add errors */ }
          }
          this.builder.addRichTextToRoot(sanitizedHtml, 'paragraph', 'wide');
        } else {
          // Plain text fallback: insert as a standard paragraph block
          const rootId = (this.builder as unknown as { json: { root: string } }).json.root;
          if (rootId) {
            // Use addTextBlock to preserve schema expectations
            (this.builder as unknown as { addTextBlock: (parentId: string, text: string, type: 'paragraph'|'h2'|'h3'|'h4'|'quote'|'bullet-list') => string })
              .addTextBlock(rootId, trimmed, 'paragraph');
          } else {
            // Detached creation if root somehow missing
            (this.builder as unknown as { createTextNode: (text: string, type: 'paragraph'|'h2'|'h3'|'h4'|'quote'|'bullet-list', size?: 'wide'|'standard') => string })
              .createTextNode(trimmed, 'paragraph', 'wide');
          }
        }
      }
    } catch { /* ignore description insertion errors */ }

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
      // Attempt enrichment for extent/center/zoom (browser -> async, node -> sync)
      const isBrowser = typeof window !== 'undefined';
      const infoA = wmA ? (isBrowser ? await SwipeConverter.fetchWebMapInfo(wmA, this.token) : SwipeConverter.fetchWebMapInfoSync(wmA, this.token)) : undefined;
      const infoB = wmB ? (isBrowser ? await SwipeConverter.fetchWebMapInfo(wmB, this.token) : SwipeConverter.fetchWebMapInfoSync(wmB, this.token)) : undefined;
      const initialA: Record<string, unknown> = {};
      const initialB: Record<string, unknown> = {};
      if (infoA?.extent) {
        (initialA as { extent?: unknown }).extent = infoA.extent;
        const sz = determineScaleZoomLevel(infoA.extent as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialA as { viewpoint?: unknown }).viewpoint = { targetGeometry: infoA.center ?? infoA.extent, scale: sz.scale };
        }
        if (contentA && contentB) {
          const cA = infoA?.center || { x: ((infoA.extent as any).xmin + (infoA.extent as any).xmax) / 2, y: ((infoA.extent as any).ymin + (infoA.extent as any).ymax) / 2, spatialReference: (infoA.extent as any).spatialReference || { wkid: 102100 } };
          (initialA as { center?: unknown }).center = cA as any;
        }
      }
      if (Array.isArray(infoA?.operationalLayers)) {
        (initialA as { mapLayers?: Array<{ id: string; title: string; visible: boolean }> }).mapLayers = infoA!.operationalLayers!.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
      } else if (wmA) {
        const base = `https://www.arcgis.com/sharing/rest/content/items/${wmA}/data?f=json`;
        const url = this.token ? `${base}&token=${encodeURIComponent(this.token)}` : base;
        fetchJsonWithCache<{ operationalLayers?: Array<Record<string, unknown>> }>(url, undefined, 10 * 60 * 1000)
          .then(wm => {
            const ops: Array<Record<string, unknown>> = Array.isArray(wm?.operationalLayers) ? wm!.operationalLayers! : [];
            if (ops.length) {
              (initialA as { mapLayers?: Array<Record<string, unknown>> }).mapLayers = ops.map(layer => ({ ...layer }));
            }
          })
          .catch(() => {/* ignore */});
      }
      if (infoB?.extent) {
        (initialB as { extent?: unknown }).extent = infoB.extent;
        const sz = determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialB as { viewpoint?: unknown }).viewpoint = { targetGeometry: infoB.center ?? infoB.extent, scale: sz.scale };
        }
        if (!('center' in initialB)) {
          const cB = infoB?.center || { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } };
          (initialB as { center?: unknown }).center = cB as any;
        }
      }
      if (Array.isArray(infoB?.operationalLayers)) {
        (initialB as { mapLayers?: Array<{ id: string; title: string; visible: boolean }> }).mapLayers = infoB!.operationalLayers!.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
      } else if (wmB) {
          // Derive caption: last visible wins. Left falls back to basemap if none visible.
          const pickLastVisibleTitle = (layers: Array<{ title: string; visible: boolean }>): string | undefined => {
            for (let i = layers.length - 1; i >= 0; i--) {
              if (layers[i].visible) return layers[i].title;
            }
            return undefined;
          };
          let leftLabel = pickLastVisibleTitle(leftLayers);
          const rightLabel = pickLastVisibleTitle(rightLayers);
          if (!leftLabel && Array.isArray((baseData as any)?.baseMap?.baseMapLayers)) {
            const bml = ((baseData as any).baseMap.baseMapLayers as Array<{ title?: string; visibility?: boolean }>);
            for (let i = bml.length - 1; i >= 0; i--) {
              if (bml[i].visibility) { leftLabel = bml[i].title || leftLabel; break; }
            }
          }
          const caption = (leftLabel && rightLabel) ? `Left: ${leftLabel} — Right: ${rightLabel}` : undefined;
        const base = `https://www.arcgis.com/sharing/rest/content/items/${wmB}/data?f=json`;
        const url = this.token ? `${base}&token=${encodeURIComponent(this.token)}` : base;
        fetchJsonWithCache<{ operationalLayers?: Array<Record<string, unknown>> }>(url, undefined, 10 * 60 * 1000)
          .then(wm => {
            const ops: Array<Record<string, unknown>> = Array.isArray(wm?.operationalLayers) ? wm!.operationalLayers! : [];
            if (ops.length) {
              (initialB as { mapLayers?: Array<Record<string, unknown>> }).mapLayers = ops.map(layer => ({ ...layer }));
            }
          })
          .catch(() => {/* ignore */});
      }
      const resA = wmA ? this.builder.addWebMapResource(wmA, 'Web Map', initialA as any, 'default') : undefined;
      const resB = wmB ? this.builder.addWebMapResource(wmB, 'Web Map', initialB as any, 'default') : undefined;
      // Persist enrichment at top-level resource data to match expected schema and include item identifiers
      if (resA && infoA) {
        const szA = infoA.extent ? determineScaleZoomLevel(infoA.extent as unknown as { ymax: number; ymin: number }) : undefined;
        this.builder.updateWebMapData(resA, {
          extent: infoA.extent,
          center: infoA.center,
          zoom: szA?.zoom,
          viewpoint: (initialA as any).viewpoint,
          mapLayers: (initialA as any).mapLayers ?? [],
          itemId: wmA,
          itemType: 'Web Map',
          type: 'default',
        });
        try {
          const rdata: any = this.builder.getJson().resources[resA]?.data || {};
          console.info('[SwipeConverter] resA', resA, 'extent', rdata.extent, 'viewpoint', rdata.viewpoint, 'center', rdata.center, 'zoom', rdata.zoom);
        } catch { /* ignore log errors */ }
      }
      if (resB && infoB) {
        const szB = infoB.extent ? determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number }) : undefined;
        this.builder.updateWebMapData(resB, {
          extent: infoB.extent,
          center: infoB.center,
          zoom: szB?.zoom,
          viewpoint: (initialB as any).viewpoint,
          mapLayers: (initialB as any).mapLayers ?? [],
          itemId: wmB,
          itemType: 'Web Map',
          type: 'default',
        });
        try {
          const rdata: any = this.builder.getJson().resources[resB]?.data || {};
          console.info('[SwipeConverter] resB', resB, 'extent', rdata.extent, 'viewpoint', rdata.viewpoint, 'center', rdata.center, 'zoom', rdata.zoom);
        } catch { /* ignore log errors */ }
      }
      if (resA) contentA = this.builder.createWebMapNode(resA, undefined);
      if (resB) contentB = this.builder.createWebMapNode(resB, undefined);
      // Ensure centers are set last so no subsequent updates overwrite them
      if (resB) {
        const centerFromB = (infoB?.center || (infoB?.extent ? { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } } : undefined));
        this.builder.updateWebMapData(resB, { center: centerFromB } as any);
      }
      if (resA) {
        const centerFromB = (infoB?.center || (infoB?.extent ? { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } } : undefined));
        this.builder.updateWebMapData(resA, { center: centerFromB } as any);
      }
      // Also mirror extent/viewpoint at node level for downstream consumers
      // To ensure initial sync, set first node extent/viewpoint from second webmap's extent/center when available
      if (contentA && (infoB?.extent || infoA?.extent)) this.builder.updateNodeData(contentA, (data) => {
        (data as Record<string, unknown>).extent = (infoB?.extent || infoA?.extent);
        const sz = determineScaleZoomLevel(infoA.extent as unknown as { ymax: number; ymin: number });
        const vpGeom = (infoB?.center ?? infoB?.extent) || (infoA.center ?? infoA.extent);
        if (sz) (data as Record<string, unknown>).viewpoint = { targetGeometry: vpGeom, scale: sz.scale };
        const hasTime = Array.isArray(infoA.operationalLayers) && infoA.operationalLayers.some(l => (l as any).timeAnimation === true);
        (data as Record<string, unknown>).timeSlider = !!hasTime;
        // Respect resource-layer visibility from webmap operationalLayers
        if (Array.isArray(infoA.operationalLayers) && infoA.operationalLayers.length) {
          (data as Record<string, unknown>).mapLayers = infoA.operationalLayers.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
          (data as Record<string, unknown>).viewPlacement = 'extent';
        }
        try {
          console.info('[SwipeConverter] node', contentA, 'extent', (data as any).extent, 'viewpoint', (data as any).viewpoint);
        } catch { /* ignore log errors */ }
      });
      if (contentB && infoB?.extent) this.builder.updateNodeData(contentB, (data) => {
        (data as Record<string, unknown>).extent = infoB.extent;
        const sz = determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number });
        if (sz) (data as Record<string, unknown>).viewpoint = { targetGeometry: infoB.center ?? infoB.extent, scale: sz.scale };
        const hasTime = Array.isArray(infoB.operationalLayers) && infoB.operationalLayers.some(l => (l as any).timeAnimation === true);
        (data as Record<string, unknown>).timeSlider = !!hasTime;
        if (Array.isArray(infoB.operationalLayers) && infoB.operationalLayers.length) {
          (data as Record<string, unknown>).mapLayers = infoB.operationalLayers.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
          (data as Record<string, unknown>).viewPlacement = 'extent';
        }
        try {
          console.info('[SwipeConverter] node', contentB, 'extent', (data as any).extent, 'viewpoint', (data as any).viewpoint);
        } catch { /* ignore log errors */ }
      });
      // Derive caption from webmap item titles and create swipe
      if (contentA && contentB) {
        const fetchTitle = async (id?: string): Promise<string | undefined> => {
          if (!id) return undefined;
          try {
            const base = `https://www.arcgis.com/sharing/rest/content/items/${id}?f=json`;
            const url = this.token ? `${base}&token=${encodeURIComponent(this.token)}` : base;
            const item = await fetchJsonWithCache<any>(url, undefined, 10 * 60 * 1000);
            const t = (item && typeof item.title === 'string') ? item.title : undefined;
            return t && t.trim().length ? t.trim() : undefined;
          } catch { return undefined; }
        };
        const titleA = await fetchTitle(wmA);
        const titleB = await fetchTitle(wmB);
        const caption = (titleA && titleB) ? `Left: ${titleA} — Right: ${titleB}` : undefined;
          const swipeId = this.builder.createSwipeNode(contentA, contentB, 'extent', caption);
          const rootId = this.builder.getStoryRootId();
          if (rootId) this.builder.addChild(rootId, swipeId);
          swipeIdCreated = swipeId;
        swipeIdCreated = swipeId;
      }
    } else {
      // TWO_LAYERS: duplicate base webmap as two distinct resources; preserve original layer visibilities, override classic layer list
      const baseId = String(v.webmap || '');
      try {
        const rawLayersLog = Array.isArray(v.layers) ? v.layers : [];
        console.info('[SwipeConverter] classic values.layers (top-level)', rawLayersLog);
      } catch { /* ignore log errors */ }
      if (baseId) {
        // Attempt enrichment (extent/viewpoint) once and apply to both resources
        const baseInfo = SwipeConverter.fetchWebMapInfoSync(baseId, this.token);
        // Fetch full webmap data JSON to persist complete resource data
        const baseUrl = `https://www.arcgis.com/sharing/rest/content/items/${baseId}/data?f=json`;
        const baseData = await fetchJsonWithCache<any>(this.token ? `${baseUrl}&token=${encodeURIComponent(this.token)}` : baseUrl, undefined, 10 * 60 * 1000).catch(() => undefined);
        const initialState: Record<string, unknown> = {};
        // Fallbacks from full webmap data if fetchWebMapInfoSync lacks extent/center
        const extentFromData = (baseData?.initialState?.view?.extent) || (baseData?.mapOptions?.extent) || (baseData?.extent) || (baseData?.mapOptions?.mapExtent);
        const centerFromData = (baseData?.initialState?.view?.center) || (baseData?.mapOptions?.center) || (baseData?.center);
        const useExtent = baseInfo?.extent || extentFromData;
        const useCenter = baseInfo?.center || centerFromData;
        if (useExtent) {
          (initialState as { extent?: unknown }).extent = useExtent;
          const sz = determineScaleZoomLevel(useExtent as unknown as { ymax: number; ymin: number });
          if (sz) {
            (initialState as { viewpoint?: unknown }).viewpoint = { targetGeometry: useCenter ?? useExtent, scale: sz.scale };
            (initialState as { zoom?: number }).zoom = sz.zoom;
          }
        }
        const resA = this.builder.addWebMapResource(baseId, 'Web Map', initialState as any, 'default');
        const resB = this.builder.addWebMapResource(baseId, 'Web Map', initialState as any, 'default');
        if (resA && initialState) this.builder.updateWebMapInitialState(resA, initialState as any);
        if (resB && initialState) this.builder.updateWebMapInitialState(resB, initialState as any);
        // Persist complete base webmap data object into resource data so downstream has full context
        if (baseData && resA) this.builder.updateWebMapData(resA, { ...(baseData as any), itemId: baseId, itemType: 'Web Map', type: 'default' } as any);
        if (baseData && resB) this.builder.updateWebMapData(resB, { ...(baseData as any), itemId: baseId, itemType: 'Web Map', type: 'default' } as any);
        // Ensure extent, center, viewpoint, zoom are present on resources
        if (resA) this.builder.updateWebMapData(resA, { extent: (initialState as any).extent, center: baseInfo?.center, viewpoint: (initialState as any).viewpoint, zoom: (initialState as any).zoom } as any);
        if (resB) this.builder.updateWebMapData(resB, { extent: (initialState as any).extent, center: baseInfo?.center, viewpoint: (initialState as any).viewpoint, zoom: (initialState as any).zoom } as any);
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
        try {
          console.info('[SwipeConverter] parsed classicLayers (top-level)', classicLayers);
        } catch { /* ignore log errors */ }
        // Source webmap operational layer visibilities
        // Prefer full webmap data for layer list; fallback to baseInfo
        const fullOpsA: Array<{ id: string; title?: string; visibility?: boolean }> = Array.isArray((baseData as any)?.operationalLayers) ? (baseData as any).operationalLayers : (baseInfo?.operationalLayers || []);
        // Avoid over-aggressive normalization collisions (e.g., MS_1763 vs MS_3722)
        const normalizeId = (s?: string) => (s || '').replace(/([A-Za-z]+)_([0-9]{3,})$/, '$1_$2');
        const stripTrailingIndex = (s?: string) => (s || '').replace(/_\d+$/, '');
        const sourceLayers: Array<{ id: string; title: string; visible: boolean }> = fullOpsA.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
        try {
          console.info('[SwipeConverter][TWO_LAYERS] sourceLayers', sourceLayers.map(l => ({ id: l.id, title: l.title, vis: l.visible })));
        } catch { /* ignore */ }
        if (contentA && contentB) {
          // Build match sets from classic-listed layers (raw + normalized variants)
          const hiddenLeftSet = new Set<string>();
          const shownRightSet = new Set<string>();
          for (const cl of classicLayers) {
            const rawId = (cl.id || '').trim();
            const rawTitle = (cl.title || cl.id || '').trim();
            hiddenLeftSet.add(rawId);
            hiddenLeftSet.add(rawTitle);
            shownRightSet.add(rawId);
            shownRightSet.add(rawTitle);
          }
          // Compute left/right layers via pure mapping (no in-place mutation)
          let leftLayers: Array<{ id: string; title: string; visible: boolean }> = sourceLayers.map(l => {
            const rawId = (l.id || '').trim();
            const rawTitle = (l.title || '').trim();
            const shouldHide = hiddenLeftSet.has(rawId) || hiddenLeftSet.has(rawTitle);
            return { id: l.id, title: l.title, visible: shouldHide ? false : l.visible };
          });
          let rightLayers: Array<{ id: string; title: string; visible: boolean }> = sourceLayers.map(l => {
            const rawId = (l.id || '').trim();
            const rawTitle = (l.title || '').trim();
            const shouldShow = shownRightSet.has(rawId) || shownRightSet.has(rawTitle);
            return { id: l.id, title: l.title, visible: shouldShow ? true : l.visible };
          });
          // Add any classic-listed layers not present in source
          for (const cl of classicLayers) {
            const clIdRaw = (cl.id || '').trim();
            const clTitleRaw = (cl.title || cl.id || '').trim();
            const existsInSource = sourceLayers.some(x => {
              const xid = (x.id || '').trim();
              const xtitle = (x.title || '').trim();
              return xid === clIdRaw || xtitle === clTitleRaw;
            });
            if (!existsInSource) {
              leftLayers = [{ id: cl.id, title: cl.title || cl.id, visible: false }, ...leftLayers];
              rightLayers = [{ id: cl.id, title: cl.title || cl.id, visible: true }, ...rightLayers];
            }
          }
          try {
            const leftSnapshot = leftLayers.map(l => ({ id: l.id, title: l.title, vis: l.visible }));
            const rightSnapshot = rightLayers.map(l => ({ id: l.id, title: l.title, vis: l.visible }));
            console.info('[SwipeConverter][TWO_LAYERS] leftLayers after toggles', leftSnapshot);
            console.info('[SwipeConverter][TWO_LAYERS] rightLayers after toggles', rightSnapshot);
          } catch { /* ignore */ }
          // Single classic layer case already handled by loop
          this.builder.updateNodeData(contentA, (data) => {
            (data as Record<string, unknown>).mapLayers = leftLayers;
            if ((initialState as any).extent) (data as any).extent = (initialState as any).extent;
            if ((initialState as any).viewpoint) (data as any).viewpoint = (initialState as any).viewpoint;
          });
          this.builder.updateNodeData(contentB, (data) => {
            (data as Record<string, unknown>).mapLayers = rightLayers;
            if ((initialState as any).extent) (data as any).extent = (initialState as any).extent;
            if ((initialState as any).viewpoint) (data as any).viewpoint = (initialState as any).viewpoint;
          });
          // Also mirror mapLayers into resource initialState to ensure enrichment
          if (resA) this.builder.updateWebMapInitialState(resA, { mapLayers: leftLayers } as any);
          if (resB) this.builder.updateWebMapInitialState(resB, { mapLayers: rightLayers } as any);
          // Visibility already applied to leftLayers/rightLayers before node creation; avoid further mapLayers mutations.

          // Derive caption: last visible wins on each side; left falls back to basemap
          const pickLastVisibleTitle = (layers: Array<{ title: string; visible: boolean }>): string | undefined => {
            for (let i = layers.length - 1; i >= 0; i--) {
              if (layers[i].visible) return layers[i].title;
            }
            return undefined;
          };
          let leftLabel = pickLastVisibleTitle(leftLayers.map(l => ({ title: l.title, visible: l.visible })));
          const rightLabel = pickLastVisibleTitle(rightLayers.map(l => ({ title: l.title, visible: l.visible })));
          if (!leftLabel && Array.isArray((baseData as any)?.baseMap?.baseMapLayers)) {
            const bml = ((baseData as any).baseMap.baseMapLayers as Array<{ title?: string; visibility?: boolean }>);
            for (let i = bml.length - 1; i >= 0; i--) {
              if (bml[i].visibility) { leftLabel = bml[i].title || leftLabel; break; }
            }
          }
          derivedCaption = (leftLabel && rightLabel) ? `Left: ${leftLabel} — Right: ${rightLabel}` : undefined;
        }
      }
    }

    // Extent/viewpoint placement: extent for swipe, center for spyglass
    const viewPlacement = this.layout === 'spyglass' ? 'extent' : 'extent';
    if (contentA && contentB && !swipeIdCreated) {
      const swipeId = this.builder.createSwipeNode(contentA, contentB, viewPlacement, derivedCaption);
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

    // Converter metadata (derive classicType from detectTemplate and include template version)
    const classicType = detectClassicTemplate(this.classicJson);
    const vAny = v as unknown as { templateCreation?: string; templateLastEdit?: string };
    const templateVersion = ((this.classicJson as unknown as { version?: string }).version
      || (v as unknown as { version?: string }).version
      || (v as unknown as { templateVersion?: string }).templateVersion);
    const templateCreation = vAny.templateCreation;
    const templateLastEdit = vAny.templateLastEdit;
    this.builder.addConverterMetadata(classicType || 'Swipe', {
      classicMetadata: { classicTheme: { layout: this.layout, model: this.model }, templateVersion },
      classicTemplateCreation: templateCreation,
      classicTemplateLastEdit: templateLastEdit
    } as any);
    this.emit('Built swipe block');
  }

  // Minimal sanitizer for sidePanelDescription: allow <strong>/<b>, <em>/<i>, and <a href>.
  // Strip inline styles and other attributes/tags; collect inline styles strings for metadata.
  private sanitizeSidePanelHtml(html: string): { sanitizedHtml: string; inlineStyles: string[] } {
  // Sanitizer moved to shared utility in utils/htmlSanitizer.ts
  }


  protected applyTheme(): void {
    try {
      const { themeId, variableOverrides } = computeTheme(this.themeId as any, this.classicJson);
      this.builder.applyTheme({ themeId, variableOverrides });
      this.emit('Applied theme from classic settings');
    } catch {
      // no-op; keep existing theme
    }
  }

  protected collectMedia(): string[] {
    return [];
  }

  protected getStoryMapJson(): StoryMapJSON {
    return this.builder.getJson();
  }

  static async convert(opts: BaseConverterOptions): Promise<ConverterResult> {
    const conv = new SwipeConverter(opts);
    return conv.convert();
  }

  // Inline swipe block builder for embedding into other converters
  static async buildInlineSwipeBlock(
    builder: StoryMapJSONBuilder,
    values: ClassicValues,
    layout: SwipeLayout = 'swipe',
    token?: string
  ): string {
    // Path identification for diagnostics
    builder.addConverterMetadata('Swipe', { path: 'buildInlineSwipeBlock' } as any);
    // Also emit via a synthetic converter instance if possible
    try { (builder as any).emit?.('SwipeConverter.buildInlineSwipeBlock used'); } catch { /* ignore */ }
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
      const isBrowser = typeof window !== 'undefined';
      const infoA = wmA ? (isBrowser ? await SwipeConverter.fetchWebMapInfo(wmA, token) : SwipeConverter.fetchWebMapInfoSync(wmA, token)) : undefined;
      const infoB = wmB ? (isBrowser ? await SwipeConverter.fetchWebMapInfo(wmB, token) : SwipeConverter.fetchWebMapInfoSync(wmB, token)) : undefined;
      if (infoA?.extent) {
        (initialA as { extent?: unknown }).extent = infoA.extent;
        const sz = determineScaleZoomLevel(infoA.extent as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialA as { viewpoint?: unknown }).viewpoint = { targetGeometry: infoA.center ?? infoA.extent, scale: sz.scale };
        }
      }
      if (Array.isArray(infoA?.operationalLayers)) {
        (initialA as { mapLayers?: Array<{ id: string; title: string; visible: boolean }> }).mapLayers = infoA!.operationalLayers!.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
      }
      if (infoB?.extent) {
        (initialB as { extent?: unknown }).extent = infoB.extent;
        const sz = determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialB as { viewpoint?: unknown }).viewpoint = { targetGeometry: infoB.center ?? infoB.extent, scale: sz.scale };
        }
      }
      if (Array.isArray(infoB?.operationalLayers)) {
        (initialB as { mapLayers?: Array<{ id: string; title: string; visible: boolean }> }).mapLayers = infoB!.operationalLayers!.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
      }
      const resA = wmA ? builder.addWebMapResource(wmA, 'Web Map', initialA as any, 'default') : undefined;
      const resB = wmB ? builder.addWebMapResource(wmB, 'Web Map', initialB as any, 'default') : undefined;
      if (resA && initialA) builder.updateWebMapInitialState(resA, initialA as any);
      if (resB && initialB) builder.updateWebMapInitialState(resB, initialB as any);
      if (resA) {
        const useExtentA = infoA?.extent || infoB?.extent;
        const szA = useExtentA ? determineScaleZoomLevel(useExtentA as unknown as { ymax: number; ymin: number }) : undefined;
        // Force center from right resource (infoB) for both resources
        const centerFromB = (infoB?.center || (infoB?.extent ? { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } } : undefined));
        const centerA = centerFromB;
        // Log for diagnostics (avoid using instance emit in static method)
        // Quiet noisy debug in CLI/Netlify to avoid contaminating JSON output
        // try { console.debug(`SwipeConverter.merge resA data: extent=${useExtentA ? 'yes' : 'no'} center=${centerA ? 'yes' : 'no'} zoom=${szA?.zoom ?? 'n/a'}`); } catch (e) { /* ignore */ }
        builder.updateWebMapData(resA, {
          extent: useExtentA,
          center: centerA,
          zoom: szA?.zoom,
          viewpoint: (initialA as any).viewpoint,
          mapLayers: (initialA as any).mapLayers ?? [],
          itemId: wmA,
          itemType: 'Web Map',
          type: 'default',
        } as any);
      }
      if (resB) {
        const szB = infoB?.extent ? determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number }) : undefined;
        const centerFromB = (infoB?.center || (infoB?.extent ? { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } } : undefined));
        const centerB = centerFromB;
        // try { console.debug(`SwipeConverter.merge resB data: extent=${infoB?.extent ? 'yes' : 'no'} center=${centerB ? 'yes' : 'no'} zoom=${szB?.zoom ?? 'n/a'}`); } catch (e) { /* ignore */ }
        builder.updateWebMapData(resB, {
          extent: infoB?.extent,
          center: centerB,
          zoom: szB?.zoom,
          viewpoint: (initialB as any).viewpoint,
          mapLayers: (initialB as any).mapLayers ?? [],
          itemId: wmB,
          itemType: 'Web Map',
          type: 'default',
        } as any);
      }
      if (resA) contentA = builder.createWebMapNode(resA, undefined);
      if (resB) contentB = builder.createWebMapNode(resB, undefined);
      // Ensure resA has center/extent persisted after node creation (guard against merges dropping center)
      if (resA) {
        const useExtentA2 = infoA?.extent || infoB?.extent;
        const centerFromB2 = (infoB?.center || (infoB?.extent ? { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } } : undefined));
        const centerA2 = centerFromB2;
        // try { console.debug(`SwipeConverter.finalize resA data: extent=${useExtentA2 ? 'yes' : 'no'} center=${centerA2 ? 'yes' : 'no'}`); } catch (e) { /* ignore */ }
        builder.updateWebMapData(resA, { extent: useExtentA2, center: centerA2 } as any);
      }
      if (contentA && (infoB?.extent || infoA?.extent)) builder.updateNodeData(contentA, (data) => {
        const useExtent = (infoB?.extent || infoA?.extent);
        (data as Record<string, unknown>).extent = useExtent;
        const sz = determineScaleZoomLevel((useExtent as unknown as { ymax: number; ymin: number }));
        // Force left node viewpoint to use right center (or its midpoint)
        const rightCenter = infoB?.center || (infoB?.extent ? { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } } : undefined);
        const vpGeom = rightCenter ?? useExtent;
        if (sz) (data as Record<string, unknown>).viewpoint = { targetGeometry: vpGeom, scale: sz.scale };
        const hasTime = Array.isArray(infoA.operationalLayers) && infoA.operationalLayers.some(l => (l as any).timeAnimation === true);
        (data as Record<string, unknown>).timeSlider = !!hasTime;
        if (Array.isArray(infoA.operationalLayers) && infoA.operationalLayers.length) {
          // Prefer layer visibility from webmap (resource), unless classic overrides elsewhere
          (data as Record<string, unknown>).mapLayers = infoA.operationalLayers.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
          (data as Record<string, unknown>).viewPlacement = 'extent';
        }
      });
      if (contentB && infoB?.extent) builder.updateNodeData(contentB, (data) => {
        (data as Record<string, unknown>).extent = infoB.extent;
        const sz = determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number });
        const centerB = infoB.center || { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } };
        if (sz) (data as Record<string, unknown>).viewpoint = { targetGeometry: centerB ?? infoB.extent, scale: sz.scale };
        const hasTime = Array.isArray(infoB.operationalLayers) && infoB.operationalLayers.some(l => (l as any).timeAnimation === true);
        (data as Record<string, unknown>).timeSlider = !!hasTime;
        if (Array.isArray(infoB.operationalLayers) && infoB.operationalLayers.length) {
          // Prefer layer visibility from webmap (resource), unless classic overrides elsewhere
          (data as Record<string, unknown>).mapLayers = infoB.operationalLayers.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
          (data as Record<string, unknown>).viewPlacement = 'extent';
        }
      });
    } else {
      const baseId = String(values.webmap || '');
      try {
        const rawLayersLog = Array.isArray(values.layers) ? values.layers : [];
        console.info('[SwipeConverter] classic values.layers (inline)', rawLayersLog);
      } catch { /* ignore log errors */ }
      // Attempt enrichment from base webmap (collect extent + operational layer visibilities)
      const baseInfo = baseId ? SwipeConverter.fetchWebMapInfoSync(baseId, token) : undefined;
      const dataUrl = baseId ? `https://www.arcgis.com/sharing/rest/content/items/${baseId}/data?f=json` : undefined;
      const fullData = dataUrl ? await fetchJsonWithCache<any>(token ? `${dataUrl}&token=${encodeURIComponent(token)}` : dataUrl, undefined, 10 * 60 * 1000).catch(() => undefined) : undefined;
      const initialBase: Record<string, unknown> = {};
      const extentFromData2 = (fullData?.initialState?.view?.extent) || (fullData?.mapOptions?.extent) || (fullData?.extent) || (fullData?.mapOptions?.mapExtent);
      const centerFromData2 = (fullData?.initialState?.view?.center) || (fullData?.mapOptions?.center) || (fullData?.center);
      const useExtent2 = baseInfo?.extent || extentFromData2;
      const useCenter2 = baseInfo?.center || centerFromData2;
      if (useExtent2) {
        (initialBase as { extent?: unknown }).extent = useExtent2;
        const sz = determineScaleZoomLevel(useExtent2 as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialBase as { viewpoint?: unknown }).viewpoint = { targetGeometry: useCenter2 ?? useExtent2, scale: sz.scale };
          (initialBase as { zoom?: number }).zoom = sz.zoom;
        }
      }
      const resA = baseId ? builder.addWebMapResource(baseId, 'Web Map', initialBase as any, 'default') : undefined;
      const resB = baseId ? builder.addWebMapResource(baseId, 'Web Map', initialBase as any, 'default') : undefined;
      if (resA && initialBase) builder.updateWebMapInitialState(resA, initialBase as any);
      if (resB && initialBase) builder.updateWebMapInitialState(resB, initialBase as any);
      // Persist full webmap data into both resources
      if (fullData && resA) builder.updateWebMapData(resA, { ...(fullData as any), itemId: baseId, itemType: 'Web Map', type: 'default' } as any);
      if (fullData && resB) builder.updateWebMapData(resB, { ...(fullData as any), itemId: baseId, itemType: 'Web Map', type: 'default' } as any);
      // Ensure extent/center/viewpoint/zoom preserved on resources
      if (resA) builder.updateWebMapData(resA, { extent: (initialBase as any).extent, center: baseInfo?.center, viewpoint: (initialBase as any).viewpoint, zoom: (initialBase as any).zoom } as any);
      if (resB) builder.updateWebMapData(resB, { extent: (initialBase as any).extent, center: baseInfo?.center, viewpoint: (initialBase as any).viewpoint, zoom: (initialBase as any).zoom } as any);
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
        try {
          console.info('[SwipeConverter] parsed classicLayers (inline)', classicLayers);
        } catch { /* ignore log errors */ }
        // Prefer full webmap data for layer list; fallback to baseInfo
        const fullOps: Array<{ id: string; title?: string; visibility?: boolean }> = Array.isArray((fullData as any)?.operationalLayers) ? (fullData as any).operationalLayers : (baseInfo?.operationalLayers || []);
        const normalizeId = (s?: string) => (s || '').replace(/_\d+$/, '');
        const sourceLayers: Array<{ id: string; title: string; visible: boolean }> = fullOps.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
        try {
          console.info('[SwipeConverter][INLINE TWO_LAYERS] sourceLayers', sourceLayers.map(l => ({ id: l.id, title: l.title, vis: l.visible })));
        } catch { /* ignore */ }
        // Build match sets
        const hiddenLeftSet = new Set<string>();
        const shownRightSet = new Set<string>();
        for (const cl of classicLayers) {
          hiddenLeftSet.add(normalizeId(cl.id));
          hiddenLeftSet.add(normalizeId(cl.title || cl.id));
          shownRightSet.add(normalizeId(cl.id));
          shownRightSet.add(normalizeId(cl.title || cl.id));
        }
        // Pure mapping
        let leftLayers: Array<{ id: string; title: string; visible: boolean }> = sourceLayers.map(l => {
          const keyId = normalizeId(l.id);
          const keyTitle = normalizeId(l.title);
          const shouldHide = hiddenLeftSet.has(keyId) || hiddenLeftSet.has(keyTitle);
          return { id: l.id, title: l.title, visible: shouldHide ? false : l.visible };
        });
        let rightLayers: Array<{ id: string; title: string; visible: boolean }> = sourceLayers.map(l => {
          const keyId = normalizeId(l.id);
          const keyTitle = normalizeId(l.title);
          const shouldShow = shownRightSet.has(keyId) || shownRightSet.has(keyTitle);
          return { id: l.id, title: l.title, visible: shouldShow ? true : l.visible };
        });
        for (const cl of classicLayers) {
          const clIdNorm = normalizeId(cl.id);
          const clTitleNorm = normalizeId(cl.title || cl.id);
          const existsInSource = sourceLayers.some(x => normalizeId(x.id) === clIdNorm || normalizeId(x.title) === clTitleNorm);
          if (!existsInSource) {
            leftLayers = [{ id: cl.id, title: cl.title || cl.id, visible: false }, ...leftLayers];
            rightLayers = [{ id: cl.id, title: cl.title || cl.id, visible: true }, ...rightLayers];
          }
        }
        try {
          const leftSnapshot = leftLayers.map(l => ({ id: l.id, title: l.title, vis: l.visible }));
          const rightSnapshot = rightLayers.map(l => ({ id: l.id, title: l.title, vis: l.visible }));
          console.info('[SwipeConverter][INLINE TWO_LAYERS] leftLayers after toggles', leftSnapshot);
          console.info('[SwipeConverter][INLINE TWO_LAYERS] rightLayers after toggles', rightSnapshot);
        } catch { /* ignore */ }
        builder.updateNodeData(contentA, (data) => {
          (data as Record<string, unknown>).mapLayers = leftLayers;
          if ((initialBase as any).extent) (data as any).extent = (initialBase as any).extent;
          if ((initialBase as any).viewpoint) (data as any).viewpoint = (initialBase as any).viewpoint;
        });
        builder.updateNodeData(contentB, (data) => {
          (data as Record<string, unknown>).mapLayers = rightLayers;
          if ((initialBase as any).extent) (data as any).extent = (initialBase as any).extent;
          if ((initialBase as any).viewpoint) (data as any).viewpoint = (initialBase as any).viewpoint;
        });
      }
    }
    const viewPlacement = layout === 'spyglass' ? 'extent' : 'extent';
    if (!contentA || !contentB) throw new Error('SwipeConverter.buildInlineSwipeBlock: missing content nodes');
    return builder.createSwipeNode(contentA, contentB, viewPlacement);
  }

  // Synchronous wrapper for inline swipe block (Node-only contexts)
  static buildInlineSwipeBlockSync(
    builder: StoryMapJSONBuilder,
    values: ClassicValues,
    layout: SwipeLayout = 'swipe',
    token?: string
  ): string {
    // Node contexts only; avoid browser-only async fetches
    try { builder.addConverterMetadata('Swipe', { path: 'buildInlineSwipeBlockSync' } as any); } catch { /* ignore */ }
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
      const infoA = wmA ? SwipeConverter.fetchWebMapInfoSync(wmA, token) : undefined;
      const infoB = wmB ? SwipeConverter.fetchWebMapInfoSync(wmB, token) : undefined;
      if (infoA?.extent) {
        (initialA as { extent?: unknown }).extent = infoA.extent;
        const sz = determineScaleZoomLevel(infoA.extent as unknown as { ymax: number; ymin: number });
        if (sz) (initialA as { viewpoint?: unknown }).viewpoint = { targetGeometry: infoA.center ?? infoA.extent, scale: sz.scale };
      }
      if (Array.isArray(infoA?.operationalLayers)) {
        (initialA as { mapLayers?: Array<{ id: string; title: string; visible: boolean }> }).mapLayers = infoA!.operationalLayers!.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
      }
      if (infoB?.extent) {
        (initialB as { extent?: unknown }).extent = infoB.extent;
        const sz = determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number });
        if (sz) (initialB as { viewpoint?: unknown }).viewpoint = { targetGeometry: infoB.center ?? infoB.extent, scale: sz.scale };
      }
      if (Array.isArray(infoB?.operationalLayers)) {
        (initialB as { mapLayers?: Array<{ id: string; title: string; visible: boolean }> }).mapLayers = infoB!.operationalLayers!.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
      }
      const resA = wmA ? builder.addWebMapResource(wmA, 'Web Map', initialA as any, 'default') : undefined;
      const resB = wmB ? builder.addWebMapResource(wmB, 'Web Map', initialB as any, 'default') : undefined;
      if (resA && initialA) builder.updateWebMapInitialState(resA, initialA as any);
      if (resB && initialB) builder.updateWebMapInitialState(resB, initialB as any);
      if (resA) {
        const useExtentA = infoA?.extent || infoB?.extent;
        const szA = useExtentA ? determineScaleZoomLevel(useExtentA as unknown as { ymax: number; ymin: number }) : undefined;
        const centerFromB = (infoB?.center || (infoB?.extent ? { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } } : undefined));
        builder.updateWebMapData(resA, { extent: useExtentA, center: centerFromB, zoom: szA?.zoom, viewpoint: (initialA as any).viewpoint, mapLayers: (initialA as any).mapLayers ?? [], itemId: wmA, itemType: 'Web Map', type: 'default' } as any);
      }
      if (resB) {
        const szB = infoB?.extent ? determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number }) : undefined;
        const centerFromB = (infoB?.center || (infoB?.extent ? { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } } : undefined));
        builder.updateWebMapData(resB, { extent: infoB?.extent, center: centerFromB, zoom: szB?.zoom, viewpoint: (initialB as any).viewpoint, mapLayers: (initialB as any).mapLayers ?? [], itemId: wmB, itemType: 'Web Map', type: 'default' } as any);
      }
      if (resA) contentA = builder.createWebMapNode(resA, undefined);
      if (resB) contentB = builder.createWebMapNode(resB, undefined);
      if (resA) {
        const useExtentA2 = infoA?.extent || infoB?.extent;
        const centerFromB2 = (infoB?.center || (infoB?.extent ? { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } } : undefined));
        builder.updateWebMapData(resA, { extent: useExtentA2, center: centerFromB2 } as any);
      }
      if (contentA && (infoB?.extent || infoA?.extent)) builder.updateNodeData(contentA, (data) => {
        const useExtent = (infoB?.extent || infoA?.extent);
        (data as Record<string, unknown>).extent = useExtent;
        const sz = determineScaleZoomLevel((useExtent as unknown as { ymax: number; ymin: number }));
        const rightCenter = infoB?.center || (infoB?.extent ? { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } } : undefined);
        const vpGeom = rightCenter ?? useExtent;
        if (sz) (data as Record<string, unknown>).viewpoint = { targetGeometry: vpGeom, scale: sz.scale };
        const hasTime = Array.isArray(infoA?.operationalLayers) && infoA!.operationalLayers!.some(l => (l as any).timeAnimation === true);
        (data as Record<string, unknown>).timeSlider = !!hasTime;
        if (Array.isArray(infoA?.operationalLayers) && infoA!.operationalLayers!.length) {
          (data as Record<string, unknown>).mapLayers = infoA!.operationalLayers!.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
          (data as Record<string, unknown>).viewPlacement = 'extent';
        }
      });
      if (contentB && infoB?.extent) builder.updateNodeData(contentB, (data) => {
        (data as Record<string, unknown>).extent = infoB.extent as any;
        const sz = determineScaleZoomLevel(infoB.extent as unknown as { ymax: number; ymin: number });
        const centerB = infoB.center || { x: ((infoB.extent as any).xmin + (infoB.extent as any).xmax) / 2, y: ((infoB.extent as any).ymin + (infoB.extent as any).ymax) / 2, spatialReference: (infoB.extent as any).spatialReference || { wkid: 102100 } };
        if (sz) (data as Record<string, unknown>).viewpoint = { targetGeometry: centerB ?? (infoB.extent as any), scale: sz.scale };
        const hasTime = Array.isArray(infoB.operationalLayers) && infoB.operationalLayers!.some(l => (l as any).timeAnimation === true);
        (data as Record<string, unknown>).timeSlider = !!hasTime;
        if (Array.isArray(infoB.operationalLayers) && infoB.operationalLayers!.length) {
          (data as Record<string, unknown>).mapLayers = infoB.operationalLayers!.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
          (data as Record<string, unknown>).viewPlacement = 'extent';
        }
      });
    } else {
      const baseId = String(values.webmap || '');
      const baseInfo = baseId ? SwipeConverter.fetchWebMapInfoSync(baseId, token) : undefined;
      const initialBase: Record<string, unknown> = {};
      const useExtent2 = baseInfo?.extent;
      const useCenter2 = baseInfo?.center;
      if (useExtent2) {
        (initialBase as { extent?: unknown }).extent = useExtent2;
        const sz = determineScaleZoomLevel(useExtent2 as unknown as { ymax: number; ymin: number });
        if (sz) {
          (initialBase as { viewpoint?: unknown }).viewpoint = { targetGeometry: useCenter2 ?? useExtent2, scale: sz.scale };
          (initialBase as { zoom?: number }).zoom = sz.zoom;
        }
      }
      const resA = baseId ? builder.addWebMapResource(baseId, 'Web Map', initialBase as any, 'default') : undefined;
      const resB = baseId ? builder.addWebMapResource(baseId, 'Web Map', initialBase as any, 'default') : undefined;
      if (resA && initialBase) builder.updateWebMapInitialState(resA, initialBase as any);
      if (resB && initialBase) builder.updateWebMapInitialState(resB, initialBase as any);
      if (resA) builder.updateWebMapData(resA, { extent: (initialBase as any).extent, center: baseInfo?.center, viewpoint: (initialBase as any).viewpoint, zoom: (initialBase as any).zoom, itemId: baseId, itemType: 'Web Map', type: 'default' } as any);
      if (resB) builder.updateWebMapData(resB, { extent: (initialBase as any).extent, center: baseInfo?.center, viewpoint: (initialBase as any).viewpoint, zoom: (initialBase as any).zoom, itemId: baseId, itemType: 'Web Map', type: 'default' } as any);
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
        const sourceLayers: Array<{ id: string; title: string; visible: boolean }> = Array.isArray(baseInfo?.operationalLayers) ? baseInfo!.operationalLayers!.map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility })) : [];
        const hiddenLeftSet = new Set<string>();
        const shownRightSet = new Set<string>();
        const normalizeId = (s?: string) => (s || '').replace(/_\d+$/, '');
        for (const cl of classicLayers) {
          hiddenLeftSet.add(normalizeId(cl.id));
          hiddenLeftSet.add(normalizeId(cl.title || cl.id));
          shownRightSet.add(normalizeId(cl.id));
          shownRightSet.add(normalizeId(cl.title || cl.id));
        }
        const leftLayers: Array<{ id: string; title: string; visible: boolean }> = sourceLayers.map(l => {
          const keyId = normalizeId(l.id);
          const keyTitle = normalizeId(l.title);
          const shouldHide = hiddenLeftSet.has(keyId) || hiddenLeftSet.has(keyTitle);
          return { id: l.id, title: l.title, visible: shouldHide ? false : l.visible };
        });
        const rightLayers: Array<{ id: string; title: string; visible: boolean }> = sourceLayers.map(l => {
          const keyId = normalizeId(l.id);
          const keyTitle = normalizeId(l.title);
          const shouldShow = shownRightSet.has(keyId) || shownRightSet.has(keyTitle);
          return { id: l.id, title: l.title, visible: shouldShow ? true : l.visible };
        });
        builder.updateNodeData(contentA, (data) => {
          (data as Record<string, unknown>).mapLayers = leftLayers;
          if ((initialBase as any).extent) (data as any).extent = (initialBase as any).extent;
          if ((initialBase as any).viewpoint) (data as any).viewpoint = (initialBase as any).viewpoint;
        });
        builder.updateNodeData(contentB, (data) => {
          (data as Record<string, unknown>).mapLayers = rightLayers;
          if ((initialBase as any).extent) (data as any).extent = (initialBase as any).extent;
          if ((initialBase as any).viewpoint) (data as any).viewpoint = (initialBase as any).viewpoint;
        });
      }
    }
    const viewPlacement = layout === 'spyglass' ? 'extent' : 'extent';
    if (!contentA || !contentB) throw new Error('SwipeConverter.buildInlineSwipeBlockSync: missing content nodes');
    return builder.createSwipeNode(contentA, contentB, viewPlacement);
  }

  // Browser-safe synchronous inline swipe builder that avoids any network or Node APIs.
  // Relies solely on provided classic values to construct swipe content nodes.
  static buildInlineSwipeBlockBrowserSync(
    builder: StoryMapJSONBuilder,
    values: ClassicValues,
    layout: SwipeLayout = 'swipe',
    token?: string
  ): string {
    try { builder.addConverterMetadata('Swipe', { path: 'buildInlineSwipeBlockBrowserSync' } as any); } catch { /* ignore */ }
    const dm = String(values.dataModel || '').toUpperCase() as SwipeModel;
    let contentA: string | undefined;
    let contentB: string | undefined;
    const fetchInfoSync = (itemId: string): { extent?: ClassicExtent; center?: { x: number; y: number; spatialReference: { wkid: number } }; zoom?: number; viewpoint?: { targetGeometry?: unknown; scale?: number } } | undefined => {
      try {
        if (typeof window === 'undefined') return undefined;
        const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json${token ? `&token=${encodeURIComponent(token)}` : ''}`;
        const xhr = new XMLHttpRequest();
        xhr.open('GET', base, false);
        xhr.send(null);
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
          const data = JSON.parse(xhr.responseText);
          const pickExtent = (d: any): any => d?.initialState?.view?.extent || d?.mapOptions?.extent || d?.extent || d?.mapOptions?.mapExtent || undefined;
          const pickCenter = (d: any): any => d?.initialState?.view?.center || d?.mapOptions?.center || d?.center || undefined;
          const extent = pickExtent(data);
          const center = pickCenter(data);
          let viewpoint: { targetGeometry?: unknown; scale?: number } | undefined;
          let zoom: number | undefined;
          if (extent) {
            const sz = determineScaleZoomLevel(extent as unknown as { ymax: number; ymin: number });
            if (sz) { viewpoint = { targetGeometry: center ?? extent, scale: sz.scale }; zoom = sz.zoom; }
          }
          return { extent, center, zoom, viewpoint } as any;
        }
      } catch { /* ignore */ }
      return undefined;
    };
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
      // Create resources and enrich with synchronous browser fetch when possible
      const infoA = wmA ? fetchInfoSync(wmA) : undefined;
      const infoB = wmB ? fetchInfoSync(wmB) : undefined;
      const resA = wmA ? builder.addWebMapResource(wmA, 'Web Map', (infoA ? { extent: infoA.extent, center: infoA.center, viewpoint: infoA.viewpoint, zoom: infoA.zoom, itemId: wmA, itemType: 'Web Map', type: 'default' } : {} as any), 'default') : undefined;
      const resB = wmB ? builder.addWebMapResource(wmB, 'Web Map', (infoB ? { extent: infoB.extent, center: infoB.center, viewpoint: infoB.viewpoint, zoom: infoB.zoom, itemId: wmB, itemType: 'Web Map', type: 'default' } : {} as any), 'default') : undefined;
      if (resA && infoA) builder.updateWebMapData(resA, { extent: infoA.extent, center: infoA.center, viewpoint: infoA.viewpoint, zoom: infoA.zoom, itemId: wmA, itemType: 'Web Map', type: 'default' } as any);
      if (resB && infoB) builder.updateWebMapData(resB, { extent: infoB.extent, center: infoB.center, viewpoint: infoB.viewpoint, zoom: infoB.zoom, itemId: wmB, itemType: 'Web Map', type: 'default' } as any);
      if (resA) contentA = builder.createWebMapNode(resA, undefined);
      if (resB) contentB = builder.createWebMapNode(resB, undefined);
      // Initialize node-level alignment from RIGHT webmap when available
      const initFromRight = (nodeId?: string) => {
        if (!nodeId || !infoB) return;
        builder.updateNodeData(nodeId, (data) => {
          const hasExtent = !!(data as any).extent;
          const hasVp = !!(data as any).viewpoint;
          if (!hasExtent && infoB.extent) (data as Record<string, unknown>).extent = infoB.extent as unknown as Record<string, unknown>;
          if (!hasVp && infoB.viewpoint) (data as Record<string, unknown>).viewpoint = infoB.viewpoint as unknown as Record<string, unknown>;
          if (!(data as any).viewPlacement) (data as Record<string, unknown>).viewPlacement = 'extent' as unknown as Record<string, unknown>;
        });
      };
      initFromRight(contentA);
      initFromRight(contentB);
    } else {
      const baseId = String(values.webmap || '');
      const info = baseId ? fetchInfoSync(baseId) : undefined;
      const resA = baseId ? builder.addWebMapResource(baseId, 'Web Map', (info ? { extent: info.extent, center: info.center, viewpoint: info.viewpoint, zoom: info.zoom, itemId: baseId, itemType: 'Web Map', type: 'default' } : {} as any), 'default') : undefined;
      const resB = baseId ? builder.addWebMapResource(baseId, 'Web Map', (info ? { extent: info.extent, center: info.center, viewpoint: info.viewpoint, zoom: info.zoom, itemId: baseId, itemType: 'Web Map', type: 'default' } : {} as any), 'default') : undefined;
      if (resA && info) builder.updateWebMapData(resA, { extent: info.extent, center: info.center, viewpoint: info.viewpoint, zoom: info.zoom, itemId: baseId, itemType: 'Web Map', type: 'default' } as any);
      if (resB && info) builder.updateWebMapData(resB, { extent: info.extent, center: info.center, viewpoint: info.viewpoint, zoom: info.zoom, itemId: baseId, itemType: 'Web Map', type: 'default' } as any);
      if (resA && resB) {
        contentA = builder.createWebMapNode(resA, undefined);
        contentB = builder.createWebMapNode(resB, undefined);
        const rawLayers = Array.isArray(values.layers) ? values.layers : [];
        const classicLayers: Array<{ id: string; title?: string }> = rawLayers.map((entry: unknown) => {
          if (entry && typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
            const obj = entry as import('../types/classic').ClassicLayer;
            return { id: obj.id, title: obj.title || obj.id };
          }
          return { id: String(entry), title: String(entry) };
        }).filter(l => l.id);
        // Without source layer visibilities, apply a simple mapping: left hidden, right shown.
        const leftLayers = classicLayers.map(cl => ({ id: cl.id, title: cl.title || cl.id, visible: false }));
        const rightLayers = classicLayers.map(cl => ({ id: cl.id, title: cl.title || cl.id, visible: true }));
        builder.updateNodeData(contentA, (data) => { (data as Record<string, unknown>).mapLayers = leftLayers; });
        builder.updateNodeData(contentB, (data) => { (data as Record<string, unknown>).mapLayers = rightLayers; });
        // Initialize node-level alignment from base webmap info when available
        if (info) {
          const apply = (nodeId?: string) => {
            if (!nodeId) return;
            builder.updateNodeData(nodeId, (data) => {
              const hasExtent = !!(data as any).extent;
              const hasVp = !!(data as any).viewpoint;
              if (!hasExtent && info.extent) (data as Record<string, unknown>).extent = info.extent as unknown as Record<string, unknown>;
              if (!hasVp && info.viewpoint) (data as Record<string, unknown>).viewpoint = info.viewpoint as unknown as Record<string, unknown>;
              if (!(data as any).viewPlacement) (data as Record<string, unknown>).viewPlacement = 'extent' as unknown as Record<string, unknown>;
            });
          };
          apply(contentA);
          apply(contentB);
        }
      }
    }
    const viewPlacement = layout === 'spyglass' ? 'extent' : 'extent';
    if (!contentA || !contentB) throw new Error('SwipeConverter.buildInlineSwipeBlockBrowserSync: missing content nodes');
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

  static async fetchWebMapInfo(itemId: string, token?: string): Promise<{ extent?: ClassicExtent; center?: { x: number; y: number; spatialReference: { wkid: number } }; operationalLayers?: Array<{ id: string; title?: string; visibility?: boolean }> } | undefined> {
    try {
      const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
      const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
      const data = await fetchJsonWithCache<any>(url, undefined, 10 * 60 * 1000);
      const pickExtent = (d: any): any => d?.initialState?.view?.extent || d?.mapOptions?.extent || d?.extent || d?.mapOptions?.mapExtent || undefined;
      const pickCenter = (d: any): any => d?.initialState?.view?.center || d?.mapOptions?.center || d?.center || undefined;
      let extent = pickExtent(data);
      let center = pickCenter(data);
      if (!extent || (typeof extent !== 'object' && !Array.isArray(extent))) {
        const itemUrl = `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`;
        const item = await fetchJsonWithCache<any>(itemUrl, undefined, 10 * 60 * 1000);
        if (Array.isArray(item.extent) && item.extent.length === 2 && Array.isArray(item.extent[0]) && Array.isArray(item.extent[1])) {
          const [[xmin,ymin],[xmax,ymax]] = item.extent as [number[], number[]];
          extent = { xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } } as ClassicExtent;
        }
        if (!center && Array.isArray(item.center) && item.center.length >= 2) {
          const [lon, lat] = item.center;
          center = { x: lon, y: lat, spatialReference: { wkid: 4326 } };
        }
      }
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
      const operationalLayers = Array.isArray(data?.operationalLayers) ? data.operationalLayers.filter((l: any) => l && l.id).map((l: any) => ({ id: l.id, title: l.title, visibility: l.visibility })) : [];
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
