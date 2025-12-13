/* eslint-disable @typescript-eslint/no-explicit-any */


/**
 * StoryMap JSON Builder
 * Builds StoryMap JSON structure without using the Python API
 * Ported from StoryMapJSONBuilder class in converter_json.py
 */

// import type {
//   StoryMapNode,
//   StoryMapResource,
//   Extent,
//   Viewpoint,
//   MapLayer
// } from '../types/storymap';
// import {
//   createBaseStorymapJson,
//   createTextNode,
//   createImageNode,
//   createImageResource,
//   createMapNode,
//   createMapResource,
//   createEmbedNode,
//   createGalleryNode,
//   createSeparatorNode,
//   createSidecarStructure,
//   addChildToNode,
//   insertNodeBeforeCredits,
//   setCoverData,
//   setTheme
// } from './storymap-schema.ts';
// import { generateNodeId, generateResourceId, getImageDimensions } from './utils.ts';

class StoryMapJSONBuilder {
  private storymap: any;
  /**
   * Public getter for storymap property
   */
  getStorymap(): any {
    return this.storymap;
  }
  public localImages: string[] = [];

  constructor(_themeId: string = 'summit') {
    this.storymap = createBaseStorymapJson();
  }

  /**
   * Get the complete StoryMap JSON
   */
  getJson(): any {
    return this.storymap;
  }

  /**
   * Add a node to the story
   */
  addNode(node: StoryMapNode, parentId?: string): string {
    const nodeId = generateNodeId();
    this.storymap.nodes[nodeId] = node;

    if (parentId) {
      addChildToNode(this.storymap, parentId, nodeId);
    } else {
      // Add to story root before credits
      insertNodeBeforeCredits(this.storymap, nodeId);
    }

    return nodeId;
  }

  /**
   * Create a detached node (not added to any parent)
   * Useful for sidecar media
   */
  createDetachedNode(node: StoryMapNode): string {
    const nodeId = generateNodeId();
    this.storymap.nodes[nodeId] = node;
    return nodeId;
  }

  /**
   * Create a detached narrative panel (used when manually assembling slides)
   */
  private createNarrativePanelDetached(): string {
    const id = generateNodeId();
    this.storymap.nodes[id] = {
      type: 'immersive-narrative-panel',
      data: {
        panelStyle: 'themed'
      },
      children: []
    };
    return id;
  }

  /**
   * Add a text node (detached) with optional wide config
   */
  addTextDetached(
    text: string,
    style: string = 'paragraph',
    alignment: string = 'start',
    wide: boolean = true
  ): string {
    const node = createTextNode(text, style, alignment);
    const id = this.createDetachedNode(node);
    if (wide) {
      this.storymap.nodes[id].config = { size: 'wide' };
    }
    return id;
  }

  // /**
  //  * Add an image node (detached) with optional wide config
  //  */
  // addImageDetached(
  //   url: string,
  //   caption?: string,
  //   alt?: string,
  //   display: 'standard' | 'wide' = 'wide'
  // ): string {
  //   const res = createImageResource(url);
  //   const resId = this.addResource(res);
  //   const node = createImageNode(resId, caption, alt, display);
  //   const id = this.createDetachedNode(node);
  //   if (display === 'wide') {
  //     this.storymap.nodes[id].config = { size: 'wide' };
  //   }
  //   return id;
  // }

