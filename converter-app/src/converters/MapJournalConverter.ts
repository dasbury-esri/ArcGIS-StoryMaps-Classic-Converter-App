import { detectClassicTemplate } from '../util/detectTemplate';
// In Node, Vite resolves node:child_process to a shim in browser. We guard usage.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
/**
 * MapJournalConverter
 *
 * Role:
 * - Implements Classic Map Journal → ArcGIS StoryMaps conversion.
 * - Translates classic sections, media, and web maps into StoryMap JSON nodes/resources.
 * - Reports progress via the provided callback and enriches metadata for downstream UI.
 *
 * Placement (src/converters/):
 * - Lives alongside other concrete converters to keep strategies modular.
 * - Consumed by `ConverterFactory` for selection/orchestration.
 */
import { BaseConverter } from './BaseConverter';
import { determineScaleZoomLevel } from '../util/scale';
import { fetchJsonWithCache } from '../utils/fetchCache';
import type { ClassicValues, ClassicSection } from '../types/classic';
import type { ConverterResult, StoryMapJSON } from '../types/core';
import { createThemeWithDecisions } from '../theme/themeMapper';
import { computeTheme } from '../util/classicTheme';
import { SwipeConverter } from './SwipeConverter';
import { execSync } from 'node:child_process';
import { StoryMapJSONBuilder } from '../schema/StoryMapJSONBuilder';
import type { BaseConverterOptions } from './BaseConverter';

export class MapJournalConverter extends BaseConverter {
  private builder: StoryMapJSONBuilder;
  private sections: ClassicSection[] = [];
  private imageResourceMap = new Map<string, string>();
  private media = new Set<string>();
  // Collected <style> blocks found in section HTML (not turned into narrative nodes)
  private styleBlocks: string[] = [];
  // Count of external provider video embeds (YouTube/Vimeo) converted
  private videoEmbedCount = 0;
  // Lightweight log collector for converter-metadata persistence
  private debugLogs: string[] = [];

  // Runtime flag to temporarily suppress converter-metadata resources
  private shouldSuppressMetadata(): boolean {
    // Safe cross-runtime check across browser/Node and UI toggle
    let flag = '';
    // Browser: Vite import.meta.env
    const meta: unknown = (typeof import.meta !== 'undefined') ? import.meta : undefined;
    const metaEnv = (meta as { env?: Record<string, unknown> } | undefined)?.env;
    if (metaEnv && typeof metaEnv.SUPPRESS_CONVERTER_METADATA !== 'undefined') {
      flag = String(metaEnv.SUPPRESS_CONVERTER_METADATA);
    }
    // Browser: UI toggle via globalThis
    if (!flag && typeof globalThis !== 'undefined') {
      const g = globalThis as unknown as { __SUPPRESS_CONVERTER_METADATA?: unknown };
      if (typeof g.__SUPPRESS_CONVERTER_METADATA !== 'undefined') {
        flag = String(g.__SUPPRESS_CONVERTER_METADATA);
      }
    }
    // Node: process.env
    if (!flag && typeof process !== 'undefined') {
      const pEnv = (process as unknown as { env?: Record<string, unknown> }).env;
      if (pEnv && typeof pEnv.SUPPRESS_CONVERTER_METADATA !== 'undefined') {
        flag = String(pEnv.SUPPRESS_CONVERTER_METADATA);
      }
    }
    return String(flag || '').toLowerCase() === 'true';
  }

  private logDebug(message: string, data?: unknown): void {
    try {
      const line = data ? `${message} ${JSON.stringify(data)}` : message;
      this.debugLogs.push(line);
      if (typeof console !== 'undefined' && console.debug) console.debug('[MapJournalConverter]', message, data ?? '');
    } catch { /* ignore */ }
  }

  private logWarn(message: string, data?: unknown): void {
    try {
      const line = data ? `${message} ${JSON.stringify(data)}` : message;
      this.debugLogs.push(line);
      if (typeof console !== 'undefined' && console.warn) console.warn('[MapJournalConverter]', message, data ?? '');
    } catch { /* ignore */ }
  }

  private flushDebugLogs(path: string): void {
    if (!this.debugLogs.length) return;
    try {
      if (!this.shouldSuppressMetadata()) {
        this.builder.addConverterMetadata('MapJournal', { path, classicMetadata: { logs: this.debugLogs.slice() } });
      }
      this.debugLogs.length = 0;
    } catch { /* ignore */ }
  }

  constructor(options: BaseConverterOptions) {
    super(options);
    this.builder = new StoryMapJSONBuilder(options.themeId);
  }

  protected extractStructure(): void {
    const values = this.classicJson.values as ClassicValues;
    const storySections = (values.story && Array.isArray(values.story.sections)) ? values.story.sections as ClassicSection[] : [];
    const topSections = Array.isArray(values.sections) ? values.sections as ClassicSection[] : [];
    // Prefer story.sections (Map Journal) else fallback to top-level sections
    this.sections = storySections.length ? storySections : topSections;
    this.emit(`Extracted ${this.sections.length} section(s)`);
  }

