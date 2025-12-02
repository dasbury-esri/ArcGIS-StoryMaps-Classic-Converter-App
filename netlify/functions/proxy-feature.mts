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
    const targetUrl = normalizeUrl(raw);
    const response = await fetch(targetUrl);
    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch {
    return new Response('Proxy request failed', { status: 500 });
  }
};
