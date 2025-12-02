import type { Context } from "@netlify/functions";

function normalizeUrl(u: string) {
  if (!u) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (!/^https?:\/\//i.test(u)) return 'https://' + u;
  return u;
}

export default async (req: Request, _context: Context) => {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get('url');
    if (!raw) return new Response('Missing url parameter', { status: 400 });
    const imageUrl = normalizeUrl(raw);
    const response = await fetch(imageUrl);
    if (!response.ok) return new Response('Failed to fetch image', { status: response.status });
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length > 10 * 1024 * 1024) {
      return new Response('Image too large', { status: 413 });
    }
    return new Response(buffer, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': contentType
      }
    });
  } catch {
    return new Response('Error fetching image', { status: 500 });
  }
};
