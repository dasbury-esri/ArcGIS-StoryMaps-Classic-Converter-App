/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Image Transfer Utilities
 * Handle downloading images from classic story and uploading to new story
 */

import { addResource } from './arcgis-client.ts';

/**
 * Check if URL is an ArcGIS Online resource
 */
export function isAgoResource(url: string): boolean {
    return (
        url.includes('www.arcgis.com/sharing/rest/content') ||
        url.includes('//www.arcgis.com/sharing/rest/content')
    );
}

/**
 * Extract classic item ID from AGO resource URL
 */
export function extractItemIdFromUrl(url: string): string | null {
    const match = url.match(/\/items\/([a-f0-9]+)\/resources/i);
    return match ? match[1] : null;
}

/**
 * Extract resource filename from URL
 */
export function extractResourceName(url: string): string {
    // Get the part after /resources/
    const parts = url.split('/resources/');
    if (parts.length > 1) {
        // Remove query params
        const filename = parts[1].split('?')[0];
        return decodeURIComponent(filename);
    }
    // Fallback: use last part of path
    const lastPart = url.split('/').pop()?.split('?')[0];
    return lastPart || 'image.jpg';
}

/**
 * Generate a unique resource name for the new story
 */
export function generateResourceName(originalName: string, forcedExt?: string): string {
  const recognized = ['jpg','jpeg','png','gif','webp','bmp','tif','tiff'];
  let ext = forcedExt;
  if (!ext) {
    const tail = originalName.split('.').pop() || '';
    ext = recognized.includes(tail.toLowerCase()) ? tail.toLowerCase() : 'jpg';
  }
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'tiff') ext = 'tif';
  const uuid = Math.random().toString(36).substring(2, 15);
  return `${uuid}.${ext}`;
}

function normalizeExtension(ext: string): string {
  if (!ext) return '.jpg';
  const e = ext.toLowerCase();
  if (['.jpg','.jpeg','.png','.gif','.webp','.bmp','.tif','.tiff'].includes(e)) {
    if (e === '.jpeg') return '.jpg';
    if (e === '.tiff') return '.tif';
    return e;
  }
  return '.jpg';
}

/**
 * Validate token
 */
export function looksLikeUsername(value: string): boolean {
  return !!value && value.length < 40 && /[_a-z]/i.test(value) && !/[.=]/.test(value);
}

/**
 * Rewrite all image URLs in StoryMap JSON to use the proxy endpoint
 */
export function rewriteImageUrlsToProxy(storymapJson: any, proxyBaseUrl: string): any {
  if (!storymapJson.resources) return storymapJson;
  for (const resource of Object.values<any>(storymapJson.resources)) {
    if (resource.type === 'image') {
      const url = resource.data?.url || resource.data?.src;
      if (url) {
        const proxiedUrl = `${proxyBaseUrl}/proxy-image?url=${encodeURIComponent(url)}`;
        if (resource.data.url) resource.data.url = proxiedUrl;
        if (resource.data.src) resource.data.src = proxiedUrl;
      }
    }
  }
  return storymapJson;
}

/**
 * Fetch image from AGO resource and convert to Blob
 */
export async function fetchImageAsBlob(url: string, token: string): Promise<Blob> {
    if (!token) {
        throw new Error('Missing token for image fetch');
    }
    if (looksLikeUsername(token)) {
        console.warn('[fetchImageAsBlob] Token looks like a username, aborting fetch:', token);
        throw new Error('Invalid token (looks like username)');
    }
    // Ensure URL has https protocol
    let fullUrl = url;
    if (url.startsWith('//')) {
        fullUrl = 'https:' + url;
    } else if (!url.startsWith('http')) {
        fullUrl = 'https://' + url;
    }

    // Add token to URL
    const separator = fullUrl.includes('?') ? '&' : '?';
    const urlWithToken = `${fullUrl}${separator}token=${token}`;

    const response = await fetch(urlWithToken);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    return response.blob();
}

