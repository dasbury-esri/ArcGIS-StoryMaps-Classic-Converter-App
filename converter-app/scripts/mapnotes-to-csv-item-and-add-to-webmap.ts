// Uses global fetch available in Node 18+
import { Readable } from 'stream';

type AnyObject = Record<string, any>;

function getEnv(name: string, required = true): string | undefined {
  const v = process.env[name];
  if (required && (!v || v.trim() === '')) {
    console.error(`[Error] Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

function getEnvOptional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : undefined;
}

async function fetchWebmap(id: string, token: string): Promise<AnyObject> {
  const url = `https://www.arcgis.com/sharing/rest/content/items/${id}/data?f=json&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch webmap data: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchItem(id: string, token: string): Promise<AnyObject> {
  const url = `https://www.arcgis.com/sharing/rest/content/items/${id}?f=json&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch item: ${res.status} ${res.statusText}`);
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
  const headers = [
    '__OBJECTID',
    'OBJECTID',
    'Title',
    'Visible',
    'Description',
    'Image_URL',
    'Image_Link_URL',
    'DATE',
    'Type_ID',
    'x',
    'y',
  ];
  let oid = 1;
  const rows = features.map((f) => {
    const attrs = f?.attributes || {};
    const geom = f?.geometry || {};
    const sr = geom?.spatialReference || { wkid: 102100 };
    // Convert Web Mercator (EPSG:3857/102100) to WGS84 lon/lat
    const toWgs84 = (mx: number, my: number): { lon: number; lat: number } => {
      const R = 6378137;
      const lon = (mx / R) * (180 / Math.PI);
      const lat = (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * (180 / Math.PI);
      return { lon, lat };
    };
    let x = geom?.x;
    let y = geom?.y;
    if (typeof x === 'number' && typeof y === 'number') {
      const srOverrideWkid = getEnvOptional('SR_WKID');
      const srOverrideWkt = getEnvOptional('SR_WKT');
      const wkid = srOverrideWkid ? Number(srOverrideWkid) : (sr?.wkid || sr?.latestWkid);
      const isWebMercator = wkid === 102100 || wkid === 3857 || (!!srOverrideWkt && /3857|102100|WGS_1984_Web_Mercator/i.test(srOverrideWkt));
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
  // Multipart form for file upload
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

// Owner-scoped update to reliably persist changes
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

// Fetch CSV headers by downloading the CSV text and reading the first line
async function fetchCsvHeaders(csvItemId: string, token: string): Promise<string[]> {
  try {
    const url = `https://www.arcgis.com/sharing/rest/content/items/${csvItemId}/data?token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    const firstLine = text.split(/\r?\n/)[0] || '';
    const headers = firstLine.split(',').map(h => h.trim()).filter(h => h.length > 0);
    return headers;
  } catch {
    return [];
  }
}

function buildFieldsFromHeaders(headerNames: string[]): Array<{ alias?: string; editable?: boolean; length?: number; name: string; nullable?: boolean; type: string }> {
  const typeFor = (name: string): string => {
    if (name === '__OBJECTID') return 'esriFieldTypeOID';
    if (name === 'OBJECTID' || name === 'Visible' || name === 'Type_ID') return 'esriFieldTypeInteger';
    if (name === 'x' || name === 'y') return 'esriFieldTypeDouble';
    if (name === 'DATE') return 'esriFieldTypeString';
    return 'esriFieldTypeString';
  };
  const normalizedHeaderNames = headerNames.filter((n) => n !== '__OBJECTID');
  return normalizedHeaderNames.map((name) => {
    const t = typeFor(name);
    const base: any = { alias: name, editable: name !== 'OBJECTID', name, nullable: true, type: t };
    if (t === 'esriFieldTypeString') base.length = 255;
    return base;
  });
}

async function main() {
  const token = getEnv('ARCGIS_TOKEN') as string;
  const webmapId = (getEnv('WEBMAP_ID') as string) || '';
  console.log(`[Fetch] Webmap ${webmapId}`);
  const webmap = await fetchWebmap(webmapId, token);
  const opLayers: AnyObject[] = webmap?.operationalLayers || [];
  const mapNotes = opLayers.find(isMapNotesLayer);
  if (!mapNotes) {
    console.log('[Transform] No Map Notes-like layer found');
    return;
  }
  console.log(`[Transform] Found Map Notes layer: title=${mapNotes.title} id=${mapNotes.id}`);
  const { headers, rows } = mapNotesToCsvRows(mapNotes);
  const featureCount = rows.length;
  if (featureCount === 0) {
    const fc = mapNotes?.featureCollection;
    const fs = fc?.layers?.[0]?.featureSet;
    const srcCount = Array.isArray(fs?.features) ? fs.features.length : 0;
    console.error(`[Error] Map Notes export produced 0 CSV rows (source features: ${srcCount}). Aborting CSV item creation.`);
    console.error('[Debug] Layer keys:', Object.keys(mapNotes || {}));
    console.error('[Debug] featureCollection present:', !!fc, 'featureSet present:', !!fs);
    return;
  }
  // Validate CSV field mapping and coordinate ranges
  const parseNum = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };
  const xs = rows.map(r => parseNum(r[9])).filter(n => !Number.isNaN(n));
  const ys = rows.map(r => parseNum(r[10])).filter(n => !Number.isNaN(n));
  const stats = (arr: number[]) => ({
    count: arr.length,
    min: arr.length ? Math.min(...arr) : NaN,
    max: arr.length ? Math.max(...arr) : NaN,
    mean: arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : NaN,
  });
  const xStats = stats(xs);
  const yStats = stats(ys);
  const inRangeX = xs.every(x => x >= -180 && x <= 360);
  const inRangeY = ys.every(y => y >= -90 && y <= 90);
  console.log('[Validate] x stats:', xStats, 'y stats:', yStats);
  if (!inRangeX || !inRangeY) {
    console.error('[Error] Coordinate validation failed: expected WGS84 ranges (x∈[-180,360], y∈[-90,90]).');
    console.error('[Debug] Example bad rows:', rows.slice(0, 5).map(r => ({ x: r[9], y: r[10], title: r[2] })));
    return;
  }
  const csv = csvString(headers, rows);
  // Log sample of first row to validate lon/lat ranges
  const sample = rows.slice(0, 1).map(r => ({ lon: r[9], lat: r[10], title: r[2] }));
  console.log('[Debug] Sample converted rows (lon, lat, title):', JSON.stringify(sample));
  const self = await getUserInfo(token);
  const owner = self?.user?.username || '';
  if (!owner) throw new Error('Unable to resolve AGO username for addItem');
  console.log('[Item] Creating CSV item...');
  console.log(`[Item] CSV rows: ${featureCount}`);
  const tsSuffix = new Date().toISOString().replace(/[:.]/g, '-');
  let csvItemTitle = `Converted Map Notes (CSV) - ${tsSuffix}`;
  let csvItemId: string;
  try {
    const res = await addCsvItem(owner, token, csvItemTitle, csv);
    csvItemId = res.id;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes('already exists')) {
      csvItemTitle = `Converted Map Notes (CSV) - ${tsSuffix}-${Date.now()}`;
      const res2 = await addCsvItem(owner, token, csvItemTitle, csv);
      csvItemId = res2.id;
    } else {
      throw e;
    }
  }
  const csvDataUrl = `https://www.arcgis.com/sharing/rest/content/items/${csvItemId}/data`;
  console.log(`[Item] CSV item created: ${csvItemId}`);

  // Build renderer and popup as provided by user example (esriPMS symbol with imageData)
  const layerDef = {
    geometryType: 'esriGeometryPoint',
    objectIdField: '__OBJECTID',
    fields: [
      { alias: '__OBJECTID', editable: false, name: '__OBJECTID', nullable: false, type: 'esriFieldTypeOID' },
      { alias: 'OBJECTID', editable: true, name: 'OBJECTID', nullable: true, type: 'esriFieldTypeInteger' },
      { alias: 'Title', editable: true, length: 255, name: 'Title', nullable: true, type: 'esriFieldTypeString' },
      { alias: 'Visible', editable: true, name: 'Visible', nullable: true, type: 'esriFieldTypeInteger' },
      { alias: 'Description', editable: true, length: 255, name: 'Description', nullable: true, type: 'esriFieldTypeString' },
      { alias: 'Image URL', editable: true, length: 255, name: 'Image_URL', nullable: true, type: 'esriFieldTypeString' },
      { alias: 'Image Link URL', editable: true, length: 255, name: 'Image_Link_URL', nullable: true, type: 'esriFieldTypeString' },
      { alias: 'DATE', editable: true, length: 255, name: 'DATE', nullable: true, type: 'esriFieldTypeDate' },
      { alias: 'Type ID', editable: true, name: 'Type_ID', nullable: true, type: 'esriFieldTypeInteger' },
      { alias: 'x', editable: true, name: 'x', nullable: true, type: 'esriFieldTypeDouble' },
      { alias: 'y', editable: true, name: 'y', nullable: true, type: 'esriFieldTypeDouble' },
    ],
    drawingInfo: {
      renderer: {
        type: 'simple',
        visualVariables: [
          {
            type: 'sizeInfo',
            valueExpression: '$view.scale',
            stops: [
              { size: 80.64516129032258, value: 2256.994353 },
              { size: 64.51612903225806, value: 18055.954822 },
              { size: 32.25806451612903, value: 144447.638572 },
              { size: 16.129032258064516, value: 1155581.108577 },
            ],
          },
        ],
        symbol: {
          type: 'esriPMS',
          angle: 0,
          xoffset: 0,
          yoffset: 0,
          contentType: 'image/png',
          imageData:
            'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAADImlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS4wLWMwNjAgNjEuMTM0Nzc3LCAyMDEwLzAyLzEyLTE3OjMyOjAwICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdFJlZj0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlUmVmIyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ1M1IE1hY2ludG9zaCIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo0NUY4MEUwQkQyODExMUUwQUU5NUVFMEYwMTY0NzUwNSIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo0NUY4MEUwQ0QyODExMUUwQUU5NUVFMEYwMTY0NzUwNSI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOjBFMDg0ODhFRDI4MTExRTBBRTk1RUUwRjAxNjQ3NTA1IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjQ1RjgwRTBBRDI4MTExRTBBRTk1RUUwRjAxNjQ3NTA1Ii8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+aGFvYAAAB99JREFUeF7tmntoVnUcxk8XE0ttqXQTWVpSYYFEVERjUGSFSRJBwf6QiAgCI5aWWUuzi6vMXJmad7OVlVKmOSOTFPpjKt5ybe2ape2SbZo2U9Nfz+fsfLcfh3e6IbQz9h54eC9737PzPM/3dn6/N3DOBT0ZPZo8xqcF6Mnhn46AdAqka0C6CKa7QLoLpCfB9Cjco+tAjyafngTTk+BZToJBAo/OtvWzqgEJ5N9pPp3+gq+wJ8A5ev9/PfS/LxR6C+cL5wrncD1dFQHnhuwLr3TukyFCpjBUGOaB14C/AT4HBreA7350qXPLM5z7sLdzS8RlsbBA+ECYK8wWCgJ36tQpJW8wRLhU6BcJgQhdJsD5LQJcHhEyEVKQhWgIfRZAOiQ+QMT7Obes12nJu3cCd/z4cQS4XbhRGByJQCR0mQCyTAdEQmJG0iMbEh3UQhSXQ6dFOMSFLa4v1fXj/KLUzkPevR245uZmBHhUGB2JQCSQDl0mgBjoCImJIER9sj5JHF6mjAEQNtIW8j75OW1h72bq+QzhzcAdOnQIAV6KRCASSAdqQpcJcFEoQOikD7lqhI0oeR0HpBdGrs/X4zyhHfIuP3CNjY0IUCA8LdwlDBMu6koB+oYCmLPmLq6as5A2okaWAmeAuBW79/X8vZaC1+r8G3o+PXAnXgtcQ0MDAiwQnhPuFa4R+na9AEY4FWmfqJGFMMBxqjyun4b8cZE/+krgamtrEyqAH9rxsI6ThbCRNuK0uXeFWZ7zynnCHuchf+TlwO3bty+hAkA6FXFz2HcZpwGkASFv5KNqT8GD/L+vt5E/ODVwe/fuTagAfm5bmMfD2wgbaSMeJ/+WyCvvT4n8sVcD9/e0wP0l8o1TAldTU5NQAeIFLRV5CPukIU6xI+xx3mt3fugfVug3ifyfeYGrrq5OsACnc94nDmmDT16Djovcp+pT+JqV++b+AQlQVVXVzQSI57lPHPKp3I+FP7nf+FLg/ngxcJWVlQkVAPf9fu5Xd3O/PfIpwp/8/0f5T+VHAMI/+QKk6ut+lY8LAHEjT/hH465VfxPA8h8BKioqEhoB1uutx1uba899Ix8XgKnP6/0UQKo/+d+QaAHi/T5V7vs577tv1T/W/loLYJT/9S8Erry8PKER4A867YW977o5D/kU4W+TH+GP+5CvnRy4srKyhArQXtGzKh93HOJx8imqP8WP0If870JpaWlCBYi77rc3I2uEcdxA4fN6v8391vspfHVyf//zug+YFLiSkpKECmBTXbyyx8lC2ABxZv6o8Nncb4XPJ/+ryO99LnB79uxJqACpctrchWgcEI+R99ueTx7iNc+2YPfu3ckT4OTJk22FzHq5kcPd9qB2x8iL8z55ih5hT8j/IvLVIl41sQW7du1KngDHjh1rG2KicKaXhxDB1uf2XvQ+055/r28V3ycP6UqhYkILdu7cmTwBWKm1PIYwxHAVcgZeG+w9bnXj7c7IE+5GvOwZtT+hXNixY0fyBDh8+HDosjkKMUBYA3vtvw9x/z6fnKfVUeyMPKRLc9uQWAEOHjzompqa3IEDB8JFy/r6eldXV9eKI5+NDW9rDRCn0vt3eUaefN/93cdu27ZtbsuWLa3YunWr2759eyJrAEvSLE2zRM1SNUvWK4Q1wtr8/Pzy+p+Lw7s6AHF6vN3g2JBjzpfNGeU2b958ok+fPpv0/W+F9cLXnCs6J+dO1LI4mxJsTrBJwY4NmxZcIEvXC/v371+oyn2kcdW4VuLc3PgTnh/2OzatcRMnTqzWd4uELyMxl+lxUXROzp2ojRG2pdieYq+O7SpEIBJYt3+ei508efLafVUlrklF0b+zI+yt1VHwSpY85tatW3dU7m/Q91YJi4WZwjThBWFSdO5EbY2xMckuLRuViEAkkA5sWtwnjBXGaYRtbFg9vtX5eKurkBjbftjocnJySvT5L4SFwivCk8LDwv3ROTl3ojZH2ZomChCBSCAdqAns2AwXbhDuyM3NnfprxY/uD80J3NlxY0PoU/TM/aKioqP6LPm+XMgXnohEvFmP10Xn5NyJ2h7nxwmIQCQgBDWBwsh2FaIMEIbiWnFx8U/7v8lvvblhxEWACtUEqn5WVtZWfW6lMFvIFXCdqLpCuDg6J+dO1A8kdD3tHoiDMFz88Ly8vAms6tZqWPLH3J9WTXGFhYWN+gyVfqlAzucIt0Tk++gx/BXI6Y6u+oXIma6LCycyLhNuWr9+/fc1m5eHt7dEQNX0geF0l52djfufC1T58cIoRIvEQ8RuKwACnSeQDsPGjBmTw9L2bwXXhzXg5w2LXEFBwX797SuBqk+LewSxItEQ74zk+SdJjQCuzaKAIjly9erVa4kCRGCBIzMzc6Pe/1Sg5VH1bd8f0RCvQ0eSBbAooDBeNWLEiNFa2/ubBc5Zs2aVRuTn65Fe/xAiCfbTlw65n/QIsCi4QE8GCjeuXLlyhURozsjImKfXc4XpwuNCNiIJiNVh97uDAFwj7TIcnUeOHHnPjBkzGJeZ7qYITwkPIE4kEmJ12P3uIgCEegnMBgw2dwu0O0bbB4XbECcSKfztX2eOpNcA42JRwHCD21nCncKtAtPjJZFInXK/u0QA12nDUX89R4SrhWuFTGGQwNDTafe7kwAmAjnOWJshkBIIAvkODT2pUqO7pIAJYPcPCMGwQ22g6nc69E2MzgrwH/UCyrKfQEjMAAAAAElFTkSuQmCC',
          height: 30,
          width: 30,
        },
      },
    },
  };

  const popupInfo = {
    popupElements: [
      { type: 'text', text: '<p><span>{Description}</span>&nbsp;</p>' },
      {
        type: 'media',
        description: '',
        mediaInfos: [
          {
            altText: '',
            caption: '',
            title: '',
            type: 'image',
            refreshInterval: 0,
            value: { linkURL: '{Image_Link_URL}', sourceURL: '{Image_URL}' },
          },
        ],
        title: '',
      },
    ],
    description: '<p><span>{Description}</span>&nbsp;</p>',
    mediaInfos: [
      {
        altText: '',
        caption: '',
        title: '',
        type: 'image',
        refreshInterval: 0,
        value: { linkURL: '{Image_Link_URL}', sourceURL: '{Image_URL}' },
      },
    ],
    fieldInfos: [
      { fieldName: 'OBJECTID', isEditable: false, label: 'OBJECTID', visible: false },
      { fieldName: 'DATE', isEditable: true, label: 'DATE', visible: true },
      { fieldName: 'Description', isEditable: true, label: 'Description', visible: true },
      { fieldName: 'Image_Link_URL', isEditable: true, label: 'Image Link URL', visible: true },
      { fieldName: 'Image_URL', isEditable: true, label: 'Image URL', visible: true },
      { fieldName: 'Title', isEditable: true, label: 'Title', visible: true },
      { fieldName: 'Type_ID', format: { digitSeparator: true, places: 0 }, isEditable: true, label: 'Type ID', visible: true },
      { fieldName: 'Visible', format: { digitSeparator: true, places: 0 }, isEditable: true, label: 'Visible', visible: true },
      { fieldName: 'x', format: { digitSeparator: true, places: 2 }, isEditable: true, label: 'x', visible: true },
      { fieldName: 'y', format: { digitSeparator: true, places: 2 }, isEditable: true, label: 'y', visible: true },
    ],
    title: '{Title}',
  };

  // Build CSV layer operational spec using CSV headers and enforce OBJECTID
  // Pull headers from raw CSV
  const headerNames = await fetchCsvHeaders(csvItemId, token);
  const fullFields = buildFieldsFromHeaders(headerNames.length ? headerNames : ['Title','Description','Image_URL','Image_Link_URL','DATE','Type_ID','Visible','OBJECTID','x','y']);
  const csvLayer = {
    id: `csv_${Date.now()}`,
    layerId: 0,
    title: 'Converted Map Notes (CSV)',
    visibility: Boolean(mapNotes?.visibility ?? true),
    opacity: 1,
    itemId: csvItemId,
    layerType: 'CSV',
    type: 'CSV',
    url: csvDataUrl,
    layerDefinition: {
      geometryType: 'esriGeometryPoint',
      type: 'Feature Layer',
      objectIdField: headerNames.includes('OBJECTID') ? 'OBJECTID' : (headerNames[0] || 'OBJECTID'),
      fields: fullFields,
      title: 'Converted Map Notes (CSV)',
      drawingInfo: {
        renderer: {
          type: 'simple',
          symbol: {
            type: 'esriPMS',
            // Fallback to data URI (may be stripped) or static URL; Save step will upload to resources
            url: `http://static.arcgis.com/images/Symbols/Shapes/OrangePin2LargeB.png`,
            contentType: 'image/png', angle: 0, xoffset: 0, yoffset: 0, width: 18, height: 18,
          },
        },
      },
    },
    popupInfo,
    columnDelimiter: ',',
    displayField: 'Title',
    locationInfo: { latitudeFieldName: 'y', locationType: 'coordinates', longitudeFieldName: 'x' },
  };

  // First, append with a minimal CSV layer to ensure persistence
  const minimalLayer = {
    id: `csv_${Date.now()}`,
    title: 'Converted Map Notes (CSV)',
    itemId: csvItemId,
    type: 'CSV',
    visibility: true,
    opacity: 1,
  };
  // Append using owner-scoped update for reliability
  let updated = { ...webmap, operationalLayers: [...opLayers] };
  const alreadyHas = updated.operationalLayers.some((l: AnyObject) => (l?.itemId || '') === csvItemId);
  if (!alreadyHas) {
    updated.operationalLayers.push(minimalLayer);
    console.log('[Update] Adding minimal CSV layer to webmap (owner-scoped)...');
    await updateWebmapDataOwner(webmapId, owner, token, updated);
    console.log('[Update] Minimal layer append success.');
  } else {
    console.log('[Update] CSV layer already present; skipping minimal append.');
  }

  // Re-fetch current data, find the just-added layer by itemId, then enrich it
  const current = await fetchWebmap(webmapId, token);
  const currentLayers: AnyObject[] = current?.operationalLayers || [];
  const idx = currentLayers.findIndex((l) => (l?.itemId || '') === csvItemId);
  if (idx >= 0) {
    const enriched = { ...current };
    const existing = currentLayers[idx];
    const mergedLayer = { ...existing, ...csvLayer };
    // Also remove any duplicate minimal CSV layers that match title but lack itemId
    const deduped = currentLayers.filter((l, i) => {
      if (i === idx) return true;
      const isSameTitle = (l?.title || '') === csvItemTitle;
      const isCsv = String(l?.type || l?.layerType || '').toLowerCase() === 'csv';
      const hasItem = !!l?.itemId;
      return !(isCsv && isSameTitle && !hasItem);
    });
    enriched.operationalLayers = [...deduped.slice(0, idx), mergedLayer, ...deduped.slice(idx + 1)];
    console.log('[Update] Enriching CSV layer via owner-scoped update...');
    await updateWebmapDataOwner(webmapId, owner, token, enriched);
    console.log('[Update] Enrichment success.');
    // Retain original Map Notes layer; only ensure CSV layer is enriched and duplicates removed.
    // Reorder: place CSV layer immediately after the original Map Notes layer
    const reordered = await fetchWebmap(webmapId, token);
    const rLayers: AnyObject[] = reordered?.operationalLayers || [];
    const mapNotesIdx2 = rLayers.findIndex(isMapNotesLayer);
    const csvIdx2 = rLayers.findIndex((l) => (l?.itemId || '') === csvItemId);
    if (mapNotesIdx2 >= 0 && csvIdx2 >= 0 && csvIdx2 !== mapNotesIdx2 + 1) {
      const working = [...rLayers];
      const [csvLayerObj] = working.splice(csvIdx2, 1);
      working.splice(mapNotesIdx2 + 1, 0, csvLayerObj);
      const reorderedUpdate = { ...reordered, operationalLayers: working };
      console.log('[Update] Reordering layers: placing CSV after Map Notes (owner-scoped)...');
      await updateWebmapDataOwner(webmapId, owner, token, reorderedUpdate);
      console.log('[Update] Layer order normalized.');
    } else {
      console.log('[Update] Layer order already correct or Map Notes/CSV not found for reorder.');
    }

      // Post-validation: if CSV layer is present and has expected schema, set original Map Notes visibility to false
      const validated = await fetchWebmap(webmapId, token);
      const vLayers: AnyObject[] = validated?.operationalLayers || [];
      const csvLayerNow = vLayers.find((l) => (l?.itemId || '') === csvItemId);
      const hasObjectIdField = Boolean(csvLayerNow?.layerDefinition?.objectIdField === 'OBJECTID');
      const symbolUrl = csvLayerNow?.layerDefinition?.drawingInfo?.renderer?.symbol?.url;
      const contentType = csvLayerNow?.layerDefinition?.drawingInfo?.renderer?.symbol?.contentType;
      const hasPngSymbol = Boolean(symbolUrl && typeof symbolUrl === 'string' && symbolUrl.toLowerCase().includes('.png')) || contentType === 'image/png';
      if (csvLayerNow && hasObjectIdField && hasPngSymbol) {
        const mapNotesIndex = vLayers.findIndex(isMapNotesLayer);
        if (mapNotesIndex >= 0) {
          const updatedLayers = vLayers.map((l, i) => (i === mapNotesIndex ? { ...l, visibility: false } : l));
          const hideMapNotesUpdate = { ...validated, operationalLayers: updatedLayers };
          console.log('[Update] CSV validated (OBJECTID + PNG symbol). Hiding original Map Notes layer (visibility=false)...');
          await updateWebmapDataOwner(webmapId, owner, token, hideMapNotesUpdate);
          console.log('[Update] Original Map Notes layer visibility set to false.');
        }
      } else {
        console.log('[Validate] CSV layer not fully confirmed (needs OBJECTID and PNG symbol); leaving Map Notes visibility as-is.');
      }
    // Save function call removed; enrichment now fully handled inline.
  } else {
    console.warn('[Update] CSV layer with itemId not found after append; skipping enrichment.');
  }

  // Verify (immediate) — expect CSV layer present and Map Notes retained
  const after = await fetchWebmap(webmapId, token);
  const titles = (after?.operationalLayers || []).map((l: AnyObject) => l?.title);
  const ids = (after?.operationalLayers || []).map((l: AnyObject) => l?.id);
  console.log('[Verify] operationalLayers titles:', JSON.stringify(titles));
  console.log('[Verify] operationalLayers ids:', JSON.stringify(ids));
  console.log(`[Verify] CSV item: https://www.arcgis.com/home/item.html?id=${csvItemId}`);
  console.log(`[Verify] Webmap: https://www.arcgis.com/home/item.html?id=${webmapId}`);

  // Additional content-level re-fetch
  const itemInfo = await fetchItem(webmapId, token);
  console.log('[Verify] content item info (layer count hint):', {
    title: itemInfo?.title,
    modified: itemInfo?.modified,
    numViews: itemInfo?.numViews,
  });
}

main().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});
