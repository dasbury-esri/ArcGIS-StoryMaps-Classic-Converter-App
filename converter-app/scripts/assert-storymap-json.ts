#!/usr/bin/env ts-node
/*
 CLI Assertion Tool
 Usage:
   npx ts-node scripts/assert-storymap-json.ts <path-to-json> [--fail-on-warning] [--quiet]
   cat story.json | npx ts-node scripts/assert-storymap-json.ts -

 Exits non-zero if errors (or warnings when --fail-on-warning) are found.
*/
import fs from 'fs';
import path from 'path';
import { assertStoryMapJson, formatAssertionReport } from '../src/refactor/util/assertions.ts';

interface Args { file: string; failOnWarning: boolean; quiet: boolean }

function parseArgs(argv: string[]): Args {
  const out: Args = { file: '', failOnWarning: false, quiet: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fail-on-warning') out.failOnWarning = true;
    else if (a === '--quiet') out.quiet = true;
    else if (!out.file) out.file = a;
  }
  if (!out.file) {
    console.error('Missing JSON file path (or - for stdin).');
    process.exit(2);
  }
  return out;
}

function readJson(file: string): unknown {
  if (file === '-') {
    const data = fs.readFileSync(0, 'utf-8'); // stdin
    return JSON.parse(data);
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  const args = parseArgs(process.argv);
  let json: unknown;
  try {
    json = readJson(args.file);
  } catch (e) {
    console.error('[assert] Failed to read/parse JSON:', (e as Error).message);
    process.exit(2);
  }
  const result = assertStoryMapJson(json);
  const report = formatAssertionReport(result);
  if (!args.quiet) {
    console.log(report);
    if (result.errors.length) {
      console.log('\nErrors detail:');
      for (const e of result.errors) console.log('  - ' + e);
    }
    if (result.warnings.length) {
      console.log('\nWarnings detail:');
      for (const w of result.warnings) console.log('  - ' + w);
    }
  }
  if (result.errors.length || (args.failOnWarning && result.warnings.length)) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => {
  console.error('[assert] Uncaught error:', e);
  process.exit(3);
});
