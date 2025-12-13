/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ClassicStoryMapJSON, StoryMapJSON } from '../types/storymap';
import type { 
  MapTourValues,
  MapTourFeature,
  MapTourPlace 
} from '../types/storymap';

import { StoryMapJSONBuilder } from './storymap-builder.ts';
import {
  createTourMapNode,
  createMapResource,
  createTextNode,
  createImageNode,
  createCarouselNode,
  createTourNode,
  createCreditsNode
} from './storymap-schema.ts';
import { transferImage } from '../api/image-transfer.ts';
import { 
  generateNodeId, 
  generateUUID,
  getAttrFromList,
  ensureHttpsProtocol 
} from './utils.ts';

const proxyBaseUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PROXY_BASE_URL) || process.env.VITE_PROXY_BASE_URL || '';

// Attribute key lists (update here as needed)
const IMAGE_URL_KEYS = ['pic_url', 'Pic_url', 'PIC_URL', 'url', 'Url', 'URL'] as const;
const THUMB_URL_KEYS = ['thumb_url', 'Thumb_url', 'THUMB_URL'] as const;
const TITLE_KEYS = ['name', 'Name', 'NAME', 'title', 'Title', 'TITLE'] as const;
const DESC_KEYS = [
  'description', 'Description', 'DESCRIPTION',
  'desc', 'Desc', 'DESC', 'desc1', 'Desc1', 'DESC1',
  'caption', 'Caption', 'CAPTION', 'FULL_Caption'
] as const;
// const ATTR_KEYS = ['PHOTO_CREDIT', 'photo_credit', 'credit', 'attribution'] as const;
const LON_KEYS = ['long', 'Long', 'LONG', 'LON', 'longitude', 'Longitude', 'LONGITUDE', 'x'] as const;
const LAT_KEYS = ['lat', 'Lat', 'LAT', 'latitude', 'Latitude', 'LATITUDE', 'y'] as const;

export class MapTourConverter {
  private targetStoryId: string;
  private username: string;
  private token: string;
  private classicJson: ClassicStoryMapJSON;
  private themeId: string;
  private builder: StoryMapJSONBuilder;
  // Map featureId to uploaded image/thumb resource info
  private uploadedResources: Record<string, {
    imageUrl: string;
    thumbUrl: string;
    imageFilename: string;
    thumbFilename: string;
    imageResourceId?: string;
    thumbResourceId?: string;
  }> = {};

  constructor(
    classicJson: ClassicStoryMapJSON, 
    themeId: string = 'summit', 
    username: string = '', 
    token: string = '', 
    targetStoryId: string = ''
  ) {
    console.log('[MapTourConverter] Constructor targetStoryId:', targetStoryId);
    this.classicJson = classicJson;
    this.themeId = themeId;
    this.username = username;
    this.token = token;
    this.targetStoryId = targetStoryId;
    this.builder = new StoryMapJSONBuilder(themeId);
    this.detectTheme();
  }

  private detectTheme(): void {
    try {
      const themeMajor = this.classicJson.values?.settings?.theme?.colors?.themeMajor;
      const themeMapping: Record<string, string> = {
        dark: 'obsidian',
        light: 'summit'
      };
      if (themeMajor && themeMapping[themeMajor]) {
        this.themeId = themeMapping[themeMajor];
      }
    } catch {
      // Use default theme
    }
  }

  private getRootNodeId(): string {
    return this.builder.getStorymap().root;
  }

  private setRootChildren(children: string[]): void {
    this.builder.getStorymap().nodes[this.getRootNodeId()].children = children;
  }

  private getStorymapId(): string {
    console.log('[MapTourConverter] getStorymapId:', this.targetStoryId);
    return this.targetStoryId;
  }

  private stripHtml(text: string): string {
    return text.replace(/<[^>]*>/g, '');
  }

  private summarize(text: string, max: number = 240): string {
    const plain = this.stripHtml(text).replace(/\s+/g, ' ').trim();
    if (!plain) return '';
    return plain.length > max ? plain.slice(0, max).trim() + '…' : plain;
  }

