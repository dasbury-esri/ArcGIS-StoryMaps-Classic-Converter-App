import type { StoryMapJSON, StoryMapImageResource, StoryMapImageNode } from '../types/core';

export interface MediaMapping {
  [originalUrl: string]: string; // original URL -> resourceName
}

export class ResourceMapper {
  static apply(storymap: StoryMapJSON, mapping: MediaMapping): StoryMapJSON {
    // Update image resources
    for (const res of Object.values(storymap.resources)) {
      if (res.type === 'image') {
        const imgRes = res as StoryMapImageResource;
        const src = imgRes.data.src;
        if (src) {
          const newName = mapping[src];
          if (newName) {
            imgRes.data.resourceId = newName;
            delete imgRes.data.src;
            imgRes.data.provider = 'item-resource';
          }
        }
      }
    }
    // Update image nodes that still reference external src
    for (const node of Object.values(storymap.nodes)) {
      if (node.type === 'image') {
        const imgNode = node as StoryMapImageNode;
        if (imgNode.data.src && mapping[imgNode.data.src]) {
          imgNode.data.resourceId = mapping[imgNode.data.src];
          imgNode.data.provider = 'item-resource';
          delete imgNode.data.src;
        }
      }
    }
    return storymap;
  }

  static rewriteImageUrlsToProxy(storymap: StoryMapJSON, proxyBaseUrl: string): StoryMapJSON {
    for (const res of Object.values(storymap.resources)) {
      if (res.type === 'image') {
        const imgRes = res as StoryMapImageResource;
        if (imgRes.data.src && !imgRes.data.resourceId) {
          imgRes.data.src = `${proxyBaseUrl}?url=${encodeURIComponent(imgRes.data.src)}`;
        }
      }
    }
    for (const node of Object.values(storymap.nodes)) {
      if (node.type === 'image') {
        const imgNode = node as StoryMapImageNode;
        if (imgNode.data.src && !imgNode.data.resourceId) {
          imgNode.data.src = `${proxyBaseUrl}?url=${encodeURIComponent(imgNode.data.src)}`;
        }
      }
    }
    return storymap;
  }
}
