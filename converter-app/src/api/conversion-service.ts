/**
 * Backend conversion service client
 * Calls either the local proxy route or Netlify function to convert classic Map Journal
 */

export interface BackendConversionResult {
  storymapJson: unknown;
  mediaUrls: string[];
}

function buildQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v.length) usp.set(k, v);
  }
  return usp.toString();
}

export async function convertClassicViaBackend(itemId: string, token?: string): Promise<BackendConversionResult> {
  const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const query = buildQuery({ itemId, token });
  const proxyUrl = `http://localhost:3001/convert/mapjournal?${query}`;
  const netlifyUrl = `/.netlify/functions/convert-mapjournal?${query}`;

  // Try local proxy first when developing locally; otherwise prefer Netlify function
  const candidates = isLocal ? [proxyUrl, netlifyUrl] : [netlifyUrl, proxyUrl];

  let lastErr: unknown = null;
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) throw new Error(`Backend conversion failed: ${resp.status} ${resp.statusText}`);
      const json = await resp.json();
      // Netlify fallback may return classic JSON directly if tsx is unavailable; detect shape
      if (json && json.storymapJson && Array.isArray(json.mediaUrls)) {
        return json as BackendConversionResult;
      }
      // If we got classic JSON fallback, return minimal result for caller to handle embeds
      if (json && json.values) {
        return { storymapJson: json, mediaUrls: [] };
      }
      // Unknown shape, throw to try next candidate
      throw new Error('Unexpected backend response shape');
    } catch (err) {
      lastErr = err;
      // continue to next candidate
    }
  }
  throw lastErr || new Error('Backend conversion failed');
}
