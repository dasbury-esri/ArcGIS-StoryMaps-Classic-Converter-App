import type { Handler } from '@netlify/functions';

// Minimal shared types
type AnyObject = Record<string, any>;

async function fetchWebmap(id: string, token: string): Promise<AnyObject> {
  const url = `https://www.arcgis.com/sharing/rest/content/items/${id}/data?f=json&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch webmap data: ${res.status} ${res.statusText}`);
  return res.json();
}

function isMapNotesLayer(layer: AnyObject): boolean {
  const type = (layer?.layerType || layer?.type || '').toLowerCase();
  const fc = layer?.featureCollection;
  const title = (layer?.title || '').toLowerCase();
  if (type === 'mapnotes') return true;
  if (title.includes('map notes') && !!fc) return true;
  if (fc && Array.isArray(fc.layers)) {
    const total = fc.layers.reduce((sum: number, lyr: AnyObject) => {
      const feats = lyr?.featureSet?.features || [];
      return sum + (Array.isArray(feats) ? feats.length : 0);
    }, 0);
    return total > 0;
  }
  return false;
}

function mapNotesToCsvRows(layer: AnyObject): { headers: string[]; rows: Array<string[]> } {
  const sublayers: AnyObject[] = layer?.featureCollection?.layers || [];
  const features: AnyObject[] = sublayers.flatMap((sl) => sl?.featureSet?.features || []);
  const headers = ['__OBJECTID','OBJECTID','Title','Visible','Description','Image_URL','Image_Link_URL','DATE','Type_ID','x','y'];
  let oid = 1;
  const rows = features.map((f) => {
    const attrs = f?.attributes || {};
    const geom = f?.geometry || {};
    const sr = geom?.spatialReference || { wkid: 102100 };
    const toWgs84 = (mx: number, my: number): { lon: number; lat: number } => {
      const R = 6378137;
      const lon = (mx / R) * (180 / Math.PI);
      const lat = (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * (180 / Math.PI);
      return { lon, lat };
    };
    let x = geom?.x;
    let y = geom?.y;
    if (typeof x === 'number' && typeof y === 'number') {
      const wkid = (sr?.wkid || sr?.latestWkid);
      const isWebMercator = wkid === 102100 || wkid === 3857;
      if (isWebMercator) {
        const { lon, lat } = toWgs84(x, y);
        x = lon;
        y = lat;
      }
    }
    const r = [
      String(oid++),
      String(attrs?.OBJECTID ?? ''),
      String(attrs?.TITLE ?? attrs?.Title ?? ''),
      String(attrs?.VISIBLE ?? attrs?.Visible ?? ''),
      String(attrs?.DESCRIPTION ?? attrs?.Description ?? ''),
      String(attrs?.IMAGE_URL ?? attrs?.Image_URL ?? ''),
      String(attrs?.IMAGE_LINK_URL ?? attrs?.Image_Link_URL ?? ''),
      String(attrs?.DATE ?? ''),
      String(attrs?.TYPEID ?? attrs?.Type_ID ?? ''),
      x !== undefined && x !== null ? String(x) : '',
      y !== undefined && y !== null ? String(y) : '',
    ];
    return r;
  });
  return { headers, rows };
}

function csvString(headers: string[], rows: Array<string[]>): string {
  const esc = (v: string) => {
    const needsQuote = /[",\n]/.test(v);
    const s = v.replace(/"/g, '""');
    return needsQuote ? `"${s}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(row.map(esc).join(','));
  return lines.join('\n');
}

async function getUserInfo(token: string): Promise<AnyObject> {
  const url = `https://www.arcgis.com/sharing/rest/portals/self?f=json&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch portals/self: ${res.status} ${res.statusText}`);
  return res.json();
}

async function addCsvItem(owner: string, token: string, title: string, csvText: string): Promise<{ id: string }> {
  const base = `https://www.arcgis.com/sharing/rest/content/users/${encodeURIComponent(owner)}`;
  const url = `${base}/addItem`;
  const boundary = `----csv${Date.now()}`;
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
  addField('type', 'CSV');
  addField('title', title);
  addField('tags', 'storymaps,converter,mapnotes,csv');
  addFile('file', `${title.replace(/\s+/g, '_')}.csv`, 'text/csv', csvText);
  parts.push(`--${boundary}--`);
  const body = parts.join('\r\n');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Failed to add CSV item: ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (!(json.success === true && json.id)) throw new Error(`CSV addItem failed: ${JSON.stringify(json)}`);
  return { id: json.id };
}

async function updateWebmapDataOwner(id: string, owner: string, token: string, data: AnyObject): Promise<void> {
  const url = `https://www.arcgis.com/sharing/rest/content/users/${encodeURIComponent(owner)}/items/${id}/update`;
  const form = new URLSearchParams();
  form.set('f', 'json');
  form.set('token', token);
  form.set('text', JSON.stringify(data));
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Failed to update webmap: ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (!(json.success === true || json.id === id)) throw new Error(`Update webmap failed: ${JSON.stringify(json)}`);
}

export const handler: Handler = async (event) => {
  try {
    const webmapId = (event.queryStringParameters?.webmapId || event.body && JSON.parse(event.body).webmapId) as string | undefined;
    const token = (event.queryStringParameters?.token || event.body && JSON.parse(event.body).token) as string | undefined;
    if (!webmapId || !token) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing webmapId or token' }) };
    }
    const wm = await fetchWebmap(webmapId, token);
    const opLayers: AnyObject[] = wm?.operationalLayers || [];
    const mapNotes = opLayers.find(isMapNotesLayer);
    if (!mapNotes) {
      return { statusCode: 200, body: JSON.stringify({ message: 'No Map Notes layer found; skipping.', changed: false }) };
    }
    const { headers, rows } = mapNotesToCsvRows(mapNotes);
    if (!rows.length) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Map Notes export produced 0 CSV rows' }) };
    }
    const csv = csvString(headers, rows);
    const self = await getUserInfo(token);
    const owner = self?.user?.username || '';
    if (!owner) throw new Error('Unable to resolve AGO username for addItem');
    const tsSuffix = new Date().toISOString().replace(/[:.]/g, '-');
    const title = `Converted Map Notes (CSV) - ${tsSuffix}`;
    const { id: csvItemId } = await addCsvItem(owner, token, title, csv);
    // Append minimal layer first
    const minimal = { id: `csv_${Date.now()}`, title, itemId: csvItemId, type: 'CSV', visibility: true, opacity: 1 };
    const updated = { ...wm, operationalLayers: [...opLayers, minimal] };
    await updateWebmapDataOwner(webmapId, owner, token, updated);
    return { statusCode: 200, body: JSON.stringify({ message: 'CSV item created and minimal layer appended', csvItemId, title, changed: true }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e?.message || e) }) };
  }
};
