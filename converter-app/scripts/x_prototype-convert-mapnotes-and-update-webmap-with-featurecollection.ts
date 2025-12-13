/*
 Update a target webmap by converting Map Notes layers to FeatureCollection layers
 and posting the updated JSON to ArcGIS Online.

 Usage:
   ARCGIS_TOKEN=... WEBMAP_ID=ef0e2f0bf20243bc9fec83e0d7e5f4bc \
   node converter-app/scripts/update-webmap-with-featurecollection.ts
*/

import fetch from 'node-fetch';
import { getOrgBase } from '../../scripts/lib/orgBase';
const ORG_BASE = getOrgBase();

type AnyObject = Record<string, any>;

function getEnv(name: string, required = true): string | undefined {
  const v = process.env[name];
  if (required && (!v || v.trim() === '')) {
    console.error(`[Error] Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

function safeClone<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj as T;
  return JSON.parse(JSON.stringify(obj));
}

async function fetchWebmap(id: string, token: string): Promise<AnyObject> {
  const url = `${ORG_BASE}/sharing/rest/content/items/${id}/data?f=json&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch webmap data: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json;
}

async function getUserInfo(token: string): Promise<AnyObject> {
  const url = `${ORG_BASE}/sharing/rest/portals/self?f=json&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch portals/self: ${res.status} ${res.statusText}`);
  return res.json();
}

async function createFeatureCollectionItem(
  owner: string,
  folderId: string | undefined,
  token: string,
  title: string,
  featureCollectionPayload: AnyObject
): Promise<{ id: string }> {
  const base = `${ORG_BASE}/sharing/rest/content/users/${encodeURIComponent(owner)}`;
  const url = `${base}/addItem` + (folderId ? `?folderId=${encodeURIComponent(folderId)}` : '');
  const form = new URLSearchParams();
  form.set('f', 'json');
  form.set('token', token);
  form.set('type', 'Feature Collection');
  form.set('title', title);
  form.set('tags', 'storymaps,converter,mapnotes');
  form.set('text', JSON.stringify(featureCollectionPayload));
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Failed to add FeatureCollection item: ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (!(json.success === true && json.id)) {
    throw new Error(`AddItem did not succeed: ${JSON.stringify(json)}`);
  }
  return { id: json.id };
}

function isMapNotesLayer(layer: AnyObject): boolean {
  const type = layer?.layerType || layer?.type || '';
  const fc = layer?.featureCollection;
  const features: AnyObject[] = fc?.layers?.[0]?.featureSet?.features || [];
  // Scan features to robustly detect esriPMS symbol types (picture markers)
  const esriPMSSymbolFound = features.some((f) => f?.symbol?.type === 'esriPMS');
  const hasFeatures = Array.isArray(features) && features.length > 0;
  const title = (layer?.title || '').toLowerCase();
  if (type.toLowerCase() === 'mapnotes') return true;
  if (title.includes('map notes') && !!fc) return true;
  // Heuristic: featureCollection with esriPMS symbols are Map Notes-like
  return !!fc && hasFeatures && esriPMSSymbolFound;
}

function isNormalizedFeatureCollection(layer: AnyObject): boolean {
  const fc = layer?.featureCollection;
  const fcLayer = fc?.layers?.[0];
  const hasFeatureCollection = !!fc && !!fcLayer && !!fcLayer.featureSet && Array.isArray(fcLayer.featureSet.features);
  const hasRenderer = !!(
    fcLayer?.layerDefinition?.drawingInfo?.renderer || layer?.drawingInfo?.renderer || layer?.renderer
  );
  const hasPopupInfo = !!(fcLayer?.popupInfo || layer?.popupInfo);
  const hasTitle = typeof layer?.title === 'string' && layer.title.length > 0;
  return hasFeatureCollection && hasRenderer && hasPopupInfo && hasTitle;
}

function convertMapNotesToFeatureCollection(layer: AnyObject): AnyObject | null {
  // If layer already has featureCollection, clone and normalize renderer/popupInfo
  if (layer?.featureCollection) {
    const fc = safeClone(layer.featureCollection);
    const popupInfo = safeClone(layer?.featureCollection?.layers?.[0]?.popupInfo || layer?.popupInfo);
    const name = '(Converted) Map Notes';
    // Preserve renderer/drawingInfo from common locations
    const renderer = safeClone(
      layer?.renderer ||
        layer?.drawingInfo?.renderer ||
        layer?.featureCollection?.layers?.[0]?.layerDefinition?.drawingInfo?.renderer
    );
    let drawingInfo = safeClone(
      layer?.drawingInfo || layer?.featureCollection?.layers?.[0]?.layerDefinition?.drawingInfo
    );
    // If no renderer, synthesize a unique-value renderer based on per-feature symbol.url
    if (!drawingInfo?.renderer) {
      const features: AnyObject[] = fc?.layers?.[0]?.featureSet?.features || [];
      const urls = new Set<string>();
      const uniqueValueInfos: AnyObject[] = [];
      for (const f of features) {
        const url = f?.symbol?.url || f?.attributes?.SYMBOL_URL || '';
        if (url) urls.add(url);
      }
      for (const url of urls) {
        uniqueValueInfos.push({
          value: url,
          symbol: {
            type: 'esriPMS',
            url,
            contentType: 'image/png',
            angle: 0,
            xoffset: 0,
            yoffset: 0,
          },
          label: url,
        });
      }
      if (uniqueValueInfos.length > 0) {
        drawingInfo = {
          ...(drawingInfo || {}),
          renderer: {
            type: 'uniqueValue',
            field1: 'SYMBOL_URL',
            defaultSymbol: {
              type: 'esriPMS',
              url: Array.from(urls)[0],
              contentType: 'image/png',
              angle: 0,
              xoffset: 0,
              yoffset: 0,
            },
            uniqueValueInfos,
          },
        };
        // Ensure each feature carries the SYMBOL_URL attribute used by the renderer
        for (const f of features) {
          const url = f?.symbol?.url || '';
          f.attributes = { ...(f.attributes || {}), SYMBOL_URL: url };
        }
      }
    }
    return {
      title: name,
      visibility: layer?.visibility !== false,
      opacity: layer?.opacity ?? 1,
      featureCollection: fc,
      popupInfo,
      layerType: 'ArcGISFeatureLayer',
      // Preserve renderer if present
      layerDefinition: {
        ...(safeClone(layer?.layerDefinition) || {}),
        ...(drawingInfo ? { drawingInfo } : {}),
        ...(renderer ? { renderer } : {}),
      },
    };
  }

  // Otherwise, try to build a featureCollection from available graphics (operationalLayers[i].featureCollection.layers[0].featureSet)
  const graphics = layer?.featureSet?.features || layer?.featureCollection?.layers?.[0]?.featureSet?.features;
  if (!graphics || !Array.isArray(graphics) || graphics.length === 0) return null;

  const featureSet = {
    geometryType: (layer?.featureSet?.geometryType || 'esriGeometryPoint'),
    spatialReference: safeClone(layer?.featureSet?.spatialReference || layer?.featureCollection?.layers?.[0]?.featureSet?.spatialReference),
    features: graphics.map((g: AnyObject) => {
      const symbol = safeClone(g.symbol);
      const attributes = safeClone(g.attributes || {});
      const url = symbol?.url || attributes?.SYMBOL_URL || '';
      return {
        geometry: safeClone(g.geometry),
        attributes: { ...attributes, SYMBOL_URL: url },
        symbol,
      };
    }),
  };

  const fcLayer = {
    layerDefinition: {
      name: '(Converted) Map Notes',
      geometryType: featureSet.geometryType,
      objectIdField: 'OBJECTID',
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID' },
        { name: 'SYMBOL_URL', type: 'esriFieldTypeString', alias: 'Symbol URL', length: 512 },
        { name: 'TITLE', type: 'esriFieldTypeString', alias: 'Title', length: 512 },
        { name: 'DESCRIPTION', type: 'esriFieldTypeString', alias: 'Description', length: 2048 },
        { name: 'TYPEID', type: 'esriFieldTypeInteger', alias: 'TypeId' },
        { name: 'VISIBLE', type: 'esriFieldTypeInteger', alias: 'Visible' },
        { name: 'IMAGE_URL', type: 'esriFieldTypeString', alias: 'Image URL', length: 1024 },
        { name: 'IMAGE_LINK_URL', type: 'esriFieldTypeString', alias: 'Image Link URL', length: 1024 },
      ],
      // Carry drawingInfo/renderer if available on source
      ...(layer?.drawingInfo ? { drawingInfo: safeClone(layer.drawingInfo) } : {}),
      ...(layer?.renderer ? { renderer: safeClone(layer.renderer) } : {}),
    },
    featureSet,
    popupInfo: safeClone(layer?.popupInfo || layer?.featureCollection?.layers?.[0]?.popupInfo),
  };
  // Synthesize a unique-value renderer if none present, based on SYMBOL_URL attribute
  const hasRenderer = !!(
    fcLayer.layerDefinition?.drawingInfo?.renderer || fcLayer.layerDefinition?.renderer
  );
  if (!hasRenderer) {
    const urls = new Set<string>();
    for (const f of featureSet.features) {
      const url = f?.attributes?.SYMBOL_URL || f?.symbol?.url || '';
      if (url) urls.add(url);
    }
    const uniqueValueInfos = Array.from(urls).map((url) => ({
      value: url,
      symbol: {
        type: 'esriPMS',
        url,
        contentType: 'image/png',
        angle: 0,
        xoffset: 0,
        yoffset: 0,
      },
      label: url,
    }));
    if (uniqueValueInfos.length > 0) {
      fcLayer.layerDefinition.drawingInfo = {
        ...(fcLayer.layerDefinition.drawingInfo || {}),
        renderer: {
          type: 'uniqueValue',
          field1: 'SYMBOL_URL',
          defaultSymbol: uniqueValueInfos[0].symbol,
          uniqueValueInfos,
        },
      };
    }
  }

  const featureCollection = {
    layers: [fcLayer],
  };

  return {
    title: '(Converted) Map Notes',
    visibility: layer?.visibility !== false,
    opacity: layer?.opacity ?? 1,
    featureCollection,
    popupInfo: fcLayer.popupInfo,
    layerType: 'ArcGISFeatureLayer',
  };
}

