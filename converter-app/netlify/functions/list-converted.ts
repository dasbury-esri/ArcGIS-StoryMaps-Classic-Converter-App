import type { Handler } from '@netlify/functions';
import fs from 'node:fs';
import path from 'node:path';

function getRepoRootFromFunc(): string {
  // converter-app/netlify/functions → repo root is ../../../..
  return path.resolve(__dirname, '../../../..');
}

function listFiles(dir: string): Array<{ name: string; path: string; mtimeMs: number; size: number }> {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir);
  const out: Array<{ name: string; path: string; mtimeMs: number; size: number }> = [];
  for (const name of entries) {
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (st.isFile()) {
        out.push({ name, path: p, mtimeMs: st.mtimeMs, size: st.size });
      }
    } catch {
      // ignore
    }
  }
  return out;
}

export const handler: Handler = async (event) => {
  try {
    const repoRoot = getRepoRootFromFunc();
    const tmpDir = path.join(repoRoot, 'tmp-converted');
    const itemId = event.queryStringParameters?.itemId || '';

    const files = listFiles(tmpDir)
      .filter(f => /^converted-app-/.test(f.name) && f.name.endsWith('.json'))
      .filter(f => itemId ? f.name.includes(itemId) : true)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    const latest = files[0] || null;
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, latest, files })
    };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err?.message || String(err) }) };
  }
};
