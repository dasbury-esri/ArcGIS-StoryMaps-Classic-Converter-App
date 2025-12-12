/**
 * Simple CLI to convert a Classic Map Series item and save outputs
 * Usage: npx --yes tsx converter-app/scripts/test-mapseries-conversion.ts <classicItemId> [themeId]
 */
import { MapSeriesConverter } from '../src/converters/MapSeriesConverter';
import { getItemData } from '../src/api/arcgis-client';
import fs from 'node:fs';
import path from 'node:path';

type ThemeId = 'auto' | 'summit' | 'obsidian';

function pad(n: number) { return String(n).padStart(2, '0'); }
function makeRunFolder(classicId: string) {
  const now = new Date();
  const stamp = `${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `${classicId}-${stamp}`;
}

async function saveLocal(filename: string, json: unknown, classicItemId: string) {
  const res = await fetch('http://localhost:8888/.netlify/functions/save-converted', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename, classicItemId, json })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn('[saveLocal] Failed:', res.status, text);
  } else {
    const info = await res.json().catch(() => ({}));
    console.log('[saveLocal] Saved:', info?.path || filename);
  }
}

async function main() {
  const inputArg = String(process.argv[2] || '').trim();
  const themeId = (String(process.argv[3] || 'auto').trim() as ThemeId);
  const tokenArgIdx = process.argv.findIndex(a => a === '--token');
  const token = tokenArgIdx > -1 ? String(process.argv[tokenArgIdx + 1] || '').trim() : (process.env.ARCGIS_TOKEN || '').trim();
  if (!inputArg) {
    console.error('Usage: tsx converter-app/scripts/test-mapseries-conversion.ts <classicItemId|path/to.json> [themeId] [--token <token>]');
    process.exit(1);
  }
  let classicItemId = inputArg;
  let classicJson: Record<string, unknown> = {};
  if (/\.json$/i.test(inputArg) || fs.existsSync(inputArg)) {
    const filePath = path.resolve(inputArg);
    console.log('[test-mapseries] Reading local JSON file:', filePath);
    const text = fs.readFileSync(filePath, 'utf-8');
    classicJson = JSON.parse(text);
    const name = path.basename(filePath);
    const m = /([a-f0-9]{32})/i.exec(name);
    if (m) classicItemId = m[1];
  } else {
    console.log('[test-mapseries] Fetching classic item data:', classicItemId);
    classicJson = await getItemData(classicItemId, token).catch((e: Error) => {
      console.error('[test-mapseries] Failed to fetch item data:', e.message);
      return {} as Record<string, unknown>;
    });
  }

  console.log('[test-mapseries] Converting series with theme:', themeId);
  const { storymapJsons, entryTitles } = await MapSeriesConverter.convertSeries({ classicJson, themeId, token });
  console.log('[test-mapseries] Entries detected:', entryTitles.length, 'jsons:', storymapJsons.length);

  const runFolder = makeRunFolder(classicItemId);
  // Save collection placeholder first, including collectionType and panel defaults
  const seriesSettings = (classicJson as { values?: { settings?: Record<string, unknown> } }).values?.settings || {} as Record<string, unknown>;
  const layoutId = (seriesSettings as { layout?: { id?: string } }).layout?.id;
  const panel = (seriesSettings as { layoutOptions?: { panel?: { position?: string; size?: string } } }).layoutOptions?.panel || {};
  const collectionDraft = {
    type: 'collection-draft',
    classicItemId,
    collectionType: layoutId,
    panelDefaults: { position: panel.position, size: panel.size },
    entries: entryTitles.map((t, i) => ({ index: i + 1, title: t }))
  };
  await saveLocal(`${runFolder}/collection-draft.json`, collectionDraft, classicItemId);

  // Save per-entry JSONs
  for (let i = 0; i < storymapJsons.length; i++) {
    const entryJson = storymapJsons[i];
    await saveLocal(`${runFolder}/entry-${i + 1}.json`, entryJson, classicItemId);
  }
  if (!storymapJsons.length) {
    console.warn('[test-mapseries] No entry JSONs returned. The classic item data may be incomplete.');
  }

  console.log('[test-mapseries] Done. Check tmp-converted/', runFolder);
}

main().catch((e: Error) => {
  console.error('[test-mapseries] Error:', e.message);
  process.exit(1);
});