function resolveExtension(urlPath: string, contentType?: string, contentDisposition?: string): string {
  // Try Content-Disposition
  if (contentDisposition) {
    const m = /filename="?([^";]+)"?/i.exec(contentDisposition);
    if (m) {
      const fn = m[1].toLowerCase();
      const extMatch = fn.match(/\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)$/);
      if (extMatch) return extMatch[0].replace('.jpeg', '.jpg').replace('.tiff', '.tif');
    }
  }
  // Try resolved URL path
  const extMatch = urlPath.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)$/);
  if (extMatch) return extMatch[0].replace('.jpeg', '.jpg').replace('.tiff', '.tif');

  // Fallback to content-type
  if (contentType && /^image\//i.test(contentType)) {
    const subtype = contentType.split('/')[1].toLowerCase();
    if (['jpg','jpeg','png','gif','webp','bmp','tiff','tif'].includes(subtype)) {
      return '.' + (subtype === 'jpeg' ? 'jpg' : subtype === 'tiff' ? 'tif' : subtype);
    }
    return '.jpg';
  }
  return '.bin';
}

async function fetchImage(url: string, token?: string) {
  const u = token ? `${url}?token=${encodeURIComponent(token)}` : url;
  const resp = await fetch(u);
  if (!resp.ok) throw new Error(`Image fetch failed ${resp.status}`);
  const cd = resp.headers.get('content-disposition') || undefined;
  const ct = resp.headers.get('content-type') || undefined;
  const resolvedUrl = resp.url; // after redirect
  const blob = await resp.blob();
  const extension = resolveExtension(resolvedUrl, ct, cd);
  return { blob, extension };
}

/**
 * Result of image transfer
 */
export interface ImageTransferResult {
    originalUrl: string;
    resourceName: string;  // Just the filename
    isTransferred: boolean;
}

/**
 * Transfer image from classic story to new story
 * Downloads from classic resources and uploads to target resources
 * Returns the resource NAME (filename), not full URL
 */
export async function transferImage(
    imageUrl: string,
    targetItemId: string,
    username: string,
    token: string,
    filename?: string
): Promise<{ originalUrl: string; resourceName: string; isTransferred: boolean }> {
  try {
    console.log('[transferImage] Starting transfer:', { imageUrl, filename, targetItemId });
    
    // Derive original base name (for fallback)
    const originalName = extractResourceName(imageUrl);   
    let extension: string = '.jpg'; 
    // Unified fetch (uses token only for AGO resources)
    let blob: Blob;

    try {
      const fetched = await fetchImage(imageUrl, isAgoResource(imageUrl) ? token : undefined);
      blob = fetched.blob;
      extension = normalizeExtension(fetched.extension); 
    } catch (primaryErr) {
      console.warn('[transferImage] Primary fetch failed, trying proxy:', { imageUrl, error: primaryErr });
      blob = await fetchImageWithProxy(imageUrl);
      // Derive extension from originalName or fallback
      const match = originalName.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)$/);
      extension = normalizeExtension(match ? match[0] : '.jpg');
    }

    // Final guard: eliminate any residual non-image extension
    if (!/^\.(jpg|png|gif|webp|bmp|tif)$/i.test(extension)) {
      extension = '.jpg';
    }

    // If caller supplied filename, keep it; else generate with proper extension
    let newResourceName: string;
    if (filename) {
      // Ensure supplied filename has a valid image extension
      const fnMatch = filename.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)$/);
      if (fnMatch) {
        const norm = normalizeExtension(fnMatch[0]);
        newResourceName = filename.replace(/\.[^.]+$/i, norm);
      } else {
        newResourceName = `${filename}${extension}`;
      }
    } else {
      // Generate with resolved extension (strip dot)
      newResourceName = generateResourceName(originalName, extension.replace('.', ''));
    }

    // Upload to AGO story item
    console.log('[transferImage] Uploading to AGO:', { newResourceName, blob });
    await addResource(targetItemId, username, blob, newResourceName, token);

    console.log('[transferImage] Transfer successful:', { imageUrl, newResourceName });    
    return {
      originalUrl: imageUrl,
      resourceName: newResourceName,
      isTransferred: true
    };
  } catch (error) {
    console.error('[transferImage] Transfer failed:', { imageUrl, error });
    return {
      originalUrl: imageUrl,
      resourceName: imageUrl,
      isTransferred: false
    };
  }
}

