#!/usr/bin/env tsx
/*
 Run end-to-end Map Tour conversion for an AGO item id using the refactored pipeline.
 Usage:
  ARCGIS_USERNAME=... ARCGIS_TOKEN=... npx --yes tsx converter-app/scripts/test-maptour-conversion.ts <itemId>
*/
import fs from 'node:fs';
import path from 'node:path';
import { getItemData, getItemDetails, createDraftStory } from '../src/api/arcgis-client';
import { convertClassicToJsonRefactored } from '../src/adapter';
import { transferImage } from '../src/api/image-transfer';

function resolveClassicResourceUrl(original: string, classicItemId: string): string {
  const isAbsolute = /^https?:\/\//i.test(original) || original.startsWith('//');
  if (isAbsolute) return original;
  const trimmed = original.replace(/^\.\/?/, '');
  const needsResourcesPrefix = !/^resources\//i.test(trimmed);
  const pathPart = needsResourcesPrefix ? `resources/${trimmed}` : trimmed;
  return `https://www.arcgis.com/sharing/rest/content/items/${classicItemId}/${pathPart}`;
}

async function main() {
  const itemId = process.argv[2];
  if (!itemId) {
    console.error('Usage: tsx converter-app/scripts/test-maptour-conversion.ts <itemId>');
    process.exit(2);
  }
  const username = process.env.ARCGIS_USERNAME || process.env.SM_USERNAME || '';
  const token = process.env.ARCGIS_TOKEN || process.env.SM_TOKEN || '';
  if (!username || !token) {
    console.error('Missing ARCGIS_USERNAME and/or ARCGIS_TOKEN in environment.');
    process.exit(2);
  }
  console.log('[run] Fetching classic item details...');
  const details: any = await getItemDetails(itemId, token);
  const title = String(details?.title || 'Untitled Story');
  console.log('[run] Creating draft story...');
  const storyId = await createDraftStory(username, token, `(Converted) ${title}`);
  console.log('[run] Draft story created:', storyId);
  console.log('[run] Fetching classic item data...');
  const classicJson = await getItemData(itemId, token) as any;

  const progress = (e: { stage: string; message: string; current?: number; total?: number }) => {
    const msg = e.total && e.current ? `${e.message} (${e.current}/${e.total})` : e.message;
    console.log(`[${e.stage}]`, msg);
  };

  const uploader = async (url: string, sid: string, user: string, tok: string) => {
    const original = url;
    const resolved = resolveClassicResourceUrl(original, itemId);
    const r = await transferImage(resolved, sid, user, tok);
    return { originalUrl: original, resourceName: r.resourceName, transferred: r.isTransferred };
  };

  console.log('[run] Starting conversion...');
  const { storymapJson, mediaMapping } = await convertClassicToJsonRefactored({
    classicJson,
    classicItemId: itemId,
    storyId,
    username,
    token,
    themeId: 'summit',
    progress,
    uploader
  });

  const outDir = path.join(process.cwd(), 'tmp-converted');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `converted-app-${itemId}-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(storymapJson, null, 2));
  console.log('[done] Saved:', outPath);
  console.log('[mapping]', JSON.stringify(mediaMapping, null, 2));
}

main().catch(err => {
  console.error('[error]', err?.message || err);
  process.exit(1);
});
