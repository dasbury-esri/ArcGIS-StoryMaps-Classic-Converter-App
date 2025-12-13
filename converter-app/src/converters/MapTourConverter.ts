/**
 * MapTourConverter
 *
 * Role:
 * - Intended to convert Classic Map Tour → ArcGIS StoryMaps.
 * - Establishes structure and typing for future implementation.
 *
 * Placement (src/converters/):
 * - Kept with other converters for modular growth.
 * - Will be registered in `ConverterFactory` when ready.
 */
import { BaseConverter } from './BaseConverter';
import type { BaseConverterOptions } from './BaseConverter';
import type { ConverterResult, StoryMapJSON } from '../types/core';
import { StoryMapJSONBuilder } from '../schema/StoryMapJSONBuilder';
import { detectClassicTemplate } from '../utils/detectTemplate';
import type { TourGeometry, TourPlace } from '../types/core.ts';
import { computeTheme } from '../utils/classicTheme';

// Attribute keys (ported)
const TITLE_KEYS = ['name','Name','NAME','title','Title','TITLE'] as const;
const DESC_KEYS = ['description','Description','DESCRIPTION','desc','Desc','DESC','desc1','Desc1','DESC1','caption','Caption','CAPTION','FULL_Caption'] as const;
const IMAGE_URL_KEYS = ['pic_url','Pic_url','PIC_URL','url','Url','URL'] as const;
const THUMB_URL_KEYS = ['thumb_url','Thumb_url','THUMB_URL'] as const;
const LON_KEYS = ['long','Long','LONG','LON','longitude','Longitude','LONGITUDE','x'] as const;
const LAT_KEYS = ['lat','Lat','LAT','latitude','Latitude','LATITUDE','y'] as const;

interface MapTourValues {
  layout?: string;
  title?: string;
  subtitle?: string;
  placardPosition?: string; // 'start' | 'end'
  order?: Array<{ id: string | number; visible?: boolean }>;
  places?: Array<{ id: string | number; name?: string; description?: string; pic_url?: string; thumb_url?: string; visible?: boolean; geometry?: { x?: number; y?: number } }>;
  webmap?: string; // classic webmap item id
  colors?: string;
  firstRecordAsIntro?: boolean;
  settings?: { theme?: { colors?: { themeMajor?: string } } };
  [k: string]: unknown;
}

export class MapTourConverter extends BaseConverter {
  private builder: StoryMapJSONBuilder;
  private uploaded: Record<string, { imageUrl?: string; thumbUrl?: string; imageResId?: string; thumbResId?: string }> = {};
  private mediaUrls: Set<string> = new Set();
  private places: TourPlace[] = [];
  private geometries: Record<string, TourGeometry> = {};

  constructor(opts: BaseConverterOptions) {
    super(opts);
    this.builder = new StoryMapJSONBuilder(opts.themeId);
  }

  protected extractStructure(): void {
    // Map Tour uses values directly; no sections list
    this.emit('MapTour: extractStructure (no sections list)');
  }