  /**
   * Add an image node (detached) with actual image dimensions
   */
  async addImageDetached(
    url: string,
    caption?: string,
    alt?: string,
    display: 'standard' | 'wide' = 'wide'
  ): Promise<string> {
    let width = 1024, height = 1024;
    console.log('[addImageDetached] Checking image dimensions for:', url);
    try {
      const dims = await getImageDimensions(url);
      console.log('[addImageDetached] getImageDimensions returned:', dims);
      width = dims.width;
      height = dims.height;
      // If dimensions are zero, try to extract from filename
      if (!width || !height) {
        const match = url.match(/__w(\d+)\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)$/i);
        if (match) {
          width = parseInt(match[1], 10);
          height = width;
          console.log('[addImageDetached] Fallback to filename width:', width);        
        }
      } else {
        console.log('[addImageDetached] No width found in filename, using default 1024');
      }
    } catch (err) {
    console.warn('[addImageDetached] Could not get image dimensions for', url, err);
      // Try to extract from filename as fallback
      const match = url.match(/__w(\d+)\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)$/i);
      if (match) {
        width = parseInt(match[1], 10);
        height = width;
        console.log('[addImageDetached] Fallback to filename width in catch:', width);
      } else {
      console.log('[addImageDetached] No width found in filename in catch, using default 1024');
      }
    }
    console.log('[addImageDetached] Final width/height for', url, width, height);
    const res = createImageResource(url, true, width, height);
    const resId = this.addResource(res);
    const node = createImageNode(resId, caption, alt, display);
    const id = this.createDetachedNode(node);
    if (display === 'wide') {
      this.storymap.nodes[id].config = { size: 'wide' };
    }
    return id;
  }

  /**
   * Add a slide to existing sidecar (narrative first, media second)
   * children: [narrativePanelId, mediaNodeId]
   */
  addSlideToSidecar(
    sidecarId: string,
    mediaNodeId?: string,
    narrativeContentIds?: string[]
  ): { slideId: string; narrativeId: string } {
    if (!this.storymap.nodes[sidecarId]) {
      throw new Error('Invalid sidecarId');
    }
    // Create narrative panel, attach content
    const narrativeId = this.createNarrativePanelDetached();
    if (narrativeContentIds && narrativeContentIds.length) {
      this.storymap.nodes[narrativeId].children = narrativeContentIds;
    }
    // Create slide
    const slideId = generateNodeId();
    this.storymap.nodes[slideId] = {
      type: 'immersive-slide',
      data: {
        transition: 'fade'
      },
      children: mediaNodeId ? [narrativeId, mediaNodeId] : [narrativeId]
    };
    // Append slide to sidecar
    this.storymap.nodes[sidecarId].children.push(slideId);
    return { slideId, narrativeId };
  }

  /**
   * Add a resource to the story
   */
  addResource(resource: StoryMapResource): string {
    const resourceId = generateResourceId();
    this.storymap.resources[resourceId] = resource;
    return resourceId;
  }

  /**
   * Add a text node
   */
  addText(
    text: string,
    style: string = 'paragraph',
    alignment: string = 'start',
    parentId?: string
  ): string {
    const node = createTextNode(text, style, alignment);
    return this.addNode(node, parentId);
  }

  /**
   * Add an image node with resource
   */
  addImage(
    imagePath: string,
    caption?: string,
    alt?: string,
    display: string = 'standard',
    floatAlignment: string = 'start',
    parentId?: string,
    isItemResource: boolean = false
  ): string {
    // Create resource
    const resource = createImageResource(imagePath, isItemResource);
    const resourceId = this.addResource(resource);

    // Create node
    const node = createImageNode(resourceId, caption, alt, display, floatAlignment);
    return this.addNode(node, parentId);
  }

  /**
   * Add a map node with resource
   */
  addMap(
    mapItemId: string,
    extent?: Extent,
    viewpoint?: Viewpoint,
    zoom?: number,
    mapLayers?: MapLayer[],
    itemType: string = 'Web Map',
    parentId?: string
  ): { nodeId: string; resourceId: string } {
    // Create resource
    const resource = createMapResource(mapItemId, itemType);
    const resourceId = this.addResource(resource);

    // Create node
    const node = createMapNode(resourceId, extent, viewpoint, zoom, mapLayers);
    const nodeId = this.addNode(node, parentId);

    return { nodeId, resourceId };
  }

  /**
   * Add an embed node
   */
  addEmbed(
    url: string,
    embedType: string = 'video',
    display: string = 'card',
    caption?: string,
    alt?: string,
    title?: string,
    description?: string,
    thumbnailUrl?: string,
    providerUrl?: string,
    parentId?: string
  ): string {
    const node = createEmbedNode(
      url,
      embedType,
      display,
      caption,
      alt,
      title,
      description,
      thumbnailUrl,
      providerUrl
    );
    return this.addNode(node, parentId);
  }

  /**
   * Add a detached embed node (not added to story root, useful for sidecars)
   */
  addEmbedDetached(
    url: string,
    embedType: string = 'video',
    display: string = 'card',
    caption?: string,
    alt?: string,
    title?: string,
    description?: string,
    thumbnailUrl?: string,
    providerUrl?: string
  ): string {
    const node = createEmbedNode(
      url,
      embedType,
      display,
      caption,
      alt,
      title,
      description,
      thumbnailUrl,
      providerUrl
    );
    return this.createDetachedNode(node);
  }

  /**
   * Add a detached map node (not added to story root, useful for sidecars)
   */
  addMapDetached(
    mapItemId: string,
    extent?: Extent,
    viewpoint?: Viewpoint,
    zoom?: number,
    mapLayers?: MapLayer[],
    itemType: string = 'Web Map'
  ): { nodeId: string; resourceId: string } {
    // Create resource
    const resource = createMapResource(mapItemId, itemType);
    const resourceId = this.addResource(resource);

    // Create node
    const node = createMapNode(resourceId, extent, viewpoint, zoom, mapLayers);
    const nodeId = this.createDetachedNode(node);

    return { nodeId, resourceId };
  }

  /**
   * Add a gallery node with image nodes
   */
  addGallery(
    imagePaths: string[],
    caption?: string,
    alt?: string,
    layout: string = 'square-dynamic',
    parentId?: string,
    isItemResource: boolean = false
  ): string {
    // Create image nodes for each image
    const imageNodeIds: string[] = [];
    for (const imagePath of imagePaths) {
      const nodeId = this.addImage(imagePath, undefined, undefined, 'standard', 'start', undefined, isItemResource);
      imageNodeIds.push(nodeId);
    }

    // Create gallery node
    const node = createGalleryNode(imageNodeIds, caption, alt, layout);
    return this.addNode(node, parentId);
  }

  /**
   * Add a detached gallery node (not added to story root, useful for sidecars)
   */
  async addGalleryDetached(
    imagePaths: string[],
    caption?: string,
    alt?: string,
    layout: string = 'square-dynamic',
    isItemResource: boolean = false
  ): string {
    // Create detached image nodes for each image
    const imageNodeIds: string[] = [];
    for (const imagePath of imagePaths) {
      const nodeId = await this.addImageDetached(imagePath, undefined, undefined, 'standard', 'start', isItemResource);
      imageNodeIds.push(nodeId);
    }

    // Create gallery node
    const node = createGalleryNode(imageNodeIds, caption, alt, layout);
    return this.createDetachedNode(node);
  }

  /**
   * Add a separator node
   */
  addSeparator(parentId?: string): string {
    const node = createSeparatorNode();
    return this.addNode(node, parentId);
  }

  /**
   * Add a sidecar structure
   */
  addSidecar(sidecarType: string = 'docked-panel'): {
    sidecarId: string;
    slideId: string;
    narrativeId: string;
  } {
    const { sidecarId, slideId, narrativeId, nodes } = createSidecarStructure(sidecarType);

    // Add all nodes
    Object.assign(this.storymap.nodes, nodes);

    // Insert sidecar before credits
    insertNodeBeforeCredits(this.storymap, sidecarId);

    return { sidecarId, slideId, narrativeId };
  }

  /**
   * Set cover information
   */
  setCover(
    title: string,
    summary: string = '',
    byLine: string = '',
    imagePath?: string
  ): void {
    let imageResourceId: string | undefined;

    if (imagePath) {
      const resource = createImageResource(imagePath);
      imageResourceId = this.addResource(resource);
    }

    setCoverData(this.storymap, title, summary, byLine, imageResourceId);
  }

  /**
   * Set story theme
   */
  setTheme(themeId: string): void {
    setTheme(this.storymap, themeId);
  }

  /**
   * Get list of locally downloaded images for cleanup
   */
  getLocalImages(): string[] {
    return this.localImages;
  }
}

