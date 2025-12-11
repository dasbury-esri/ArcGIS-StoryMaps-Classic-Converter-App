import type { Handler } from '@netlify/functions';
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

function resolveSchemaPath(): string {
  // Prefer path relative to this function's directory
  const tryPaths = [
    path.resolve(__dirname, '../../..', 'schemas', 'draft-story.json'),
    // When running from .netlify/functions-serve compiled output
    path.resolve(process.cwd(), 'schemas', 'draft-story.json'),
    // Fallback: workspace root env variable if provided
    process.env.WORKSPACE_ROOT ? path.resolve(process.env.WORKSPACE_ROOT, 'schemas', 'draft-story.json') : ''
  ].filter(Boolean);
  for (const p of tryPaths) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  // As a last resort, attempt walking up directories from __dirname
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.resolve(dir, 'schemas', 'draft-story.json');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.resolve(dir, '..');
  }
  throw new Error('Could not locate schemas/draft-story.json');
}

function getSchema(): any {
  const schemaPath = resolveSchemaPath();
  const schemaRaw = fs.readFileSync(schemaPath, 'utf-8');
  return JSON.parse(schemaRaw);
}

function resolveInputPath(relOrAbs: string): string {
  const candidateAbs = path.isAbsolute(relOrAbs) ? relOrAbs : '';
  if (candidateAbs && fs.existsSync(candidateAbs)) return candidateAbs;

  // Repo root from this function directory: converter-app/netlify/functions → repo root is ../../../..
  const repoRoot = path.resolve(__dirname, '../../../..');
  const fromRepo = path.resolve(repoRoot, relOrAbs);
  if (fs.existsSync(fromRepo)) return fromRepo;

  // Also try workspace root via walking up from cwd
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.resolve(dir, relOrAbs);
    if (fs.existsSync(candidate)) return candidate;
    dir = path.resolve(dir, '..');
  }
  return fromRepo; // return best-guess path (will 404 if missing)
}

export const handler: Handler = async (event) => {
  try {
    const schema = getSchema();
    const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
    const validate = ajv.compile(schema);

    let data: any | undefined;
    const method = event.httpMethod.toUpperCase();

    if (method === 'GET') {
      const file = event.queryStringParameters?.file;
      if (!file) {
        return {
          statusCode: 400,
          body: JSON.stringify({ ok: false, error: 'Missing query param: file' })
        };
      }
      const abs = resolveInputPath(file);
      if (!fs.existsSync(abs)) {
        return {
          statusCode: 404,
          body: JSON.stringify({ ok: false, error: `File not found: ${abs}` })
        };
      }
      const raw = fs.readFileSync(abs, 'utf-8');
      data = JSON.parse(raw);
    } else if (method === 'POST') {
      if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Missing request body' }) };
      }
      try {
        data = JSON.parse(event.body);
      } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Body is not valid JSON' }) };
      }
    } else {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }

    const valid = validate(data);
    if (!valid) {
      return {
        statusCode: 422,
        body: JSON.stringify({ ok: false, errors: validate.errors })
      };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err?.message || String(err) }) };
  }
};