async function transformOperationalLayers(
  opLayers: AnyObject[],
  options: { replace?: boolean; forceAppend?: boolean; createItem?: (title: string, fcPayload: AnyObject) => Promise<string> }
): { layers: AnyObject[]; changed: boolean; convertedCount: number } {
  let changed = false;
  let convertedCount = 0;
  const out: AnyObject[] = [];
  // Track IDs to avoid collisions
  const existingIds = new Set<string>(
    opLayers.map((l) => (typeof l.id === 'string' ? l.id : String(l.id || ''))).filter(Boolean)
  );
  for (const layer of opLayers) {
    if (isMapNotesLayer(layer)) {
      // Append normalized FeatureCollection when needed, or always when forceAppend
      const needsNormalization = !isNormalizedFeatureCollection(layer);
      const converted = (needsNormalization || options.forceAppend) ? convertMapNotesToFeatureCollection(layer) : null;
      const baseId = String(layer.id || 'mapnotes');
      const makeUniqueId = (prefix: string) => {
        let idx = 0;
        let candidate = `${prefix}_converted`;
        while (existingIds.has(candidate)) {
          idx += 1;
          candidate = `${prefix}_converted${idx}`;
        }
        existingIds.add(candidate);
        return candidate;
      };
      // Append by default; optionally replace original
      if (!options.replace) out.push(layer);
      if (converted) {
        if (options.createItem) {
          // Create separate FeatureCollection item and reference it
          const fcPayload = safeClone(converted.featureCollection);
          const itemTitle = converted.title || '(Converted) Map Notes';
          const itemId = await options.createItem(itemTitle, { featureCollection: fcPayload });
          const refLayer = {
            id: makeUniqueId(baseId),
            title: itemTitle,
            visibility: true,
            opacity: 1,
            layerType: 'ArcGISFeatureLayer',
            itemId,
          };
          out.push(refLayer);
        } else {
          const newLayer = { id: makeUniqueId(baseId), ...converted };
          out.push(newLayer);
        }
        changed = true;
        convertedCount += 1;
      }
      continue;
    }
    out.push(layer);
  }
  return { layers: out, changed, convertedCount };
}

