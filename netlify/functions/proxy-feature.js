// filepath: netlify/functions/proxy-feature.js

function normalizeUrl(u) {
  if (!u) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (!/^https?:\/\//i.test(u)) return 'https://' + u;
  return u;
}

export async function handler(event) {
  const raw = event.queryStringParameters?.url;
  if (!raw) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }
  const targetUrl = normalizeUrl(raw);
  try {
    const response = await fetch(targetUrl);
    const data = await response.text();
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: data
    };
  } catch {
    return { statusCode: 500, body: 'Proxy request failed' };
  }
}