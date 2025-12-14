import type { Handler } from "@netlify/functions";
import fs from "node:fs";
import path from "node:path";

type FileInfo = { name: string; path: string; mtimeMs: number; size: number };

function listFiles(dir: string, pattern: RegExp): FileInfo[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir);
  const out: FileInfo[] = [];
  for (const name of entries) {
    if (!pattern.test(name)) continue;
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

export const handler: Handler = async () => {
  try {
    const findDirUp = (start: string, targetName: string): string => {
      let cur = start;
      for (let i = 0; i < 8; i++) {
        const name = path.basename(cur);
        if (name === targetName) return cur;
        const next = path.resolve(cur, "..");
        if (next === cur) break;
        cur = next;
      }
      return path.resolve(start, "..", "..");
    };
    const repoRoot = findDirUp(process.cwd(), "ArcGIS-StoryMaps-Classic-Converter-App");
    const converterAppDir = path.join(repoRoot, "converter-app");
    const outDir = path.join(converterAppDir, "tests", "output");
    if (!fs.existsSync(outDir)) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, traces: [], converted: [] }),
        headers: { "content-type": "application/json" },
      };
    }
    const traces = listFiles(outDir, /^trace-.*\.json$/i).sort((a, b) => b.mtimeMs - a.mtimeMs);
    const converted = listFiles(outDir, /^converted-.*\.json$/i).sort((a, b) => b.mtimeMs - a.mtimeMs);
    // Return repo-relative paths for display
    const toRel = (fi: FileInfo) => ({
      name: fi.name,
      path: fi.path.replace(repoRoot + path.sep, '').split(path.sep).join('/'),
      mtimeMs: fi.mtimeMs,
      size: fi.size,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, traces: traces.map(toRel), converted: converted.map(toRel) }),
      headers: { "content-type": "application/json" },
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      headers: { "content-type": "application/json" },
    };
  }
};