/**
 * Transfer multiple images (batch processing with progress)
 */
// export async function transferImages(
//     imageUrls: string[],
//     targetItemId: string,
//     username: string,
//     token: string,
//     onProgress?: (current: number, total: number, message: string) => void
// ): Promise<ImageTransferResult[]> {
//     const results: ImageTransferResult[] = [];

//     for (let i = 0; i < imageUrls.length; i++) {
//         const originalUrl = imageUrls[i];

//         if (onProgress) {
//             onProgress(i + 1, imageUrls.length, `Processing image ${i + 1} of ${imageUrls.length}`);
//         }

//         const result = await transferImage(
//             originalUrl,
//             targetItemId,
//             username,
//             token,
//             onProgress ? (msg) => onProgress(i + 1, imageUrls.length, msg) : undefined
//         );

//         results.push(result);
//     }

//     return results;
// }

/**
 * Transfer multiple images (batch processing with progress)
 */
export async function transferImages(
  imageUrls: string[],
  targetItemId: string,
  username: string,
  token: string,
  onProgress?: (current: number, total: number, msg: string) => void
): Promise<{ originalUrl: string; resourceName: string; isTransferred: boolean }[]> {
  console.log('[transferImages] Starting batch transfer:', { imageUrls, targetItemId });  
  const results: { originalUrl: string; resourceName: string; isTransferred: boolean }[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    if (onProgress) {
      onProgress(i + 1, imageUrls.length, `Transferring image ${i + 1} of ${imageUrls.length}`);
    }
    const result = await transferImage(imageUrl, targetItemId, username, token);
    results.push(result);
  }
  return results;
}

/**
 * Fetch an image using a local proxy server to avoid CORS errors
 */
