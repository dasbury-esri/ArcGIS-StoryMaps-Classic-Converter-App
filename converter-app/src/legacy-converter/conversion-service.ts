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
  const query = buildQuery({ itemId, token });
  const netlifyUrl = `/.netlify/functions/convert-mapjournal?${query}`;
  // Attempt Netlify function only; if unavailable, throw for caller to fallback to client pipeline.
  try {
    const resp = await fetch(netlifyUrl, { method: 'GET' });
    if (!resp.ok) throw new Error(`Backend conversion not available: ${resp.status}`);
    const json = await resp.json();
    if (json && json.storymapJson && Array.isArray(json.mediaUrls)) {
      return json as BackendConversionResult;
    }
    if (json && json.values) {
      return { storymapJson: json, mediaUrls: [] };
    }
    throw new Error('Unexpected backend response shape');
  } catch (err) {
    throw err;
  }
}
