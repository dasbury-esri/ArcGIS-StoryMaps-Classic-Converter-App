// netlify/functions/convert-mapjournal.js
// Serverless function that performs Map Journal conversion and returns StoryMaps JSON
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function fetchClassic(itemId, token) {
  const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  const url = token ? `${base}&token=${encodeURIComponent(token)}` : base;
  const out = execSync(`curl -sL '${url}'`, { encoding: 'utf-8' });
  return JSON.parse(out);
}

export async function handler(event) {
  const itemId = event.queryStringParameters && event.queryStringParameters.itemId;
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!itemId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing itemId parameter' }) };
  }
  try {
    let body = null;
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const rootDir = path.resolve(__dirname, '..', '..');
      const tsxBin = path.resolve(rootDir, 'converter-app/node_modules/.bin/tsx');
      const scriptPath = path.resolve(rootDir, 'converter-app/scripts/convert-mapjournal.ts');
      const cmd = token ? `"${tsxBin}" "${scriptPath}" "${itemId}" "${token}"` : `"${tsxBin}" "${scriptPath}" "${itemId}"`;
      const result = execSync(cmd, { encoding: 'utf-8' });
      body = result;
    } catch (innerErr) {
      const classic = fetchClassic(itemId, token);
      body = JSON.stringify(classic);
    }

    return {
      statusCode: 200,
      body,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Conversion failed' })
    };
  }
}
