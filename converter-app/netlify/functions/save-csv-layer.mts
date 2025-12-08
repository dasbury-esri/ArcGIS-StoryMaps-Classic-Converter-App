import type { Handler } from '@netlify/functions';

// REST fallback: append a CSV layer to a WebMap by updating item data JSON.
// Request: POST JSON { token, webmapId, csvItemId, title?, visible?, opacity?, lonField?, latField? }
// Response: { success: boolean, message?: string }

const AGO = 'https://www.arcgis.com/sharing/rest';

async function fetchItemInfo(id: string, token: string) {
  const url = `${AGO}/content/items/${id}?f=json&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch item info failed: ${res.status} — ${text}`);
  }
  return res.json();
}

async function fetchWebmapData(id: string, token: string) {
  const url = `${AGO}/content/items/${id}/data?f=json&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch webmap data failed: ${res.status} — ${text}`);
  }
  return res.json();
}

// Fetch CSV headers by downloading the CSV text and reading the first line
async function fetchCsvHeaders(csvItemId: string, token: string): Promise<string[]> {
  try {
    const url = `${AGO}/content/items/${csvItemId}/data?token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    const firstLine = text.split(/\r?\n/)[0] || '';
    // Basic CSV split; headers are simple and don't include commas in names
    const headers = firstLine.split(',').map(h => h.trim()).filter(h => h.length > 0);
    return headers;
  } catch {
    return [];
  }
}

async function updateWebmapData(id: string, owner: string, token: string, data: any) {
  // Use owner-scoped update endpoint to avoid permission/tenancy issues
  const url = `${AGO}/content/users/${encodeURIComponent(owner)}/items/${id}/update`;
  const form = new URLSearchParams();
  form.set('f', 'json');
  form.set('token', token);
  form.set('text', JSON.stringify(data));
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Update webmap failed: ${res.status} — ${text}`);
  }
  return res.json();
}

// Upload a PNG resource to the CSV item and return a stable public URL
async function uploadSymbolResourceToCsvItem(opts: {
  csvItemId: string;
  token: string;
  base64Png: string;
}): Promise<string | undefined> {
  const { csvItemId, token, base64Png } = opts;
  try {
    // Fetch CSV item owner for owner-scoped addResources
    const infoUrl = `${AGO}/content/items/${csvItemId}?f=json&token=${encodeURIComponent(token)}`;
    const infoRes = await fetch(infoUrl);
    if (!infoRes.ok) return undefined;
    const info = await infoRes.json();
    const owner = info?.owner;
    if (!owner) return undefined;

    const boundary = `----sym${Date.now()}`;
    const parts: string[] = [];
    const addField = (name: string, value: string) => {
      parts.push(`--${boundary}`);
      parts.push(`Content-Disposition: form-data; name="${name}"`);
      parts.push('');
      parts.push(value);
    };
    const addFile = (name: string, filename: string, contentType: string, data: string) => {
      parts.push(`--${boundary}`);
      parts.push(`Content-Disposition: form-data; name="${name}"; filename="${filename}"`);
      parts.push(`Content-Type: ${contentType}`);
      parts.push('');
      parts.push(data);
    };

    addField('f', 'json');
    addField('token', token);
    addField('async', 'false');
    addField('name', 'symbols/custom-marker.png');
    // Decode base64 to binary string; AGO accepts raw PNG bytes in multipart body
    const pngBinary = Buffer.from(base64Png, 'base64').toString('binary');
    addFile('file', 'custom-marker.png', 'image/png', pngBinary);
    parts.push(`--${boundary}--`);
    const body = parts.join('\r\n');

    const url = `${AGO}/content/users/${encodeURIComponent(owner)}/items/${csvItemId}/addResources`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    if (!res.ok) return undefined;
    const json = await res.json();
    if (json?.success) {
      // Public resource URL (tokenless); Map Viewer will fetch this directly
      return `${AGO}/content/items/${csvItemId}/resources/symbols/custom-marker.png`;
    }
  } catch {}
  return undefined;
}