  protected async convertContent(): Promise<void> {
    const values = (this.classicJson.values || {}) as MapTourValues;
    const title = values.title || 'Untitled Story';
    const subtitle = values.subtitle || '';
    const { themeId, variableOverrides } = computeTheme(this.themeId as any, this.classicJson);

    this.builder.createStoryRoot();
    this.builder.addCoverNode(title, subtitle);
    this.builder.addNavigationHidden();
    this.builder.addCreditsNode();
    this.builder.applyTheme({ themeId, variableOverrides });

    // Prefer explicit places; otherwise, build from pre-fetched feature-layer features
    const prefetchedFeatures: PrefetchedFeature[] = Array.isArray((this.classicJson as { _mapTourFeatures?: PrefetchedFeature[] })._mapTourFeatures)
      ? (this.classicJson as { _mapTourFeatures?: PrefetchedFeature[] })._mapTourFeatures as PrefetchedFeature[]
      : [];
    type PlaceObj = { id: string | number; visible?: boolean; geometry?: { x?: number; y?: number } } & Record<string, unknown>;
    let rawPlaces: Array<PlaceObj> =
      Array.isArray(values.places) && values.places.length
        ? (values.places as Array<PlaceObj>)
        : featuresToPlaces(prefetchedFeatures);
    // Fallback: extract from embedded featureCollection in webmapJson (browser path sets this)
    const classicWithWebmap = this.classicJson as { webmapJson?: WebmapJson };
    if (!rawPlaces.length && classicWithWebmap.webmapJson) {
      const embedded = featuresFromWebmapJson(classicWithWebmap.webmapJson, (values as { sourceLayer?: string }).sourceLayer);
      if (embedded.length) rawPlaces = featuresToPlaces(embedded);
    }
    const order = Array.isArray(values.order) && values.order.length
      ? values.order
      : rawPlaces.map((p: PlaceObj) => ({ id: p.id, visible: p.visible !== false }));
    interface RawPlace { id: string | number; name?: string; description?: string; pic_url?: string; thumb_url?: string; visible?: boolean; geometry?: { x?: number; y?: number }; [k: string]: unknown }
    const placeById: Record<string | number, RawPlace> = {};
    rawPlaces.forEach(p => { if (p.id !== undefined) placeById[p.id] = p; });
    const orderedPlaces = order.map(o => placeById[o.id]).filter(Boolean).map(p => ({ ...p, visible: order.find(o => o.id === p.id)?.visible !== false }));

    let coverImageRes: string | undefined;

    for (let i = 0; i < orderedPlaces.length; i++) {
      const place = orderedPlaces[i];
      const fid = String(place.id ?? i);
      const imageUrl = firstNonEmpty(place, IMAGE_URL_KEYS);
      const thumbUrl = firstNonEmpty(place, THUMB_URL_KEYS);
      if (imageUrl) {
        this.mediaUrls.add(imageUrl);
        const resId = this.builder.addImageResource(imageUrl);
        this.uploaded[fid] = { ...(this.uploaded[fid] || {}), imageUrl, imageResId: resId };
        if (this.inlineUpload && this.uploader && this.storyId && this.username && this.token) {
          this.tryInlineUpload(imageUrl, resId).catch(() => {/* swallow per-item */});
        }
      }
      if (thumbUrl) {
        this.mediaUrls.add(thumbUrl);
        const resId = this.builder.addImageResource(thumbUrl);
        this.uploaded[fid] = { ...(this.uploaded[fid] || {}), thumbUrl, thumbResId: resId };
        if (this.inlineUpload && this.uploader && this.storyId && this.username && this.token) {
          this.tryInlineUpload(thumbUrl, resId).catch(() => {/* swallow per-item */});
        }
      }
    }

    for (let i = 0; i < orderedPlaces.length; i++) {
      const place = orderedPlaces[i];
      const fid = String(place.id ?? i);
      const titleText = firstNonEmpty(place, TITLE_KEYS) || `Place ${i + 1}`;
      const descText = firstNonEmpty(place, DESC_KEYS) || '';

      const imageRes = this.uploaded[fid]?.imageResId;
      const thumbRes = this.uploaded[fid]?.thumbResId;

      // Promote first image to cover if classic indicated firstRecordAsIntro
      if (i === 0 && values.firstRecordAsIntro && imageRes) coverImageRes = imageRes;

      const imageNodeIds: string[] = [];
      if (imageRes) imageNodeIds.push(this.builder.createImageNode(imageRes, undefined, undefined, 'standard'));
      if (thumbRes) imageNodeIds.push(this.builder.createImageNode(thumbRes, undefined, undefined, 'standard'));
      const carouselNodeId = imageNodeIds.length ? this.builder.createCarouselNode(imageNodeIds) : undefined;

      const titleNodeId = this.builder.createTextNode(titleText, 'h3', 'wide');
      const contentNodeId = this.builder.createTextNode(descText, 'paragraph', 'wide');

      // Geometry building (attribute or geometry.x/y with Web Mercator normalization)
      const geomId = this.builder.newNodeId();
      let coords = extractCoords(place);
      if (!coords && place.geometry && typeof place.geometry.x === 'number' && typeof place.geometry.y === 'number') {
        coords = normalizeCoords(place.geometry.x, place.geometry.y);
      }
      if (coords) {
        this.geometries[geomId] = {
          id: geomId,
          type: 'POINT_NUMBERED_TOUR',
          nodes: [{ long: coords.long, lat: coords.lat }],
          viewpoint: {},
          scale: 4514
        } as TourGeometry;
      }

      this.places.push({
        id: this.builder.newNodeId(),
        featureId: geomId,
        contents: [contentNodeId],
        media: carouselNodeId,
        title: titleNodeId,
        config: place.visible === false ? { isHidden: true } : undefined
      });
    }

    const tourMapNodeId = this.builder.createTourMapNode(this.geometries, values.webmap);
    const accentColor = '#f9f794';
    const layoutMapping: Record<string, { tourType: 'guided-tour' | 'explorer'; subtype: 'media-focused' | 'map-focused' | 'grid' }> = {
      'three-panel': { tourType: 'guided-tour', subtype: 'media-focused' },
      'side-panel': { tourType: 'guided-tour', subtype: 'media-focused' },
      'integrated': { tourType: 'guided-tour', subtype: 'map-focused' }
    };
    let tourType: 'guided-tour' | 'explorer';
    let subtype: 'media-focused' | 'map-focused' | 'grid';
    if (this.places.length > 15) { tourType = 'explorer'; subtype = 'grid'; }
    else {
      const lm = layoutMapping[values.layout || 'integrated'] || layoutMapping['integrated'];
      tourType = lm.tourType; subtype = lm.subtype;
    }
    const placardPos: 'start' | 'end' = values.placardPosition === 'end' ? 'end' : 'start';
    const tourNodeId = this.builder.createTourNode(this.places, tourMapNodeId, accentColor, placardPos, 'large', tourType, subtype);
    this.builder.addChild(this.builder.getStoryRootId(), tourMapNodeId);
    this.builder.addChild(this.builder.getStoryRootId(), tourNodeId);

    if (coverImageRes) this.builder.setStoryMeta(title, subtitle, coverImageRes);
    if (this.inlineUpload && (!this.storyId || !this.token || !this.uploader)) {
      this.emit('MapTour inlineUpload requested but missing storyId/token/uploader – falling back to URI resources');
    }

    this.emit(`MapTour: built ${this.places.length} place(s); layout=${values.layout || 'integrated'} mapped to ${tourType}/${subtype}`);
  }

