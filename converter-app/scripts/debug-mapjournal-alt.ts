/*
  Debug script: Convert a single Map Journal classic JSON with refactor pipeline
  and list image + webmap nodes that have alt/caption for verification.

  Usage:
    npx ts-node scripts/debug-mapjournal-alt.ts <path-to-classic-json>
*/
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { detectClassicTemplate } from '../src/util/detectTemplate.ts';
import { MapJournalConverter } from '../src/converters/MapJournalConverter.ts';

function run() {
  const argPath = process.argv[2];
  if (!argPath) {
    console.error('Provide path to classic Map Journal JSON.');
    process.exit(1);
  }
  const filePath = resolve(argPath);
  const raw = readFileSync(filePath, 'utf-8');
  const classic = JSON.parse(raw);
  const template = detectClassicTemplate(classic);
  if (!(template === 'MapJournal' || template === 'Map Journal')) {
    console.error(`Template detected as ${template}; this script expects Map Journal.`);
    process.exit(1);
  }

  const result = MapJournalConverter.convert({ classicJson: classic, themeId: 'summit', progress: () => {} });

  const imageNodes = result.storymapJson.nodes ? Object.values(result.storymapJson.nodes).filter((n: any)=>n.type==='image') : [];
  const webmapNodes = result.storymapJson.nodes ? Object.values(result.storymapJson.nodes).filter((n: any)=>n.type==='webmap') : [];

  const withAltImages = imageNodes.filter(n => (n as any).data.alt && (n as any).data.alt.trim());
  const withAltWebmaps = webmapNodes.filter(n => (n as any).data.alt && (n as any).data.alt.trim());

  console.log('File:', filePath);
  console.log('Total image nodes:', imageNodes.length);
  console.log('Image nodes with alt:', withAltImages.length);
  withAltImages.forEach((n: any) => {
    console.log('  Image alt:', n.data.alt.slice(0, 120));
  });
  console.log('Total webmap nodes:', webmapNodes.length);
  console.log('Webmap nodes with alt:', withAltWebmaps.length);
  withAltWebmaps.forEach((n: any) => {
    console.log('  Webmap alt:', n.data.alt.slice(0, 120));
  });
}

run();
