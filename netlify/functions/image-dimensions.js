// netlify/functions/image-dimensions.js
import sizeOf from 'image-size';
import fetch from 'node-fetch'; // Explicit import for Node < 18 or Netlify compatibility

function normalizeUrl(u) {
  if (!u) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (!/^https?:\/\//i.test(u)) return 'https://' + u;
  return u;
}

export async function handler(event) {
  const raw = event.queryStringParameters?.url;
  if (!raw) return { statusCode: 400, body: 'Missing url parameter' };
  const imageUrl = normalizeUrl(raw);
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return { statusCode: response.status, body: 'Failed to fetch image' };
    const buffer = await response.buffer();
    const dimensions = sizeOf(buffer);
    return {
      statusCode: 200,
      body: JSON.stringify(dimensions),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    };
  } catch {
    return { statusCode: 500, body: 'Error fetching image or reading dimensions' };
  }
}