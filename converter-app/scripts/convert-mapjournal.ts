import { execSync } from 'node:child_process';
import { MapJournalConverter } from '../src/refactor/converters/MapJournalConverter.ts';

function fetchClassic(itemId: string, token?: string): any {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  const out = execSync(`curl -sL '${url}'`, { encoding: 'utf-8' });
  return JSON.parse(out);
}

function run() {
  const itemId = process.argv[2];
  const token = process.env.ARCGIS_TOKEN || process.argv[3];
  if (!itemId) {
    console.error(JSON.stringify({ error: 'Missing itemId argument' }));
    process.exit(1);
  }
  try {
    const classic = fetchClassic(itemId, token);
    const { storymapJson, mediaUrls } = MapJournalConverter.convert({
      classicJson: classic,
      themeId: 'summit',
      progress: () => {},
      token
    });
    // Print wrapper object to stdout (storymapJson + mediaUrls) for API callers
    process.stdout.write(JSON.stringify({ storymapJson, mediaUrls }));
  } catch (err) {
    const msg = (err && typeof err === 'object' && 'message' in err) ? (err as Error).message : String(err);
    console.error(JSON.stringify({ error: 'Conversion failed', message: msg }));
    process.exit(1);
  }
}

run();