  protected convertContent(): void {
    // Pre-step: If a webmap ID is detected, trigger Map Notes → CSV conversion and persist the CSV layer
    try {
      const values = this.classicJson.values as ClassicValues;
      const webmapId: string | undefined = (values?.story?.map?.itemId) || (values?.map?.itemId) || (values?.webmap) || process.env.WEBMAP_ID;
      const token: string | undefined = this.token || process.env.ARCGIS_TOKEN;
      if (webmapId && token) {
        // Fetch webmap JSON and detect Map Notes layer before running conversion
        const fetchUrl = `https://www.arcgis.com/sharing/rest/content/items/${webmapId}/data?f=json&token=${encodeURIComponent(token)}`;
        // Use global fetch (Node 18+) instead of curl; run non-blocking to keep conversion resilient
        interface WebMapData { operationalLayers?: OperationalLayer[] }
        interface FeatureSet { features?: Feature[] }
        interface FeatureCollectionLayer { featureSet?: FeatureSet }
        interface FeatureCollection { layers?: FeatureCollectionLayer[] }
        interface OperationalLayer { layerType?: string; type?: string; title?: string; featureCollection?: FeatureCollection }
        interface Feature { symbol?: { type?: string } }
        fetch(fetchUrl)
          .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
          .then((data: WebMapData) => {
            const layers: OperationalLayer[] = Array.isArray(data?.operationalLayers) ? data.operationalLayers! : [];
            const hasMapNotes = layers.some((l: OperationalLayer) => {
              const type = String(l?.layerType || l?.type || '').toLowerCase();
              if (type === 'mapnotes') return true;
              const fc = l?.featureCollection;
              const feats: Feature[] = fc?.layers?.[0]?.featureSet?.features || [];
              const esriPMSFound = Array.isArray(feats) && feats.some((f: Feature) => String(f?.symbol?.type).toLowerCase() === 'esripms');
              const title = String(l?.title || '').toLowerCase();
              return !!fc && (esriPMSFound || title.includes('map notes'));
            });
            if (hasMapNotes) {
              this.emit(`Webmap ${webmapId} contains Map Notes. Converting to CSV and saving to webmap...`);
              const isBrowser = typeof window !== 'undefined';
              if (isBrowser) {
                // Call Netlify function to perform CSV conversion server-side
                const fnUrl = `/.netlify/functions/convert-mapnotes-to-csv`;
                fetch(fnUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ webmapId, token })
                })
                  .then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(t))))
                  .then(resp => {
                    if (resp.changed) {
                      this.emit('CSV item created and minimal layer appended via Netlify function.');
                    } else {
                      this.emit('Netlify function reported no changes (no Map Notes found).');
                    }
                  })
                  .catch(err => {
                    const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
                    this.emit(`CSV conversion function failed: ${msg}. Continuing conversion.`);
                  });
              } else {
                const scriptPath = path.resolve('converter-app/scripts/mapnotes-to-csv-item-and-add-to-webmap.ts');
                try {
                  execFileSync('npx', ['tsx', scriptPath], {
                    stdio: 'inherit',
                    env: { ...process.env, WEBMAP_ID: webmapId, ARCGIS_TOKEN: token }
                  });
                  this.emit('Map Notes → CSV conversion completed. Proceeding with content conversion.');
                } catch (err) {
                  const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
                  this.emit(`CSV conversion execution failed: ${msg}. Continuing conversion.`);
                }
              }
            } else {
              this.emit(`Webmap ${webmapId} has no Map Notes; skipping CSV conversion.`);
            }
          })
          .catch(() => {
            this.emit(`Failed to fetch webmap ${webmapId} for Map Notes detection; skipping CSV conversion.`);
          });
      }
    } catch (e: unknown) {
      const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
      this.emit(`Map Notes → CSV pre-step failed: ${msg}. Continuing conversion.`);
    }
    this.builder.createStoryRoot();
    const v = this.classicJson.values as ClassicValues;
    this.emit('Created story root node');
    this.builder.addCoverNode(v.title || 'Untitled Story', v.subtitle as string | undefined);
    this.builder.addNavigationHidden();
    this.builder.addCreditsNode();
    this.emit('Added cover/navigation/credits scaffold');
    // Inject metaSettings (title, description, optional cover image resource when available later)
    const metaDesc = (v.description || v.subtitle || '') + '';
    let coverImageRes: string | undefined;
    // Heuristic: if first resource is image and cover has image assigned later we could map; placeholder now
    this.builder.setStoryMeta(v.title || 'Untitled Story', metaDesc.trim() || undefined, coverImageRes);

    // Map classic layout settings to sidecar config
    const classicValues = v as ClassicValues;
    const layoutId = classicValues.settings?.layout?.id || 'side';
    const layoutCfg = (classicValues.settings?.layoutOptions?.layoutCfg as { size?: string; position?: string }) || {};
    const classicSize = layoutCfg.size || 'medium';
    const classicPosition = layoutCfg.position || 'right';
    const hasClassicTheme = !!classicValues.settings?.theme && Object.keys(classicValues.settings.theme || {}).length > 0;
    const subtype: 'docked-panel' | 'floating-panel' = layoutId === 'float' ? 'floating-panel' : 'docked-panel';
    let narrativePanelSize: 'small' | 'medium' | 'large' = 'medium';
    if (classicSize === 'small' || classicSize === 'medium' || classicSize === 'large') narrativePanelSize = classicSize;
    const narrativePanelPosition: 'start' | 'end' = classicPosition === 'left' ? 'start' : classicPosition === 'right' ? 'end' : 'end';
    const { immersiveId: sidecarId, slideId: placeholderSlideId, narrativeId: placeholderNarrativeId } =
      this.builder.addSidecar(subtype, narrativePanelPosition, narrativePanelSize);
    // Remove placeholder slide + narrative panel created by sidecar scaffold; we will add real slides below.
    this.builder.removeNode(placeholderSlideId);
    this.builder.removeNode(placeholderNarrativeId);
    this.builder.updateNode(sidecarId, node => { (node as unknown as { children?: string[] }).children = []; });

    // Optional intro slide (ignore root-level webmap per requirement; only use description)
    if (v.description) {
      const introNarrative: string[] = [this.builder.createTextNode(String(v.description), 'paragraph')];
      this.builder.addSlideToSidecar(sidecarId, introNarrative, undefined);
    }

    const sectionHeadingIds: string[] = [];
    const navigateButtonStubs: Array<{ actionId: string; buttonNodeId: string }> = [];
    // Inline navigate anchors (no button node) we must add href later
    const navigateInlineStubs: Array<{ actionId: string; richNodeId: string }> = [];
    for (const section of this.sections) {
      const narrativeIds: string[] = [];
      const actionStubs: Array<{ actionId: string; text: string; buttonNodeId: string }> = [];

      // Title first (capture heading id for navigate targets)
      let headingNodeId: string | undefined;
      if (section.title) {
        headingNodeId = this.builder.createTextNode(section.title, 'h3');
        narrativeIds.push(headingNodeId);
      }
      sectionHeadingIds.push(headingNodeId || '');

      const rawHtml = (section.content || section.description || '') + '';
      if (rawHtml.trim()) {
        // Use DOMParser in browser; fallback in Node
        if (typeof (globalThis as unknown as { DOMParser?: unknown }).DOMParser !== 'undefined') {
          try {
            const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
            for (const el of Array.from(doc.body.children)) {
              this.handleElementOrdered(el, narrativeIds, actionStubs, navigateButtonStubs, navigateInlineStubs);
            }
          } catch {
            this.parseOrderedFallback(rawHtml, narrativeIds, actionStubs, navigateButtonStubs, navigateInlineStubs);
          }
        } else {
          this.parseOrderedFallback(rawHtml, narrativeIds, actionStubs, navigateButtonStubs, navigateInlineStubs);
        }
      }

      // Primary media for slide
      let mediaNodeId: string | undefined;
      const m = section.media;
      if (m?.image?.url) {
        const rId = this.builder.addImageResource(m.image.url);
        mediaNodeId = this.builder.createImageNode(rId, m.image.caption, m.image.altText, 'wide');
        this.media.add(m.image.url);
      } else if (m?.webmap?.id) {
        // Support Web Scene vs Web Map via optional itemType field in classic JSON media
        const wmItemType: 'Web Map' | 'Web Scene' = m.webmap.itemType === 'Web Scene' ? 'Web Scene' : 'Web Map';
        type ClassicLayer = { id: string; visibility: boolean; title?: string };
        type ClassicExtent = { xmin: number; ymin: number; xmax: number; ymax: number; spatialReference?: { wkid?: number; latestWkid?: number; wkt?: string } };
        interface ClassicWebMapExtras { overview?: { enable?: boolean; openByDefault?: boolean }; legend?: { enable?: boolean; openByDefault?: boolean }; geocoder?: { enable?: boolean }; popup?: unknown; }
        const extras = m.webmap as ClassicWebMapExtras;
        const normalizedExtent = m.webmap.extent ? this.normalizeExtent(m.webmap.extent as ClassicExtent) : undefined;
        // Compute viewpoint/zoom/scale from extent
        interface Viewpoint { targetGeometry?: unknown; scale?: number }
        let viewpoint: Viewpoint | undefined;
        let zoom: number | undefined;
        if (normalizedExtent) {
          const scaleZoom = determineScaleZoomLevel(normalizedExtent as unknown as { ymax: number; ymin: number });
          if (scaleZoom) {
            viewpoint = { targetGeometry: normalizedExtent, scale: scaleZoom.scale };
            zoom = scaleZoom.zoom;
          }
        }
        const initialState = {
          extent: normalizedExtent,
          mapLayers: Array.isArray(m.webmap.layers)
            ? (m.webmap.layers as ClassicLayer[]).map(l => ({ id: l.id, title: l.title || l.id, visible: l.visibility }))
            : undefined,
          overview: extras.overview ? { enable: !!extras.overview.enable, openByDefault: !!extras.overview.openByDefault } : undefined,
          legend: extras.legend ? { enable: !!extras.legend.enable, openByDefault: !!extras.legend.openByDefault } : undefined,
          geocoder: extras.geocoder ? { enable: !!extras.geocoder.enable } : undefined,
          popup: extras.popup || undefined,
          viewpoint,
          zoom
        };
        // Create webmap resource as 'default' type (experiment: skip later enrichment step)
        const wId = this.builder.addWebMapResource(m.webmap.id, wmItemType, initialState, 'default');
        // Promote key initial state fields to resource-level data for canonical webmap resource
        const center = normalizedExtent ? {
          x: (normalizedExtent.xmin + normalizedExtent.xmax) / 2,
          y: (normalizedExtent.ymin + normalizedExtent.ymax) / 2,
          spatialReference: normalizedExtent.spatialReference
        } : undefined;
        // Prefer full operationalLayers from fetched webmap JSON to preserve original attributes
        let fullLayers: Array<Record<string, unknown>> | undefined;
        try {
          const rootValues: ClassicValues | undefined = (this.classicJson?.values as ClassicValues | undefined);
          const baseWebmapId: string | undefined = rootValues?.webmap;
          const webmapJson = (this.classicJson as unknown as { webmapJson?: { operationalLayers?: Array<Record<string, unknown>> } }).webmapJson;
          type OpLayer = { id: string; title?: string; visibility?: boolean };
          const ops: Array<OpLayer> = (webmapJson && Array.isArray(webmapJson.operationalLayers)) ? webmapJson.operationalLayers as Array<OpLayer> : [];
          if (ops.length && (baseWebmapId === m.webmap.id || baseWebmapId == null)) {
            fullLayers = ops.map((layer: OpLayer) => ({ id: layer.id, title: layer.title || layer.id, visible: !!layer.visibility }));
          } else {
            // Fallback: in Node (smoke tests), perform a blocking fetch to ensure parity before returning
            try {
              const base = `https://www.arcgis.com/sharing/rest/content/items/${m.webmap.id}/data?f=json`;
              const url = this.token ? `${base}&token=${encodeURIComponent(this.token)}` : base;
              const isBrowser = typeof window !== 'undefined';
              if (!isBrowser) {
                try {
                  const out = execFileSync('curl', ['-sL', url], { encoding: 'utf-8' });
                  const wm: { operationalLayers?: Array<Record<string, unknown>> } = JSON.parse(out);
                  const ops2: Array<Record<string, unknown>> = Array.isArray(wm?.operationalLayers) ? wm!.operationalLayers! : [];
                  if (ops2.length) fullLayers = ops2.map((layer) => ({ ...layer }));
                } catch { /* ignore curl failures */ }
              }
              // Also schedule an async cached fetch for browser runtime enrichment
              fetchJsonWithCache<{ operationalLayers?: Array<Record<string, unknown>> }>(url, undefined, 10 * 60 * 1000)
                .then(wm => {
                  type OpLayer2 = { id: string; title?: string; visibility?: boolean };
                  const ops2: Array<OpLayer2> = Array.isArray(wm?.operationalLayers) ? wm!.operationalLayers as Array<OpLayer2> : [];
                  if (ops2.length) {
                    // Update resource with simplified layers
                    this.builder.updateWebMapData(wId, { mapLayers: ops2.map((layer) => ({ id: layer.id, title: layer.title || layer.id, visible: !!layer.visibility })) });
                    // Also update node-level layers merging overrides when overrides exist
                    const overrideVis = new Map<string, boolean>();
                    if (m.webmap && Array.isArray(m.webmap.layers)) {
                      for (const l of m.webmap.layers as { id: string; visibility: boolean }[]) overrideVis.set(l.id, !!l.visibility);
                    }
                    if (mediaNodeId) {
                      if (overrideVis.size > 0) {
                        this.builder.updateNodeData(mediaNodeId, (data) => {
                          (data as Record<string, unknown>).mapLayers = ops2.map((layer: OpLayer2) => {
                            const id = String(layer.id || '');
                            const visible = overrideVis.has(id) ? overrideVis.get(id)! : !!layer.visibility;
                            return { id, title: layer.title || id, visible } as Record<string, unknown>;
                          });
                        });
                      }
                    }
                  }
                })
                .catch(() => {/* ignore */});
            } catch { /* ignore fetch/json errors */ }
          }
        } catch { /* ignore extraction errors */ }
        this.builder.updateWebMapData(wId, {
          extent: normalizedExtent,
          center,
          mapLayers: fullLayers ?? (Array.isArray(m.webmap.layers)
            ? (m.webmap.layers as ClassicLayer[]).map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }))
            : undefined),
          viewpoint,
          zoom
        });
        // Attach scale to top-level resource data (parity with legacy)
        // Removed attaching top-level scale to resource (rely on viewpoint.scale)
        mediaNodeId = this.builder.createWebMapNode(
          wId,
          section.title ? `${wmItemType === 'Web Scene' ? 'Scene' : 'Map'}: ${section.title}` : undefined
        );
        this.media.add(m.webmap.id);
        // Ensure slide-level extent/layers/viewpoint present on node for downstream consumers
        if (mediaNodeId) {
          this.builder.updateNodeData(mediaNodeId, (data) => {
            if (normalizedExtent) data.extent = normalizedExtent;
            // Merge overrides onto full operationalLayers when available, otherwise fall back to override subset
            if (Array.isArray(fullLayers) && fullLayers.length) {
              const overrideVis = new Map<string, boolean>();
              if (m.webmap && Array.isArray(m.webmap.layers)) {
                for (const l of m.webmap.layers as ClassicLayer[]) overrideVis.set(l.id, !!l.visibility);
              }
              if (overrideVis.size > 0) {
                (data as Record<string, unknown>).mapLayers = fullLayers.map((layer: { id: string; title?: string; visible?: boolean }) => {
                  const id = String(layer.id || '');
                  const visible = overrideVis.has(id) ? overrideVis.get(id)! : !!layer.visible;
                  return { id, title: layer.title || id, visible } as Record<string, unknown>;
                });
              }
            } else if (m.webmap && Array.isArray(m.webmap.layers)) {
              (data as Record<string, unknown>).mapLayers = (m.webmap.layers as ClassicLayer[]).map(l => ({ id: l.id, title: l.title || l.id, visible: !!l.visibility }));
            }
            if (viewpoint) (data as Record<string, unknown>).viewpoint = viewpoint;
            if (typeof zoom === 'number') (data as Record<string, unknown>).zoom = zoom;
            // Removed data.scale assignment (use viewpoint.scale)
            if (extras.overview && extras.overview.enable) {
              (data as Record<string, unknown>).overview = { openByDefault: !!extras.overview.openByDefault };
            }
            if (extras.legend && extras.legend.enable) {
              (data as Record<string, unknown>).legend = { openByDefault: !!extras.legend.openByDefault };
            }
          });
        }
      } else if (m?.video?.url) {
        const providerInfo = this.detectVideoProvider(m.video.url);
        if (providerInfo.provider !== 'unknown') {
          mediaNodeId = this.builder.createVideoEmbedNode(m.video.url, providerInfo.provider, providerInfo.id, m.video.caption, m.video.caption, undefined, m.video.altText);
          this.videoEmbedCount++; // track converted embed
        } else {
          const vRes = this.builder.addVideoResource(m.video.url, 'uri');
          mediaNodeId = this.builder.createVideoNode(vRes, m.video.caption, m.video.altText);
          this.media.add(m.video.url);
        }
      } else if (m?.webpage?.url) {
        const swipeNodeId = this.tryBuildSwipeNodeFromUrl(m.webpage.url);
        if (swipeNodeId) {
          mediaNodeId = swipeNodeId;
        } else {
          mediaNodeId = this.builder.createEmbedNode(m.webpage.url, m.webpage.caption, m.webpage.title, m.webpage.description, m.webpage.altText);
        }
      }

      const { slideId } = this.builder.addSlideToSidecar(sidecarId, narrativeIds, mediaNodeId);

      // Resolve contentActions -> action-buttons + ReplaceMedia actions
      if (Array.isArray(section.contentActions) && section.contentActions.length) {
        const map = new Map(section.contentActions.map(a => [a.id, a]));
        for (const stub of actionStubs) {
          const act = map.get(stub.actionId);
          if (!act || act.type !== 'media' || !act.media) continue;
          let actMediaNode: string | undefined;
            const media = act.media;
            if (media.webmap?.id) {
              const wmItemType2: 'Web Map' | 'Web Scene' = media.webmap.itemType === 'Web Scene' ? 'Web Scene' : 'Web Map';
              // Compute viewpoint/zoom/scale from extent if present
              interface Viewpoint2 { targetGeometry?: unknown; scale?: number }
              let viewpoint2: Viewpoint2 | undefined;
              let zoom2: number | undefined;
              // Normalize extent SR for action media as well
              type SpatialRef = { wkid?: number; latestWkid?: number; wkt?: string };
              type ClassicExtent = { xmin: number; ymin: number; xmax: number; ymax: number; spatialReference?: SpatialRef };
              const normalizedExtent2 = media.webmap.extent ? this.normalizeExtent(media.webmap.extent as ClassicExtent) : undefined;
              // Extract extras for action media
              interface ClassicWebMapExtras2 { overview?: { enable?: boolean; openByDefault?: boolean }; legend?: { enable?: boolean; openByDefault?: boolean } }
              const extras2 = media.webmap as ClassicWebMapExtras2;
              if (normalizedExtent2) {
                const scaleZoom2 = determineScaleZoomLevel(normalizedExtent2 as unknown as { ymax: number; ymin: number });
                if (scaleZoom2) {
                  viewpoint2 = { targetGeometry: normalizedExtent2, scale: scaleZoom2.scale };
                  zoom2 = scaleZoom2.zoom;
                }
              }
              const initialState2 = {
                extent: normalizedExtent2,
                mapLayers: Array.isArray(media.webmap.layers)
                  ? media.webmap.layers.map(l => ({ id: l.id, title: l.title || l.id, visible: l.visibility }))
                  : undefined,
                overview: extras2.overview ? { enable: !!extras2.overview.enable, openByDefault: !!extras2.overview.openByDefault } : undefined,
                legend: extras2.legend ? { enable: !!extras2.legend.enable, openByDefault: !!extras2.legend.openByDefault } : undefined,
                viewpoint: viewpoint2,
                zoom: zoom2
              };
              // Action replace-media webmap also created as 'default'
              const wmRes = this.builder.addWebMapResource(media.webmap.id, wmItemType2, initialState2, 'default');
              // Promote action media webmap fields to resource-level data as well
              const center2 = normalizedExtent2 ? {
                x: (normalizedExtent2.xmin + normalizedExtent2.xmax) / 2,
                y: (normalizedExtent2.ymin + normalizedExtent2.ymax) / 2,
                spatialReference: normalizedExtent2.spatialReference
              } : undefined;
              // Attempt to load full operationalLayers for this action webmap id
              let fullLayers2: Array<Record<string, unknown>> | undefined;
              try {
                const webmapJson2 = (this.classicJson as unknown as { webmapJson?: { operationalLayers?: Array<Record<string, unknown>> } }).webmapJson;
                const opsA: Array<Record<string, unknown>> = (webmapJson2 && Array.isArray(webmapJson2.operationalLayers)) ? webmapJson2.operationalLayers : [];
                const baseValues: ClassicValues | undefined = (this.classicJson?.values as ClassicValues | undefined);
                const baseId: string | undefined = baseValues?.webmap;
                if (opsA.length && (baseId === media.webmap.id || baseId == null)) {
                  fullLayers2 = opsA.map((layer: Record<string, unknown>) => ({ ...layer }));
                } else {
                  const base = `https://www.arcgis.com/sharing/rest/content/items/${media.webmap.id}/data?f=json`;
                  const url = this.token ? `${base}&token=${encodeURIComponent(this.token)}` : base;
                  const isBrowser = typeof window !== 'undefined';
                  if (!isBrowser) {
                    try {
                      const out = execFileSync('curl', ['-sL', url], { encoding: 'utf-8' });
                      const wm: { operationalLayers?: Array<Record<string, unknown>> } = JSON.parse(out);
                      const opsB: Array<Record<string, unknown>> = Array.isArray(wm?.operationalLayers) ? wm!.operationalLayers! : [];
                      if (opsB.length) fullLayers2 = opsB.map((layer: Record<string, unknown>) => ({ ...layer }));
                    } catch { /* ignore */ }
                  }
                  fetchJsonWithCache<{ operationalLayers?: Array<Record<string, unknown>> }>(url, undefined, 10 * 60 * 1000)
                    .then(wm => {
                      const opsB: Array<Record<string, unknown>> = Array.isArray(wm?.operationalLayers) ? wm!.operationalLayers! : [];
                      if (opsB.length) fullLayers2 = opsB.map((layer: Record<string, unknown>) => ({ ...layer }));
                    })
                    .catch(() => {/* ignore */});
                }
              } catch { /* ignore action webmap layer enrichment errors */ }
              this.builder.updateWebMapData(wmRes, {
                extent: normalizedExtent2,
                center: center2,
                mapLayers: fullLayers2 ?? (Array.isArray(media.webmap.layers)
                  ? media.webmap.layers.map(l => ({ id: l.id, title: l.title || l.id, visible: l.visibility }))
                  : undefined),
                viewpoint: viewpoint2,
                zoom: zoom2
              });
              // Async enrichment: fetch and cache full operationalLayers for this action webmap id
              try {
                const base = `https://www.arcgis.com/sharing/rest/content/items/${media.webmap.id}/data?f=json`;
                const url = this.token ? `${base}&token=${encodeURIComponent(this.token)}` : base;
                  fetchJsonWithCache<{ operationalLayers?: Array<Record<string, unknown>> }>(url, undefined, 10 * 60 * 1000)
                    .then(wm => {
                      const opsB: Array<Record<string, unknown>> = Array.isArray(wm?.operationalLayers) ? wm!.operationalLayers! : [];
                      if (opsB.length) {
                        // Update resource
                        this.builder.updateWebMapData(wmRes, { mapLayers: opsB.map((layer) => ({ ...layer })) });
                        // Update node-level mapLayers merging overrides, default false
                        const overrideVis = new Map<string, boolean>();
                        if (media.webmap && Array.isArray(media.webmap.layers)) {
                          for (const l of media.webmap.layers as { id: string; visibility: boolean }[]) overrideVis.set(l.id, !!l.visibility);
                        }
                        if (actMediaNode) {
                          this.builder.updateNodeData(actMediaNode, (data) => {
                            (data as Record<string, unknown>).mapLayers = opsB.map((layer: Record<string, unknown>) => {
                              const id = String(layer.id || '');
                              const visible = overrideVis.has(id) ? overrideVis.get(id)! : false;
                              return { ...layer, visible } as Record<string, unknown>;
                            });
                          });
                        }
                      }
                    })
                  .catch(() => {/* ignore */});
              } catch { /* ignore */ }
              // Attach scale to top-level resource data (parity with legacy)
              // Removed attaching scale to action webmap resource
              actMediaNode = this.builder.createWebMapNode(
                wmRes,
                stub.text.includes('Map') || stub.text.includes('Scene') ? stub.text : undefined
              );
              const currentJson = this.builder.getJson();
              if (actMediaNode) {
                const wmNode = currentJson.nodes[actMediaNode];
                const nodeData: Record<string, unknown> | undefined = wmNode && 'data' in wmNode ? (wmNode.data as Record<string, unknown>) : undefined;
                if (wmNode && nodeData) {
                  if (Array.isArray(media.webmap.layers)) {
                    const overrideVis = new Map<string, boolean>();
                    for (const l of media.webmap.layers) overrideVis.set(l.id, !!l.visibility);
                    if (Array.isArray(fullLayers2) && fullLayers2.length) {
                      nodeData.mapLayers = fullLayers2.map((layer: Record<string, unknown>) => {
                        const id = String(layer.id || '');
                        const visible = overrideVis.has(id) ? overrideVis.get(id)! : false;
                        return { ...layer, visible } as Record<string, unknown>;
                      });
                    } else {
                      nodeData.mapLayers = media.webmap.layers.map(l => ({ id: l.id, title: l.title || l.id, visible: l.visibility }));
                    }
                  }
                  if (normalizedExtent2) {
                    nodeData.extent = normalizedExtent2 as unknown as Record<string, unknown>;
                  }
                  if (viewpoint2) {
                    nodeData.viewpoint = viewpoint2 as unknown as Record<string, unknown>;
                  }
                  if (typeof zoom2 === 'number') {
                    nodeData.zoom = zoom2 as unknown as Record<string, unknown>;
                  }
                  // Removed data.scale assignment for action media node
                  // Propagate overview/legend open state to node-level for action media
                  if (extras2.overview && extras2.overview.enable) {
                    nodeData.overview = { openByDefault: !!extras2.overview.openByDefault } as unknown as Record<string, unknown>;
                  }
                  if (extras2.legend && extras2.legend.enable) {
                    nodeData.legend = { openByDefault: !!extras2.legend.openByDefault } as unknown as Record<string, unknown>;
                  }
                }
              }
              this.media.add(media.webmap.id);
            } else if (media.image?.url) {
              const rId = this.builder.addImageResource(media.image.url);
              actMediaNode = this.builder.createImageNode(rId, media.image.caption, media.image.altText, 'standard');
              this.media.add(media.image.url);
            } else if (media.video?.url) {
              const providerInfo2 = this.detectVideoProvider(media.video.url);
              if (providerInfo2.provider !== 'unknown') {
                actMediaNode = this.builder.createVideoEmbedNode(media.video.url, providerInfo2.provider, providerInfo2.id, media.video.caption, media.video.caption, undefined, media.video.altText);
                this.videoEmbedCount++;
              } else {
                const vRes = this.builder.addVideoResource(media.video.url, 'uri');
                actMediaNode = this.builder.createVideoNode(vRes, media.video.caption, media.video.altText);
                this.media.add(media.video.url);
              }
            } else if (media.webpage?.url) {
              const swipeNodeId2 = this.tryBuildSwipeNodeFromUrl(media.webpage.url);
              if (swipeNodeId2) {
                actMediaNode = swipeNodeId2;
              } else {
                actMediaNode = this.builder.createEmbedNode(media.webpage.url, media.webpage.caption, media.webpage.title, media.webpage.description, media.webpage.altText);
              }
            }
          if (actMediaNode) {
            // Attach dependents reference via builder mutator (extend StoryMapNode with dependents bag)
            this.builder.updateNode(stub.buttonNodeId, (btnNode) => {
              const b = btnNode as unknown as { dependents?: Record<string, string> };
              if (!b.dependents) b.dependents = {};
              b.dependents.actionMedia = actMediaNode;
              // If action media is a swipe, also record its content node ids to prevent loss
              const jsonSnap = this.builder.getJson();
              const swipeNode = jsonSnap.nodes[actMediaNode];
              if (swipeNode?.type === 'swipe' && swipeNode.data && (swipeNode.data as Record<string, unknown>).contents) {
                const contents = (swipeNode.data as Record<string, unknown>).contents as Record<string, string>;
                const aId = contents['0'];
                const bId = contents['1'];
                if (aId) b.dependents[`actionMedia_content_0`] = aId;
                if (bId) b.dependents[`actionMedia_content_1`] = bId;
              }
            });
            // Ensure target slide has the media node present so runtime can load resources on action
            const snap = this.builder.getJson();
            const slideNode = snap.nodes[slideId];
            const slideChildren: unknown = slideNode && 'children' in slideNode ? (slideNode as unknown as { children?: unknown }).children : undefined;
            if (Array.isArray(slideChildren)) {
              const hasChild = (slideChildren as string[]).includes(actMediaNode);
              if (!hasChild) {
                this.builder.addChild(slideId, actMediaNode);
              }
            }
            // If action media is an inline swipe, and its content nodes lack alignment,
            // initialize them using the slide's current stage media viewpoint/extent.
            try {
              const json = this.builder.getJson();
              const swipeNode = json.nodes[actMediaNode];
              const stageNode = json.nodes[mediaNodeId];
              if (swipeNode?.type === 'swipe' && stageNode && stageNode.data) {
                const contents = (swipeNode.data as unknown as { contents?: Record<string,string> })?.contents || {};
                const leftId = contents['0'];
                const rightId = contents['1'];
                const leftNode = leftId ? json.nodes[leftId] : undefined;
                const rightNode = rightId ? json.nodes[rightId] : undefined;
                const stageData = (stageNode.data as Record<string, unknown>) || {};
                const stageExtent = (stageData as unknown as { extent?: unknown }).extent as unknown;
                const stageViewpoint = (stageData as unknown as { viewpoint?: { targetGeometry?: unknown; scale?: number } }).viewpoint;
                // Derive a viewpoint from extent if none is present
                let derivedVp: { targetGeometry?: unknown; scale?: number } | undefined = stageViewpoint;
                if (!derivedVp && stageExtent) {
                  const sz = determineScaleZoomLevel(stageExtent as unknown as { ymax: number; ymin: number });
                  if (sz) derivedVp = { targetGeometry: stageExtent, scale: sz.scale };
                }
                const applyAlignment = (nodeId?: string) => {
                  if (!nodeId) return;
                  this.builder.updateNodeData(nodeId, (data) => {
                    const hasExtent = !!(data as unknown as { extent?: unknown }).extent;
                    const hasVp = !!(data as unknown as { viewpoint?: unknown }).viewpoint;
                    if (!hasExtent && stageExtent) (data as Record<string, unknown>).extent = stageExtent as unknown as Record<string, unknown>;
                    if (!hasVp && derivedVp) (data as Record<string, unknown>).viewpoint = derivedVp as unknown as Record<string, unknown>;
                    // Hint runtime to use extent-based placement for consistent alignment
                    if (!(data as unknown as { viewPlacement?: unknown }).viewPlacement) (data as Record<string, unknown>).viewPlacement = 'extent' as unknown as Record<string, unknown>;
                  });
                };
                applyAlignment(leftId);
                applyAlignment(rightId);
              }
            } catch { /* ignore alignment initialization errors */ }
            this.builder.registerReplaceMediaAction(stub.buttonNodeId, slideId, actMediaNode);
          }
        }
      }
    }

    // Resolve navigate buttons -> internal links referencing heading nodes by index
    const navigateIndexLookup = new Map<string, number>();
    this.sections.forEach((sec) => {
      (sec.contentActions || []).forEach(a => {
        if (a.type === 'navigate' && typeof a.index === 'number') navigateIndexLookup.set(a.id, a.index);
      });
    });
    for (const stub of navigateButtonStubs) {
      const targetIdx = navigateIndexLookup.get(stub.actionId);
      if (typeof targetIdx === 'number') {
        const headingId = sectionHeadingIds[targetIdx];
        if (headingId) this.builder.setButtonLink(stub.buttonNodeId, `#ref-${headingId}`);
      }
    }
    // Inline anchors: inject hrefs inside preserved HTML
    // Refresh live JSON snapshot for inline anchor resolution
    const json = this.builder.getJson();
    for (const stub of navigateInlineStubs) {
      const targetIdx = navigateIndexLookup.get(stub.actionId);
      if (typeof targetIdx !== 'number') continue;
      const headingId = sectionHeadingIds[targetIdx];
      if (!headingId) continue;
      const node = json.nodes[stub.richNodeId];
      if (node?.type === 'text' && node.data) {
        interface RichTextData { text: string; type: string; preserveHtml?: boolean }
        const data = node.data as unknown as RichTextData;
        if (!data.preserveHtml) continue;
        const html = data.text;
        // Add href if absent
        const re = new RegExp(`<a([^>]*data-storymaps=["']${stub.actionId}["'][^>]*)>`,'i');
        const updated = html.replace(re, (full, attrs) => {
          if (/href=/.test(attrs)) return full; // already has href
          return `<a${attrs} href="#ref-${headingId}" target="_self">`;
        });
        data.text = updated;
      }
    }

    // Theme provenance & inline theme resource override application
    const classicTheme = classicValues.settings?.theme || null;
    // Fallback branch: if no classic theme and float layout, apply obsidian with no overrides and adjust each immersive-narrative-panel (not the sidecar itself)
    if (!hasClassicTheme && layoutId === 'float') {
      // Update every immersive-narrative-panel to position:end & size:medium
      const currentJson = this.builder.getJson();
      for (const node of Object.values(currentJson.nodes)) {
        if (node && node.type === 'immersive-narrative-panel') {
          const dataObj: Record<string, unknown> = (node.data as Record<string, unknown>) || {};
          dataObj.position = 'end';
          dataObj.size = 'medium';
          (node as unknown as { data?: Record<string, unknown> }).data = dataObj;
        }
      }
      const decisions: Record<string, unknown> = {
        baseThemeId: 'obsidian',
        forcedByMissingClassicTheme: true,
        variableOverridesApplied: [],
        layoutMapping: {
          classicLayoutId: layoutId,
          classicSize,
          classicPosition,
          mappedSubtype: subtype,
          mappedNarrativePanelSize: 'medium',
          mappedNarrativePanelPosition: 'end'
        }
      };
      try {
        const derived = computeTheme(this.themeId as any, this.classicJson);
        this.builder.applyTheme({ themeId: derived.themeId, variableOverrides: derived.variableOverrides });
      } catch {
        this.builder.applyTheme({ themeId: 'obsidian', variableOverrides: {} });
      }
      decisions.videoEmbeds = this.videoEmbedCount;
      const classicType = detectClassicTemplate(this.classicJson);
      const vAny = (this.classicJson as unknown as { values?: { templateCreation?: string; templateLastEdit?: string } }).values || {} as { templateCreation?: string; templateLastEdit?: string };
      this.builder.addConverterMetadata(classicType || 'MapJournal', { classicMetadata: { classicTheme: classicTheme as unknown, mappingDecisions: decisions as unknown, templateVersion: ((this.classicJson as unknown as { version?: string; values?: { version?: string; templateVersion?: string } }).version
        || (this.classicJson as unknown as { values?: { version?: string } }).values?.version
        || (this.classicJson as unknown as { values?: { templateVersion?: string } }).values?.templateVersion) }, classicTemplateCreation: vAny.templateCreation, classicTemplateLastEdit: vAny.templateLastEdit } as any);
      this.emit('Applied fallback obsidian theme (no classic theme present; float layout)');
      return;
    }
    const { theme: mappedTheme, decisions } = createThemeWithDecisions(this.classicJson);
    decisions.layoutMapping = {
      classicLayoutId: layoutId,
      classicSize,
      classicPosition,
      mappedSubtype: subtype,
      mappedNarrativePanelSize: narrativePanelSize,
      mappedNarrativePanelPosition: narrativePanelPosition
    };
    // Build overrides from variableOverridesApplied list
    const overrides: Record<string,string> = {};
    if (Array.isArray(decisions.variableOverridesApplied)) {
      for (const key of decisions.variableOverridesApplied) {
        if (mappedTheme.variables && key in mappedTheme.variables) {
          overrides[key] = String(mappedTheme.variables[key]);
        }
      }
    }
    // Attach extracted custom CSS (style blocks) provenance if present
    if (this.styleBlocks.length) {
      try {
        const combinedRaw = this.styleBlocks.join('\n\n');
        // Sanitize control chars and collapse excessive whitespace
        // Replace control characters manually (avoid regex with direct control chars triggering linter)
        let sanitized = combinedRaw.split('').map(ch => {
          const code = ch.charCodeAt(0);
          return code < 32 ? ' ' : ch;
        }).join('');
        sanitized = sanitized.replace(/\r/g,'').replace(/\t/g,' ');
        // Normalize multi-blank lines
        sanitized = sanitized.replace(/\n{3,}/g,'\n\n');
        const approxBytes = combinedRaw.length;
        const truncated = sanitized.length > 6000 ? sanitized.slice(0,6000) + '\n/*__CSS_TRUNCATED__*/' : sanitized;
        (decisions as Record<string, unknown>)["customCss"] = {
          blockCount: this.styleBlocks.length,
            approxBytes,
          combined: truncated
        } as Record<string, unknown>;
      } catch {
        // swallow
      }
    }
    // Apply base theme and overrides to existing theme resource
    // Align with shared theme helper while preserving decisions overrides
    const derived = computeTheme(this.themeId as any, this.classicJson);
    const mergedOverrides = { ...(derived.variableOverrides || {}), ...overrides } as Record<string,string>;
    this.builder.applyTheme({ themeId: derived.themeId, variableOverrides: mergedOverrides });
    (decisions as Record<string, unknown>).videoEmbeds = this.videoEmbedCount;
    // Add converter metadata resource (unless suppressed)
    if (!this.shouldSuppressMetadata()) {
      const classicType2 = detectClassicTemplate(this.classicJson);
      const vAny2 = (this.classicJson as unknown as { values?: { templateCreation?: string; templateLastEdit?: string } }).values || {} as { templateCreation?: string; templateLastEdit?: string };
      this.builder.addConverterMetadata(classicType2 || 'MapJournal', { classicMetadata: { classicTheme: classicTheme, mappingDecisions: decisions, templateVersion: ((this.classicJson as unknown as { version?: string; values?: { version?: string; templateVersion?: string } }).version
        || (this.classicJson as unknown as { values?: { version?: string } }).values?.version
        || (this.classicJson as unknown as { values?: { templateVersion?: string } }).values?.templateVersion) }, classicTemplateCreation: vAny2.templateCreation, classicTemplateLastEdit: vAny2.templateLastEdit } as any);
    }
    const sidecarNode = this.builder.getJson().nodes[sidecarId];
    const childrenUnknown: unknown = sidecarNode && 'children' in sidecarNode ? (sidecarNode as unknown as { children?: unknown }).children : undefined;
    const slideCount = Array.isArray(childrenUnknown) ? (childrenUnknown as unknown[]).length : 0;
    this.emit(`Built single sidecar with ${slideCount} slide(s); theme overrides applied (${Object.keys(overrides).length})`);
  }

  protected applyTheme(): void {
    // Theme already applied with overrides inside convertContent
    this.emit('applyTheme skipped (handled in convertContent)');
  }

  protected collectMedia(): string[] {
    this.emit(`Collected ${this.media.size} media URL(s)`);
    return Array.from(this.media);
  }

  protected getStoryMapJson(): StoryMapJSON {
    return this.builder.getJson();
  }

  static convert(opts: BaseConverterOptions): ConverterResult {
    const converter = new MapJournalConverter(opts);
    return converter.convert();
  }

  // Normalizes an extent to Web Mercator (wkid 102100) if provided in WGS84 (4326).
  // Returns original extent if already projected or if required fields are missing.
  private normalizeExtent(ex: { xmin: number; ymin: number; xmax: number; ymax: number; spatialReference?: { wkid?: number; latestWkid?: number; wkt?: string } } | undefined) {
    if (!ex) return ex;
    const srVal = ex.spatialReference?.wkid || ex.spatialReference?.latestWkid || ex.spatialReference?.wkt;
    const isWgs84 = srVal === 4326 || srVal === 'WGS84' || srVal === 'WGS 84';
    if (!isWgs84) return ex;
    // Guard numeric
    if ([ex.xmin, ex.ymin, ex.xmax, ex.ymax].some(v => typeof v !== 'number' || !isFinite(v))) return ex;
    const toX = (lon: number) => lon * 20037508.34 / 180;
    const toY = (lat: number) => {
      const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
      return y * 20037508.34 / 180;
    };
    return {
      xmin: toX(ex.xmin),
      ymin: toY(ex.ymin),
      xmax: toX(ex.xmax),
      ymax: toY(ex.ymax),
      spatialReference: { wkid: 102100, latestWkid: 3857 }
    };
  }
  private extractImageEntries(html: string): Array<{ src: string; alt?: string; caption?: string }> {
    const found: Array<{ src: string; alt?: string; caption?: string }> = [];
    const figureRegex = /<figure[^>]*>([\s\S]*?)<\/figure>/gi;
    let figMatch: RegExpExecArray | null;
    while ((figMatch = figureRegex.exec(html)) !== null) {
      const figureHtml = figMatch[1];
      const imgTag = /<img[^>]*>/i.exec(figureHtml)?.[0];
      if (!imgTag) continue;
      const srcMatch = /src=["']([^"'>]+)["']/i.exec(imgTag);
      if (!srcMatch) continue;
      const altMatch = /alt=["']([^"'>]*)["']/i.exec(imgTag);
      const captionMatch = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(figureHtml);
      const caption = captionMatch ? this.stripHtml(captionMatch[1]).trim() : undefined;
      const src = srcMatch[1];
      if (!found.some(f => f.src === src)) {
        found.push({ src, alt: altMatch ? altMatch[1] : undefined, caption });
      }
    }
    const imgTagRegex = /<img[^>]*src=["']([^"'>]+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = imgTagRegex.exec(html)) !== null) {
      const tag = match[0];
      const src = match[1];
      if (!found.some(f => f.src === src)) {
        const altMatch = /alt=["']([^"'>]*)["']/i.exec(tag);
        found.push({ src, alt: altMatch ? altMatch[1] : undefined });
      }
    }
    return found;
  }

  private stripHtml(input: string): string {
    return input.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Normalize labels for buttons/action-buttons by removing leading arrow glyphs
  // and converting non-breaking spaces to normal spaces.
  private normalizeButtonLabel(label: string): string {
    const asSpace = String(label ?? '').replace(/\u00A0|&nbsp;/g, ' ');
    return asSpace.replace(/^[>›»\s]+/, '').trim();
  }

  private extractParagraphBlocks(html: string): string[] {
    const blocks: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match: RegExpExecArray | null;
    while ((match = pRegex.exec(html)) !== null) {
      const raw = match[1];
      const cleaned = this.stripHtml(raw);
      if (cleaned) blocks.push(cleaned);
    }
    // Fallback: if no <p> tags, treat entire content as one block
    if (!blocks.length) {
      const cleaned = this.stripHtml(html);
      if (cleaned) blocks.push(cleaned);
    }
    return blocks;
  }

  private extractActionAnchorLabel(html: string, actionId: string): string | undefined {
    const anchorRegex = new RegExp(`<a[^>]*data-storymaps=["']${actionId}["'][^>]*>([\\s\\S]*?)</a>`, 'i');
    const m = anchorRegex.exec(html);
    if (!m) return undefined;
    return this.stripHtml(m[1]);
  }

  private BUTTON_CLASS_REGEX = /^btn-(green|orange|purple|yellow|red)$/i;

  // Determines whether an HTML segment (post token-split) contains meaningful content.
  // Keeps segments that have visible text after stripping tags & whitespace, or that
  // include inline navigate/action anchors (data-storymaps) even if anchor text is blank.
  private isNonEmptyHtmlSegment(seg: string): boolean {
    if (!seg) return false;
    // Preserve segments containing inline action/navigate anchors regardless of text content
    const hasDataAnchor = /data-storymaps=/i.test(seg);
    // Strip style/script blocks (defensive) and HTML tags
    const stripped = seg
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ') // decode common non-breaking spaces
      .replace(/\u00A0/g, ' ') // Unicode NBSP
      .trim();
    return hasDataAnchor || stripped.length > 0;
  }

  // --- Inline Color Style -> Class Conversion (replicates Python workflow logic) ---
  // Minimal CSS color name map (extend as needed)
  private CSS_COLOR_MAP: Record<string, string> = {
    aliceblue: '#F0F8FF', antiquewhite: '#FAEBD7', aqua: '#00FFFF', aquamarine: '#7FFFD4', azure: '#F0FFFF',
    beige: '#F5F5DC', bisque: '#FFE4C4', black: '#000000', blanchedalmond: '#FFEBCD', blue: '#0000FF',
    blueviolet: '#8A2BE2', brown: '#A52A2A', burlywood: '#DEB887', cadetblue: '#5F9EA0', chartreuse: '#7FFF00',
    chocolate: '#D2691E', coral: '#FF7F50', cornflowerblue: '#6495ED', cornsilk: '#FFF8DC', crimson: '#DC143C',
    cyan: '#00FFFF', darkblue: '#00008B', darkcyan: '#008B8B', darkgoldenrod: '#B8860B', darkgray: '#A9A9A9',
    darkgreen: '#006400', darkgrey: '#A9A9A9', darkkhaki: '#BDB76B', darkmagenta: '#8B008B', darkolivegreen: '#556B2F',
    darkorange: '#FF8C00', darkorchid: '#9932CC', darkred: '#8B0000', darksalmon: '#E9967A', darkseagreen: '#8FBC8F',
    darkslateblue: '#483D8B', darkslategray: '#2F4F4F', darkslategrey: '#2F4F4F', darkturquoise: '#00CED1', darkviolet: '#9400D3',
    deeppink: '#FF1493', deepskyblue: '#00BFFF', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1E90FF',
    firebrick: '#B22222', floralwhite: '#FFFAF0', forestgreen: '#228B22', fuchsia: '#FF00FF', gainsboro: '#DCDCDC',
    ghostwhite: '#F8F8FF', gold: '#FFD700', goldenrod: '#DAA520', gray: '#808080', green: '#008000',
    greenyellow: '#ADFF2F', grey: '#808080', honeydew: '#F0FFF0', hotpink: '#FF69B4', indianred: '#CD5C5C',
    indigo: '#4B0082', ivory: '#FFFFF0', khaki: '#F0E68C', lavender: '#E6E6FA', lavenderblush: '#FFF0F5',
    lawngreen: '#7CFC00', lemonchiffon: '#FFFACD', lightblue: '#ADD8E6', lightcoral: '#F08080', lightcyan: '#E0FFFF',
    lightgoldenrodyellow: '#FAFAD2', lightgray: '#D3D3D3', lightgreen: '#90EE90', lightgrey: '#D3D3D3', lightpink: '#FFB6C1',
    lightsalmon: '#FFA07A', lightseagreen: '#20B2AA', lightskyblue: '#87CEFA', lightslategray: '#778899', lightslategrey: '#778899',
    lightsteelblue: '#B0C4DE', lightyellow: '#FFFFE0', lime: '#00FF00', limegreen: '#32CD32', linen: '#FAF0E6',
    magenta: '#FF00FF', maroon: '#800000', mediumaquamarine: '#66CDAA', mediumblue: '#0000CD', mediumorchid: '#BA55D3',
    mediumpurple: '#9370DB', mediumseagreen: '#3CB371', mediumslateblue: '#7B68EE', mediumspringgreen: '#00FA9A', mediumturquoise: '#48D1CC',
    mediumvioletred: '#C71585', midnightblue: '#191970', mintcream: '#F5FFFA', mistyrose: '#FFE4E1', moccasin: '#FFE4B5',
    navajowhite: '#FFDEAD', navy: '#000080', oldlace: '#FDF5E6', olive: '#808000', olivedrab: '#6B8E23',
    orange: '#FFA500', orangered: '#FF4500', orchid: '#DA70D6', palegoldenrod: '#EEE8AA', palegreen: '#98FB98',
    paleturquoise: '#AFEEEE', palevioletred: '#DB7093', papayawhip: '#FFEFD5', peachpuff: '#FFDAB9', peru: '#CD853F',
    pink: '#FFC0CB', plum: '#DDA0DD', powderblue: '#B0E0E6', purple: '#800080', rebeccapurple: '#663399',
    red: '#FF0000', rosybrown: '#BC8F8F', royalblue: '#4169E1', saddlebrown: '#8B4513', salmon: '#FA8072',
    sandybrown: '#F4A460', seagreen: '#2E8B57', seashell: '#FFF5EE', sienna: '#A0522D', silver: '#C0C0C0',
    skyblue: '#87CEEB', slateblue: '#6A5ACD', slategray: '#708090', slategrey: '#708090', snow: '#FFFAFA',
    springgreen: '#00FF7F', steelblue: '#4682B4', tan: '#D2B48C', teal: '#008080', thistle: '#D8BFD8',
    tomato: '#FF6347', turquoise: '#40E0D0', violet: '#EE82EE', wheat: '#F5DEB3', white: '#FFFFFF',
    whitesmoke: '#F5F5F5', yellow: '#FFFF00', yellowgreen: '#9ACD32'
  };

  private colorToHex(value: string): string | undefined {
    if (!value) return undefined;
    value = value.trim();
    // Remove !important
    value = value.replace(/!important$/i, '').trim();
    // Already hex (#RRGGBB or #RGB)
    if (/^#([0-9a-f]{3})$/i.test(value)) {
      // Expand #RGB to #RRGGBB
      const r = value[1], g = value[2], b = value[3];
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    if (/^#([0-9a-f]{6})$/i.test(value)) return value.toUpperCase();
    // rgb(r,g,b) format
    const rgbMatch = /rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(value);
    if (rgbMatch) {
      const [r,g,b] = rgbMatch.slice(1,4).map(n => Math.max(0, Math.min(255, parseInt(n,10))));
      return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase();
    }
    // Python workflow had rgb-123-123-123 variant
    const rgbDashMatch = /rgb-?(\d+)-?(\d+)-?(\d+)/i.exec(value);
    if (rgbDashMatch) {
      const [r,g,b] = rgbDashMatch.slice(1,4).map(n => Math.max(0, Math.min(255, parseInt(n,10))));
      return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase();
    }
    // Named color
    const named = value.toLowerCase();
    if (this.CSS_COLOR_MAP[named]) return this.CSS_COLOR_MAP[named].toUpperCase();
    return undefined;
  }

  private processHtmlColorsPreserveHtml(html: string): string {
    if (!html || !/<[^>]+style=/i.test(html)) return html; // fast path if no style attributes
    // Use DOM when available
    try {
      const doc = new DOMParser().parseFromString(`<wrapper>${html}</wrapper>`, 'text/html');
      const wrapper = doc.querySelector('wrapper');
      if (!wrapper) return html;
      for (const el of Array.from(wrapper.querySelectorAll('[style]'))) {
        const style = el.getAttribute('style') || '';
        const m = /color\s*:\s*([^;]+)(;?)/i.exec(style);
        if (!m) continue;
        const colorRaw = m[1].trim();
        const hex = this.colorToHex(colorRaw);
        if (!hex) continue;
        const className = `sm-text-color-${hex.substring(1)}`; // drop '#'
        // Remove color declaration from style
        let newStyle = style.replace(m[0], '').trim();
        newStyle = newStyle.replace(/;;+/g,';');
        newStyle = newStyle.replace(/^;|;$/g,'').trim();
        if (newStyle) el.setAttribute('style', newStyle); else el.removeAttribute('style');
        const existingClass = el.getAttribute('class');
        if (existingClass) el.setAttribute('class', existingClass + ' ' + className); else el.setAttribute('class', className);
      }
      return wrapper.innerHTML;
    } catch {
      // Fallback regex-based processing (less precise)
      return html.replace(/(<[^>]+style=["'][^"'>]*color\s*:[^"'>]+["'][^>]*>)/gi, (tag) => {
        const styleMatch = /style=["']([^"'>]+)["']/i.exec(tag);
        if (!styleMatch) return tag;
        let style = styleMatch[1];
        const colorDecl = /color\s*:\s*([^;]+)(;?)/i.exec(style);
        if (!colorDecl) return tag;
        const colorRaw = colorDecl[1].trim();
        const hex = this.colorToHex(colorRaw);
        if (!hex) return tag;
        const className = `sm-text-color-${hex.substring(1)}`;
        style = style.replace(colorDecl[0], '').trim();
        style = style.replace(/;;+/g,';').replace(/^;|;$/g,'').trim();
        let newTag = tag.replace(styleMatch[0], style ? `style="${style}"` : '');
        if (/class=["']/i.test(newTag)) {
          newTag = newTag.replace(/class=["']([^"'>]+)["']/i, (m0, cls) => `class="${cls} ${className}"`);
        } else {
          newTag = newTag.replace(/<([^\s>]+)/, (m0, tName) => `<${tName} class="${className}"`);
        }
        return newTag;
      });
    }
  }

  private handleElementOrdered(
    el: Element,
    narrativeIds: string[],
    actionStubs: Array<{ actionId: string; text: string; buttonNodeId: string }>,
    navigateButtonStubs: Array<{ actionId: string; buttonNodeId: string }>,
    navigateInlineStubs: Array<{ actionId: string; richNodeId: string }>
  ): void {
    if (el.tagName === 'STYLE') {
      const css = el.textContent || '';
      if (css.trim()) this.styleBlocks.push(css.trim());
      return; // Do not create a text node for raw CSS
    }
    if (el.tagName === 'FIGURE') {
      const img = el.querySelector('img');
      if (img?.src) {
        const resId = this.builder.addImageResource(img.src);
        narrativeIds.push(this.builder.createImageNode(resId, el.querySelector('figcaption')?.textContent?.trim() || undefined, img.alt || undefined, 'standard'));
        this.media.add(img.src);
      }
      return;
    }
    if (el.tagName === 'IMG') {
      if (el.getAttribute('src')) {
        const src = el.getAttribute('src')!;
        const resId = this.builder.addImageResource(src);
        narrativeIds.push(this.builder.createImageNode(resId, undefined, el.getAttribute('alt') || undefined, 'standard'));
        this.media.add(src);
      }
      return;
    }
    if (el.tagName === 'P' || el.tagName === 'DIV') {
      // Preserve inner HTML; process anchors & images
      const workingDoc = new DOMParser().parseFromString(`<wrapper>${el.innerHTML}</wrapper>`, 'text/html');
      const wrapper = workingDoc.querySelector('wrapper')!;
      // Handle images: replace with tokens so we can keep order
      for (const img of Array.from(wrapper.querySelectorAll('img[src]'))) {
        const src = img.getAttribute('src')!;
        const alt = img.getAttribute('alt') || undefined;
        const resId = this.builder.addImageResource(src);
        const imgNodeId = this.builder.createImageNode(resId, undefined, alt, 'standard');
        this.media.add(src);
        img.replaceWith(workingDoc.createTextNode(`%%IMG:${imgNodeId}%%`));
      }
      for (const a of Array.from(wrapper.querySelectorAll('a[data-storymaps]'))) {
        const actionId = a.getAttribute('data-storymaps')!;
        const actionType = a.getAttribute('data-storymaps-type') || '';
        const label = (a.textContent || 'View').trim();
        const normalizedLabel = this.normalizeButtonLabel(label);
        const classAttr = a.getAttribute('class') || '';
        const classes = classAttr.split(/\s+/).filter(Boolean);
        const hasButtonClass = classes.some(c => this.BUTTON_CLASS_REGEX.test(c));
        if (actionType === 'media') {
          const btnId = this.builder.createActionButtonNode(normalizedLabel, 'wide');
          actionStubs.push({ actionId, text: normalizedLabel, buttonNodeId: btnId });
          a.replaceWith(workingDoc.createTextNode(`%%ACTION_BTN:${btnId}%%`));
        } else if (actionType === 'navigate') {
          if (hasButtonClass) {
            const btnId = this.builder.createButtonNode(normalizedLabel, 'wide');
            navigateButtonStubs.push({ actionId, buttonNodeId: btnId });
            a.replaceWith(workingDoc.createTextNode(`%%NAV_BTN:${btnId}%%`));
          } else {
            // Keep anchor inline; will add href later
            navigateInlineStubs.push({ actionId, richNodeId: '' }); // richNodeId assigned after node creation
          }
        }
      }
      const htmlWithTokens = wrapper.innerHTML;
      const segments = htmlWithTokens.split(/(%%IMG:[^%]+%%|%%ACTION_BTN:[^%]+%%|%%NAV_BTN:[^%]+%%)/);
      for (const seg of segments) {
        if (!seg) continue;
        if (/^%%IMG:/.test(seg)) {
          const id = seg.replace(/^%%IMG:/,'').replace(/%%$/,'');
          narrativeIds.push(id);
        } else if (/^%%ACTION_BTN:/.test(seg)) {
          const id = seg.replace(/^%%ACTION_BTN:/,'').replace(/%%$/,'');
          narrativeIds.push(id);
        } else if (/^%%NAV_BTN:/.test(seg)) {
          const id = seg.replace(/^%%NAV_BTN:/,'').replace(/%%$/,'');
          narrativeIds.push(id);
        } else {
          if (!this.isNonEmptyHtmlSegment(seg)) continue; // skip blank/whitespace-only segments
          const processedSeg = this.processHtmlColorsPreserveHtml(seg)
            .replace(/&nbsp;/gi, ' ')
            .replace(/\u00A0/g, ' ');
          // If segment contains multiple top-level paragraph tags, split into separate rich text nodes.
          const paraMatches = processedSeg.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
          const multipleParas = paraMatches && paraMatches.length > 1;
          if (multipleParas) {
            for (const pHtml of paraMatches) {
              // Skip empty or &nbsp; only paragraphs
              const inner = pHtml.replace(/^<p[^>]*>|<\/p>$/gi,'').trim().replace(/&nbsp;/gi, ' ').replace(/\u00A0/g, ' ');
              const innerStripped = inner.replace(/&nbsp;|\s+/g,'').trim();
              if (!innerStripped) continue;
              // Strip outer <p> wrapper; viewer will wrap as paragraph automatically
              const richId = this.builder.createRichTextNode(inner, 'paragraph');
              if (pHtml.includes('data-storymaps')) {
                for (const stub of navigateInlineStubs) {
                  if (!stub.richNodeId && pHtml.includes(`data-storymaps="${stub.actionId}"`)) stub.richNodeId = richId;
                }
              }
              narrativeIds.push(richId);
            }
          } else {
            // Single segment: if wrapped in <p> remove wrapper so we store only inner markup
            let singleContent = processedSeg;
            const singleMatch = /^<p[^>]*>[\s\S]*?<\/p>$/.exec(processedSeg.trim());
            if (singleMatch) {
              singleContent = processedSeg.trim().replace(/^<p[^>]*>|<\/p>$/gi,'').trim();
            }
            singleContent = singleContent.replace(/&nbsp;/gi, ' ').replace(/\u00A0/g, ' ');
            const richId = this.builder.createRichTextNode(singleContent, 'paragraph');
            if (processedSeg.includes('data-storymaps')) {
              for (const stub of navigateInlineStubs) {
                if (!stub.richNodeId && processedSeg.includes(`data-storymaps="${stub.actionId}"`)) stub.richNodeId = richId;
              }
            }
            narrativeIds.push(richId);
          }
        }
      }
      return;
    }
    if (el.tagName === 'IFRAME') {
      const src = el.getAttribute('src');
      if (src) {
        const appId = this.parseSwipeAppId(src);
        if (appId && typeof window === 'undefined') {
          const classic = this.fetchClassicSwipeDataSync(appId);
          if (classic && classic.values) {
            const layout = this.parseSwipeLayoutFromUrl(src) || (String(classic.values.layout || '').toLowerCase().includes('spyglass') ? 'spyglass' : 'swipe');
            try {
              const isBrowser = typeof window !== 'undefined';
              const hasValues = !!classic.values;
              this.logDebug('iframe (DOM) -> attempting inline swipe build', { appId, layout, env: isBrowser ? 'browser' : 'node', hasValues });
              const swipeNodeId = SwipeConverter.buildInlineSwipeBlockSync(this.builder, classic.values as import('../types/classic.ts').ClassicValues, layout, this.token);
              narrativeIds.push(swipeNodeId);
              this.logDebug('iframe (DOM) -> inline swipe built', { swipeNodeId });
              this.flushDebugLogs('embedded-swipe');
              return;
            } catch (e) {
              // fall through to embed on failure
              this.logWarn('iframe (DOM) -> inline swipe build failed, using embed', { appId, error: (e as Error)?.message });
              this.flushDebugLogs('embedded-swipe');
            }
          }
        }
        const providerInfo = this.detectVideoProvider(src);
          if (providerInfo.provider !== 'unknown') {
          narrativeIds.push(this.builder.createVideoEmbedNode(src, providerInfo.provider, providerInfo.id));
          this.videoEmbedCount++;
            this.logDebug('iframe (DOM) -> video embed', providerInfo);
            this.flushDebugLogs('embedded-swipe');
        } else {
          narrativeIds.push(this.builder.createEmbedNode(src));
            this.logDebug('iframe (DOM) -> link embed', { src });
            this.flushDebugLogs('embedded-swipe');
        }
      }
      return;
    }
    const fallback = el.textContent?.trim();
    if (fallback) narrativeIds.push(this.builder.createTextNode(fallback, 'paragraph'));
  }

  // Fallback parser for Node (preserves approximate order of major block elements and inline media/action anchors)
  private parseOrderedFallback(
    html: string,
    narrativeIds: string[],
    actionStubs: Array<{ actionId: string; text: string; buttonNodeId: string }>,
    navigateButtonStubs: Array<{ actionId: string; buttonNodeId: string }>,
    navigateInlineStubs: Array<{ actionId: string; richNodeId: string }>
  ): void {
    // Extract style blocks first so they aren't lost
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = styleRegex.exec(html)) !== null) {
      const css = sm[1].trim();
      if (css) this.styleBlocks.push(css);
    }
    const blockRegex = /(<figure[\s\S]*?<\/figure>)|(<img[^>]*>)|(<p[\s\S]*?<\/p>)|(<div[\s\S]*?<\/div>)|(<iframe[\s\S]*?<\/iframe>)/gi;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(html)) !== null) {
      const fragment = match[0];
      const tagStart = fragment.slice(0, 10).toLowerCase();
      if (tagStart.startsWith('<style')) {
        const css = fragment.replace(/^<style[^>]*>|<\/style>$/gi, '').trim();
        if (css) this.styleBlocks.push(css);
        continue;
      }
      if (tagStart.startsWith('<figure')) {
        const imgTag = /<img[^>]*>/i.exec(fragment)?.[0];
        if (imgTag) {
          const src = /src=["']([^"'>]+)["']/i.exec(imgTag)?.[1];
          if (src) {
            const alt = /alt=["']([^"'>]*)["']/i.exec(imgTag)?.[1];
            const cap = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(fragment)?.[1];
            const resId = this.builder.addImageResource(src);
            narrativeIds.push(this.builder.createImageNode(resId, cap ? this.stripHtml(cap).trim() : undefined, alt, 'standard'));
            this.media.add(src);
          }
        }
        continue;
      }
      if (tagStart.startsWith('<iframe')) {
        const src = /src=["']([^"'>]+)["'][^>]*>/i.exec(fragment)?.[1];
        if (src) {
          const appId = this.parseSwipeAppId(src);
          if (appId && typeof window === 'undefined') {
            const classic = this.fetchClassicSwipeDataSync(appId);
            if (classic && classic.values) {
              const layout = this.parseSwipeLayoutFromUrl(src) || (String(classic.values.layout || '').toLowerCase().includes('spyglass') ? 'spyglass' : 'swipe');
              try {
                const isBrowser = typeof window !== 'undefined';
                const hasValues = !!classic.values;
                this.logDebug('iframe (regex) -> attempting inline swipe build', { appId, layout, env: isBrowser ? 'browser' : 'node', hasValues });
                const swipeNodeId = SwipeConverter.buildInlineSwipeBlockSync(this.builder, classic.values as import('../types/classic.ts').ClassicValues, layout, this.token);
                narrativeIds.push(swipeNodeId);
                continue;
              } catch (e) {
                // fall through
                this.logWarn('iframe (regex) -> inline swipe build failed', { appId, error: (e as Error)?.message });
              }
            }
          }
          const providerInfo = this.detectVideoProvider(src);
          if (providerInfo.provider !== 'unknown') {
            narrativeIds.push(this.builder.createVideoEmbedNode(src, providerInfo.provider, providerInfo.id));
            this.videoEmbedCount++;
          } else {
            narrativeIds.push(this.builder.createEmbedNode(src));
          }
        }
        continue;
      }
      if (tagStart.startsWith('<p') || tagStart.startsWith('<div')) {
        const inner = fragment.replace(/^<p[^>]*>|^<div[^>]*>|<\/p>$|<\/div>$/gi, '');
        // Replace images and anchors with tokens to preserve order
        let working = inner;
        // Images
        const imgRegex = /<img[^>]*src=["']([^"'>]+)["'][^>]*>/gi;
        let im: RegExpExecArray | null;
        while ((im = imgRegex.exec(inner)) !== null) {
          const tag = im[0];
          const src = im[1];
          const alt = /alt=["']([^"'>]*)["']/i.exec(tag)?.[1];
          const rId = this.builder.addImageResource(src);
          const imgNodeId = this.builder.createImageNode(rId, undefined, alt, 'standard');
          this.media.add(src);
          working = working.replace(tag, `%%IMG:${imgNodeId}%%`);
        }
        // Anchors
        const aRegex = /<a[^>]*data-storymaps=["']([^"'>]+)["'][^>]*>[\s\S]*?<\/a>/gi;
        let am: RegExpExecArray | null;
        while ((am = aRegex.exec(inner)) !== null) {
          const full = am[0];
          const actionId = am[1];
          const actionType = /data-storymaps-type=["']([^"'>]+)["']/i.exec(full)?.[1] || '';
          const labelRaw = full.replace(/<a[^>]*>|<\/a>/gi, '');
          const label = this.stripHtml(labelRaw).trim() || 'View';
          const normalizedLabel = this.normalizeButtonLabel(label);
          const classAttr = /class=["']([^"'>]+)["']/i.exec(full)?.[1] || '';
          const hasButtonClass = classAttr.split(/\s+/).some(c => this.BUTTON_CLASS_REGEX.test(c));
          if (actionType === 'media') {
            const btnId = this.builder.createActionButtonNode(normalizedLabel, 'wide');
            actionStubs.push({ actionId, text: normalizedLabel, buttonNodeId: btnId });
            working = working.replace(full, `%%ACTION_BTN:${btnId}%%`);
          } else if (actionType === 'navigate') {
            if (hasButtonClass) {
              const btnId = this.builder.createButtonNode(normalizedLabel, 'wide');
              navigateButtonStubs.push({ actionId, buttonNodeId: btnId });
              working = working.replace(full, `%%NAV_BTN:${btnId}%%`);
            } else {
              navigateInlineStubs.push({ actionId, richNodeId: '' });
            }
          }
        }
        // Iframes (detect embedded classic Swipe and replace with swipe block when possible)
        const iframeRegex = /<iframe[^>]*src=["']([^"'>]+)["'][^>]*>[\s\S]*?<\/iframe>/gi;
        let ifm: RegExpExecArray | null;
        while ((ifm = iframeRegex.exec(inner)) !== null) {
          const full = ifm[0];
          const src = ifm[1];
          let replacementId: string | undefined;
          const appId = this.parseSwipeAppId(src);
          if (appId && typeof window === 'undefined') {
            const classic = this.fetchClassicSwipeDataSync(appId);
            if (classic && classic.values) {
              const layout = this.parseSwipeLayoutFromUrl(src) || (String(classic.values.layout || '').toLowerCase().includes('spyglass') ? 'spyglass' : 'swipe');
              try {
                this.logDebug('iframe (regex) -> attempting inline swipe build', { appId, layout });
                replacementId = SwipeConverter.buildInlineSwipeBlockSync(this.builder, classic.values as import('../types/classic.ts').ClassicValues, layout, this.token);
                this.logDebug('iframe (regex) -> inline swipe built', { replacementId });
                this.flushDebugLogs('embedded-swipe');
              } catch {
                // fall through
                this.logWarn('iframe (regex) -> inline swipe build failed, will fallback', { appId });
                this.flushDebugLogs('embedded-swipe');
              }
            }
          }
          if (!replacementId) {
            const providerInfo = this.detectVideoProvider(src);
            if (providerInfo.provider !== 'unknown') {
              replacementId = this.builder.createVideoEmbedNode(src, providerInfo.provider, providerInfo.id);
              this.videoEmbedCount++;
              this.logDebug('iframe (regex) -> video embed fallback', providerInfo);
              this.flushDebugLogs('embedded-swipe');
            } else {
              replacementId = this.builder.createEmbedNode(src);
              this.logDebug('iframe (regex) -> link embed fallback', { src });
              this.flushDebugLogs('embedded-swipe');
            }
          }
          working = working.replace(full, `%%IFRAME_NODE:${replacementId}%%`);
        }
        const segments = working.split(/(%%IMG:[^%]+%%|%%ACTION_BTN:[^%]+%%|%%NAV_BTN:[^%]+%%|%%IFRAME_NODE:[^%]+%%)/);
        for (const seg of segments) {
          if (!seg) continue;
          if (/^%%IMG:/.test(seg)) {
            narrativeIds.push(seg.replace(/^%%IMG:/,'').replace(/%%$/,''));
          } else if (/^%%ACTION_BTN:/.test(seg)) {
            narrativeIds.push(seg.replace(/^%%ACTION_BTN:/,'').replace(/%%$/,''));
          } else if (/^%%NAV_BTN:/.test(seg)) {
            narrativeIds.push(seg.replace(/^%%NAV_BTN:/,'').replace(/%%$/,''));
          } else if (/^%%IFRAME_NODE:/.test(seg)) {
            narrativeIds.push(seg.replace(/^%%IFRAME_NODE:/,'').replace(/%%$/,''));
          } else {
            if (!this.isNonEmptyHtmlSegment(seg)) continue; // skip blank/whitespace-only segments
            const processedSeg = this.processHtmlColorsPreserveHtml(seg)
              .replace(/&nbsp;/gi, ' ')
              .replace(/\u00A0/g, ' ');
            const paraMatches = processedSeg.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
            const multipleParas = paraMatches && paraMatches.length > 1;
            if (multipleParas) {
              for (const pHtml of paraMatches) {
                const inner = pHtml.replace(/^<p[^>]*>|<\/p>$/gi,'').trim().replace(/&nbsp;/gi, ' ').replace(/\u00A0/g, ' ');
                const innerStripped = inner.replace(/&nbsp;|\s+/g,'').trim();
                if (!innerStripped) continue;
                const richId = this.builder.createRichTextNode(inner, 'paragraph');
                if (pHtml.includes('data-storymaps')) {
                  for (const stub of navigateInlineStubs) {
                    if (!stub.richNodeId && pHtml.includes(`data-storymaps="${stub.actionId}"`)) stub.richNodeId = richId;
                  }
                }
                narrativeIds.push(richId);
              }
            } else {
              let singleContent = processedSeg;
              const singleMatch = /^<p[^>]*>[\s\S]*?<\/p>$/.exec(processedSeg.trim());
              if (singleMatch) singleContent = processedSeg.trim().replace(/^<p[^>]*>|<\/p>$/gi,'').trim();
              singleContent = singleContent.replace(/&nbsp;/gi, ' ').replace(/\u00A0/g, ' ');
              const richId = this.builder.createRichTextNode(singleContent, 'paragraph');
              if (processedSeg.includes('data-storymaps')) {
                for (const stub of navigateInlineStubs) {
                  if (!stub.richNodeId && processedSeg.includes(`data-storymaps="${stub.actionId}"`)) stub.richNodeId = richId;
                }
              }
              narrativeIds.push(richId);
            }
          }
        }
        continue;
      }
      // Fallback plain text
      const text = this.stripHtml(fragment).trim();
      if (text) narrativeIds.push(this.builder.createTextNode(text, 'paragraph'));
    }
  }

  // Detect YouTube or Vimeo video provider and extract canonical video id
  private detectVideoProvider(url: string): { provider: 'youtube' | 'vimeo' | 'unknown'; id?: string } {
    if (!url) return { provider: 'unknown' };
    const ytMatch = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})(?:[&#?].*)?$/i.exec(url);
    if (ytMatch) {
      return { provider: 'youtube', id: ytMatch[1] };
    }
    const vimeoMatch = /(?:vimeo\.com\/(?:video\/)?)(\d+)(?:[&#?].*)?$/i.exec(url);
    if (vimeoMatch) {
      return { provider: 'vimeo', id: vimeoMatch[1] };
    }
    return { provider: 'unknown' };
  }

  // --- Swipe embed helpers ---
  private parseSwipeAppId(url: string): string | undefined {
    try {
      const u = new URL(url, 'https://example.com');
      const appid = u.searchParams.get('appid') || u.searchParams.get('appId');
      return appid || undefined;
    } catch {
      const m = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(url);
      return m?.[1];
    }
  }

  private parseSwipeLayoutFromUrl(url: string): 'swipe' | 'spyglass' | undefined {
    try {
      const u = new URL(url, 'https://example.com');
      const layout = (u.searchParams.get('layout') || '').toLowerCase();
      if (layout.includes('spyglass')) return 'spyglass';
      if (layout.includes('swipe')) return 'swipe';
      return undefined;
    } catch {
      return undefined;
    }
  }

  private fetchClassicSwipeDataSync(itemId: string): { values?: import('../types/classic.ts').ClassicValues } | undefined {
    try {
      const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
      const url = this.token ? `${base}&token=${encodeURIComponent(this.token)}` : base;
      const out = execSync(`curl -sL '${url}'`, { encoding: 'utf-8' });
      const json = JSON.parse(out);
      return json;
    } catch {
      return undefined;
    }
  }

  private fetchClassicSwipeDataProvided(appId: string): { values?: import('../types/classic.ts').ClassicValues } | undefined {
    try {
      const root = this.classicJson as unknown as { __embeddedSwipes?: Record<string, unknown> };
      const valuesRoot = (this.classicJson as unknown as { values?: unknown }).values as unknown as { __embeddedSwipes?: Record<string, unknown> } | undefined;
      const store = root.__embeddedSwipes || valuesRoot?.__embeddedSwipes || undefined;
      const found = store ? store[appId] : undefined;
      if (found && typeof found === 'object') {
        return found as { values?: import('../types/classic.ts').ClassicValues };
      }
    } catch { /* ignore */ }
    return undefined;
  }

  // Attempts to build a native swipe node from a classic swipe embed URL.
  // Returns the created node id on success; otherwise undefined to allow fallback to embed.
  private tryBuildSwipeNodeFromUrl(url: string): string | undefined {
    const appId = this.parseSwipeAppId(url);
    if (!appId) return undefined;
    // Browser path: use pre-fetched swipe JSON when available
    const isBrowser = typeof window !== 'undefined';
    const classic = isBrowser ? this.fetchClassicSwipeDataProvided(appId) : this.fetchClassicSwipeDataSync(appId);
    // Fallback for browser: fetch swipe JSON directly if not pre-provided
    if (isBrowser && (!classic || !classic.values)) {
      try {
        const base = `https://www.arcgis.com/sharing/rest/content/items/${appId}/data?f=json`;
        const url2 = this.token ? `${base}&token=${encodeURIComponent(this.token)}` : base;
        fetchJsonWithCache<{ values?: import('../types/classic.ts').ClassicValues }>(url2, undefined, 10 * 60 * 1000);
        // Note: fetchJsonWithCache returns a Promise; we cannot await here. Defer to embed when not available.
      } catch { /* ignore */ }
    }
    if (!classic || !classic.values) return undefined;
    const layoutHint = this.parseSwipeLayoutFromUrl(url);
    const layout = layoutHint || (String(classic.values.layout || '').toLowerCase().includes('spyglass') ? 'spyglass' : 'swipe');
    try {
      this.logDebug('tryBuildSwipeNodeFromUrl: attempting inline swipe build from', { url });
      const swipeNodeId = (typeof window !== 'undefined')
        ? SwipeConverter.buildInlineSwipeBlockBrowserSync(this.builder, classic.values as import('../types/classic.ts').ClassicValues, layout, this.token)
        : SwipeConverter.buildInlineSwipeBlockSync(this.builder, classic.values as import('../types/classic.ts').ClassicValues, layout, this.token);
      // DEV-only: log alignment snapshot for inline swipe contents (extent/center/viewpoint)
      try {
        if (import.meta && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
          const liveJson = this.builder.getJson();
          const swipeNode = liveJson.nodes[swipeNodeId];
          const contents = (swipeNode?.data as unknown as { contents?: Record<string,string> })?.contents || {};
          const leftId = contents['0'];
          const rightId = contents['1'];
          const leftNode = leftId ? liveJson.nodes[leftId] : undefined;
          const rightNode = rightId ? liveJson.nodes[rightId] : undefined;
          const leftData = (leftNode?.data || {}) as Record<string, unknown>;
          const rightData = (rightNode?.data || {}) as Record<string, unknown>;
          // Print concise snapshot focusing on alignment-related fields
          console.info('[InlineSwipe][AlignmentSnapshot]', {
            layout,
            swipeNodeId,
            left: {
              nodeId: leftId,
              extent: leftData.extent,
              center: (leftData as unknown as { center?: unknown })?.center,
              viewpoint: (leftData as unknown as { viewpoint?: unknown })?.viewpoint,
              viewPlacement: (leftData as unknown as { viewPlacement?: unknown })?.viewPlacement,
            },
            right: {
              nodeId: rightId,
              extent: rightData.extent,
              center: (rightData as unknown as { center?: unknown })?.center,
              viewpoint: (rightData as unknown as { viewpoint?: unknown })?.viewpoint,
              viewPlacement: (rightData as unknown as { viewPlacement?: unknown })?.viewPlacement,
            }
          });
          // Also log resource-level alignment data for referenced webmaps
          const leftResId: string | undefined = (leftNode?.data as unknown as { map?: string })?.map;
          const rightResId: string | undefined = (rightNode?.data as unknown as { map?: string })?.map;
          const leftResData = leftResId ? (liveJson.resources[leftResId]?.data as Record<string, unknown> | undefined) : undefined;
          const rightResData = rightResId ? (liveJson.resources[rightResId]?.data as Record<string, unknown> | undefined) : undefined;
          console.info('[InlineSwipe][ResourceSnapshot]', {
            swipeNodeId,
            left: { resourceId: leftResId, extent: leftResData?.extent, center: (leftResData as any)?.center, viewpoint: (leftResData as any)?.viewpoint },
            right: { resourceId: rightResId, extent: rightResData?.extent, center: (rightResData as any)?.center, viewpoint: (rightResData as any)?.viewpoint }
          });
          // For TWO_WEBMAPS, if node-level alignment is missing, initialize from RIGHT webmap resource
          try {
            const vals = classic.values as import('../types/classic.ts').ClassicValues;
            const dm = String(vals.dataModel || '').toUpperCase();
            if (dm === 'TWO_WEBMAPS' && rightResData && (leftId || rightId)) {
              const resExtent = (rightResData as any)?.extent;
              const resCenter = (rightResData as any)?.center;
              let resViewpoint = (rightResData as any)?.viewpoint as { targetGeometry?: unknown; scale?: number } | undefined;
              if (!resViewpoint && resExtent) {
                const sz = determineScaleZoomLevel(resExtent as unknown as { ymax: number; ymin: number });
                if (sz) resViewpoint = { targetGeometry: resCenter ?? resExtent, scale: sz.scale };
              }
              const applyFromRight = (nodeId?: string) => {
                if (!nodeId) return;
                this.builder.updateNodeData(nodeId, (data) => {
                  const hasExtent = !!(data as any).extent;
                  const hasVp = !!(data as any).viewpoint;
                  if (!hasExtent && resExtent) (data as Record<string, unknown>).extent = resExtent as unknown as Record<string, unknown>;
                  if (!hasVp && resViewpoint) (data as Record<string, unknown>).viewpoint = resViewpoint as unknown as Record<string, unknown>;
                  if (!(data as any).viewPlacement) (data as Record<string, unknown>).viewPlacement = 'extent' as unknown as Record<string, unknown>;
                });
              };
              applyFromRight(leftId);
              applyFromRight(rightId);
            }
          } catch { /* ignore alignment init errors */ }
        }
      } catch { /* ignore logging errors */ }
      // Integrity check: ensure referenced content nodes exist; recreate if missing.
      try {
        const liveJson = this.builder.getJson();
        const swipeNode = liveJson.nodes[swipeNodeId];
        if (swipeNode && swipeNode.type === 'swipe') {
          let contents = (swipeNode.data as { contents?: Record<string,string> } | undefined)?.contents || {};
          const missingKeys: string[] = [];
          for (const key of ['0','1']) {
            const cid = contents[key];
            if (!cid || !liveJson.nodes[cid]) missingKeys.push(key);
          }
          if (missingKeys.length) {
            const vals = classic.values as import('../types/classic.ts').ClassicValues;
            const dataModel = String(vals.dataModel || '').toUpperCase();
            // Build replacement content nodes
            const rebuilt: Record<string,string> = { ...contents };
            if (dataModel === 'TWO_LAYERS') {
              const baseId = String(vals.webmap || '');
              if (baseId) {
                const resId = this.builder.addWebMapResource(baseId, 'Web Map', {}, 'default');
                const layers: Array<{ id: string; title?: string }> = Array.isArray(vals.layers) ? (vals.layers as Array<{ id: string; title?: string }>) : [];
                const nodeA = this.builder.createWebMapNode(resId, undefined);
                const nodeB = this.builder.createWebMapNode(resId, undefined);
                if (layers.length >= 2) {
                  const l0 = layers[0];
                  const l1 = layers[1];
                  this.builder.updateNodeData(nodeA, d => {
                    (d as Record<string, unknown>).mapLayers = [
                      { id: l0.id, title: l0.title || l0.id, visible: true },
                      { id: l1.id, title: l1.title || l1.id, visible: false }
                    ];
                  });
                  this.builder.updateNodeData(nodeB, d => {
                    (d as Record<string, unknown>).mapLayers = [
                      { id: l0.id, title: l0.title || l0.id, visible: false },
                      { id: l1.id, title: l1.title || l1.id, visible: true }
                    ];
                  });
                }
                rebuilt['0'] = nodeA;
                rebuilt['1'] = nodeB;
              }
            } else { // TWO_WEBMAPS fallback
              const wmIds: string[] = [];
              if (Array.isArray(vals.webmaps)) {
                for (const entry of vals.webmaps) {
                  if (typeof entry === 'string') wmIds.push(entry);
                  else if (entry && typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) wmIds.push(String((entry as Record<string, unknown>).id));
                }
              } else if (vals.webmap) wmIds.push(String(vals.webmap));
              const [wmA, wmB] = wmIds;
              if (wmA) {
                const rA = this.builder.addWebMapResource(wmA, 'Web Map', {}, 'default');
                rebuilt['0'] = this.builder.createWebMapNode(rA, undefined);
              }
              if (wmB) {
                const rB = this.builder.addWebMapResource(wmB, 'Web Map', {}, 'default');
                rebuilt['1'] = this.builder.createWebMapNode(rB, undefined);
              }
            }
            // Patch swipe node data with rebuilt contents (typed)
            this.builder.updateNode(swipeNodeId, node => {
              const dataObj: Record<string, unknown> = (node as unknown as { data?: Record<string, unknown> }).data || {};
              dataObj.contents = rebuilt as unknown as Record<string, unknown>;
              (node as unknown as { data?: Record<string, unknown> }).data = dataObj;
            });
            contents = rebuilt;
            this.logDebug('swipe contents rebuilt due to missing keys', { missingKeys });
          }
          // Final guard: ensure both content references exist; else drop swipe
          const c0 = contents['0'];
          const c1 = contents['1'];
          if (!c0 || !c1 || !liveJson.nodes[c0] || !liveJson.nodes[c1]) {
            // Remove the broken swipe node and return undefined to allow embed fallback
            try { this.builder.removeNode(swipeNodeId); } catch { /* ignore */ }
            this.logWarn('dropping inline swipe; invalid contents', { c0, c1 });
            this.flushDebugLogs('embedded-swipe');
            return undefined;
          }
          this.logDebug('inline swipe built successfully', { swipeNodeId, contents });
        }
      } catch { /* ignore integrity rebuild errors */ }
      // Ensure converter-metadata reflects Map Journal at story level and records classic item id
      try {
        const classicId = (this.options as any)?.classicItemId as string | undefined;
        const payload: Record<string, unknown> = {};
        if (classicId) payload.classicItemId = classicId;
        this.builder.addConverterMetadata('MapJournal', { classicMetadata: {}, ...(payload as any) });
      } catch { /* ignore metadata update errors */ }
      this.flushDebugLogs('embedded-swipe');
      return swipeNodeId;
    } catch (e) {
      this.logWarn('inline swipe build failed; will use embed', { url, error: (e as Error)?.message });
      this.flushDebugLogs('embedded-swipe');
      return undefined;
    }
  }
}
