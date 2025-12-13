/**
 * Thumbnail utilities for Map Series conversion
 */

const DEFAULT_THUMBNAIL = 'https://cdn-a.arcgis.com/cdn/1BE082D/js/arcgis-app-components/arcgis-app/assets/arcgis-item-thumbnail/storymap.png';

export function getDefaultThumbnailUrl(): string {
  return DEFAULT_THUMBNAIL;
}

/**
 * Try to derive a thumbnail URL for a webmap item.
 * Falls back to default if not accessible.
 */
export async function deriveWebmapThumbnailUrl(itemId: string): Promise<string> {
  try {
    const f: typeof fetch | undefined = (typeof fetch !== 'undefined') ? fetch : undefined;
    if (!f) return DEFAULT_THUMBNAIL;
    const itemUrl = `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`;
    const resp = await f(itemUrl);
    if (!resp.ok) return DEFAULT_THUMBNAIL;
    const item = await resp.json();
    const tn = item?.thumbnail as string | undefined;
    const rest = item?._portal?.resturl as string | undefined;
    if (tn && typeof tn === 'string') {
      const base = rest || 'https://www.arcgis.com/';
      // Construct standard info URL
      return `${base}sharing/rest/content/items/${itemId}/info/${tn}`;
    }
  } catch { /* ignore */ }
  return DEFAULT_THUMBNAIL;
}

/**
 * For image media, just return the image URL (downscaling handled downstream/UI).
 */
export function deriveImageThumbnailUrl(imageUrl: string | undefined): string {
  if (typeof imageUrl === 'string' && imageUrl.trim().length) return imageUrl.trim();
  return DEFAULT_THUMBNAIL;
}

/**
 * For video or generic embeds, use the default.
 */
export function deriveEmbedThumbnailUrl(): string {
  return DEFAULT_THUMBNAIL;
}

/**
 * Build a proxied image thumbnail URL (downscaled) via Netlify/local proxy.
 * Falls back to the original URL if proxy is unavailable.
 */
export function buildProxiedThumbnailUrl(originalUrl: string, width = 400): string {
  try {
    const url = originalUrl.startsWith('//') ? 'https:' + originalUrl : originalUrl;
    const isProd = process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true';
    const proxyBaseUrl = process.env.VITE_PROXY_BASE_URL || '';
    const base = isProd ? '/.netlify/functions/image-thumbnail' : `${proxyBaseUrl}/image-thumbnail`;
    // If no base (dev) configured, return original
    if (!base || base.startsWith('undefined')) return url;
    const encoded = encodeURIComponent(url);
    return `${base}?url=${encoded}&w=${width}`;
  } catch {
    return originalUrl;
  }
}
