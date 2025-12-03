import type { StoryMapJSON, StoryMapImageResource, StoryMapImageNode } from '../types/core.ts';

export interface MediaMapping {
  [originalUrl: string]: string; // original URL -> resourceName
}

export class ResourceMapper {
  static apply(storymap: StoryMapJSON, mapping: MediaMapping): StoryMapJSON {
    // Transform image resources src -> resourceId and update nodes to use data.image (already set)
    for (const [resId, res] of Object.entries(storymap.resources)) {
      if (res.type === 'image') {
        const imgRes = res as StoryMapImageResource;
        const src = (imgRes.data as any).src;
        if (src && mapping[src]) {
          (imgRes.data as any).resourceId = mapping[src];
          delete (imgRes.data as any).src;
          (imgRes.data as any).provider = 'item-resource';
        }
      }
    }
    // Legacy fallback: if any image nodes still have data.src (older structure), convert them
    for (const node of Object.values(storymap.nodes)) {
      if (node.type === 'image') {
        const imgNode = node as StoryMapImageNode;
        if ((imgNode.data as any).src) {
          const src = (imgNode.data as any).src as string;
          const resId = Object.entries(storymap.resources).find(([rid, r]) => r.type === 'image' && (r.data as any).src === src)?.[0];
          if (resId) {
            // ensure resource transformation happened above
            imgNode.data = { ...(imgNode.data as any), image: resId } as any;
            delete (imgNode.data as any).src;
            delete (imgNode.data as any).resourceId;
            delete (imgNode.data as any).provider;
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
        const src = (imgRes.data as any).src;
        const resourceId = (imgRes.data as any).resourceId;
        if (src && !resourceId) (imgRes.data as any).src = `${proxyBaseUrl}?url=${encodeURIComponent(src)}`;
      }
    }
    // Node-level rewrite only for legacy structure
    for (const node of Object.values(storymap.nodes)) {
      if (node.type === 'image') {
        const imgNode = node as StoryMapImageNode;
        const src = (imgNode.data as any).src;
        const imageRes = (imgNode.data as any).image;
        if (src && !imageRes) (imgNode.data as any).src = `${proxyBaseUrl}?url=${encodeURIComponent(src)}`;
      }
    }
    return storymap;
  }
}
