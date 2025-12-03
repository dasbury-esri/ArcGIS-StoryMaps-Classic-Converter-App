import type { Context } from "@netlify/functions";
import fs from 'fs';
import path from 'path';

export default async (req: Request, _context: Context) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    const payload = await req.json().catch(() => ({}));
    const { classicItemId, json } = (payload as { classicItemId?: string; json?: unknown });
    if (!json) {
      return new Response('Missing json in payload', { status: 400 });
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

    return new Response(JSON.stringify({ ok: true, path: filePath, fileName }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(err?.message || 'Server error', { status: 500 });
  }
};
