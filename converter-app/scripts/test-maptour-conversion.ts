#!/usr/bin/env ts-node
/*
 Map Tour Conversion Test Script
 Usage:
   npx ts-node scripts/test-maptour-conversion.ts <classic-json> [more-json ...] [--out ./output] [--assert]

 Converts one or more classic Map Tour JSON files into StoryMap JSON using MapTourConverter.
 If --assert is provided, runs refactor assertions on the output and prints a summary.
 Output files are written as converted-<basename>.json into the specified --out directory (default: ./tmp-converted).
*/
import fs from 'fs';
import path from 'path';
import { MapTourConverter } from '../src/converter/maptour-converter.ts';
import { assertStoryMapJson, formatAssertionReport } from '../src/refactor/util/assertions.ts';
import type { ClassicStoryMapJSON } from '../src/types/storymap';

interface Args { files: string[]; outDir: string; doAssert: boolean; }

function parseArgs(argv: string[]): Args {
  const files: string[] = [];
  let outDir = './tmp-converted';
  let doAssert = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      outDir = argv[++i] || outDir;
    } else if (a === '--assert') {
      doAssert = true;
    } else if (a.startsWith('-')) {
      console.error('Unknown flag:', a);
      process.exit(2);
    } else {
      files.push(a);
    }
  }
  if (!files.length) {
    console.error('Provide at least one classic Map Tour JSON file.');
    process.exit(2);
  }
  return { files, outDir, doAssert };
}

async function convertOne(file: string, outDir: string, doAssert: boolean) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const raw = fs.readFileSync(abs, 'utf-8');
  let classic: ClassicStoryMapJSON;
  try {
    classic = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse JSON ${abs}: ${(e as Error).message}`);
  }
  const converter = new MapTourConverter(classic, 'summit', '', '', ''); // blank credentials triggers URL resource fallback
  const storymap = await converter.convert();
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outName = 'converted-' + path.basename(file).replace(/\.json$/i, '') + '.json';
  const outPath = path.join(outDir, outName);
  fs.writeFileSync(outPath, JSON.stringify(storymap, null, 2));
  console.log(`[convert] Wrote ${outPath}`);
  if (doAssert) {
    const result = assertStoryMapJson(storymap);
    console.log(formatAssertionReport(result));
  }
}

async function main() {
  const args = parseArgs(process.argv);
  for (const f of args.files) {
    try {
      await convertOne(f, args.outDir, args.doAssert);
    } catch (e) {
      console.error('[convert] Error:', (e as Error).message);
    }
  }
}

main().catch(e => {
  console.error('[convert] Uncaught error:', e);
  process.exit(1);
});
