#!/usr/bin/env node
/**
 * Normalizes a StoryMap JSON test file to align with expected schema:
 * - Ensure all webmap nodes have config.size = 'standard'
 * - Remove data.scale on webmap nodes (retain viewpoint.scale)
 * - Add data.textAlignment = 'start' for text nodes missing it
 * - Remove story.data.metaSettings
 */
import fs from 'fs';
import path from 'path';

const target = path.resolve('test_data/storymaps/tests/broken.json');
if (!fs.existsSync(target)) {
  console.error('File not found:', target);
  process.exit(1);
}

const raw = fs.readFileSync(target, 'utf8');
let json;
try {
  json = JSON.parse(raw);
} catch (e) {
  console.error('Failed to parse JSON:', e.message);
  process.exit(1);
}

if (!json.nodes || typeof json.nodes !== 'object') {
  console.error('Invalid structure: missing nodes');
  process.exit(1);
}

let webmapUpdated = 0;
let webmapScaleRemoved = 0;
let textAligned = 0;
let metaSettingsRemoved = 0;

for (const [id, node] of Object.entries(json.nodes)) {
  if (!node || typeof node !== 'object') continue;
  const type = node.type;
  if (type === 'webmap') {
    // Ensure config.size
    if (!node.config || typeof node.config !== 'object') {
      node.config = { size: 'standard' };
      webmapUpdated++;
    } else if (!node.config.size) {
      node.config.size = 'standard';
      webmapUpdated++;
    }
    if (node.data && typeof node.data === 'object') {
      if (Object.prototype.hasOwnProperty.call(node.data, 'scale')) {
        // Only remove if viewpoint.scale exists or we decide to rely solely on viewpoint
        if (node.data.viewpoint && node.data.viewpoint.scale) {
          delete node.data.scale;
          webmapScaleRemoved++;
        } else {
          // If viewpoint.scale missing but data.scale present, move scale then delete
          if (!node.data.viewpoint) node.data.viewpoint = {};
          if (!node.data.viewpoint.scale) node.data.viewpoint.scale = node.data.scale;
          delete node.data.scale;
          webmapScaleRemoved++;
        }
      }
    }
  } else if (type === 'text') {
    if (node.data && typeof node.data === 'object' && !node.data.textAlignment) {
      node.data.textAlignment = 'start';
      textAligned++;
    }
  } else if (type === 'story') {
    if (node.data && typeof node.data === 'object' && node.data.metaSettings) {
      delete node.data.metaSettings;
      metaSettingsRemoved++;
    }
  }
}

fs.writeFileSync(target, JSON.stringify(json, null, 4));
console.log('Normalization complete');
console.log({ webmapUpdated, webmapScaleRemoved, textAligned, metaSettingsRemoved });