async function updateWebmapData(id: string, token: string, data: AnyObject): Promise<void> {
  const url = `https://www.arcgis.com/sharing/rest/content/items/${id}/update?f=json&token=${encodeURIComponent(token)}`;
  const form = new URLSearchParams();
  form.set('f', 'json');
  form.set('token', token);
  form.set('text', JSON.stringify(data));
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Failed to update webmap: ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (!(json.success === true || json.id === id)) {
    console.error('[Update] Response:', json);
    throw new Error('Update webmap did not succeed');
  }
}

async function main() {
  const token = getEnv('ARCGIS_TOKEN') as string;
  const id = (getEnv('WEBMAP_ID') as string) || 'ef0e2f0bf20243bc9fec83e0d7e5f4bc';
  const args = process.argv.slice(2);
  const replace = args.includes('--replace');
  const forceAppend = args.includes('--force-append');
  const useItemBacked = args.includes('--item-backed');

  console.log(`[Fetch] Webmap ${id}`);
  const webmap = await fetchWebmap(id, token);
  const opLayers: AnyObject[] = webmap?.operationalLayers || [];
  console.log(`[Inspect] operationalLayers: ${opLayers.length}`);
  const mapNotesCount = opLayers.filter(isMapNotesLayer).length;
  console.log(`[Inspect] detected Map Notes-like layers: ${mapNotesCount}`);
  if (opLayers[0]) {
    const l = opLayers[0];
    const symType = l?.featureCollection?.layers?.[0]?.featureSet?.features?.[0]?.symbol?.type;
    console.log('[Inspect] first layer keys:', Object.keys(l));
    console.log('[Inspect] layerType:', l.layerType, 'type:', l.type, 'title:', l.title);
    console.log('[Inspect] has featureCollection:', !!l.featureCollection, 'first symbol type:', symType);
    const firstFeature = l?.featureCollection?.layers?.[0]?.featureSet?.features?.[0];
    if (firstFeature) {
      console.log('[Inspect] first feature keys:', Object.keys(firstFeature));
      console.log('[Inspect] first feature.symbol:', firstFeature.symbol);
    }
  }

  let createItemFn: ((title: string, fcPayload: AnyObject) => Promise<string>) | undefined = undefined;
  if (useItemBacked) {
    const self = await getUserInfo(token);
    const owner = self?.user?.username || self?.user?.email || self?.user?.fullName || '';
    const folderId = undefined; // can be set to a specific folder if desired
    if (!owner) {
      console.warn('[Item] Unable to resolve owner username; falling back to inline featureCollection.');
    } else {
      createItemFn = async (title: string, fcPayload: AnyObject) => {
        const { id: newItemId } = await createFeatureCollectionItem(owner, folderId, token, title, fcPayload);
        console.log(`[Item] Created FeatureCollection item ${newItemId} (${title})`);
        return newItemId;
      };
    }
  }

  const { layers, changed, convertedCount } = await transformOperationalLayers(opLayers, { replace, forceAppend, createItem: createItemFn });
  console.log(`[Transform] changed=${changed} replace=${replace} forceAppend=${forceAppend} converted=${convertedCount}`);
  if (!changed) {
    console.log('[Transform] No Map Notes-like layers found to convert. Exiting.');
    return;
  }

  const updated = { ...webmap, operationalLayers: layers };
  // Add a harmless cache-bust property to ensure 'modified' changes
  (updated as AnyObject)._converterCacheBust = Date.now();
  // Safety: do not alter baseMap or other properties

  console.log('[Update] Posting updated webmap data...');
  await updateWebmapData(id, token, updated);
  console.log('[Update] Success. Verifying updated content...');

  // Fetch org URL for quick verification link
  try {
    const orgRes = await fetch(
      `https://www.arcgis.com/sharing/rest/portals/self?f=json&token=${encodeURIComponent(token)}`
    );
    const orgJson = await orgRes.json();
    const orgUrl = orgJson?.portalHostname ? `https://${orgJson.portalHostname}` : 'https://www.arcgis.com';
    console.log(`[Verify] Open: ${orgUrl}/home/item.html?id=${id}`);
  } catch (e) {
    console.log('[Verify] Could not resolve org URL.');
  }

  // Re-fetch to compare original vs updated
  // Small delay to avoid stale cache
  await new Promise((r) => setTimeout(r, 1200));
  const webmapAfter = await fetchWebmap(id, token);
  const beforeCount = (webmap?.operationalLayers || []).length;
  const afterCount = (webmapAfter?.operationalLayers || []).length;
  const addedIds = new Set(
    (webmapAfter?.operationalLayers || [])
      .map((l: AnyObject) => l?.id)
      .filter((x: any) => typeof x === 'string')
  );
  for (const l of webmap?.operationalLayers || []) {
    if (typeof l?.id === 'string') addedIds.delete(l.id);
  }
  const newLayerIds = Array.from(addedIds);
  const afterTitles = (webmapAfter?.operationalLayers || []).map((l: AnyObject) => l?.title);
  console.log(`[Verify] operationalLayers before=${beforeCount} after=${afterCount} newIds=${JSON.stringify(newLayerIds)} titles=${JSON.stringify(afterTitles)}`);
  if ((replace && afterCount === beforeCount) || (!replace && afterCount === beforeCount + convertedCount)) {
    console.log('[Verify] Layer count matches expected change.');
  } else {
    console.warn('[Verify] Unexpected layer count change. Please inspect differences.');
  }
  console.log('[Done] Please validate in ArcGIS Map Viewer.');
}

main().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});
