/**
 * Test: Swipe TWO_WEBMAPS alignment and resource enrichment
 *
 * Mimics UI conversion flow: loads classic JSON, runs SwipeConverter,
 * and validates that:
 * - Each webmap resource has extent, center, zoom, viewpoint, itemId, itemType, type.
 * - The first webmap node's extent/viewpoint are set using the second webmap's extent/center.
 * - Swipe node uses viewPlacement 'extent'.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { ConverterFactory } from '../src/ConverterFactory';
import type { ConverterResult } from '../src/types/core';

type StoryMapJSON = {
  root: string;
  nodes: Record<string, { type: string; data?: any; children?: string[]; config?: any }>;
  resources: Record<string, { type: string; data: any }>;
};

function readClassicJson(p: string): any {
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

function assert(condition: any, msg: string) {
  if (!condition) throw new Error(msg);
}

function findNodeIdsByType(json: StoryMapJSON, type: string): string[] {
  return Object.entries(json.nodes)
    .filter(([, n]) => n.type === type)
    .map(([id]) => id);
}

async function runTest(classicPath: string, token?: string) {
  const classic = readClassicJson(classicPath);
  const result: ConverterResult = await ConverterFactory.create({
    classicJson: classic,
    themeId: 'summit',
    progress: (e) => console.error(e.message),
    enrichMaps: true,
    enrichScenes: false,
  });
  const out = (result as any).storymapJson as StoryMapJSON;

  // Locate webmap nodes referenced by swipe
  const swipeIds = findNodeIdsByType(out, 'swipe');
  assert(swipeIds.length === 1, `Expected 1 swipe node, found ${swipeIds.length}`);
  const swipeId = swipeIds[0];
  const swipeData = out.nodes[swipeId].data || {};
  assert(swipeData.viewPlacement === 'extent', 'Swipe node viewPlacement should be "extent"');
  const contents = swipeData.contents || {};
  const leftNodeId = contents['0'];
  const rightNodeId = contents['1'];
  assert(leftNodeId && rightNodeId, 'Swipe contents must reference left and right webmap nodes');

  const leftNode = out.nodes[leftNodeId];
  const rightNode = out.nodes[rightNodeId];
  assert(leftNode?.type === 'webmap' && rightNode?.type === 'webmap', 'Swipe contents must be webmap nodes');

  const leftData = leftNode.data || {};
  const rightData = rightNode.data || {};
  // Ensure left node extent/viewpoint exist
  assert(!!leftData.extent, 'Left webmap node missing extent');
  assert(!!leftData.viewpoint, 'Left webmap node missing viewpoint');

  // Resources referenced by nodes
  const leftResId = leftData.map as string;
  const rightResId = rightData.map as string;
  assert(leftResId && rightResId, 'Webmap nodes must reference resource ids');
  const leftRes = out.resources[leftResId];
  const rightRes = out.resources[rightResId];
  assert(leftRes?.type === 'webmap' && rightRes?.type === 'webmap', 'Resources must be type webmap');
  const leftKeys = Object.keys(leftRes.data || {});
  const rightKeys = Object.keys(rightRes.data || {});
  console.log('Left resource id:', leftResId);
  console.log('Right resource id:', rightResId);
  console.log('Left resource keys:', leftKeys);
  console.log('Right resource keys:', rightKeys);
  console.log('Left center:', JSON.stringify((leftRes.data || {}).center ?? null));
  console.log('Right center:', JSON.stringify((rightRes.data || {}).center ?? null));

  // Validate resource enrichment structure
  const checkRes = (res: { data: any }, label: string) => {
    const d = res.data || {};
    for (const key of ['extent', 'center', 'viewpoint', 'itemId', 'itemType', 'type']) {
      assert(d[key] !== undefined, `${label} missing ${key}`);
    }
    assert(Array.isArray(d.mapLayers), `${label} mapLayers should be an array`);
    assert(typeof d.zoom === 'number' || d.zoom === undefined, `${label} zoom should be a number or undefined`);
  };
  checkRes(leftRes, 'Left resource');
  checkRes(rightRes, 'Right resource');

  // Alignment rule: left node extent/viewpoint should be derived from right resource extent/center
  const rightExtent = rightRes.data.extent;
  const rightCenter = rightRes.data.center;
  assert(rightExtent, 'Right resource missing extent');
  assert(rightCenter, 'Right resource missing center');

  const leftExtent = leftData.extent;
  const leftVp = leftData.viewpoint;
  const vpGeom = leftVp?.targetGeometry;
  const vpIsPoint = vpGeom && typeof vpGeom.x === 'number' && typeof vpGeom.y === 'number';
  const vpIsExtent = vpGeom && typeof vpGeom.xmin === 'number' && typeof vpGeom.ymin === 'number';
  if (vpIsPoint) {
    console.log('Left viewpoint is point:', JSON.stringify(vpGeom));
  } else if (vpIsExtent) {
    const mid = { x: (vpGeom.xmin + vpGeom.xmax) / 2, y: (vpGeom.ymin + vpGeom.ymax) / 2 };
    console.log('Left viewpoint is extent, midpoint:', JSON.stringify(mid));
  } else {
    console.log('Left viewpoint targetGeometry is unknown shape:', JSON.stringify(vpGeom));
  }
  // Compare by coordinates (xmin/ymin/xmax/ymax and center x/y)
  for (const k of ['xmin', 'ymin', 'xmax', 'ymax']) {
    assert(Math.abs((leftExtent?.[k] ?? 0) - (rightExtent?.[k] ?? 0)) < 1e-6, `Left extent ${k} should match right extent ${k}`);
  }
  if (vpIsPoint) {
    assert(Math.abs((vpGeom?.x ?? 0) - (rightCenter?.x ?? 0)) < 1e-6, 'Left viewpoint x should match right center x');
    assert(Math.abs((vpGeom?.y ?? 0) - (rightCenter?.y ?? 0)) < 1e-6, 'Left viewpoint y should match right center y');
  } else if (vpIsExtent) {
    const midX = (vpGeom.xmin + vpGeom.xmax) / 2;
    const midY = (vpGeom.ymin + vpGeom.ymax) / 2;
    assert(Math.abs(midX - (rightCenter?.x ?? 0)) < 1e-6, 'Left viewpoint midpoint x should match right center x');
    assert(Math.abs(midY - (rightCenter?.y ?? 0)) < 1e-6, 'Left viewpoint midpoint y should match right center y');
  } else {
    assert(false, 'Left viewpoint targetGeometry is neither point nor extent');
  }

  console.log('OK: TWO_WEBMAPS alignment and resources validated');
}

async function main() {
  const classicPath = process.argv[2];
  const token = process.argv[3];
  if (!classicPath) {
    console.error('Usage: tsx scripts/test-swipe-two-webmaps.ts <classic_json_path> [token]');
    process.exit(1);
  }
  const fullPath = path.isAbsolute(classicPath)
    ? classicPath
    : path.join(process.cwd(), classicPath);
  try {
    await runTest(fullPath, token);
  } catch (e: any) {
    console.error('FAIL:', e?.message || e);
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const base = path.basename(fullPath).replace(/\.json$/i, '');
      const outPath = path.join(process.cwd(), 'tmp-converted', `converted-app-${base}-test-${ts}.json`);
      const classic = readClassicJson(fullPath);
      const result: ConverterResult = await ConverterFactory.create({
        classicJson: classic,
        themeId: 'summit',
        progress: (ev) => console.error(ev.message),
        enrichMaps: true,
        enrichScenes: false,
      });
      const smj = (result as any).storymapJson as StoryMapJSON;
      fs.writeFileSync(outPath, JSON.stringify(smj, null, 2), 'utf-8');
      console.error('Wrote failed output to:', outPath);
    } catch { /* ignore secondary failure */ }
    process.exit(2);
  }
}

main();
