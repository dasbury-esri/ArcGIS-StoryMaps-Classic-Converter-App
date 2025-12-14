import type { Context } from "@netlify/functions";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export default async (req: Request, _context: Context) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    const payload = await req.json().catch(() => ({}));
    const { classicItemId, json, filename } = (payload as { classicItemId?: string; json?: unknown; filename?: string });
    if (!json) {
      return new Response('Missing json in payload', { status: 400 });
    }

    // Netlify functions run with cwd at the functions directory; project root is two levels up
    // Resolve paths relative to this function file to avoid variability in process.cwd()
    const fnFile = fileURLToPath(import.meta.url);
    const fnDir = path.dirname(fnFile);
    // Walk upwards to find the real converter-app folder (avoids .netlify/functions-serve nesting)
    const findDirUp = (start: string, targetName: string): string => {
      let cur = start;
      for (let i = 0; i < 6; i++) {
        const name = path.basename(cur);
        if (name === targetName) return cur;
        const next = path.resolve(cur, '..');
        if (next === cur) break;
        cur = next;
      }
      return start;
    };
    const converterAppDir = findDirUp(fnDir, 'converter-app');
    const repoRoot = path.resolve(converterAppDir, '..');
    // Write under converter-app/tests/output when an explicit filename is given.
    // Fallback default (no filename) remains converter-app/tests/output for consistency.
    const testsOutputDir = path.join(converterAppDir, 'tests', 'output');
    try { fs.mkdirSync(testsOutputDir, { recursive: true }); } catch {}
    try { fs.mkdirSync(outDir, { recursive: true }); } catch {}

    const iso = new Date().toISOString();
    const trimmed = iso.substring(0, 16).replace(':', '-').replace('Z', '');
    const classicId = (classicItemId || 'unknown').toLowerCase();
    // If a filename is provided, respect it and ensure intermediate directories exist under converter-app/tests/output
    let fileName: string;
    let filePath: string;
    if (filename && typeof filename === 'string' && filename.trim().length > 0) {
      // sanitize leading slashes
      const rel = filename.replace(/^\/+/, '');
      filePath = path.join(converterAppDir, rel);
      try {
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
      fileName = rel.split('/').pop() || rel;
    } else {
      fileName = `converted-app-${classicId}-${trimmed}.json`;
      filePath = path.join(testsOutputDir, fileName);
    }

    fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');

    // Provide a repo-relative path for client use (GraphView expects repo-relative)
    const relPath = filePath.replace(repoRoot + path.sep, '').split(path.sep).join('/');
    return new Response(JSON.stringify({ ok: true, path: filePath, relPath, fileName }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: unknown) {
    const msg = (err instanceof Error) ? err.message : String(err);
    return new Response(msg || 'Server error', { status: 500 });
  }
};
