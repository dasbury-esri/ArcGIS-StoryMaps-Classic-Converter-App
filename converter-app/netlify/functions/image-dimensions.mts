import type { Context } from "@netlify/functions";
import sizeOf from 'image-size';

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
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const dimensions = sizeOf(buffer);
    return new Response(JSON.stringify(dimensions), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch {
    return new Response('Error fetching image or reading dimensions', { status: 500 });
  }
};
