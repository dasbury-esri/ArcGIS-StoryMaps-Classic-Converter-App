import type { StoryMapJSON, StoryMapNode, StoryMapImageNode, StoryMapVideoNode, StoryMapWebMapNode } from '../types/core.ts';

interface ThemeConfigInput {
  themeId: string;
  variableOverrides?: Record<string, string>;
}

export class StoryMapJSONBuilder {
  private json: StoryMapJSON;
  private themeResourceId: string;

  constructor(themeId: string) {
    this.themeResourceId = this.generateResourceId();
    this.json = {
      root: '',
      nodes: {},
      resources: {
        [this.themeResourceId]: {
          type: 'story-theme',
          data: { themeId, themeBaseVariableOverrides: {} }
        }
      },
      actions: []
    } as StoryMapJSON;
  }

  createStoryRoot(): string {
    const id = this.generateNodeId();
    this.json.root = id;
    this.json.nodes[id] = {
      type: 'story',
      data: { storyTheme: this.themeResourceId },
      config: { coverDate: '' },
      children: []
    } as StoryMapNode;
    return id;
  }

  addNode(nodeType: string, data?: Record<string, unknown>, config?: Record<string, unknown>, children?: string[]): string {
    const id = this.generateNodeId();
    const node: StoryMapNode = { type: nodeType };
    if (data) node.data = data;
    if (config) node.config = config;
    if (children) node.children = children;
    this.json.nodes[id] = node;
    return id;
  }

  applyTheme(input: ThemeConfigInput): void {
    const theme = this.json.resources[this.themeResourceId];
    if (theme) {
      (theme.data as any).themeId = input.themeId;
      if (input.variableOverrides && Object.keys(input.variableOverrides).length) {
        (theme.data as any).themeBaseVariableOverrides = input.variableOverrides;
      }
    }
  }

  addImageResource(originalUrl: string, width?: number, height?: number): string {
    const id = this.generateResourceId();
    this.json.resources[id] = {
      type: 'image',
      data: { src: originalUrl, provider: 'uri', width, height }
    } as any;
    return id;
  }

  finalizeImageResourceAsItem(resourceId: string, itemFilename: string, width?: number, height?: number): void {
    const res = this.json.resources[resourceId];
    if (!res || res.type !== 'image') return;
    delete (res.data as any).src;
    (res.data as any).resourceId = itemFilename;
    (res.data as any).provider = 'item-resource';
    if (width) (res.data as any).width = width;
    if (height) (res.data as any).height = height;
  }

  addVideoResource(originalUrl: string, provider: 'uri' | 'youtube' | 'vimeo' = 'uri', resourceId?: string): string {
    const id = resourceId ?? this.generateResourceId();
    this.json.resources[id] = {
      type: 'video',
      data: { src: originalUrl, provider }
    } as any;
    return id;
  }

  addTextBlock(parentId: string, text: string, blockType: 'paragraph' | 'h2' | 'h3' | 'h4' | 'quote' | 'bullet-list'): string {
    const id = this.generateNodeId();
    const node: StoryMapNode = { type: 'text', data: { text, type: blockType } };
    this.json.nodes[id] = node;
    this.appendChild(parentId, id);
    return id;
  }

  addImageNode(parentId: string, imageResourceId: string, caption?: string, alt?: string, size: 'standard' | 'wide' = 'standard'): string {
    const id = this.generateNodeId();
    const node: StoryMapImageNode = {
      type: 'image',
      data: { image: imageResourceId, caption, alt },
      config: { size }
    } as any;
    this.json.nodes[id] = node;
    this.appendChild(parentId, id);
    return id;
  }

  addVideoNode(parentId: string, vid: { src?: string; resourceId?: string; provider: 'item-resource' | 'uri' | 'youtube' | 'vimeo'; caption?: string; alt?: string }): string {
    const id = this.generateNodeId();
    const node: StoryMapVideoNode = {
      type: 'video',
      data: {
        src: vid.src,
        resourceId: vid.resourceId,
        provider: vid.provider,
        caption: vid.caption,
        alt: vid.alt
      }
    };
    this.json.nodes[id] = node;
    this.appendChild(parentId, id);
    return id;
  }

  addWebMapResource(itemId: string, itemType: 'Web Map' | 'Web Scene' = 'Web Map'): string {
    const id = this.generateResourceId();
    this.json.resources[id] = {
      type: 'webmap',
      data: { type: 'minimal', itemId, itemType }
    } as any;
    return id;
  }