  async convert(): Promise<StoryMapJSON> {
    const values = this.classicJson.values || {};
    const mtValues = values as MapTourValues;
    // Directly extract layout, subtitle, and order from values
    const layout = mtValues.layout || 'integrated'; // classic options were; "three-panel" -> guided-tour/media-focused, "integrated" -> guided-tour/map-focused, "side-panel" -> guided-tour/media-focused
    const title = mtValues.title || 'Untitled Story';
    const subtitle = mtValues.subtitle || '';
    const placardPosition = mtValues.placardPosition || 'start';
    // const headerColor = mtValues.colors ? mtValues.colors.split(';')[0] : '#FFFFFF'; // fallback to white. Classic Map Tour had a very simple theme "header". "content" (i.e. slide) and "footer" (i.e. silde carousel)
    // const slideColor = mtValues.colors ? mtValues.colors.split(';')[1] : '#FFFFFF'; // thumbnail background color
    // const carouselColor = mtValues.colors ? mtValues.colors.split(';')[2] : '#FFFFFF'; // thumbnail carousel background color
    // const zoomLevel = mtValues.zoomLevel || ''; // map zoom level after navigating to a point. Need to translate the zoomLevel [0-22?] to a scale for AGSM (enum?) 
    // const locateButton = mtValues.locationButton || ''; // option to show the location button in the UI
    // const customLogoImageUrl = mtValues.logoURL || '';
    // const customLogoClickThroughLink = mtValues.logoTarget || '';
    // const customHeaderText = mtValues.headerLinkText || '';
    // const customHeaderClickThroughLink = mtValues.headerLinkUrl || '';
    // const socialButtonFacebook = mtValues.social.facebook || ''; // boolean
    // const socialButtonTwitter = mtValues.social.twitter || ''; // boolean
    // const socialButtonBitly = mtValues.social.bitly || ''; // boolean
    const firstRecordAsIntro = mtValues.firstRecordAsIntro === true; // option to promote first place media to cover
    const accentColor = '#f9f794'; // in classic Map Tour, each point could have one of four marker colors (red, blue, green, purple). AGSM doesn't have this option. AGSM color is derived from Theme "accentColor1" 
    const features = await this.extractFeatures();

    // Track node IDs to enforce proper order
    const orderedNodeIds: string[] = [];
    // Create nodes
    const rootId = this.getRootNodeId();
    const storymapNodes = this.builder.getStorymap().nodes;
    // const children = storymapNodes[rootId].children || [];
    const coverId = Object.keys(storymapNodes).find(id => storymapNodes[id]?.type === 'storycover');
    const navId = Object.keys(storymapNodes).find(id => storymapNodes[id]?.type === 'navigation');
  // Create credits node and its children
  const { creditsId, childIds, nodes: creditsNodes } = createCreditsNode('', '', '');
  // Add creditsNodes to storymap nodes
  Object.assign(storymapNodes, creditsNodes);

  // Ensure storycover and navigation are first
  if (coverId) orderedNodeIds.push(coverId);
  if (navId) orderedNodeIds.push(navId);

  const rootChildren = storymapNodes[rootId].children || [];
  const oldCreditsId = rootChildren.find((id: string) => storymapNodes[id]?.type === 'credits' && id !== creditsId);

  if (oldCreditsId) {
    // Remove from nodes
    delete storymapNodes[oldCreditsId];
    // Remove from root children
    const idx = rootChildren.indexOf(oldCreditsId);
    if (idx !== -1) rootChildren.splice(idx, 1);
  }

    // Feature ordering
    const placesArr: MapTourPlace[] = features.map(f => ({
      id: this.getFeatureId(f.attributes),
      ...f.attributes,
      geometry: f.geometry
    }));
    const orderArr = Array.isArray(mtValues.order) ? mtValues.order : [];

    // Build ordered/filtered places list
    let placesList: MapTourPlace[];
    if (orderArr.length > 0 && placesArr.length > 0) {
      // Use order array to order and filter places
      const placeById = Object.fromEntries(placesArr.map(p => [String(p.id), p]));
      placesList = orderArr
        .map((o) => {
          const place = placeById[String(o.id)];
          if (place) {
            // Attach visibility from order if present
            return { ...place, visible: o.visible !== false };
          }
          return undefined;
        })
        .filter(Boolean) as MapTourPlace[];
    } else {
      // Fallback: use places array as-is
      placesList = placesArr;
    }
    // Use placesList for feature ordering
    const featureById: Record<string, MapTourFeature> = {};
    for (const feature of features) {
      const fid = this.getFeatureId(feature.attributes);
      if (fid) featureById[fid] = feature;
    }
    const filteredFeatures = placesList
      .map((p: MapTourPlace) => featureById[String(p.id)])
      .filter(Boolean);

    console.log("Number of places:", filteredFeatures.length)  

    // 1. Build image/thumb map and upload resources
    // For each place, add image, carousel, title, contents nodes in order
    for (let i = 0; i < filteredFeatures.length; i++) {
      const feature = filteredFeatures[i];
      const fid = this.getFeatureId(feature.attributes);
      if (!fid) continue;
      const attrs = feature.attributes || {};
      const imageUrl = getAttrFromList(attrs, Array.from(IMAGE_URL_KEYS), '');
      const thumbUrl = getAttrFromList(attrs, Array.from(THUMB_URL_KEYS), '');
      // Generate unique filenames
      const imageFilename = this.generateUniqueFilename(fid, 'image', imageUrl);
      const thumbFilename = thumbUrl ? this.generateUniqueFilename(fid, 'thumb', thumbUrl) : '';
      // Upload image
      let imageResourceId: string | undefined;
      if (imageUrl) {
        if (!this.targetStoryId || !this.token) {
          // Offline/local conversion fallback: reference original URL directly
          imageResourceId = this.builder.addResource({
            type: 'image',
            data: {
              src: ensureHttpsProtocol(imageUrl),
              provider: 'uri',
              height: 1024,
              width: 1024
            }
          });
        } else {
          console.log('[MapTourConverter] Preparing to transfer image:', { imageUrl, imageFilename });
          const imageTransferResult = await this.transferSingleImage(imageUrl, imageFilename);
          console.log('[MapTourConverter] Image transfer result:', imageTransferResult);
          imageResourceId = this.builder.addResource({
            type: 'image',
            data: {
              resourceId: imageTransferResult.resourceName,
              provider: 'item-resource',
              height: 1024,
              width: 1024
            }
          });
          console.log('[MapTourConverter] Added image resource:', { imageResourceId, resourceName: imageTransferResult.resourceName });
        }
      }
      // Upload thumbnail
      let thumbResourceId: string | undefined;
      if (thumbUrl) {
        // const thumbTransferResult = await this.transferSingleImage(thumbUrl, thumbFilename);
        // thumbResourceId = this.builder.addResource({
        //   type: "image",
        //   data: {
        //     provider: "item-resource",
        //     resourceId: thumbTransferResult.resourceName,
        //     height: 256,
        //     width: 256
        //   }
        // });
      }
      this.uploadedResources[fid] = {
        imageUrl,
        thumbUrl,
        imageFilename,
        thumbFilename,
        imageResourceId,
        thumbResourceId
      };
    }

    // 2. Build place nodes with carousel media
    const places: any[] = [];
    // Build geometries for tour-map
    const geometries: Record<string, any> = {};   
    let firstPlaceImageResourceId: string | undefined;
    let firstPlaceTitle: string | undefined;
    let firstPlaceDesc: string | undefined;
    
    for (let i = 0; i < filteredFeatures.length; i++) {
      const feature = filteredFeatures[i];
      const attrs = feature.attributes || {};
      const fid = this.getFeatureId(attrs);
      const titleText = getAttrFromList(attrs, Array.from(TITLE_KEYS), `Place ${i + 1}`);
      const descText = getAttrFromList(attrs, Array.from(DESC_KEYS), '');
      // const attributionText = getAttrFromList(attrs, Array.from(ATTR_KEYS), '');
      const isVisible = placesList[i]?.visible !== false;
      const coords = this.getFeatureCoords(feature);
      if (!coords) continue; // skip if no valid coordinates 
      let { long, lat } = coords;
      if (this.isWebMercator(long, lat)) {
        [long, lat] = this.webMercatorToWgs84(long, lat);
      } 

      const resourceInfo = fid ? this.uploadedResources[fid] : undefined;

      const imageNodeId = resourceInfo?.imageResourceId
        ? this.builder.createDetachedNode(
            createImageNode(resourceInfo.imageResourceId, undefined, undefined, 'standard', 'start')
          )
        : undefined;

      const thumbNodeId = resourceInfo?.thumbResourceId
        ? this.builder.createDetachedNode(
            createImageNode(resourceInfo.thumbResourceId, undefined, undefined, 'standard', 'start')
          )
        : undefined;

      const imageNodeIds: string[] = [];
      if (imageNodeId) imageNodeIds.push(imageNodeId);
      if (thumbNodeId) imageNodeIds.push(thumbNodeId);
      if (i === 0 && resourceInfo?.imageResourceId) {
        firstPlaceImageResourceId = resourceInfo.imageResourceId;
      }

      const mediaNodeId = this.builder.createDetachedNode(
        createCarouselNode(imageNodeIds)
      );
      const titleNodeId = this.builder.createDetachedNode(
        createTextNode(titleText, 'h3', 'start')
      );
      const contentNodeId = this.builder.createDetachedNode(
        createTextNode(descText, 'paragraph', 'start')
      );
      const contents = [contentNodeId];

      if (i === 0) {
        firstPlaceTitle = titleText;
        firstPlaceDesc = descText;
      }

      // Geometry
      const geomId = generateUUID();
      if (coords && coords.long !== undefined && coords.lat !== undefined) {
        geometries[geomId] = {
          id: geomId,
          type: "POINT_NUMBERED_TOUR",
          nodes: [{ long, lat }],
          scale: 4514,
          viewpoint: {}
        };
      }
  // Push its NodeIds to orderedNodeIds in the proper order
  if (imageNodeId) orderedNodeIds.push(imageNodeId);
  if (thumbNodeId) orderedNodeIds.push(thumbNodeId);
  orderedNodeIds.push(mediaNodeId);
  orderedNodeIds.push(titleNodeId);
  orderedNodeIds.push(contentNodeId);

      // Place node
      places.push({
        id: generateNodeId(),
        featureId: geomId,
        contents,
        media: mediaNodeId,
        title: titleNodeId,
        config: isVisible ? undefined : { isHidden: true }
      });
    }

    // Basemap resource creation and assignment
    const webmapJson = (this.classicJson as any).webmapJson || (mtValues as any).webmapJson || {};
    const webmapId = (this.classicJson as any).webmap || (mtValues as any).webmap;
    const tourMapNode = createTourMapNode(geometries);
    if (webmapJson && typeof webmapJson.version === 'string' && parseFloat(webmapJson.version) < 2.0) {
      // Use basemap name for old webmaps
      const basemapTitle = webmapJson.baseMap?.title?.toLowerCase() || 'topographic';
      tourMapNode.data.basemap = {
        type: 'name',
        value: basemapTitle
      };
    } else if (webmapId) {
      // Use webmap resource for newer webmaps
      const basemapResourceId = this.builder.addResource(createMapResource(webmapId));
      tourMapNode.data.basemap = {
        type: 'resource',
        value: basemapResourceId
      };
    }
    const tourMapNodeId = this.builder.createDetachedNode(tourMapNode);
  
    // Classic layout options were: 
    // "three-panel" -> convert to AGSM guided-tour/media-focused, 
    // "integrated" -> convert to AGSM guided-tour/map-focused, 
    // "side-panel" -> convert to AGSM guided-tour/media-focused
    const layoutMapping: Record<string, { tourType: string; subtype: string }> = {
      'three-panel': { tourType: 'guided-tour', subtype: 'media-focused' },
      'side-panel': { tourType: 'guided-tour', subtype: 'media-focused' },
      'integrated': { tourType: 'guided-tour', subtype: 'map-focused' }
    };
    // Create Tour node (detached)  
    // Use explorer/grid if more than 15 places
    let tourType: string;
    let subtype: string;
    if (places.length > 15) {
      tourType = 'explorer';
      subtype = 'grid';
    } else {
      const layoutConfig = layoutMapping[layout] || { tourType: 'explorer', subtype: 'grid' };
      tourType = layoutConfig.tourType;
      subtype = layoutConfig.subtype;
    }

    const tourNode = createTourNode(
      places,
      tourMapNodeId,
      accentColor,
      placardPosition,
      'large',
      tourType,
      subtype
    );
    const tourNodeId = this.builder.createDetachedNode(tourNode);

    // Add tour-map and tour nodes
    orderedNodeIds.push(tourMapNodeId);
    orderedNodeIds.push(tourNodeId);

    // Add credits children and credits node immediately before story node
    for (const childId of childIds) {
      orderedNodeIds.push(childId);
    }
    orderedNodeIds.push(creditsId);
    orderedNodeIds.push(rootId);

    // Rebuild nodes object in this order
    const nodes = this.builder.getStorymap().nodes;
    const reordered: Record<string, any> = {};
    for (const id of orderedNodeIds) {
      if (nodes[id]) reordered[id] = nodes[id];
    }
    // Optionally, add any remaining nodes not referenced (orphaned nodes)
    for (const id of Object.keys(nodes)) {
      if (!reordered[id]) reordered[id] = nodes[id];
    }
    this.builder.getStorymap().nodes = reordered;

  this.setRootChildren([coverId, navId, tourNodeId, tourMapNodeId, creditsId].filter(Boolean) as string[]);

    // Set cover and theme
    const coverTitleBase = firstRecordAsIntro && firstPlaceTitle ? firstPlaceTitle : title;
    const coverSummaryBase = firstRecordAsIntro && firstPlaceDesc ? this.summarize(firstPlaceDesc) : subtitle;
    this.builder.setCover(`(CONVERSION) ${coverTitleBase}`, coverSummaryBase);
    if (firstRecordAsIntro && firstPlaceImageResourceId && coverId) {
      try {
        const coverNode = storymapNodes[coverId];
        if (coverNode?.data) {
          coverNode.data.image = firstPlaceImageResourceId;
          coverNode.data.type = 'full';
        }
      } catch {/* ignore */}
    }
    this.builder.setTheme(this.themeId);

    const storymapJson = this.builder.getJson();
    return storymapJson;
  }

