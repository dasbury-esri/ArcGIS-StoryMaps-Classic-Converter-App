import type { Context } from "@netlify/functions";

function normalizeUrl(u: string) {
  if (!u) return u;
  // scheme-relative → default to https
  if (u.startsWith('//')) return 'https:' + u;
  // preserve explicit http/https; only add https when scheme missing
  if (!/^https?:\/\//i.test(u)) return 'https://' + u;
  return u;
}

export default async (req: Request, _context: Context) => {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get('url');
    if (!raw) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing url parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const targetUrl = normalizeUrl(raw);
    let response: Response;
    try {
      response = await fetch(targetUrl);
    } catch (e) {
      const isHttp = /^http:\/\//i.test(targetUrl);
      const body = {
        ok: false,
        error: isHttp ? 'Upstream HTTP endpoint failed. Consider upgrading to HTTPS.' : 'Upstream fetch failed.',
        url: targetUrl,
        note: isHttp ? 'HTTP endpoints may be blocked by browsers or proxies.' : undefined
      };
      return new Response(JSON.stringify(body), { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    const contentType = response.headers.get('content-type') || 'application/json';
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Proxy request failed';
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
