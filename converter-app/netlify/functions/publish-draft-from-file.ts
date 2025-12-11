import type { Handler } from '@netlify/functions';
import fs from 'node:fs';
import path from 'node:path';
import fetch from 'node-fetch';

// Reuse validator to keep behavior consistent with validate-draft
import Ajv from 'ajv';
// Load schema via fs to avoid esbuild JSON import resolution issues in Netlify functions
const schemaPath = path.resolve(process.cwd(), 'schemas/draft-story.json');
const schemaText = fs.readFileSync(schemaPath, 'utf8');
const draftSchema = JSON.parse(schemaText);

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(draftSchema as any);

export const handler: Handler = async (event) => {
  try {
    const fileParam = event.queryStringParameters?.file;
    const storyIdParam = event.queryStringParameters?.storyId;
    const tokenParam = event.queryStringParameters?.token;
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader || '');
    const token = tokenParam || (bearerMatch ? bearerMatch[1] : undefined);
    if (!fileParam) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Missing '?file=' parameter" })
      };
    }
    const abs = path.resolve(process.cwd(), fileParam);
    if (!fs.existsSync(abs)) {
      return {
        statusCode: 404,
        body: JSON.stringify({ ok: false, error: `File not found: ${abs}` })
      };
    }
    const text = fs.readFileSync(abs, 'utf8');
    let json: any;
    try {
      json = JSON.parse(text);
    } catch (e: any) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: `Invalid JSON: ${e?.message || String(e)}` })
      };
    }
    const valid = validate(json);
    if (!valid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, errors: validate.errors })
      };
    }

    // Require token to publish
    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ ok: false, error: 'Missing ArcGIS token (pass as Authorization: Bearer <token> or ?token=...)' })
      };
    }

    // Resolve username
    const selfUrl = `https://www.arcgis.com/sharing/rest/portals/self?f=json&token=${encodeURIComponent(token)}`;
    const selfResp = await fetch(selfUrl);
    if (!selfResp.ok) {
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: `Failed to resolve user info (${selfResp.status})` }) };
    }
    const selfJson = await selfResp.json();
    const username: string | undefined = selfJson?.user?.username || selfJson?.user?.fullName || selfJson?.name || undefined;
    if (!username) {
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Unable to resolve username from portals/self' }) };
    }

    // Create or reuse StoryMap draft item
    let storyId: string | undefined = storyIdParam && /^[a-f0-9]{32}$/i.test(storyIdParam) ? storyIdParam : undefined;
    if (!storyId) {
      const title = (json?.nodes?.[json?.root]?.data?.title) || 'Converted Story (Local JSON)';
      const addItemUrl = `https://www.arcgis.com/sharing/rest/content/users/${encodeURIComponent(username)}/addItem`;
      const form = new URLSearchParams();
      form.append('f', 'json');
      form.append('token', token);
      form.append('title', String(title));
      // Use the modern StoryMaps item type so Builder can load the draft
      form.append('type', 'StoryMap');
      form.append('typeKeywords', 'StoryMap,smconverter:online-app,smdraftresourceid:draft.json');
      form.append('description', 'Draft created via Classic Converter dev function (publish-draft-from-file)');
      const addItemResp = await fetch(addItemUrl, { method: 'POST', body: form });
      const addItemJson = await addItemResp.json();
      if (!addItemJson?.success || !addItemJson?.id) {
        return { statusCode: 502, body: JSON.stringify({ ok: false, error: addItemJson?.error?.message || 'Failed to create draft item' }) };
      }
      storyId = addItemJson.id as string;
    }

    // Upload draft.json resource
    const addResUrl = `https://www.arcgis.com/sharing/rest/content/users/${encodeURIComponent(username)}/items/${encodeURIComponent(storyId!)}/addResources`;
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
    const bodyParts: string[] = [];
    bodyParts.push(`--${boundary}`);
    bodyParts.push('Content-Disposition: form-data; name="f"');
    bodyParts.push('');
    bodyParts.push('json');
    bodyParts.push(`--${boundary}`);
    bodyParts.push('Content-Disposition: form-data; name="token"');
    bodyParts.push('');
    bodyParts.push(token);
    bodyParts.push(`--${boundary}`);
    bodyParts.push('Content-Disposition: form-data; name="fileName"');
    bodyParts.push('');
    bodyParts.push('draft.json');
    bodyParts.push(`--${boundary}`);
    bodyParts.push('Content-Disposition: form-data; name="file"; filename="draft.json"');
    bodyParts.push('Content-Type: application/json');
    bodyParts.push('');
    bodyParts.push(JSON.stringify(json));
    bodyParts.push(`--${boundary}--`);
    const addResResp = await fetch(addResUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: Buffer.from(bodyParts.join('\r\n'))
    });
    const addResJson = await addResResp.json();
    if (!addResJson?.success) {
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: addResJson?.error?.message || 'Failed to upload draft.json' }) };
    }

    // Update keywords to ensure smconverter tag present
    try {
      const updateUrl = `https://www.arcgis.com/sharing/rest/content/users/${encodeURIComponent(username)}/items/${encodeURIComponent(storyId!)}/update`;
      const upd = new URLSearchParams();
      upd.append('f', 'json');
      upd.append('token', token);
      upd.append('typeKeywords', 'StoryMap,smconverter:online-app,smdraftresourceid:draft.json');
      await fetch(updateUrl, { method: 'POST', body: upd });
    } catch { /* ignore */ }

    const editUrl = `https://storymaps.arcgis.com/stories/${storyId!}/edit`;
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, storyId, editUrl })
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err?.message || String(err) })
    };
  }
};
