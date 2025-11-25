#!/usr/bin/env ts-node
/* Inline Map Tour conversion with immediate image upload.
   Usage:
     npx ts-node scripts/test-maptour-inline.ts <classic-json> --story <storyId> --user <username> --token <token>
   If credentials omitted, falls back to URI resources but still exercises inline path.
*/
import fs from 'fs';
import path from 'path';
import { MapTourConverter } from '../src/refactor/converters/MapTourConverter.ts';
import type { ClassicStoryMapJSON } from '../src/refactor/types/classic';
import { assertStoryMapJson, formatAssertionReport } from '../src/refactor/util/assertions.ts';
import { transferImage } from '../src/api/image-transfer.ts';

interface Args { file: string; storyId?: string; username?: string; token?: string; }
function parse(argv: string[]): Args {
  const out: Args = { file: '' };
  for (let i=2;i<argv.length;i++) {
    const a = argv[i];
    if (a === '--story') out.storyId = argv[++i];
    else if (a === '--user') out.username = argv[++i];
    else if (a === '--token') out.token = argv[++i];
    else if (!out.file) out.file = a;
  }
  if (!out.file) { console.error('Missing classic JSON file path.'); process.exit(2); }
  return out;
}

async function main() {
  const args = parse(process.argv);
  const abs = path.resolve(args.file);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const classic = JSON.parse(fs.readFileSync(abs,'utf-8')) as ClassicStoryMapJSON;

  const uploader = async (url: string, storyId: string, username: string, token: string) => {
    try {
      const res = await transferImage(url, storyId, username, token);
      return { originalUrl: url, resourceName: res.resourceName, transferred: res.isTransferred };
    } catch {
      return { originalUrl: url, resourceName: '', transferred: false };
    }
  };

  const result = await MapTourConverter.convertInline({
    classicJson: classic,
    themeId: 'auto',
    progress: e => console.log('[progress]', e.message),
    storyId: args.storyId,
    username: args.username,
    token: args.token,
    uploader,
    inlineUpload: true
  });

  const json = result.storymapJson;
  fs.writeFileSync('tmp-converted/inline-' + path.basename(args.file).replace(/\.json$/i,'') + '.json', JSON.stringify(json,null,2));
  console.log('Wrote inline conversion output.');
  const assertion = assertStoryMapJson(json);
  console.log(formatAssertionReport(assertion));
  const imageResources = Object.entries(json.resources).filter(([, r]) => r.type === 'image');
  console.log('Image resources summary:');
  for (const [id, res] of imageResources) {
    const data: Record<string, unknown> = res.data as Record<string, unknown>;
    const provider = data.provider as string | undefined;
    const resourceId = data.resourceId as string | undefined;
    const src = data.src as string | undefined;
    console.log(`  ${id}: provider=${provider || ''} resourceId=${resourceId || ''} src=${src || ''}`);
  }
}

main().catch(e => { console.error('Inline conversion failed:', e); process.exit(1); });