  addWebMapNode(parentId: string, webMapResourceId: string, caption?: string): string {
    const id = this.generateNodeId();
    const node: StoryMapWebMapNode = {
      type: 'webmap',
      data: { map: webMapResourceId, caption }
    } as any;
    this.json.nodes[id] = node;
    this.appendChild(parentId, id);
    return id;
  }

  addCoverNode(title: string, subtitle?: string, byline?: string): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = {
      type: 'storycover',
      data: {
        type: 'minimal',
        title,
        summary: subtitle || '',
        byline: byline || '',
        titlePanelVerticalPosition: 'top',
        titlePanelHorizontalPosition: 'start',
        titlePanelStyle: 'gradient'
      }
    } as StoryMapNode;
    if (this.json.root && this.json.nodes[this.json.root]) this.appendChild(this.json.root, id);
    return id;
  }

  addNavigationHidden(): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'navigation', data: { links: [] }, config: { isHidden: true } } as any;
    if (this.json.root) this.appendChild(this.json.root, id);
    return id;
  }

  addCreditsNode(): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'credits', children: [] } as any;
    if (this.json.root) this.appendChild(this.json.root, id);
    return id;
  }

  addSidecar(subtype: 'docked-panel' | 'floating-panel' = 'docked-panel', narrativePanelPosition: 'start' | 'end' = 'end', narrativePanelSize: 'small' | 'medium' | 'large' = 'medium'): { immersiveId: string; slideId: string; narrativeId: string } {
    const immersiveId = this.generateNodeId();
    const slideId = this.generateNodeId();
    const narrativeId = this.generateNodeId();
    this.json.nodes[immersiveId] = {
      type: 'immersive',
      data: { type: 'sidecar', subtype, narrativePanelPosition, narrativePanelSize },
      children: [slideId]
    } as any;
    this.json.nodes[slideId] = { type: 'immersive-slide', data: { transition: 'fade' }, children: [narrativeId] } as any;
    this.json.nodes[narrativeId] = { type: 'immersive-narrative-panel', data: { panelStyle: 'themed' }, children: [] } as any;
    // Insert before credits if credits exists
    const root = this.json.nodes[this.json.root];
    if (root?.children) {
      const creditsIdx = root.children.findIndex(c => this.json.nodes[c]?.type === 'credits');
      if (creditsIdx > -1) root.children.splice(creditsIdx, 0, immersiveId); else root.children.push(immersiveId);
    }
    return { immersiveId, slideId, narrativeId };
  }

  // Deprecated previous section method retained for backward compatibility
  addSection(parentId: string, title?: string, htmlContent?: string): string {
    const sectionId = this.generateNodeId();
    this.json.nodes[sectionId] = { type: 'slide', children: [] } as StoryMapNode;
    this.appendChild(parentId, sectionId);
    if (title) this.addTextBlock(sectionId, title, 'h2');
    if (htmlContent) {
      const text = htmlContent.replace(/<[^>]+>/g, '').trim();
      if (text) this.addTextBlock(sectionId, text, 'paragraph');
    }
    return sectionId;
  }

  private appendChild(parentId: string, childId: string): void {
    const parent = this.json.nodes[parentId];
    if (!parent) return;
    if (!parent.children) parent.children = [];
    parent.children.push(childId);
  }

  getJson(): StoryMapJSON {
    // Reorder nodes so root story node is last for downstream consumers expecting that ordering
    const nodesOrdered: Record<string, any> = {};
    for (const [id, node] of Object.entries(this.json.nodes)) {
      if (id === this.json.root) continue;
      nodesOrdered[id] = node;
    }
    if (this.json.root) nodesOrdered[this.json.root] = this.json.nodes[this.json.root];
    const { root, resources, actions } = this.json;
    const ordered: StoryMapJSON = { root, nodes: nodesOrdered, resources, actions } as StoryMapJSON;
    return ordered;
  }

  /** Set top-level story metaSettings inside root story node */
  setStoryMeta(title: string, description?: string, imageResourceId?: string): void {
    if (!this.json.root) return;
    const rootNode = this.json.nodes[this.json.root];
    if (!rootNode || rootNode.type !== 'story') return;
    if (!rootNode.data) rootNode.data = {} as any;
    (rootNode.data as any).metaSettings = {
      title: title,
      description: description || '',
      imageResourceId: imageResourceId
    };
  }

  /** Add converter metadata resource */
  addConverterMetadata(classicType: string, payload: Omit<import('../types/core.ts').ConverterMetadataPayload,'type'|'version'|'classicType'>): void {
    const id = this.generateResourceId();
    (this.json.resources as any)[id] = {
      type: 'converter-metadata',
      data: {
        type: 'storymap',
        version: '1.0.0',
        classicType,
        ...payload
      }
    };
  }

  private generateNodeId(): string {
    return `n-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateResourceId(): string {
    return `r-${Math.random().toString(36).slice(2, 8)}`;
  }

  /* Detached node factories (do NOT append to a parent) */
  createTextNode(text: string, blockType: 'paragraph' | 'h2' | 'h3' | 'h4' | 'quote' | 'bullet-list', size: 'wide' | 'standard' = 'wide'): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'text', data: { text, type: blockType }, config: { size } } as StoryMapNode;
    return id;
  }

  // Rich HTML text node (preserves inline markup/styles)
  createRichTextNode(html: string, blockType: 'paragraph' | 'h2' | 'h3' | 'h4' | 'quote' | 'bullet-list', size: 'wide' | 'standard' = 'wide'): string {
    const id = this.generateNodeId();
    // Flag preserveHtml so downstream renderer can differentiate
    this.json.nodes[id] = { type: 'text', data: { text: html, type: blockType, preserveHtml: true }, config: { size } } as any;
    return id;
  }

  createImageNode(imageResourceId: string, caption?: string, alt?: string, size: 'wide' | 'standard' = 'wide'): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'image', data: { image: imageResourceId, caption, alt }, config: { size } } as any;
    return id;
  }

  createWebMapNode(webMapResourceId: string, caption?: string): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'webmap', data: { map: webMapResourceId, caption } } as any;
    return id;
  }

  createVideoNode(videoResourceId: string, caption?: string, alt?: string): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'video', data: { video: videoResourceId, caption, alt } } as any;
    return id;
  }

  createEmbedNode(url: string, caption?: string, title?: string, description?: string, alt?: string): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = {
      type: 'embed',
      data: {
        url,
        embedType: 'link',
        title,
        description,
        caption,
        alt: alt || '',
        isEmbedSupported: true,
        display: 'inline',
        embedSrc: url
      }
    } as any;
    return id;
  }

  /** Add a new slide (immersive-slide) to an existing sidecar immersive node. */
  addSlideToSidecar(sidecarId: string, narrativeContentNodeIds: string[], mediaNodeId?: string): { slideId: string; narrativeId: string } {
    const sidecar = this.json.nodes[sidecarId];
    if (!sidecar || sidecar.type !== 'immersive') throw new Error('addSlideToSidecar: invalid sidecarId');
    const narrativeId = this.generateNodeId();
    this.json.nodes[narrativeId] = {
      type: 'immersive-narrative-panel',
      data: { panelStyle: 'themed' },
      children: [...narrativeContentNodeIds]
    } as any;
    const slideId = this.generateNodeId();
    const children = mediaNodeId ? [narrativeId, mediaNodeId] : [narrativeId];
    this.json.nodes[slideId] = { type: 'immersive-slide', data: { transition: 'fade' }, children } as any;
    if (!sidecar.children) sidecar.children = [];
    sidecar.children.push(slideId);
    return { slideId, narrativeId };
  }

  // Detached action button factory (no parent append)
  createActionButtonNode(text: string, size: 'wide' | 'standard' = 'wide'): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'action-button', data: { text }, config: { size } } as any;
    return id;
  }

  addActionButton(parentId: string, text: string, size: 'wide' | 'standard' = 'wide'): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'action-button', data: { text }, config: { size } } as any;
    this.appendChild(parentId, id);
    return id;
  }

  // Generic button (for navigate actions) detached factory
  createButtonNode(text: string, size: 'wide' | 'standard' = 'wide', link?: string): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'button', data: { text, link }, config: { size } } as any;
    return id;
  }

  setButtonLink(buttonNodeId: string, link: string): void {
    const node = this.json.nodes[buttonNodeId];
    if (node && node.type === 'button') {
      if (!node.data) node.data = {};
      (node.data as any).link = link;
    }
  }

  registerReplaceMediaAction(originActionButtonId: string, targetSlideId: string, mediaNodeId: string): void {
    if (!this.json.actions) this.json.actions = [];
    this.json.actions.push({ origin: originActionButtonId, trigger: 'ActionButton_Apply', target: targetSlideId, event: 'ImmersiveSlide_ReplaceMedia', data: { media: mediaNodeId } });
  }
}
