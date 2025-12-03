import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MapJournalConverter } from '../src/converters/MapJournalConverter.ts';

function fetchClassic(itemId: string, token?: string): any {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  const out = execSync(`curl -sL '${url}'`, { encoding: 'utf-8' });
  return JSON.parse(out);
}

function run() {
  const itemId = process.argv[2] || 'ccd648e8845847d2947cbc7e0c4ec616';
  const token = process.env.ARCGIS_TOKEN || process.argv[3];
  const classic = fetchClassic(itemId, token);
  const { storymapJson, mediaUrls } = MapJournalConverter.convert({
    classicJson: classic,
    themeId: 'summit',
    progress: () => {},
    token
  });
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const outDir = path.resolve(__dirname, '../../tmp-converted');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `converted-mapjournal-${itemId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(storymapJson, null, 2));
  const swipeCount = Object.values(storymapJson.nodes).filter((n: any) => n?.type === 'swipe').length;
  console.log(`Converted MapJournal ${itemId} -> ${path.basename(outPath)} (media: ${mediaUrls.length}, swipe nodes: ${swipeCount})`);
}

run();