  protected applyTheme(): void {
    this.emit('MapTour: applyTheme (handled during convertContent)');
  }

  protected collectMedia(): string[] {
    return Array.from(this.mediaUrls);
  }

  protected getStoryMapJson(): StoryMapJSON {
    return this.builder.getJson();
  }

  static convert(opts: BaseConverterOptions): ConverterResult {
    const template = detectClassicTemplate(opts.classicJson);
    if (!/tour/i.test(template)) {
      throw new Error('MapTourConverter invoked for non Map Tour template');
    }
    const conv = new MapTourConverter(opts);
    return conv.convert();
  }
  private async tryInlineUpload(url: string, resourceId: string): Promise<void> {
    if (!this.uploader || !this.storyId || !this.username || !this.token) return;
    try {
      const result = await this.uploader(url, this.storyId, this.username, this.token);
      if (result.transferred && result.resourceName) {
        this.builder.finalizeImageResourceAsItem(resourceId, result.resourceName);
        this.emit(`Inline upload success for ${url}`);
      } else {
        this.emit(`Inline upload skipped/not transferred for ${url}`);
      }
    } catch (e) {
      this.emit(`Inline upload error for ${url}: ${(e as Error).message}`);
    }
  }

  // Convenience static method for inline conversion
  static async convertInline(opts: BaseConverterOptions): Promise<ConverterResult> {
    const conv = new MapTourConverter({ ...opts, inlineUpload: true });
    return conv.convert();
  }
}

function firstNonEmpty(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = obj && obj[k];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return undefined;
}

