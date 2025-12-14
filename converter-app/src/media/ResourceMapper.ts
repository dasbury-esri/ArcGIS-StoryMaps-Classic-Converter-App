import type { StoryMapJSON, StoryMapImageResource, StoryMapImageNode } from '../types/core';

export interface MediaMapping {
  [originalUrl: string]: string; // original URL -> resourceName
}

export class ResourceMapper {
  static apply(storymap: StoryMapJSON, mapping: MediaMapping): StoryMapJSON {
    // Transform image resources src -> resourceId and update nodes to use data.image (already set)
    for (const [resId, res] of Object.entries(storymap.resources)) {
      if (res.type === 'image') {
        const imgRes = res as StoryMapImageResource;
        const src = (imgRes.data && typeof imgRes.data === 'object' ? (imgRes.data as { src?: unknown }).src : undefined);
        if (typeof src === 'string' && mapping[src]) {
          const d = (imgRes.data || {}) as Record<string, unknown>;
          d.resourceId = mapping[String(src)];
          delete (d as { src?: unknown }).src;
          (d as Record<string, unknown>).provider = 'item-resource';
          imgRes.data = d as typeof imgRes.data;
        }
      }
    }
    // Legacy fallback: if any image nodes still have data.src (older structure), convert them
    for (const node of Object.values(storymap.nodes)) {
      if (node.type === 'image') {
        const imgNode = node as StoryMapImageNode;
        const srcVal = (imgNode.data && typeof imgNode.data === 'object') ? (imgNode.data as { src?: unknown }).src : undefined;
        if (typeof srcVal === 'string') {
          const src = srcVal;
          const resId = Object.entries(storymap.resources).find(([rid, r]) => r.type === 'image' && typeof (r.data as { src?: unknown }).src === 'string' && (r.data as { src?: string }).src === src)?.[0];
          if (resId) {
            // ensure resource transformation happened above
            const d = (imgNode.data || {}) as Record<string, unknown>;
            d.image = resId;
            delete (d as { src?: unknown }).src;
            delete (d as { resourceId?: unknown }).resourceId;
            delete (d as { provider?: unknown }).provider;
            imgNode.data = d as typeof imgNode.data;
          }
        }
      }
    }
    return storymap;
  }

  static rewriteImageUrlsToProxy(storymap: StoryMapJSON, proxyBaseUrl: string): StoryMapJSON {
    for (const res of Object.values(storymap.resources)) {
      if (res.type === 'image') {
        const imgRes = res as StoryMapImageResource;
        const d = (imgRes.data || {}) as Record<string, unknown>;
        const src = (d as { src?: unknown }).src;
        const resourceId = (d as { resourceId?: unknown }).resourceId;
        if (typeof src === 'string' && !resourceId) d.src = `${proxyBaseUrl}?url=${encodeURIComponent(src)}`;
        imgRes.data = d as typeof imgRes.data;
      }
    }
    // Node-level rewrite only for legacy structure
    for (const node of Object.values(storymap.nodes)) {
      if (node.type === 'image') {
        const imgNode = node as StoryMapImageNode;
        const d = (imgNode.data || {}) as Record<string, unknown>;
        const src = (d as { src?: unknown }).src;
        const imageRes = (d as { image?: unknown }).image;
        if (typeof src === 'string' && !imageRes) d.src = `${proxyBaseUrl}?url=${encodeURIComponent(src)}`;
        imgNode.data = d as typeof imgNode.data;
      }
    }
    return storymap;
  }
}
