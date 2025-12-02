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
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length > 10 * 1024 * 1024) {
      return { statusCode: 413, body: 'Image too large' };
    }
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': contentType
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch {
    return { statusCode: 500, body: 'Error fetching image' };
  }
}

export default handler;
