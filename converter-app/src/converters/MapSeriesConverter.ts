/**
 * MapSeriesConverter (MVP skeleton)
 *
 * Builds one StoryMaps draft JSON per Classic Map Series entry.
 * Returns child drafts and lightweight publish plan with builder URLs.
 */
import { BaseConverter } from './BaseConverter';
import type { BaseConverterOptions } from './BaseConverter';
import type { ConverterResult, StoryMapJSON } from '../types/core';
import type { ClassicEntry, ClassicEntryMedia, ProgressEvent } from '../types/mapseries';
import { StoryMapJSONBuilder } from '../schema/StoryMapJSONBuilder';
import { MapJournalConverter } from './MapJournalConverter';
import { MapTourConverter } from './MapTourConverter';
import { SwipeConverter } from './SwipeConverter';
import { detectClassicTemplate } from '../util/detectTemplate';
import { deriveWebmapThumbnailUrl, deriveImageThumbnailUrl, deriveEmbedThumbnailUrl, getDefaultThumbnailUrl, buildProxiedThumbnailUrl } from '../util/thumbnails';
import { createDraftStory, getUsername, addResource } from '../api/arcgis-client';
import { getOrgBase } from '../lib/orgBase';

// Types moved to src/types/mapseries.ts

export interface MapSeriesResult extends Omit<ConverterResult,'storymapJson'> {
  storymapJsons: StoryMapJSON[];
  entryTitles: string[];
  builderLinks?: string[];
  thumbnailUrls?: string[];
  draftItemIds?: string[];
  thumbnailResourcePaths?: string[];
}

export class MapSeriesConverter extends BaseConverter {
  private builders: StoryMapJSONBuilder[] = [];
  private entryTitles: string[] = [];
  private static childCache: Record<string, Record<string, unknown>> = {};

  constructor(opts: BaseConverterOptions) {
    super(opts);
  }

  protected extractStructure(): void {
    this.emit('MapSeries: extractStructure');
  }

  protected async convertContent(): Promise<void> {
    const values = (this.classicJson as { values?: { story?: { entries?: ClassicEntry[] } } }).values || {};
    const entries = values.story?.entries || [];
    if (!Array.isArray(entries) || !entries.length) {
      this.emit('MapSeries: no entries found');
      return;
    }
    for (const [idx, entry] of entries.entries()) {
      const title = (entry.title || `Entry ${idx + 1}`);
      const subtitle = (entry.subtitle || '');
      const b = new StoryMapJSONBuilder(this.themeId);
      b.createStoryRoot();
      b.addCoverNode(title, subtitle);
      b.addNavigationHidden();
      b.addCreditsNode();
      const webmapId = typeof entry.webmap === 'string' ? entry.webmap : undefined;
      const desc = (entry.description || '') as string;
      const textNode = b.createTextNode(desc, 'paragraph', 'wide');
      const mapNodeId = b.createWebMapNode(webmapId);
      b.addChild(b.getStoryRootId(), textNode);
      b.addChild(b.getStoryRootId(), mapNodeId);
      this.builders.push(b);
      this.entryTitles.push(title);
    }
  }

  protected applyTheme(): void {
    // Theme applied per entry via builder initialization
  }

  protected collectMedia(): string[] {
    return [];
  }

  protected getStoryMapJson(): StoryMapJSON {
    // Not used; series returns multiple JSONs via convertSeries()
    return this.builders[0]?.getJson() as StoryMapJSON;
  }

