import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SwipeConverter } from '../src/refactor/converters/SwipeConverter.ts';

async function run() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const samplesDir = path.resolve(__dirname, '../../test_data/classics/Swipe');
  const files = fs.readdirSync(samplesDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const p = path.join(samplesDir, f);
    const raw = fs.readFileSync(p, 'utf-8');
    const classic = JSON.parse(raw);
    const { storymapJson, mediaUrls } = SwipeConverter.convert({
      classicJson: classic,
      themeId: 'summit',
      progress: () => {}
    });
    const outDir = path.resolve(__dirname, '../../tmp-converted');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `converted-swipe-${path.basename(f, '.json')}.json`);
    fs.writeFileSync(outPath, JSON.stringify(storymapJson, null, 2));
    console.log(`Converted ${f} -> ${path.basename(outPath)} (media count: ${mediaUrls.length})`);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
