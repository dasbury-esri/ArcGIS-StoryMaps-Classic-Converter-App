#!/usr/bin/env node
// Verify all Netlify functions under netlify/functions by probing local dev endpoints
// Usage: node scripts/verify-functions.mjs [--base http://localhost:8888]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const functionsDir = path.join(repoRoot, 'netlify', 'functions');

const argv = process.argv.slice(2);
const baseArgIdx = argv.indexOf('--base');
const baseUrl = baseArgIdx > -1 && argv[baseArgIdx + 1] ? argv[baseIdx + 1] : 'http://localhost:8888';

function listFunctionNames(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const names = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      // folder-based function
      if (fs.existsSync(path.join(dir, e.name, 'index.js')) || fs.existsSync(path.join(dir, e.name, 'index.ts'))) {
        names.push(e.name);
      }
    } else if (e.isFile() && /\.(js|ts)$/.test(e.name)) {
      // single-file function, name from filename without extension
      const base = e.name.replace(/\.(js|ts)$/i, '');
      names.push(base);
    }
  }
  return Array.from(new Set(names)).sort();
}

async function probeFunction(name) {
  const url = `${baseUrl}/.netlify/functions/${name}`;
  try {
    // Default GET; for endpoints requiring POST, send minimal payloads
    let res;
    if (name === 'save-converted') {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ classicItemId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', json: { ping: true } })
      });
    } else if (name === 'image-dimensions') {
      const testImg = 'https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock.jpg';
      res = await fetch(`${url}?url=${encodeURIComponent(testImg)}`);
    } else if (name === 'proxy-image') {
      const testImg = 'https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock.jpg';
      res = await fetch(`${url}?url=${encodeURIComponent(testImg)}`);
    } else if (name === 'proxy-feature') {
      const testFeature = 'https://services.arcgis.com/jIL9msH9OI208GCb/arcgis/rest/services/2019_to_2020_Tract_Changes/FeatureServer?f=pjson';
      res = await fetch(`${url}?url=${encodeURIComponent(testFeature)}`);
    } else if (name === 'convert-cascade-legacy') {
      // Will error without itemId; just expect 400
      res = await fetch(`${url}?itemId=`);
    } else if (name === 'convert-mapjournal') {
      // Will error without itemId; just expect 400
      res = await fetch(`${url}?itemId=`);
    } else {
      res = await fetch(url);
    }
    const status = res.status;
    let bodyText = '';
    try { bodyText = await res.text(); } catch {}
    return { name, ok: status >= 200 && status < 400, status, preview: bodyText.slice(0, 200) };
  } catch (e) {
    return { name, ok: false, status: 0, error: e.message };
  }
}

(async function main() {
  if (!fs.existsSync(functionsDir)) {
    console.error(`[verify-functions] functions dir not found: ${functionsDir}`);
    process.exit(1);
  }
  const names = listFunctionNames(functionsDir);
  console.log(`[verify-functions] found ${names.length} functions: ${names.join(', ')}`);
  const results = [];
  for (const n of names) {
    const r = await probeFunction(n);
    results.push(r);
    const statusStr = r.ok ? 'OK' : 'FAIL';
    console.log(`${statusStr.padEnd(4)} ${n} -> status ${r.status}${r.error ? ` error ${r.error}` : ''}`);
    if (r.preview) console.log(`      preview: ${r.preview}`);
  }
  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    console.error(`[verify-functions] ${failed.length} failures: ${failed.map(f => f.name).join(', ')}`);
    process.exit(2);
  } else {
    console.log('[verify-functions] all functions responded successfully');
  }
})();
