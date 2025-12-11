import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SwipeConverter } from '../src/converters/SwipeConverter.ts';

async function fetchClassicById(itemId: string): Promise<any> {
  const url = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch classic item ${itemId}: HTTP ${res.status}`);
  return res.json();
}

async function run() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const arg = process.argv[2];
  const outDir = path.resolve(__dirname, '../../tmp-converted');
  fs.mkdirSync(outDir, { recursive: true });

  if (arg) {
    // If arg is a 32-char item id, fetch; else treat as file path
    let classic: any;
    let label = arg;
    if (/^[a-f0-9]{32}$/i.test(arg)) {
      const json = await fetchClassicById(arg);
      classic = json;
      label = arg;
    } else {
      const classicPath = path.resolve(arg);
      const raw = fs.readFileSync(classicPath, 'utf-8');
      classic = JSON.parse(raw);
      label = path.basename(classicPath, '.json');
    }
    const { storymapJson, media } = await SwipeConverter.convert({
      classicJson: classic,
      themeId: 'summit',
      progress: () => {},
      classicItemId: /^[a-f0-9]{32}$/i.test(arg) ? arg : undefined
    } as any);
    const outPath = path.join(outDir, `converted-app-${label}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    fs.writeFileSync(outPath, JSON.stringify(storymapJson, null, 2));
    console.log(`[Converted] ${label} -> ${outPath}`);
    return;
  }

  // No arg: convert all samples from test_data/classics/Swipe
  const samplesDir = path.resolve(__dirname, '../../test_data/classics/Swipe');
  const files = fs.readdirSync(samplesDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const p = path.join(samplesDir, f);
    const raw = fs.readFileSync(p, 'utf-8');
    const classic = JSON.parse(raw);
    const { storymapJson, media } = await SwipeConverter.convert({
      classicJson: classic,
      themeId: 'summit',
      progress: () => {}
    } as any);
    const outPath = path.join(outDir, `converted-swipe-${path.basename(f, '.json')}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    fs.writeFileSync(outPath, JSON.stringify(storymapJson, null, 2));
    console.log(`Converted ${f} -> ${path.basename(outPath)} (media count: ${(media || []).length})`);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
