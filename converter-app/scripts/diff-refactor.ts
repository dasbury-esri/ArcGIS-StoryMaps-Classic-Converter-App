import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { convertClassicToJsonRefactored } from '../src/refactor/index.ts';
import type { ClassicStoryMapJSON } from '../src/refactor/types/classic';

interface DiffResult {
  addedPaths: string[];
  removedPaths: string[];
  changed: Array<{ path: string; legacy: unknown; refactor: unknown }>;
}

function loadJson(p: string) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectPaths(obj: any, prefix = '', map: Record<string, any> = {}) {
  if (obj === null || typeof obj !== 'object') {
    map[prefix || ''] = obj;
    return map;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectPaths(v, prefix ? `${prefix}[${i}]` : `[${i}]`, map));
    return map;
  }
  for (const key of Object.keys(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    collectPaths(obj[key], next, map);
  }
  return map;
}

function diffObjects(legacy: any, refactor: any): DiffResult {
  const legacyMap = collectPaths(legacy);
  const refactorMap = collectPaths(refactor);
  const addedPaths: string[] = [];
  const removedPaths: string[] = [];
  const changed: Array<{ path: string; legacy: unknown; refactor: unknown }> = [];

  const allPaths = new Set([...Object.keys(legacyMap), ...Object.keys(refactorMap)]);
  for (const p of allPaths) {
    const inLegacy = p in legacyMap;
    const inRefactor = p in refactorMap;
    if (inLegacy && !inRefactor) removedPaths.push(p);
    else if (!inLegacy && inRefactor) addedPaths.push(p);
    else if (legacyMap[p] !== refactorMap[p]) changed.push({ path: p, legacy: legacyMap[p], refactor: refactorMap[p] });
  }
  return { addedPaths, removedPaths, changed };
}

async function main() {
  const root = path.resolve(process.cwd(), '..'); // from converter-app
  const classicPath = path.resolve(root, 'test_data/output/classic_json.json');
  const legacyConvertedPath = path.resolve(root, 'test_data/output/converted_storymap_json.json');
  if (!fs.existsSync(classicPath) || !fs.existsSync(legacyConvertedPath)) {
    console.error('Required source files missing. Ensure legacy outputs exist in test_data/output/.');
    process.exit(1);
  }

  const classicJson: ClassicStoryMapJSON = loadJson(classicPath);
  const legacyJson = loadJson(legacyConvertedPath);

  // Run refactor conversion with stub uploader
  const uploader = async (url: string) => {
    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
    return { originalUrl: url, resourceName: `img_${hash}.json`, transferred: true };
  };

  const progress = (e: { stage: string; message: string; current?: number; total?: number }) => {
    // Minimal console output for debug
    if (e.stage === 'error') console.error('[progress]', e);
  };

  const refactorResult = await convertClassicToJsonRefactored({
    classicJson,
    storyId: 'DUMMY_STORY_ID',
    classicItemId: 'DUMMY_CLASSIC_ID',
    username: 'tester',
    token: 'FAKE_TOKEN',
    themeId: 'summit',
    progress,
    uploader: (u, s, user, t) => uploader(u)
  });

  const refactorOutPath = path.resolve(root, 'test_data/output/converted_storymap_json_refactor.json');
  fs.writeFileSync(refactorOutPath, JSON.stringify(refactorResult.storymapJson, null, 2));

  const diff = diffObjects(legacyJson, refactorResult.storymapJson);
  const diffPath = path.resolve(root, 'test_data/output/diff_legacy_refactor.json');
  fs.writeFileSync(diffPath, JSON.stringify(diff, null, 2));

  console.log('Legacy vs Refactor diff summary:');
  console.log('Added paths:', diff.addedPaths.length);
  console.log('Removed paths:', diff.removedPaths.length);
  console.log('Changed paths:', diff.changed.length);
  console.log('Output written to:', diffPath);
}

main().catch(err => {
  console.error('Diff script error:', err);
  process.exit(1);
});
