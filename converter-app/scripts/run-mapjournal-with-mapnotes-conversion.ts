// Orchestrates Map Notes → CSV layer save, then runs MapJournal converter
// Usage:
//   ARCGIS_TOKEN=... CLASSIC_APP_ID=0a806e5eb48b4deeb5c2449d2cfc7cff WEBMAP_ID=4fd144cef2054576a62105d04ea1df62 
//   npx tsx converter-app/scripts/run-mapjournal-with-mapnotes-conversion.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function getEnv(name: string, required = true): string | undefined {
  const v = process.env[name];
  if (required && (!v || v.trim() === '')) {
    console.error(`[Error] Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

async function runMapNotesToCsv(webmapId: string, token: string) {
  const scriptPath = path.resolve('converter-app/scripts/mapnotes-to-csv-item-and-add-to-webmap.ts');
  console.log(`[Step] Converting Map Notes to CSV and saving to webmap ${webmapId}...`);
  const env = { ...process.env, WEBMAP_ID: webmapId, ARCGIS_TOKEN: token };
  const { stdout, stderr } = await execFileAsync('npx', ['tsx', scriptPath], { env });
  if (stderr && stderr.trim()) console.error(stderr);
  console.log(stdout);
}

async function runMapJournalConverter(classicAppId: string) {
  // Placeholder: invoke existing converter pipeline for MapJournal.
  // If there is a CLI entry, call it here. Otherwise this is where
  // integration into converter runtime will be added.
  console.log(`[Step] MapJournal converter would run for classic app ${classicAppId} (integration point).`);
}

async function main() {
  const token = getEnv('ARCGIS_TOKEN') as string;
  const webmapId = getEnv('WEBMAP_ID') as string;
  const classicAppId = getEnv('CLASSIC_APP_ID', false) || '0a806e5eb48b4deeb5c2449d2cfc7cff';

  await runMapNotesToCsv(webmapId, token);
  await runMapJournalConverter(classicAppId);

  console.log('[Done] Orchestration complete. Validate in Map Viewer and Story converter.');
}

main().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});
