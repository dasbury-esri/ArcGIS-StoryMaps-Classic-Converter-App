import { Handler } from '@netlify/functions';
import fs from 'fs';
import path from 'path';

// List the latest trace.json under test/output/tmp_results/**
export const handler: Handler = async () => {
  try {
    const findDirUp = (start: string, targetName: string): string => {
      let cur = start;
      for (let i = 0; i < 8; i++) {
        const name = path.basename(cur);
        if (name === targetName) return cur;
        const next = path.resolve(cur, '..');
        if (next === cur) break;
        cur = next;
      }
      return path.resolve(start, '..', '..');
    };
    const root = findDirUp(process.cwd(), 'ArcGIS-StoryMaps-Classic-Converter-App');
    const converterAppDir = path.join(root, 'converter-app');
    const outDir = path.join(converterAppDir, 'tests', 'output');
    if (!fs.existsSync(outDir)) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'tests/output directory not found' }),
        headers: { 'content-type': 'application/json' }
      };
    }
    const files = fs.readdirSync(outDir).map(name => ({
      name,
      abs: path.join(outDir, name)
    })).filter(f => /^trace-.*\.json$/i.test(f.name));
    if (!files.length) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No trace-*.json found' }),
        headers: { 'content-type': 'application/json' }
      };
    }
    const withStats = files.map(f => {
      const st = fs.statSync(f.abs);
      return { ...f, mtime: st.mtimeMs || st.ctimeMs || 0 };
    }).sort((a, b) => b.mtime - a.mtime);
    const latest = withStats[0];
    const rel = latest.abs.replace(root + path.sep, '').split(path.sep).join('/');
    return {
      statusCode: 200,
      body: JSON.stringify({ path: '/' + rel }),
      headers: { 'content-type': 'application/json' }
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String((e as Error)?.message || e) }),
      headers: { 'content-type': 'application/json' }
    };
  }
};
