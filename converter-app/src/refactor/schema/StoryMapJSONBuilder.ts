import type { StoryMapJSON, StoryMapNode, StoryMapImageNode } from '../types/core';

interface ThemeConfigInput {
  themeId: string;
}

export class StoryMapJSONBuilder {
  private json: StoryMapJSON;

  constructor(themeId: string) {
    this.json = {
      type: 'storymap',
      version: '1.0.0',
      root: '',
      nodes: {},
      resources: {
        theme: {
          type: 'story-theme',
          data: { themeId }
        }
      }
    };
  }

  createStoryRoot(themeId: string): string {
    const id = this.generateId('story');
    this.json.root = id;
    this.json.nodes[id] = {
      type: 'story',
      data: { storyTheme: themeId },
      children: []
    };
    return id;
  }

  addNode(nodeType: string, data?: Record<string, unknown>, config?: Record<string, unknown>, children?: string[]): string {
    const id = this.generateId(nodeType);
    const node: StoryMapNode = { type: nodeType };
    if (data) node.data = data;
    if (config) node.config = config;
    if (children) node.children = children;
    this.json.nodes[id] = node;
    return id;
  }

  applyTheme(input: ThemeConfigInput): void {
    const theme = this.json.resources.theme;
    theme.data.themeId = input.themeId;
  }

  addImageResource(originalUrl: string, resourceId?: string): string {
    const id = resourceId ?? this.generateId('img');
    this.json.resources[id] = {
      type: 'image',
      data: { src: originalUrl, provider: 'uri' }
    };
    return id;
  }

  addTextBlock(parentId: string, text: string, blockType: 'paragraph' | 'h2' | 'h3' | 'h4' | 'quote'): string {
    const id = this.generateId('text');
    const node: StoryMapNode = { type: 'text', data: { text, type: blockType } };
    this.json.nodes[id] = node;
    this.appendChild(parentId, id);
    return id;
  }

  addImageNode(parentId: string, img: { src?: string; resourceId?: string; provider: 'item-resource' | 'uri'; caption?: string; alt?: string }): string {
    const id = this.generateId('image');
    const node: StoryMapImageNode = {
      type: 'image',
      data: {
        src: img.src,
        resourceId: img.resourceId,
        provider: img.provider,
        caption: img.caption,
        alt: img.alt
      }
    };
    this.json.nodes[id] = node;
    this.appendChild(parentId, id);
    return id;
  }

  private appendChild(parentId: string, childId: string): void {
    const parent = this.json.nodes[parentId];
    if (!parent) return;
    if (!parent.children) parent.children = [];
    parent.children.push(childId);
  }

  getJson(): StoryMapJSON {
    return this.json;
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