function extractCoords(place: Record<string, unknown>): { long: number; lat: number } | undefined {
  const attrs = place || {};
  const lonRaw = firstNonEmpty(attrs, LON_KEYS);
  const latRaw = firstNonEmpty(attrs, LAT_KEYS);
  const lon = Number(lonRaw);
  const lat = Number(latRaw);
  if (!isNaN(lon) && !isNaN(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) {
    return { long: lon, lat };
  }
  return undefined;
}

// Normalize possible Web Mercator coordinates (wkid 102100) into WGS84 lon/lat
function normalizeCoords(x: number, y: number): { long: number; lat: number } | undefined {
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return { long: x, lat: y }; // already lon/lat
  // Basic Web Mercator inverse
  const R_MAJOR = 6378137.0;
  const lon = (x / R_MAJOR) * 180.0 / Math.PI;
  let lat = (y / R_MAJOR) * 180.0 / Math.PI;
  lat = 180.0 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180.0)) - Math.PI / 2.0);
  if (!isNaN(lon) && !isNaN(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) return { long: lon, lat };
  return undefined;
}

// mapClassicTheme replaced by computeTheme in util/classicTheme

// Types and helpers for feature-layer tours (prefetched in ConverterFactory)
type PrefetchedFeature = { attributes?: Record<string, unknown>; geometry?: { x?: number; y?: number } };

function featureIdFromAttributes(attrs: Record<string, unknown>): string | number | undefined {
  const keys = ['__OBJECTID','objectid','id','ID','FID','fid','ObjectID','Object_Id','OBJECTID','OBJECTID_1'];
  for (const k of keys) {
    const v = attrs[k];
    if (v !== undefined && v !== null && String(v).trim()) return typeof v === 'number' ? v : String(v).trim();
  }
  return undefined;
}

function featuresToPlaces(features: PrefetchedFeature[]): Array<{ id: string | number; visible?: boolean; geometry?: { x?: number; y?: number } } & Record<string, unknown>> {
  if (!Array.isArray(features) || !features.length) return [];
  const places: Array<{ id: string | number; visible?: boolean; geometry?: { x?: number; y?: number } } & Record<string, unknown>> = [];
  for (const f of features) {
    const attrs: Record<string, unknown> = (f.attributes || {}) as Record<string, unknown>;
    const fid = featureIdFromAttributes(attrs);
    if (fid === undefined) continue;
    // Flatten attributes to top-level so key lookups work (title/desc/pic_url/thumb_url, etc.)
    places.push({ id: fid, ...attrs, geometry: f.geometry });
  }
  return places;
}

function featuresFromWebmapJson(wmJson: Record<string, unknown>, sourceLayer?: string): PrefetchedFeature[] {
  try {
    const wm = wmJson as WebmapJson;
    const layers: OperationalLayer[] = Array.isArray(wm.operationalLayers) ? wm.operationalLayers as OperationalLayer[] : [];
    const match = (ly: OperationalLayer) => {
      const id = String(ly?.id || '');
      const title = String(ly?.title || '').toLowerCase();
      const titleMatch = /map\s*tour|maptour/.test(title);
      const idMatch = /^maptour-layer/i.test(id);
      const srcMatch = sourceLayer ? (id === sourceLayer || id.includes(sourceLayer) || sourceLayer.includes(id)) : false;
      return srcMatch || idMatch || titleMatch;
    };
    const targets = layers.filter(match);
    for (const ly of targets) {
      const fcLayers = ly.featureCollection?.layers || [];
      for (const fc of fcLayers) {
        const feats = fc.featureSet?.features;
        if (Array.isArray(feats)) {
          return feats as PrefetchedFeature[];
        }
      }
    }
  } catch {/* ignore */}
  return [];
}

// Minimal webmap typing to avoid 'any' casts
type WebmapJson = { operationalLayers?: OperationalLayer[] };
type OperationalLayer = {
  id?: string;
  title?: string;
  sourceLayer?: string;
  featureCollection?: { layers?: Array<{ featureSet?: { features?: PrefetchedFeature[] } }> };
};