// Merge legacy Map Notes field metadata with CSV headers to produce full field definitions
function buildFieldsFromHeaders(opts: {
  headerNames: string[];
  legacyFields?: Array<any>;
}): Array<{ alias?: string; editable?: boolean; length?: number; name: string; nullable?: boolean; type: string }> {
  const { headerNames, legacyFields = [] } = opts;
  const legacyByName: Record<string, any> = {};
  for (const lf of legacyFields) {
    const n = lf?.name || lf?.fieldName;
    if (n) legacyByName[n] = lf;
  }
  const typeFor = (name: string): string => {
    if (name === '__OBJECTID') return 'esriFieldTypeOID';
    if (name === 'OBJECTID' || name === 'Visible' || name === 'Type_ID') return 'esriFieldTypeInteger';
    if (name === 'x' || name === 'y') return 'esriFieldTypeDouble';
    if (name === 'DATE') return 'esriFieldTypeString';
    return 'esriFieldTypeString';
  };
  const aliasFor = (name: string): string => {
    const lf = legacyByName[name];
    return (lf?.alias) || name;
  };
  const editableFor = (name: string): boolean => {
    if (name === '__OBJECTID') return false;
    const lf = legacyByName[name];
    return lf?.editable !== undefined ? !!lf.editable : true;
  };
  const lengthFor = (name: string): number | undefined => {
    const lf = legacyByName[name];
    const t = typeFor(name);
    // Only string fields typically have length; use legacy if present
    return t === 'esriFieldTypeString' ? (lf?.length ?? 255) : undefined;
  };
  const nullableFor = (name: string): boolean => {
    const lf = legacyByName[name];
    if (name === '__OBJECTID') return false;
    return lf?.nullable !== undefined ? !!lf.nullable : true;
  };
  // Prefer OBJECTID as the single id field; drop __OBJECTID if present to avoid duplication
  const normalizedHeaderNames = headerNames.filter((n) => n !== '__OBJECTID');
  const fields = normalizedHeaderNames.map((name) => {
    const type = typeFor(name);
    const base: any = {
      alias: aliasFor(name),
      editable: editableFor(name),
      name,
      nullable: nullableFor(name),
      type,
    };
    const len = lengthFor(name);
    if (len !== undefined) base.length = len;
    return base;
  });
  // Ensure __OBJECTID exists as OID if present in headers
  return fields;
}

