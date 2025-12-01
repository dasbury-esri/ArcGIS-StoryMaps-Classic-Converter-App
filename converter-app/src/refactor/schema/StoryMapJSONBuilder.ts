import type { StoryMapJSON, StoryMapNode, StoryMapImageNode, StoryMapVideoNode, StoryMapWebMapNode, StoryMapResource, ConverterMetadataPayload, TourGeometry, TourPlace } from '../types/core.ts';

// Extended story node to allow metaSettings without using any
interface ExtendedStoryMapStoryNode {
  type: 'story';
  data: {
    storyTheme: string;
    coverDate?: string;
    metaSettings?: { title: string; description: string; imageResourceId?: string };
  };
  children?: string[];
  config?: { coverDate?: string };
}


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
      if (theme.type === 'story-theme') {
        theme.data.themeId = input.themeId;
        if (input.variableOverrides && Object.keys(input.variableOverrides).length) {
          theme.data.themeBaseVariableOverrides = input.variableOverrides;
        }
      }
    }
  }

  addImageResource(originalUrl: string, width?: number, height?: number): string {
    const id = this.generateResourceId();
    this.json.resources[id] = {
      type: 'image',
      data: { src: originalUrl, provider: 'uri', width, height }
    } as unknown as StoryMapResource;
    return id;
  }

  finalizeImageResourceAsItem(resourceId: string, itemFilename: string, width?: number, height?: number): void {
    const res = this.json.resources[resourceId];
    if (!res || res.type !== 'image') return;
    delete res.data.src;
    res.data.resourceId = itemFilename;
    res.data.provider = 'item-resource';
    if (width) res.data.width = width;
    if (height) res.data.height = height;
  }

  addVideoResource(originalUrl: string, provider: 'uri' | 'youtube' | 'vimeo' = 'uri', resourceId?: string): string {
    const id = resourceId ?? this.generateResourceId();
    this.json.resources[id] = {
      type: 'video',
      data: { src: originalUrl, provider }
    } as unknown as StoryMapResource;
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
    } as unknown as StoryMapResource;
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

  addWebMapResource(itemId: string, itemType: 'Web Map' | 'Web Scene' = 'Web Map', initialState?: {
    extent?: { xmin: number; ymin: number; xmax: number; ymax: number; spatialReference?: Record<string, unknown> };
    mapLayers?: Array<{ id: string; title: string; visible: boolean }>;
    overview?: { enable: boolean; openByDefault: boolean };
    legend?: { enable: boolean; openByDefault: boolean };
    geocoder?: { enable: boolean };
    popup?: unknown;
  }, variant: 'minimal' | 'default' = 'minimal'): string {
    const id = this.generateResourceId();
    const data: { type: typeof variant; itemId: string; itemType: 'Web Map' | 'Web Scene'; initialState?: { extent?: unknown; mapLayers?: Array<{ id: string; title: string; visible: boolean }>; overview?: { enable: boolean; openByDefault: boolean }; legend?: { enable: boolean; openByDefault: boolean }; geocoder?: { enable: boolean }; popup?: unknown } } = { type: variant, itemId, itemType };
    if (initialState && (
      initialState.extent || initialState.mapLayers || initialState.overview || initialState.legend || initialState.geocoder || initialState.popup
    )) {
      data.initialState = { ...initialState };
    }
    this.json.resources[id] = { type: 'webmap', data } as unknown as StoryMapResource;
    return id;
  }

  addWebMapNode(parentId: string, webMapResourceId: string, caption?: string): string {
    const id = this.generateNodeId();
    const node: StoryMapWebMapNode = {
      type: 'webmap',
      data: { map: webMapResourceId, caption }
    } as unknown as StoryMapNode;
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
    this.json.nodes[id] = { type: 'navigation', data: { links: [] }, config: { isHidden: true } } as unknown as StoryMapNode;
    if (this.json.root) this.appendChild(this.json.root, id);
    return id;
  }

  addCreditsNode(): string {
    const creditsId = this.generateNodeId();
    // Create minimal attribution + optional placeholder text blocks to mirror working sample shape.
    const attributionId = this.generateNodeId();
    this.json.nodes[attributionId] = { type: 'attribution', data: { content: '', attribution: '' } } as unknown as StoryMapNode;
    // Two optional empty paragraph text nodes (builder tolerates empty content; include alignment)
    const emptyText1 = this.generateNodeId();
    this.json.nodes[emptyText1] = { type: 'text', data: { text: '', type: 'paragraph', textAlignment: 'start' }, config: { size: 'wide' } } as StoryMapNode;
    const emptyText2 = this.generateNodeId();
    this.json.nodes[emptyText2] = { type: 'text', data: { text: '', type: 'paragraph', textAlignment: 'start' }, config: { size: 'wide' } } as StoryMapNode;
    this.json.nodes[creditsId] = { type: 'credits', children: [emptyText1, emptyText2, attributionId] } as unknown as StoryMapNode;
    if (this.json.root) this.appendChild(this.json.root, creditsId);
    return creditsId;
  }

  addSidecar(subtype: 'docked-panel' | 'floating-panel' = 'docked-panel', narrativePanelPosition: 'start' | 'end' = 'end', narrativePanelSize: 'small' | 'medium' | 'large' = 'medium'): { immersiveId: string; slideId: string; narrativeId: string } {
    const immersiveId = this.generateNodeId();
    const slideId = this.generateNodeId();
    const narrativeId = this.generateNodeId();
    this.json.nodes[immersiveId] = {
      type: 'immersive',
      data: { type: 'sidecar', subtype, narrativePanelPosition, narrativePanelSize },
      children: [slideId]
    } as unknown as StoryMapNode;
    this.json.nodes[slideId] = { type: 'immersive-slide', data: { transition: 'fade' }, children: [narrativeId] } as unknown as StoryMapNode;
    this.json.nodes[narrativeId] = { type: 'immersive-narrative-panel', data: { panelStyle: 'themed' }, children: [] } as unknown as StoryMapNode;
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
    // Normalization pass: enforce schema expectations
    for (const node of Object.values(this.json.nodes)) {
      if (!node) continue;
      if (node.type === 'webmap') {
        if (!node.config) node.config = { size: 'standard' };
        else if (!('size' in node.config)) (node.config as { size?: string }).size = 'standard';
        if (node.data && 'scale' in node.data) {
          delete (node.data as { scale?: unknown }).scale;
        }
      } else if (node.type === 'text') {
        if (node.data && !('textAlignment' in node.data)) {
          (node.data as { textAlignment?: string }).textAlignment = 'start';
        }
      }
    }
    // Remove metaSettings from root story node (handled later in reporting)
    if (this.json.root) {
      const rootNode = this.json.nodes[this.json.root];
      if (rootNode?.type === 'story' && rootNode.data && 'metaSettings' in (rootNode.data as Record<string, unknown>)) {
        delete (rootNode.data as ExtendedStoryMapStoryNode['data']).metaSettings;
      }
    }
    // Reorder nodes so root story node is last for downstream consumers expecting that ordering
    const nodesOrdered: Record<string, StoryMapNode> = {};
    for (const [id, node] of Object.entries(this.json.nodes)) {
      if (id === this.json.root) continue;
      nodesOrdered[id] = node;
    }
    if (this.json.root) nodesOrdered[this.json.root] = this.json.nodes[this.json.root];
    const { root, resources, actions } = this.json;
    return { root, nodes: nodesOrdered, resources, actions } as StoryMapJSON;
  }

  /** Mutate an existing node's data object (real underlying JSON, not ordered copy) */
  updateNodeData(nodeId: string, mutate: (data: Record<string, unknown>, node: StoryMapNode) => void): void {
    const node = this.json.nodes[nodeId];
    if (!node) return;
    if (!node.data) node.data = {};
    mutate(node.data as Record<string, unknown>, node);
  }

  /** Generic node mutator (full node object) */
  updateNode(nodeId: string, mutate: (node: StoryMapNode) => void): void {
    const node = this.json.nodes[nodeId];
    if (!node) return;
    mutate(node as StoryMapNode);
  }

  /** Remove a node and detach it from any parent children arrays */
  removeNode(nodeId: string): void {
    const nodes = this.json.nodes;
    if (!nodes || !nodes[nodeId]) return;
    for (const n of Object.values(nodes)) {
      if (n?.children && Array.isArray(n.children)) {
        const idx = n.children.indexOf(nodeId);
        if (idx > -1) n.children.splice(idx, 1);
      }
    }
    delete nodes[nodeId];
  }

  /** Set top-level story metaSettings inside root story node */
  setStoryMeta(title: string, description?: string, imageResourceId?: string): void {
    if (!this.json.root) return;
    const rootNode = this.json.nodes[this.json.root];
    if (!rootNode || rootNode.type !== 'story') return;
    if (!rootNode.data) rootNode.data = {};
    (rootNode as ExtendedStoryMapStoryNode).data.metaSettings = {
      title: title,
      description: description || '',
      imageResourceId: imageResourceId
    };
  }

  /** Add converter metadata resource */
  addConverterMetadata(classicType: string, payload: Omit<import('../types/core.ts').ConverterMetadataPayload,'type'|'version'|'classicType'>): void {
    const id = this.generateResourceId();
    const resource: { type: 'converter-metadata'; data: ConverterMetadataPayload } = {
      type: 'converter-metadata',
      data: { type: 'storymap', version: '1.0.0', classicType, ...payload }
    };
    this.json.resources[id] = resource as unknown as StoryMapResource;
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
    this.json.nodes[id] = { type: 'text', data: { text, type: blockType, textAlignment: 'start' }, config: { size } } as StoryMapNode;
    return id;
  }

  // Rich HTML text node (preserves inline markup/styles)
  createRichTextNode(html: string, blockType: 'paragraph' | 'h2' | 'h3' | 'h4' | 'quote' | 'bullet-list', size: 'wide' | 'standard' = 'wide'): string {
    const id = this.generateNodeId();
    // Flag preserveHtml so downstream renderer can differentiate
    this.json.nodes[id] = { type: 'text', data: { text: html, type: blockType, preserveHtml: true, textAlignment: 'start' }, config: { size } } as unknown as StoryMapNode;
    return id;
  }

  createImageNode(imageResourceId: string, caption?: string, alt?: string, size: 'wide' | 'standard' = 'wide'): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'image', data: { image: imageResourceId, caption, alt }, config: { size } } as unknown as StoryMapNode;
    return id;
  }

  createWebMapNode(webMapResourceId: string, caption?: string): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'webmap', data: { map: webMapResourceId, caption }, config: { size: 'standard' } } as unknown as StoryMapNode;
    return id;
  }

  createVideoNode(videoResourceId: string, caption?: string, alt?: string): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'video', data: { video: videoResourceId, caption, alt } } as unknown as StoryMapNode;
    return id;
  }

  // Video embed (external provider) node factory
  createVideoEmbedNode(url: string, provider: 'youtube' | 'vimeo' | 'unknown', videoId?: string, caption?: string, title?: string, description?: string, alt?: string, aspectRatio: string = '16:9'): string {
    const id = this.generateNodeId();
    // Derive embedSrc based on provider when possible
    let embedSrc = url;
    if (provider === 'youtube' && videoId) {
      embedSrc = `https://www.youtube.com/embed/${videoId}`;
    } else if (provider === 'vimeo' && videoId) {
      embedSrc = `https://player.vimeo.com/video/${videoId}`;
    }
    this.json.nodes[id] = {
      type: 'embed',
      data: {
        url,
        embedSrc,
        embedType: 'video',
        provider,
        videoId,
        title: title || undefined,
        description: description || undefined,
        caption: caption || undefined,
        alt: alt || '',
        isEmbedSupported: true,
        display: 'inline',
        aspectRatio
      }
    } as unknown as StoryMapNode;
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
    } as unknown as StoryMapNode;
    return id;
  }

  /** Create swipe node referencing two content node IDs (usually webmap nodes). */
  createSwipeNode(contentAId: string, contentBId: string, viewPlacement: 'extent' | 'center' = 'extent', caption?: string): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = {
      type: 'swipe',
      data: {
        contents: { '0': contentAId, '1': contentBId },
        viewPlacement,
        caption: caption
      },
      config: { size: 'full' }
    } as unknown as StoryMapNode;
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
    } as unknown as StoryMapNode;
    const slideId = this.generateNodeId();
    const children = mediaNodeId ? [narrativeId, mediaNodeId] : [narrativeId];
    this.json.nodes[slideId] = { type: 'immersive-slide', data: { transition: 'fade' }, children } as unknown as StoryMapNode;
    if (!sidecar.children) sidecar.children = [];
    sidecar.children.push(slideId);
    return { slideId, narrativeId };
  }

  // Detached action button factory (no parent append)
  createActionButtonNode(text: string, size: 'wide' | 'standard' = 'wide'): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'action-button', data: { text }, config: { size } } as unknown as StoryMapNode;
    return id;
  }

  addActionButton(parentId: string, text: string, size: 'wide' | 'standard' = 'wide'): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'action-button', data: { text }, config: { size } } as unknown as StoryMapNode;
    this.appendChild(parentId, id);
    return id;
  }

  // Generic button (for navigate actions) detached factory
  createButtonNode(text: string, size: 'wide' | 'standard' = 'wide', link?: string): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'button', data: { text, link }, config: { size } } as unknown as StoryMapNode;
    return id;
  }

  setButtonLink(buttonNodeId: string, link: string): void {
    const node = this.json.nodes[buttonNodeId];
    if (node && node.type === 'button') {
      if (!node.data) node.data = {};
      (node.data as { link?: string }).link = link;
    }
  }

  /** Public child append helper (exposes internal appendChild for converters) */
  addChild(parentId: string, childId: string): void {
    this.appendChild(parentId, childId);
  }

  /** Convenience getter for story root id */
  getStoryRootId(): string {
    return this.json.root;
  }

  /** Public ID factory for converters that need standalone ids */
  newNodeId(): string {
    return this.generateNodeId();
  }

  /** Create tour-map node (optionally referencing a webmap resource) */
  createTourMapNode(
    geometries: Record<string, TourGeometry>,
    webmapId?: string,
    mode: '2d' | '3d' = '2d'
  ): string {
    const id = this.generateNodeId();
    const basemap: Record<string, unknown> = { type: 'name', value: 'worldImagery' };
    if (webmapId) {
      const resId = this.addWebMapResource(webmapId, 'Web Map', {}, 'minimal');
      basemap.type = 'resource';
      basemap.value = resId;
    }
    this.json.nodes[id] = {
      type: 'tour-map',
      data: { geometries, mode, basemap }
    } as StoryMapNode;
    return id;
  }

  /** Create carousel node (limits to first 5 images to avoid overflow) */
  createCarouselNode(imageNodeIds: string[]): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = { type: 'carousel', children: imageNodeIds.slice(0, 5) } as StoryMapNode;
    return id;
  }

  /** Create tour node (Map Tour refactor) */
  createTourNode(
    places: TourPlace[],
    tourMapNodeId: string,
    accentColor: string,
    placardPosition: 'start' | 'end' = 'start',
    narrativePanelSize: 'small' | 'medium' | 'large' = 'large',
    tourType: 'guided-tour' | 'explorer' = 'guided-tour',
    subtype: 'media-focused' | 'map-focused' | 'grid' = 'map-focused'
  ): string {
    const id = this.generateNodeId();
    this.json.nodes[id] = {
      type: 'tour',
      data: {
        type: tourType,
        subtype,
        narrativePanelPosition: placardPosition,
        map: tourMapNodeId,
        places,
        narrativePanelSize,
        accentColor
      }
    } as StoryMapNode;
    return id;
  }

  registerReplaceMediaAction(originActionButtonId: string, targetSlideId: string, mediaNodeId: string): void {
    if (!this.json.actions) this.json.actions = [];
    this.json.actions.push({ origin: originActionButtonId, trigger: 'ActionButton_Apply', target: targetSlideId, event: 'ImmersiveSlide_ReplaceMedia', data: { media: mediaNodeId } });
  }
}
