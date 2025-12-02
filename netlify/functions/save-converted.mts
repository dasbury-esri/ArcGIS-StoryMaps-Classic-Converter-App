import type { Context } from "@netlify/functions";
import fs from 'fs';
import path from 'path';

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    if (!event.body) {
      return { statusCode: 400, body: 'Missing body' };
    }
    const payload = JSON.parse(event.body || '{}');
    const { classicItemId, json } = payload || {};
    if (!json) {
      return { statusCode: 400, body: 'Missing json in payload' };
    }

    const workspaceRoot = process.cwd();
    const outDir = path.join(workspaceRoot, 'tmp-converted');
    try { fs.mkdirSync(outDir, { recursive: true }); } catch {}

    const iso = new Date().toISOString();
    const trimmed = iso.substring(0, 16).replace(':', '-').replace('Z', '');
    const classicId = (classicItemId || 'unknown').toLowerCase();
    const fileName = `converted-app-${classicId}-${trimmed}.json`;
    const filePath = path.join(outDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, path: filePath, fileName })
    };
  } catch (err) {
    return { statusCode: 500, body: (err && err.message) || 'Server error' };
  }
}

export default handler;