function buildCsvOperationalLayer(opts: {
  itemId: string;
  title?: string;
  visible?: boolean;
  opacity?: number;
  lonField?: string;
  latField?: string;
  fields?: Array<{ name: string }>;
  legacyFields?: Array<any>;
  imageDataBase64?: string;
  imageUrlFallback?: string;
  uploadedUrlOverride?: string;
}) {
  const {
    itemId,
    title = 'Converted Map Notes',
    visible = true,
    opacity = 1,
    lonField = 'x',
    latField = 'y',
    fields = [],
    legacyFields = [],
    imageDataBase64,
    imageUrlFallback = 'http://static.arcgis.com/images/Symbols/Shapes/OrangePin2LargeB.png',
    uploadedUrlOverride
  } = opts;

  // Map CSV field names to correct case variants
  const names = fields.map((f) => f.name);
  const pick = (hi: string, lo: string) => (names.includes(hi) ? hi : (names.includes(lo) ? lo : hi));
  const Title = pick('TITLE', 'Title');
  const Description = pick('DESCRIPTION', 'Description');
  const Image_URL = pick('IMAGE_URL', 'Image_URL');
  const Image_Link_URL = pick('IMAGE_LINK_URL', 'Image_Link_URL');

  // Always produce full field definitions from header names + legacy metadata
  const headerNames = names.length ? names : [Title, Description, Image_URL, Image_Link_URL, 'DATE', 'Type_ID', 'Visible', 'OBJECTID', 'x', 'y'];
  const fullFields = buildFieldsFromHeaders({ headerNames, legacyFields });

  // Minimal CSV layer spec aligned with WebMap JSON expectations
  return {
    itemId,
    title,
    type: 'CSV',
    layerType: 'CSV',
    visibility: visible,
    opacity,
    // Ensure CSV layer resolves its data
    url: `${AGO}/content/items/${encodeURIComponent(itemId)}/data`,
    // Explicit coordinate mapping so AGO normalizer keeps the layer
    locationInfo: {
      locationType: 'coordinates',
      latitudeFieldName: latField,
      longitudeFieldName: lonField
    },
    // Provide a default layerId; AGO may assign differently
    layerId: 0,
    // Layer definition with fields and drawingInfo under layerDefinition (required by Map Viewer)
    layerDefinition: {
      geometryType: 'esriGeometryPoint',
      type: 'Feature Layer',
      objectIdField: headerNames.includes('OBJECTID') ? 'OBJECTID' : (headerNames[0] || 'OBJECTID'),
      fields: fullFields,
      // Enforce a clear layer title in the webmap
      title: 'Converted Map Notes (CSV)',
      drawingInfo: {
        renderer: {
          type: 'simple',
          symbol: {
            type: 'esriPMS',
            // Prefer uploaded resource URL; fallback to data URI (may be stripped) or static URL
            url: uploadedUrlOverride || (imageDataBase64 ? `data:image/png;base64,${imageDataBase64}` : imageUrlFallback),
            contentType: 'image/png',
            angle: 0,
            xoffset: 0,
            yoffset: 0,
            width: 18,
            height: 18,
          },
        },
      },
    },
    popupInfo: {
      title: `{${Title}}`,
      description: `{${Description}}`,
      mediaInfos: [
        {
          type: 'image',
          value: { sourceURL: `{${Image_URL}}`, linkURL: `{${Image_Link_URL}}` },
        },
      ],
    },
    displayField: Title
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const { token, webmapId, csvItemId, title, visible, opacity, lonField, latField } = body;
    if (!token || !webmapId || !csvItemId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Missing token, webmapId, or csvItemId' }) };
    }

    const [itemInfo, data] = await Promise.all([
      fetchItemInfo(webmapId, token),
      fetchWebmapData(webmapId, token)
    ]);
      // Try to extract legacy Map Notes picture symbol imageData/url to mirror classic shapes
      const opLayersFull = Array.isArray(data.operationalLayers) ? data.operationalLayers : [];
      const mapNotes = opLayersFull.find((l: any) => String(l?.layerType || l?.type || '').toLowerCase() === 'mapnotes');
      const mnDef = mapNotes?.layerDefinition || mapNotes?.featureCollection?.layers?.[0]?.layerDefinition;
      const mnDrawing = mnDef?.drawingInfo || mapNotes?.drawingInfo;
      const mnRenderer = mnDrawing?.renderer;
      const mnSymbol = mnRenderer?.symbol || (mapNotes?.featureCollection?.layers?.[0]?.featureSet?.features?.[0]?.symbol);
      const imageDataBase64 = (mnSymbol && (mnSymbol.imageData || mnSymbol?.data)) ? (mnSymbol.imageData || mnSymbol.data) : undefined;
      const imageUrlFallback = (mnSymbol && mnSymbol.url) ? mnSymbol.url : 'http://static.arcgis.com/images/Symbols/Shapes/OrangePin2LargeB.png';

    const opLayers = Array.isArray(data.operationalLayers) ? data.operationalLayers.slice() : [];

    // Avoid duplicate append if item already present
    const exists = opLayers.some((l: any) => l?.itemId === csvItemId);
    if (!exists) {
      // Try to inspect CSV item fields via CSV data header fetch for best-case alignment
      let fields: Array<{ name: string }> = [];
      let headerNames: string[] = [];
      try {
        const csvFieldsUrl = `${AGO}/content/items/${csvItemId}/data?f=json&token=${encodeURIComponent(token)}`;
        const fieldsRes = await fetch(csvFieldsUrl);
        if (fieldsRes.ok) {
          const fieldsJson = await fieldsRes.json().catch(() => ({}));
          if (Array.isArray(fieldsJson?.fields)) fields = fieldsJson.fields as Array<{ name: string }>;
        }
      } catch {}
      // As a fallback, fetch CSV headers from the raw CSV
      if (!fields.length) {
        headerNames = await fetchCsvHeaders(csvItemId, token);
        if (headerNames.length) {
          fields = headerNames.map((name) => ({ name }));
        }
      }
      // Build legacy fields metadata if available from Map Notes
      const legacyFields = (mapNotes?.layerDefinition?.fields) || (mapNotes?.featureCollection?.layers?.[0]?.layerDefinition?.fields) || [];
      // If we have base64 PNG, upload to CSV item resources to avoid Map Viewer stripping imageData
      let uploadedUrlOverride: string | undefined;
      if (imageDataBase64) {
        uploadedUrlOverride = await uploadSymbolResourceToCsvItem({ csvItemId, token, base64Png: imageDataBase64 });
      }
      const csvLayer = buildCsvOperationalLayer({ itemId: csvItemId, title, visible, opacity, lonField, latField, fields: (fields.length ? fields : []), legacyFields, imageDataBase64, imageUrlFallback, uploadedUrlOverride });
      opLayers.push(csvLayer);
      data.operationalLayers = opLayers;

      const updateRes = await updateWebmapData(webmapId, itemInfo.owner, token, data);
      if (!updateRes?.success) {
        return { statusCode: 500, body: JSON.stringify({ success: false, message: 'Update failed', details: updateRes }) };
      }
    } else {
      // If exists, enrich the existing CSV layer block with renderer/popup/displayField
      const idx = opLayers.findIndex((l: any) => l?.itemId === csvItemId);
      if (idx >= 0) {
        const existing = opLayers[idx];
        let fields: Array<{ name: string }> = [];
        let headerNames: string[] = [];
        try {
          const csvFieldsUrl = `${AGO}/content/items/${csvItemId}/data?f=json&token=${encodeURIComponent(token)}`;
          const fieldsRes = await fetch(csvFieldsUrl);
          if (fieldsRes.ok) {
            const fieldsJson = await fieldsRes.json().catch(() => ({}));
            if (Array.isArray(fieldsJson?.fields)) fields = fieldsJson.fields as Array<{ name: string }>;
          }
        } catch {}
        if (!fields.length) {
          headerNames = await fetchCsvHeaders(csvItemId, token);
          if (headerNames.length) {
            fields = headerNames.map((name) => ({ name }));
          }
        }
        const legacyFields = (mapNotes?.layerDefinition?.fields) || (mapNotes?.featureCollection?.layers?.[0]?.layerDefinition?.fields) || [];
        let uploadedUrlOverride: string | undefined;
        if (imageDataBase64) {
          uploadedUrlOverride = await uploadSymbolResourceToCsvItem({ csvItemId, token, base64Png: imageDataBase64 });
        }
        const enriched = buildCsvOperationalLayer({ itemId: csvItemId, title, visible, opacity, lonField, latField, fields: (fields.length ? fields : []), legacyFields, imageDataBase64, imageUrlFallback, uploadedUrlOverride });
        const merged = { ...existing, ...enriched };
        opLayers[idx] = merged;
        data.operationalLayers = opLayers;
        const updateRes = await updateWebmapData(webmapId, itemInfo.owner, token, data);
        if (!updateRes?.success) {
          return { statusCode: 500, body: JSON.stringify({ success: false, message: 'Enrichment failed', details: updateRes }) };
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ success: false, message: err?.message || String(err) }) };
  }
};
