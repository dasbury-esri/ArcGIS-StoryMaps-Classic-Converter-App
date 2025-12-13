/**
 * Smoke test: Convert a Classic MapJournal JSON and print webmap resource shapes.
 * Usage: npx tsx converter-app/scripts/smoke-convert-webmap-shape.ts <classic-json-path>
 */
import fs from 'node:fs';
import path from 'node:path';
import { MapJournalConverter } from '../src/converters/MapJournalConverter';
import type { StoryMapJSON } from '../src/types/core';
import { getOrgBase } from '../../scripts/lib/orgBase';

const arg = process.argv[2];
let classicJson: any;
if (!arg) {
  console.error('Usage: npx tsx converter-app/scripts/smoke-convert-webmap-shape.ts <classic-json-path|classic-item-id>');
  process.exit(1);
}
if (/^[a-f0-9]{32}$/i.test(arg)) {
  const ORG_BASE = getOrgBase();
  const url = `${ORG_BASE}/sharing/rest/content/items/${arg}/data?f=json`;
  console.log('[Smoke] Fetching classic item data by id:', arg);
  const res = await fetch(url);
  if (!res.ok) {
    console.error('[Smoke] Failed to fetch item data. HTTP', res.status);
    process.exit(2);
  }
  classicJson = await res.json();
} else {
  const classicPath = path.resolve(arg);
  if (!fs.existsSync(classicPath)) {
    console.error('[Smoke] Classic JSON not found:', classicPath);
    process.exit(1);
  }
  classicJson = JSON.parse(fs.readFileSync(classicPath, 'utf-8'));
}

const progress = (e: { stage: string; message: string; current?: number; total?: number }) => {
  // Minimal progress logging
  if (e.stage === 'convert' || e.stage === 'fetch') {
    console.log('[Progress]', e.stage, e.message);
  }
};

const conv = new MapJournalConverter({ classicJson, themeId: 'summit', progress, token: undefined });
const result = conv.convert();
const story: StoryMapJSON = result.storymapJson;

const webmapResources = Object.entries(story.resources || {}).filter(([, r]) => r && r.type === 'webmap');
if (!webmapResources.length) {
  console.log('[Smoke] No webmap resources produced.');
  process.exit(0);
}

for (const [rid, res] of webmapResources) {
  const data = (res as any).data || {};
  const keys = Object.keys(data).sort();
  console.log('--- Webmap Resource', rid, '---');
  console.log('Keys:', keys.join(', '));
  // Print subset for verification
  console.log('itemId:', data.itemId);
  console.log('itemType:', data.itemType);
  console.log('type:', data.type);
  console.log('has extent:', !!data.extent);
  console.log('has center:', !!data.center);
  console.log('has viewpoint:', !!data.viewpoint);
  console.log('has zoom:', typeof data.zoom === 'number');
  const outCount = Array.isArray(data.mapLayers) ? data.mapLayers.length : 0;
  console.log('mapLayers count:', outCount);
  // Fetch original webmap and compare operationalLayers length
  if (typeof data.itemId === 'string' && /^[a-f0-9]{32}$/i.test(data.itemId)) {
    const ORG_BASE = getOrgBase();
    const wmUrl = `${ORG_BASE}/sharing/rest/content/items/${data.itemId}/data?f=json`;
    const wmRes = await fetch(wmUrl);
    if (wmRes.ok) {
      const wmJson = await wmRes.json();
      const ops = Array.isArray(wmJson.operationalLayers) ? wmJson.operationalLayers : [];
      console.log('original operationalLayers count:', ops.length);
      if (ops.length !== outCount) {
        console.error('[MISMATCH] mapLayers count differs from original operationalLayers');
        process.exitCode = 3;
      }
    } else {
      console.warn('[Warn] Could not fetch original webmap data to compare counts');
    }
  }
  if (data.initialState) {
    console.error('[ERROR] initialState present on resource, should be removed');
    process.exitCode = 2;
  }
}

console.log('[Smoke] Completed webmap resource shape check.');