async function fetchImageWithProxy(imageUrl: string): Promise<Blob> {
  const proxyUrl = `http://localhost:3001/proxy-image?url=${encodeURIComponent(imageUrl)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error('Failed to fetch image via proxy');
  return await response.blob();
}

/**
 * Scan StoryMap JSON for all image URLs that need to be transferred
 * * Updated to scan for both 'url' and 'src' properties
 */
export function collectImageUrls(storymapJson: any): string[] {
    const imageUrls = new Set<string>();

    // Scan resources for image URLs
    if (storymapJson.resources) {
        for (const resource of Object.values<any>(storymapJson.resources)) {
            if (resource.type === 'image') {
                const url = resource.data?.url || resource.data?.src;
                if (url) { 
                    imageUrls.add(url);
                }
            }
        }
    }

    return Array.from(imageUrls);
}

/**
 * Collect image URLs from classic MapJournal JSON
 * Scans both section.contents (HTML) and section.media (if type === "image")
 */
export function collectClassicJournalImageUrls(classicJson: any): string[] {
  const urls = new Set<string>();
  const sections = classicJson.values?.story?.sections || [];
  for (const section of sections) {
    // section.media
    if (section.media && section.media.type === "image" && section.media.image?.url) {
      urls.add(section.media.image.url);
    }
    // section.content (HTML)
    const html = section.content || section.contents || "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const img of Array.from(doc.querySelectorAll("img"))) {
      const src = img.getAttribute("src");
      if (src) urls.add(src);
    }
  }
  return Array.from(urls);
}

function extractWidthFromFilename(filename: string | undefined): number | undefined {
  if (!filename) return undefined;
  const match = filename.match(/__w(\d+)\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)$/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Update StoryMap JSON to fix image resource structures
 * For transferred images: use resourceId + provider: "item-resource"
 * For external images: use src + provider: "uri"
 */
export function updateImageResourcesInJson(storymapJson: any, transferResults: Record<string, string>) {
  console.log('[updateImageResourcesInJson] Entering');
  const normalizeUrl = (url: string) => {
    let u = decodeURIComponent(url);
    if (u.startsWith('//')) u = 'https:' + u;
    return u;
  };
  console.log('[updateImageResourcesInJson] storymapJson:', storymapJson);
  if (!storymapJson.resources) {
    console.log('[updateImageResourcesInJson] No resources in storymapJson!');
    return storymapJson;
  }
  for (const [resourceId, resource] of Object.entries<any>(storymapJson.resources)) {
    console.log('[updateImageResourcesInJson] Resource:', resource);
    if (resource.type !== 'image') continue;
    // Preserve original before mutation
    const originalUrl = resource.data.url || resource.data.src;
    if (!originalUrl) {
      console.log('[updateImageResourcesInJson] SKIPPING: No url or src for', resourceId, resource);
      continue;
    }  
    console.log('[updateImageResourcesInJson] Original URL', originalUrl);
    const matchKey = Object.keys(transferResults).find(
      k => normalizeUrl(k) === normalizeUrl(originalUrl)
    );
    console.log('[updateImageResourcesInJson] MatchKey', matchKey);
    if (matchKey) {
      // Transferred image
      const transferredName = transferResults[matchKey]; // new filename
      const widthFromOriginal = extractWidthFromFilename(originalUrl);
      console.log('[updateImageResourcesInJson] transferred resource:', {
        resourceId,
        originalUrl,
        transferredName,
        widthFromOriginal
      });

      // Mutate structure
      resource.data.resourceId = transferredName;
      delete resource.data.url;
      delete resource.data.src;
      resource.data.provider = 'item-resource';
      resource.data.width = widthFromOriginal || 1024;
      resource.data.height = widthFromOriginal || 1024;
    } else {
      // External / not transferred
      const widthFromOriginal = extractWidthFromFilename(originalUrl);
      console.log('[updateImageResourcesInJson] WARNING external image:', {
        resourceId,
        originalUrl,
        widthFromOriginal
      });
      resource.data.provider = 'uri';
      // Keep existing url/src as-is
      resource.data.width = widthFromOriginal || 1024;
      resource.data.height = widthFromOriginal || 1024;
    }
  }
  return storymapJson;
}

// export function updateImageUrlsInJson(
//     storymapJson: any,
//     transferResults: ImageTransferResult[]
// ): any {
//     const updated = JSON.parse(JSON.stringify(storymapJson));

//     // Create lookup map
//     const resultMap = new Map<string, ImageTransferResult>();
//     for (const result of transferResults) {
//         resultMap.set(result.originalUrl, result);
//     }

//     // Update resources
//     if (updated.resources) {
//         for (const resource of Object.values<any>(updated.resources)) {
//             if (resource.type === 'image' && resource.data?.url) {
//                 const oldUrl = resource.data.url;
//                 const result = resultMap.get(oldUrl);

//                 if (result && result.isTransferred) {
//                     // Image was transferred - use resourceId structure
//                     delete resource.data.url;
//                     delete resource.data.type;
//                     resource.data.resourceId = result.resourceName;
//                     resource.data.provider = 'item-resource';
//                     resource.data.height = 1024;
//                     resource.data.width = 1024;
//                 } else {
//                     // External URL or transfer failed - use src structure
//                     const url = result ? result.resourceName : oldUrl;
//                     delete resource.data.url;
//                     delete resource.data.type;
//                     resource.data.src = url;
//                     resource.data.provider = 'uri';
//                     resource.data.height = 1024;
//                     resource.data.width = 1024;
//                 }
//             }
//         }
//     }

//     return updated;
// }