  private async extractFeatures(): Promise<MapTourFeature[]> {
    const values = this.classicJson.values || {};
    const webmapJson = (this.classicJson as any).webmapJson || (values as any).webmapJson || {};
    const layers = webmapJson.operationalLayers || [];
    // Try to use sourceLayer from classicJson
    const sourceLayer = (this.classicJson as any).sourceLayer || (values as any).sourceLayer;
    if (sourceLayer) {
      for (const layer of layers) {
        // Match by id 
        const layerId = layer.id || '';
        if (
          layerId === sourceLayer ||
          layerId.includes(sourceLayer) ||
          sourceLayer.includes(layerId)
        ) {
          if (layer.featureCollection) {
            for (const fcLayer of layer.featureCollection.layers || []) {
              if (fcLayer.featureSet && Array.isArray(fcLayer.featureSet.features)) {
                return fcLayer.featureSet.features;
              }
            }
          }
          // Fallback: try feature service
          const featureServiceUrl = layer.url || layer.URL;
          if (featureServiceUrl) {
            try {
              const queryUrl = `${ensureHttpsProtocol(featureServiceUrl)}/query?where=1=1&outFields=*&f=json`;
              const proxyUrl = `${proxyBaseUrl}/proxy-feature?url=${encodeURIComponent(queryUrl)}`;
              const response = await fetch(proxyUrl);
              if (response.ok) {
                const fsJson = await response.json();
                if (fsJson.features) return fsJson.features;
              }
            } catch (err) {
              console.error('Error fetching features from feature service:', err);
            }
          }
        }
      }
    }

    // Fuzzy title search if no sourceLayer
    const fuzzyTitles = [
      "map tour layer",
      "maptour-layer",
      "maptour layer",
      "map tour",
      "maptour"
    ];
    for (const layer of layers) {
      const title = (layer.title || '').toLowerCase();
      if (
        fuzzyTitles.some(ft => title.includes(ft)) ||
        /^maptour-layer/i.test(layer.id || '')
      ) {
        if (layer.featureCollection) {
          for (const fcLayer of layer.featureCollection.layers || []) {
            if (fcLayer.featureSet && Array.isArray(fcLayer.featureSet.features)) {
              return fcLayer.featureSet.features;
            }
          }
        }
        // Fallback: try feature service
        const featureServiceUrl = layer.url || layer.URL;
        if (featureServiceUrl) {
          try {
            const queryUrl = `${ensureHttpsProtocol(featureServiceUrl)}/query?where=1=1&outFields=*&f=json`;
            const proxyUrl = `${proxyBaseUrl}/proxy-feature?url=${encodeURIComponent(queryUrl)}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
              const fsJson = await response.json();
              if (fsJson.features) return fsJson.features;
            }
          } catch (err) {
            console.error('Error fetching features from feature service:', err);
          }
        }
      }
    }

    // 3. Attempt live fetch of webmap data if webmapId present (public maps only)
    const webmapIdFallback = (values as any).webmap || (this.classicJson as any).webmap;
    if (webmapIdFallback) {
      try {
        const ORG_BASE = (globalThis as unknown as { __ORG_BASE?: string }).__ORG_BASE || 'https://www.arcgis.com';
        const url = `${ORG_BASE}/sharing/rest/content/items/${webmapIdFallback}/data?f=json`;
        const resp = await fetch(url);
        if (resp.ok) {
          const wm = await resp.json();
          const layers2 = wm.operationalLayers || [];
          for (const layer of layers2) {
            if (layer.featureCollection) {
              for (const fcLayer of layer.featureCollection.layers || []) {
                if (fcLayer.featureSet && Array.isArray(fcLayer.featureSet.features)) {
                  return fcLayer.featureSet.features;
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('[MapTourConverter] Live webmap fetch failed:', (e as Error).message);
      }
    }
    // 4. No features found
    return [];
}

  private getFeatureId(attrs: any): string | undefined {
    for (const key of [
      '__OBJECTID',
      'objectid',
      'id',
      'ID',
      'FID',
      'fid',
      'ObjectID',
      'Object_Id',
      'OBJECTID',
      'OBJECTID_1'
    ]) {
      if (attrs[key] !== undefined && attrs[key] !== null) return String(attrs[key]).trim();
    }
    return undefined;
  }

  private isWebMercator(x: number, y: number): boolean {
    return Math.abs(x) > 180 || Math.abs(y) > 90;
  }

  private webMercatorToWgs84(x: number, y: number): [number, number] {
    const R_MAJOR = 6378137.0;
    const lon = (x / R_MAJOR) * 180.0 / Math.PI;
    let lat = (y / R_MAJOR) * 180.0 / Math.PI;
    lat = 180.0 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180.0)) - Math.PI / 2.0);
    return [lon, lat];
  }

  // Generate a unique filename for image or thumb
  private generateUniqueFilename(fid: string, type: 'image' | 'thumb', url: string): string {
    const extMatch = url.match(/\.([a-zA-Z0-9]+)(\?|$)/);
    const ext = extMatch ? extMatch[1] : 'jpg';
    const uid = Math.random().toString(36).substring(2, 8);
    const fidPadded = fid.padStart(3, '0');
    return `place_${fidPadded}_${type}_${uid}.${ext}`;
  }

  // Transfer a single image and return transfer result
  private async transferSingleImage(url: string, filename: string): Promise<{ originalUrl: string; resourceName: string; isTransferred: boolean }> {
    // You may want to pass filename to transferImage if your API supports it
    // Otherwise, transferImage will generate a resource name
    if (!this.getStorymapId()) {
      throw new Error("Target StoryMap item ID is missing!");
    }
    return await transferImage(url, this.getStorymapId(), this.username, this.token, filename);
  }

  // Robustly get coordinates
  private getFeatureCoords(feature: any): { long: number, lat: number } | undefined {
    const attrs = feature.attributes || {};
    // Try attribute-based extraction
    const longStr = getAttrFromList(attrs, Array.from(LON_KEYS), '');
    const latStr = getAttrFromList(attrs, Array.from(LAT_KEYS), '');
    const long = Number(longStr);
    const lat = Number(latStr);

    // If valid numbers, use them
    if (!isNaN(long) && !isNaN(lat) && long !== 0 && lat !== 0) {
      return { long, lat };
    }

    // Fallback to geometry object
    if (feature.geometry && typeof feature.geometry.x === 'number' && typeof feature.geometry.y === 'number') {
      return { long: feature.geometry.x, lat: feature.geometry.y };
    }

    // No valid coordinates found
    console.warn("No valid coordinates found for feature", feature);
    return undefined;
  }

}