  static async convertSeries(opts: { classicJson: Record<string, unknown>; themeId: 'auto' | 'summit' | 'obsidian'; progress?: (e: ProgressEvent) => void; token?: string }): Promise<{ storymapJsons: StoryMapJSON[]; entryTitles: string[]; builderLinks: string[]; thumbnailUrls: string[]; draftItemIds: string[]; thumbnailResourcePaths: string[] }> {
      const { classicJson, themeId, progress, token } = opts;
      // Derive theme from classic and honor user selection
      const { computeTheme } = await import('../util/classicTheme');
      const derived = computeTheme(themeId, classicJson as Record<string, unknown>);
      const themeToUse = derived.themeId;
      // Extract global Map Series settings used to inform Sidecar panel and map options
      const seriesSettings = (classicJson as { values?: { settings?: Record<string, unknown> } }).values?.settings || {} as Record<string, unknown>;
      const layout = (seriesSettings as { layout?: { id?: string } }).layout || {};
      const layoutOptions = (seriesSettings as { layoutOptions?: { panel?: { position?: string; size?: 'wide' | 'standard' } } }).layoutOptions || {} as { panel?: { position?: string; size?: 'wide' | 'standard' } };
      const panelOpts = layoutOptions.panel || {};
      const mapOptions = (seriesSettings as { mapOptions?: Record<string, unknown> }).mapOptions || {} as Record<string, unknown>;
      const entries = Array.isArray(classicJson?.values?.story?.entries)
        ? classicJson.values.story.entries
        : Array.isArray(classicJson?.values?.story?.sections)
          ? classicJson.values.story.sections
          : [];
      // Helper: classify entry type and template
      const classify = (entry: ClassicEntry): { kind: 'image' | 'video' | 'embed' | 'classic' | 'webmap' | 'unknown'; template?: 'mapjournal' | 'maptour' | 'swipe' | 'mapseries' } => {
        try {
          const media: ClassicEntryMedia = (entry?.media || entry?.content || {}) as ClassicEntryMedia;
          // Webmap entries (Map Series often uses media.type === 'webmap')
          const mediaType = (media as unknown as { type?: string }).type || '';
          const webmapId = (typeof media?.webmap === 'string' ? media.webmap : (media as unknown as { webmap?: { id?: string } }).webmap?.id) || (typeof (entry as unknown as { webmap?: string }).webmap === 'string' ? (entry as unknown as { webmap?: string }).webmap : '');
          if (mediaType.toLowerCase() === 'webmap' || webmapId) {
            return { kind: 'webmap' };
          }
          const imageUrl = (typeof media?.image === 'string' ? media.image : media?.image?.url) || media?.imageUrl || media?.photo;
          const videoUrl = (typeof media?.video === 'string' ? media.video : media?.video?.source) || media?.videoUrl;
          const embedUrl = media?.webpage?.url || media?.embed?.url || media?.url;
          if (imageUrl) return { kind: 'image' };
          if (videoUrl) return { kind: 'video' };
          if (embedUrl) {
            const txt = String(embedUrl).toLowerCase();
            if (/storymaps\.(arcgis)\.com\/stories\//.test(txt)) return { kind: 'classic' };
            if (/appid=/.test(txt) || /apps\/(MapTour|MapJournal|StoryMapJournal|swipe)/i.test(txt)) {
              const mapName = () => {
                if (/journal|storymapjournal/.test(txt)) return 'mapjournal';
                if (/tour/.test(txt)) return 'maptour';
                if (/swipe|spyglass/.test(txt)) return 'swipe';
                if (/series/.test(txt)) return 'mapseries';
                return undefined;
              };
              const t = mapName();
              return { kind: 'classic', template: t };
            }
            return { kind: 'embed' };
          }
          const appField = (entry as unknown as { appid?: string; appId?: string }).appid || (entry as unknown as { appid?: string; appId?: string }).appId;
          if (appField && /^[a-f0-9]{32}$/i.test(appField)) return { kind: 'classic', template: 'mapjournal' };
          const sysApp = (entry as unknown as { content?: { actions?: { open?: { system?: { appid?: string } } } } }).content?.actions?.open?.system?.appid;
          if (sysApp && /^[a-f0-9]{32}$/i.test(sysApp)) return { kind: 'classic', template: 'mapjournal' };
          const hasClassic = !!(media?.webmap || media?.appid || media?.appId);
          if (hasClassic) return { kind: 'classic', template: 'mapjournal' };
        } catch { /* ignore */ }
        return { kind: 'unknown' };
      };
      const storymapJsons: StoryMapJSON[] = [];
      const entryTitles: string[] = [];
      const builderLinks: string[] = [];
      const thumbnailUrls: string[] = [];
      const draftItemIds: string[] = [];
      const thumbnailResourcePaths: string[] = [];
      // Debug: summarize entry types and itemIds/appids detected ahead of conversion
      const summaries = (entries || []).map((entry: ClassicEntry, idx: number) => {
        const media: ClassicEntryMedia = (entry?.media || entry?.content || {}) as ClassicEntryMedia;
        const embedUrl = media?.webpage?.url || media?.embed?.url || media?.url || '';
        const urlApp = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(String(embedUrl))?.[1] || '';
        const appField = (entry as unknown as { appid?: string; appId?: string }).appid || (entry as unknown as { appid?: string; appId?: string }).appId || '';
        const sysApp = (entry as unknown as { content?: { actions?: { open?: { system?: { appid?: string } } } } }).content?.actions?.open?.system?.appid || '';
        const k = classify(entry);
        const kind = k.template ? `${k.kind}:${k.template}` : k.kind;
        return { index: idx + 1, title: String(entry?.title || entry?.headline || ''), kind, urlApp, appField, sysApp, embedUrl };
      });
      console.log('[MapSeriesConverter] Entry count:', entries.length, 'Summary:', summaries);


      for (let i = 0; i < entries.length; i++) {
        const entry = (entries[i] || {}) as ClassicEntry;
        const title = String(entry?.title || entry?.headline || `Entry ${i + 1}`);
        entryTitles.push(title);
        const kind = classify(entry);

        const builder = new StoryMapJSONBuilder(themeToUse);
        builder.createStoryRoot();
        // Apply any variable overrides derived at the series level
        try { if (derived.variableOverrides) builder.applyTheme({ themeId: themeToUse, variableOverrides: derived.variableOverrides }); } catch { /* ignore */ }
        builder.addCoverNode(title, '');

        let json: StoryMapJSON;
        if (kind.kind === 'image') {
          const media = (entry?.media || entry?.content || {}) as ClassicEntryMedia;
          const src = (typeof media?.image === 'string' ? media.image : media?.image?.url) || media?.imageUrl || media?.photo || '';
          const tn = builder.createTextNode(src ? `Image: ${src}` : 'Image entry', 'paragraph', 'wide');
          builder.addChild(builder.getStoryRootId(), tn);
          try {
            const direct = deriveImageThumbnailUrl(src);
            const thumb = buildProxiedThumbnailUrl(direct, 400);
            const jsonOnce = builder.getJson();
            const rid = `r-series-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            (jsonOnce as unknown as { resources: Record<string, { type?: string; data?: Record<string, unknown> }> }).resources[rid] = { type: 'series-settings', data: { thumbnailUrl: thumb } };
            thumbnailUrls.push(thumb);
          } catch { /* ignore thumb attach */ }
          json = builder.getJson();
        } else if (kind.kind === 'video') {
          const media = (entry?.media || entry?.content || {}) as ClassicEntryMedia;
          const url = (typeof media?.video === 'string' ? media.video : media?.video?.source) || media?.videoUrl || '';
          const tn = builder.createTextNode(url ? `Video: ${url}` : 'Video entry', 'paragraph', 'wide');
          builder.addChild(builder.getStoryRootId(), tn);
          try {
            const thumb = deriveEmbedThumbnailUrl();
            const jsonOnce = builder.getJson();
            const rid = `r-series-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            (jsonOnce as unknown as { resources: Record<string, { type?: string; data?: Record<string, unknown> }> }).resources[rid] = { type: 'series-settings', data: { thumbnailUrl: thumb } };
            thumbnailUrls.push(thumb);
          } catch { /* ignore thumb attach */ }
          json = builder.getJson();
        } else if (kind.kind === 'embed') {
          const media = (entry?.media || entry?.content || {}) as ClassicEntryMedia;
          const url = media?.webpage?.url || media?.embed?.url || media?.url || '';
          const tn = builder.createTextNode(url ? `Embed: ${url}` : 'Embed entry', 'paragraph', 'wide');
          builder.addChild(builder.getStoryRootId(), tn);
          try {
            const thumb = deriveEmbedThumbnailUrl();
            const jsonOnce = builder.getJson();
            const rid = `r-series-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            (jsonOnce as unknown as { resources: Record<string, { type?: string; data?: Record<string, unknown> }> }).resources[rid] = { type: 'series-settings', data: { thumbnailUrl: thumb } };
            thumbnailUrls.push(thumb);
          } catch { /* ignore thumb attach */ }
          json = builder.getJson();
        } else if (kind.kind === 'webmap') {
          // Build a Sidecar (immersive) slide: narrative panel + webmap media
          const media = (entry?.media || entry?.content || {}) as ClassicEntryMedia;
          const webmapId = (typeof media?.webmap === 'string' ? media.webmap : (media as unknown as { webmap?: { id?: string } }).webmap?.id) || (typeof (entry as unknown as { webmap?: string }).webmap === 'string' ? (entry as unknown as { webmap?: string }).webmap : '');
          const desc = String((entry as unknown as { description?: string }).description || '');
          // Map Classic panel options to Sidecar settings
          const posRaw = String(panelOpts.position || '').toLowerCase();
          const pos: 'start' | 'end' = (posRaw === 'start' || posRaw === 'left') ? 'start' : (posRaw === 'end' || posRaw === 'right') ? 'end' : 'end';
          const sizeClassic = String(panelOpts.size || '').toLowerCase();
          const size: 'small' | 'medium' | 'large' = (sizeClassic === 'small' || sizeClassic === 'medium' || sizeClassic === 'large')
            ? (sizeClassic as 'small' | 'medium' | 'large')
            : (sizeClassic === 'wide' ? 'large' : 'medium');
          const { slideId, narrativeId } = builder.addSidecar('docked-panel', pos, size);
          const tn = builder.createTextNode(desc || 'Map Series entry narrative', 'paragraph', 'wide');
          // Create a proper Web Map resource and node reference so we can enrich it
          const resId = builder.addWebMapResource(webmapId, 'Web Map', undefined, 'minimal');
          const mapNodeId = builder.createWebMapNode(resId);
          // Add narrative and media to Sidecar nodes
          builder.addChild(narrativeId, tn);
          // Append webmap as media child on the slide
          builder.updateNode(slideId, (node) => { if (!node.children) node.children = []; (node.children as string[]).push(mapNodeId); });
          // Apply mapOptions from series settings when present onto the webmap node (basic overlay-only fields)
          try {
            builder.updateNodeData(mapNodeId, (data) => {
              const extent = (mapOptions as { extent?: Record<string, unknown> }).extent;
              const viewpoint = (mapOptions as { viewpoint?: Record<string, unknown> }).viewpoint;
              const zoom = (mapOptions as { zoom?: number }).zoom;
              if (extent && typeof extent === 'object') (data as Record<string, unknown>).extent = extent as Record<string, unknown>;
              if (viewpoint && typeof viewpoint === 'object') (data as Record<string, unknown>).viewpoint = viewpoint as Record<string, unknown>;
              if (typeof zoom === 'number') (data as unknown as { zoom?: number }).zoom = zoom;
            });
          } catch { /* ignore mapOptions mapping errors */ }
          // Enrich the Web Map resource and node with extent/viewpoint/zoom when available
          try {
            const f: typeof fetch | undefined = (typeof fetch !== 'undefined') ? fetch : undefined;
            if (f && typeof webmapId === 'string' && webmapId.length) {
              const ORG_BASE = getOrgBase();
              const urlData = `${ORG_BASE}/sharing/rest/content/items/${webmapId}/data?f=json`;
              const respData = await f(urlData);
              type WebMapData = {
                initialState?: { view?: { extent?: unknown; center?: unknown; scale?: number; zoom?: number } };
                mapOptions?: { extent?: unknown; mapExtent?: unknown; center?: unknown; zoom?: number };
                extent?: unknown;
                center?: unknown;
                view?: { scale?: number };
              };
              let data: WebMapData = {};
              if (respData && respData.ok) {
                data = await respData.json();
              }
              // Attempt to derive extent/center/viewpoint/zoom from common locations in the webmap JSON
              const pickExtent = (d: WebMapData): unknown => d.initialState?.view?.extent || d.mapOptions?.extent || d.extent || d.mapOptions?.mapExtent || undefined;
              const pickCenter = (d: WebMapData): unknown => d.initialState?.view?.center || d.mapOptions?.center || d.center || undefined;
              const extent = pickExtent(data);
              const centerRaw = pickCenter(data);
              const normalizeCenter = (c: unknown): unknown => {
                if (!c) return c;
                if (Array.isArray(c) && c.length >= 2) {
                  const [lon, lat] = c;
                  return { x: lon, y: lat, spatialReference: { wkid: 4326 } };
                }
                return c;
              };
              const center = normalizeCenter(centerRaw);
              const zoom = (data.initialState?.view?.zoom ?? data.mapOptions?.zoom);
              const viewpoint = (data.initialState?.view?.scale || data.view?.scale)
                ? { targetGeometry: extent, scale: (data.initialState?.view?.scale ?? data.view?.scale) }
                : undefined;
              // If extent missing, fallback to item details extent
              let finalExtent = extent;
              if (!finalExtent || (typeof finalExtent !== 'object' && !Array.isArray(finalExtent))) {
                const ORG_BASE = getOrgBase();
                const urlItem = `${ORG_BASE}/sharing/rest/content/items/${webmapId}?f=json`;
                const respItem = await f(urlItem);
                if (respItem && respItem.ok) {
                  const item = await respItem.json();
                  if (Array.isArray(item?.extent) && item.extent.length === 2 && Array.isArray(item.extent[0]) && Array.isArray(item.extent[1])) {
                    const [[xmin, ymin], [xmax, ymax]] = item.extent as [number[], number[]];
                    finalExtent = { xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } };
                  }
                }
              }
              // Update resource-level data
              builder.updateWebMapData(resId, {
                extent: finalExtent,
                center,
                zoom: (typeof zoom === 'number') ? zoom : undefined,
                viewpoint
              });
              // Attach a thumbnail URL for this entry (prefer AGO item thumbnail)
              try {
                const direct = await deriveWebmapThumbnailUrl(String(webmapId));
                const thumb = buildProxiedThumbnailUrl(direct, 400);
                const jsonOnce = builder.getJson();
                const ridThumb = `r-series-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                (jsonOnce as unknown as { resources: Record<string, { type?: string; data?: Record<string, unknown> }> }).resources[ridThumb] = { type: 'series-settings', data: { thumbnailUrl: thumb } };
                thumbnailUrls.push(thumb);
              } catch { /* ignore thumb attach */ }
              // Propagate to node-level if missing
              builder.updateNodeData(mapNodeId, (nd) => {
                const resEntry = builder.getJson().resources[resId];
                const rdata = (resEntry?.data || {}) as { extent?: unknown; viewpoint?: unknown; zoom?: number };
                interface WebMapNodeData { extent?: unknown; viewpoint?: unknown; zoom?: number }
                const ndTyped = nd as unknown as WebMapNodeData;
                if (rdata.extent && !ndTyped.extent) ndTyped.extent = rdata.extent;
                if (rdata.viewpoint && !ndTyped.viewpoint) ndTyped.viewpoint = rdata.viewpoint;
                if (typeof rdata.zoom === 'number' && !ndTyped.zoom) ndTyped.zoom = rdata.zoom;
              });
            }
          } catch { /* ignore enrichment failures; leave minimal webmap node */ }
          // Attach converter metadata noting panel position/size and collection layout id for downstream renderers
          try {
            const jsonOnce = builder.getJson();
            MapSeriesConverter.appendConverterMetadata(jsonOnce, classicJson, undefined, i + 1);
            const resources = (jsonOnce as unknown as { resources: Record<string, { type?: string; data?: Record<string, unknown> }> }).resources;
            const rid = `r-series-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const existing = resources[rid]?.data || {};
            resources[rid] = { type: 'series-settings', data: { ...existing, layoutId: layout?.id, panel: { position: pos, size }, mapOptions, defaultThumbnailUrl: getDefaultThumbnailUrl() } };
          } catch { /* ignore metadata attach errors */ }
          json = builder.getJson();
        } else if (kind.kind === 'classic') {
          // If classic child entry, try full conversion via appropriate converter
          try {
            const childData = await MapSeriesConverter.fetchChildClassicJson(entry, token);
            const detected = detectClassicTemplate(childData);
            const template = (detected?.toLowerCase() || kind.template || 'mapjournal') as 'mapjournal' | 'maptour' | 'swipe' | 'mapseries';
            const childProgress = (e: ProgressEvent) => progress?.({ stage: 'convert', message: `Entry ${i + 1}: ${e.message}`, current: i + 1, total: entries.length });
            if (template === 'mapjournal') {
              const res = MapJournalConverter.convert({ classicJson: childData, themeId: themeToUse, progress: childProgress });
              json = res.storymapJson;
            } else if (template === 'maptour') {
              json = MapTourConverter.convert({ classicJson: childData, themeId: themeToUse, progress: childProgress }).storymapJson;
            } else if (template === 'swipe') {
              const conv = new SwipeConverter({ classicJson: childData, themeId: themeToUse, progress: childProgress, token });
              json = await conv.convert().then(r => r.storymapJson);
            } else if (template === 'mapseries') {
              // Nested series: build simple placeholder noting nesting; full recursion can be added later
              const tn = builder.createTextNode('Nested Map Series detected. Convert separately.', 'paragraph', 'wide');
              builder.addChild(builder.getStoryRootId(), tn);
              json = builder.getJson();
            } else {
              const tn1 = builder.createTextNode('Unsupported classic entry type; saved as embed.', 'paragraph', 'wide');
              builder.addChild(builder.getStoryRootId(), tn1);
              const url = (entry?.media as ClassicEntryMedia)?.webpage?.url || '';
              const tn2 = builder.createTextNode(url ? `Embed: ${url}` : 'Embed entry', 'paragraph', 'wide');
              builder.addChild(builder.getStoryRootId(), tn2);
              json = builder.getJson();
            }
            // Append converter-metadata resource with context
            MapSeriesConverter.appendConverterMetadata(json, classicJson, template, i + 1);
          } catch {
            const tn = builder.createTextNode('Failed to convert classic child entry; saved as placeholder.', 'paragraph', 'wide');
            builder.addChild(builder.getStoryRootId(), tn);
            json = builder.getJson();
          }
        } else {
          const tn = builder.createTextNode(`Converted from Map Series entry ${i + 1}`,'paragraph','wide');
          builder.addChild(builder.getStoryRootId(), tn);
          json = builder.getJson();
        }

        storymapJsons.push(json);
        builderLinks.push(`https://storymaps.arcgis.com/stories/new?title=${encodeURIComponent(title)}`);
        // If token provided, create a draft StoryMap item and upload thumbnail as a resource
        if (token) {
          try {
            const username = await getUsername(token);
            const itemId = await createDraftStory(username, token, title);
            draftItemIds.push(itemId);
            // Upload converted draft JSON to the item's resources as 'draft.json'
            try {
              const draftBlob = new Blob([JSON.stringify(json)], { type: 'application/json' });
              await addResource(itemId, username, draftBlob, 'draft.json', token);
            } catch { /* ignore draft upload failures */ }
            // Upload thumbnail resource (prefer proxied/downscaled URL)
            const thumbUrl = thumbnailUrls[thumbnailUrls.length - 1] || getDefaultThumbnailUrl();
            const resp = await fetch(thumbUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              const resourcePath = `thumbnails/series-entry-${i + 1}.png`;
              await addResource(itemId, username, blob, resourcePath, token);
              thumbnailResourcePaths.push(resourcePath);
            } else {
              // Fallback: skip upload
              thumbnailResourcePaths.push('');
            }
            // Replace builder link with direct editor URL for the created draft
            builderLinks[builderLinks.length - 1] = `https://storymaps.arcgis.com/stories/${itemId}/edit`;
          } catch {
            // If draft creation fails, avoid emitting empty placeholders here;
            // we'll filter invalid entries after the loop to keep arrays consistent.
            // Intentionally skip pushing to draftItemIds/thumbnailResourcePaths.
          }
        }
        progress?.({ stage: 'convert', message: `Converted Map Series entry ${i + 1}`, current: i + 1, total: entries.length });
      }
      // Defensive guard: remove any entries without valid draft item IDs when token provided
      try {
        if (token) {
          const validIdx: number[] = [];
          for (let i = 0; i < draftItemIds.length; i++) {
            const id = draftItemIds[i];
            if (typeof id === 'string' && /^[a-f0-9]{32}$/i.test(id)) validIdx.push(i);
          }
          if (validIdx.length && validIdx.length !== draftItemIds.length) {
            const pick = (arr: unknown[], idxs: number[]) => idxs.map(i => arr[i]);
            const storymapJsonsF = pick(storymapJsons as unknown as unknown[], validIdx) as StoryMapJSON[];
            const entryTitlesF = pick(entryTitles as unknown as unknown[], validIdx) as string[];
            const builderLinksF = pick(builderLinks as unknown as unknown[], validIdx) as string[];
            const thumbnailUrlsF = pick(thumbnailUrls as unknown as unknown[], validIdx) as string[];
            const draftItemIdsF = pick(draftItemIds as unknown as unknown[], validIdx) as string[];
            const thumbnailResourcePathsF = pick(thumbnailResourcePaths as unknown as unknown[], validIdx) as string[];
            return { storymapJsons: storymapJsonsF, entryTitles: entryTitlesF, builderLinks: builderLinksF, thumbnailUrls: thumbnailUrlsF, draftItemIds: draftItemIdsF, thumbnailResourcePaths: thumbnailResourcePathsF };
          }
        }
      } catch { /* ignore filtering errors */ }
      return { storymapJsons, entryTitles, builderLinks, thumbnailUrls, draftItemIds, thumbnailResourcePaths };
    }

    static async fetchChildClassicJson(entry: ClassicEntry, token?: string): Promise<Record<string, unknown>> {
      try {
        const { getItemData } = await import('../api/arcgis-client');
        const media = (entry?.media || entry?.content || {}) as ClassicEntryMedia;
        const url = media?.webpage?.url || media?.url || '';
        const candidates: string[] = [];
        // Priority 1: URL query appid
        const urlApp = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(String(url))?.[1];
        if (urlApp) {
          console.debug('[MapSeriesConverter] appid from URL:', urlApp);
          candidates.push(urlApp);
        }
        // Priority 2: direct entry fields
        const directApp = (entry as unknown as { appid?: string; appId?: string }).appid || (entry as unknown as { appid?: string; appId?: string }).appId;
        if (directApp) {
          console.debug('[MapSeriesConverter] appid from entry fields:', directApp);
          candidates.push(directApp);
        }
        // Priority 3: nested actions.open.system.appid
        try {
          const sys = (entry as unknown as { content?: { actions?: { open?: { system?: { appid?: string } } } } }).content?.actions?.open?.system;
          if (sys?.appid && /^[a-f0-9]{32}$/i.test(sys.appid)) {
            console.debug('[MapSeriesConverter] appid from nested actions.open.system:', sys.appid);
            candidates.push(sys.appid);
          }
        } catch { /* ignore */ }
        // Note: Do NOT use regex fallback; it can pick unrelated ids.
        // De-duplicate while preserving priority
        const seen = new Set<string>();
        const ordered = candidates.filter(id => { const ok = !seen.has(id); if (ok) seen.add(id); return ok; });
        const chosen = ordered.find(id => /^[a-f0-9]{32}$/i.test(id));
        if (chosen) {
          console.debug('[MapSeriesConverter] Fetching child classic JSON for appid:', chosen);
          if (MapSeriesConverter.childCache[chosen]) {
            console.debug('[MapSeriesConverter] Using cached child JSON for appid:', chosen);
            return MapSeriesConverter.childCache[chosen];
          }
          const json = await getItemData(chosen, token);
          const child = (json || {}) as Record<string, unknown>;
          try {
            const values = (child as { values?: Record<string, unknown> }).values || {};
            const hasSections = Array.isArray((values as { sections?: unknown[] }).sections);
            const hasStoryEntries = Array.isArray((values as { story?: { entries?: unknown[] } }).story?.entries);
            console.debug('[MapSeriesConverter] Child payload shape:', { hasSections, hasStoryEntries, keys: Object.keys(values) });
          } catch { /* ignore shape logging errors */ }
          MapSeriesConverter.childCache[chosen] = child;
          return MapSeriesConverter.childCache[chosen];
        }
        // Fallback: if entry carries inline classic JSON, return it
        const json = (entry as unknown as { classicJson?: Record<string, unknown>; data?: Record<string, unknown> }).classicJson || (entry as unknown as { classicJson?: Record<string, unknown>; data?: Record<string, unknown> }).data || {};
        return json as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    }

    static appendConverterMetadata(json: StoryMapJSON, parentClassicJson: Record<string, unknown>, template: string | undefined, entryIndex: number) {
      try {
        const resources: Record<string, { type?: string; data?: Record<string, unknown> }> = (json as unknown as { resources?: Record<string, { type?: string; data?: Record<string, unknown> }> }).resources || {};
        const rid = `r-converter-metadata-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const data: Record<string, unknown> = {
          classicMetadata: {
            parentTemplate: 'mapseries',
            childTemplate: template || 'unknown',
            entryIndex,
            parentTitle: String((parentClassicJson as { values?: { title?: string } })?.values?.title || ''),
          }
        };
        resources[rid] = { type: 'converter-metadata', data };
        (json as unknown as { resources?: Record<string, { type?: string; data?: Record<string, unknown> }> }).resources = resources;
      } catch { /* ignore */ }
    }
  }
