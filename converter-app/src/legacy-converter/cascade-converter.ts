/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cascade JSON Converter
 * Converts Cascade stories to StoryMap JSON
 * Ported from CascadeJSONConverter class in converter_json.py
 */

import type { ClassicStoryMapJSON } from '../types/storymap';
import { StoryMapJSONBuilder } from './storymap-builder';
import { createCreditsNode } from './storymap-schema';
import { 
  collectImageUrls, 
  transferImages, 
  // updateImageUrlsInJson 
} from '../api/image-transfer';
import {
  determineScaleZoomLevel,
  ensureHttpsProtocol,
  isNonEmptyString,
  extractProviderUrl,
  detectTheme
} from './utils';
import { TEXT_STYLES, ALIGNMENTS, createImageResource, createImageNode, createEmbedNode, createMapResource, createMapNode } from './storymap-schema';

export class CascadeConverter {
  private classicJson: ClassicStoryMapJSON;
  private themeId: string;
  private builder: StoryMapJSONBuilder;
  private username: string;
  private token: string;
  private targetStoryId: string;

  constructor(
    classicJson: ClassicStoryMapJSON, 
    themeId: string = 'summit',
    username: string,
    token: string,
    targetStoryId: string  
  ) {
    this.classicJson = classicJson;
    this.themeId = themeId;
    this.builder = new StoryMapJSONBuilder(themeId);
    this.username = username;
    this.token = token;
    this.targetStoryId = targetStoryId;
    detectTheme(this.classicJson, 'cascade');
  }

  /**
   * Main conversion method
   */
  async convert(): Promise<any> {
    const sections = this.classicJson.values?.sections || [];

    if (sections.length === 0) {
      throw new Error('Cascade story has no sections');
    }

    // Process each section
    for (const section of sections) {
      this.processSection(section);
    }

    // Set theme
    this.builder.setTheme(this.themeId);

    // Get the current storymap JSON
    let storymapJson = this.builder.getJson();

    // Collect image URLs 
    const imageUrls = collectImageUrls(storymapJson);

    // Transfer images and get mapping
    const transferResultsArray = await transferImages(
      imageUrls,
      this.targetStoryId,
      this.username,
      this.token
    );
    const transferResults: Record<string, string> = {};
    for (const result of transferResultsArray) {
      transferResults[result.originalUrl] = result.resourceName;
    }

    // Update resources in JSON
    storymapJson = updateImageUrlsInJson(storymapJson, transferResults);
    
    return this.builder.getJson();
  }

  /**
   * Process a section
   */
  private processSection(section: any): void {
    const sectionType = section.type;

    switch (sectionType) {
      case 'cover':
        this.processCover(section);
        break;
      case 'sequence':
        this.processSequence(section);
        break;
      case 'immersive':
        this.processImmersive(section);
        break;
      case 'title':
        this.processTitle(section);
        break;
      case 'credits':
        createCreditsNode(section);
        break;
    }
  }

  /**
   * Process cover section
   */
  private processCover(section: any): void {
    const foreground = section.foreground || {};
    const background = section.background || {};

    const title = foreground.title || 'Untitled Story';
    const subtitle = foreground.subtitle || '';

    // Handle cover image
    const coverMediaType = background.type;
    let imagePath: string | undefined;

    if (coverMediaType === 'image') {
      const imageUrl = background.image?.url;
      if (imageUrl) {
        imagePath = imageUrl; // In browser, just use URL as-is
      }
    }

    // Set cover
    this.builder.setCover(title, subtitle, '', imagePath);
  }

  /**
   * Process sequence section (narrative blocks)
   */
  private processSequence(section: any): void {
    const foreground = section.foreground || {};
    const blocks = foreground.blocks || [];

    for (const block of blocks) {
      this.processBlock(block);
    }
  }

  /**
   * Process immersive section (floating sidecar)
   */
  private processImmersive(section: any): void {
    // Create sidecar
    const { sidecarId, slideId: initialSlideId, narrativeId: initialNarrativeId } =
      this.builder.addSidecar('floating-panel');

    const views = section.views || [];
    let titleAdded = false;

    for (const view of views) {
      // Process background media
      const mediaNodeId = this.processImmersiveBackground(view);

      // Process foreground content
      const narrativeIds: string[] = [];

      // Add title (once)
      if (!titleAdded) {
        const title = view.foreground?.title?.value || '';
        if (title) {
          // Use detached node for immersive narrative content
          const titleId = this.builder.addTextDetached(title, 'h2', 'start');
          narrativeIds.push(titleId);
          titleAdded = true;
        }
      }

      // Process panels
      const panels = view.foreground?.panels || [];
      for (const panel of panels) {
        const blocks = panel.blocks || [];
        for (const block of blocks) {
          const nodeIds = this.processBlock(block, true);
          narrativeIds.push(...nodeIds);
        }
      }

      // Add slide
      this.builder.addSlideToSidecar(sidecarId, mediaNodeId, narrativeIds);
    }

    // Remove initial empty slide
    if (views.length > 0) {
      const storymap = this.builder.getJson();
      const sidecarNode = storymap.nodes[sidecarId];
      if (sidecarNode.children) {
        const index = sidecarNode.children.indexOf(initialSlideId);
        if (index !== -1) {
          sidecarNode.children.splice(index, 1);
        }
      }
      delete storymap.nodes[initialSlideId];
      delete storymap.nodes[initialNarrativeId];
    }
  }

  /**
   * Process immersive view background media
   */
  private processImmersiveBackground(view: any): string | undefined {
    const background = view.background || {};
    const mediaType = background.type;

    if (mediaType === 'image') {
      const url = background.image?.url || '';

      // Create detached node for sidecar media
      const resource = createImageResource(url);
      const resourceId = this.builder.addResource(resource);
      const node = createImageNode(resourceId);
      return this.builder.createDetachedNode(node);
    } else if (mediaType === 'video' || mediaType === 'webpage') {
      const mediaData = background[mediaType] || {};
      let url = mediaData.url || '';
      url = ensureHttpsProtocol(url);
      const embedlyType = mediaType === 'video' ? 'video' : 'link';

      const caption = mediaData.caption;
      const alt = mediaData.altText;
      const title = mediaData.title;
      const description = mediaData.description;
      const providerUrl = extractProviderUrl(url);

      // Create detached node for sidecar media
      const node = createEmbedNode(
        url,
        embedlyType,
        'inline',
        caption,
        alt,
        title,
        description,
        undefined,
        providerUrl
      );
      return this.builder.createDetachedNode(node);
    } else if (mediaType === 'webmap') {
      const webmapData = background.webmap || {};
      return this.createDetachedMapNode(webmapData, 'Web Map');
    } else if (mediaType === 'webscene') {
      const websceneData = background.webscene || {};
      return this.createDetachedMapNode(websceneData, 'Web Scene');
    }

    return undefined;
  }

  /**
   * Create a detached map node
   */
  private createDetachedMapNode(mapData: any, mapType: string): string {
    const mapId = mapData.id;
    const extent = mapData.extent;
    const layers = mapData.layers || [];

    // Calculate viewpoint for webmaps
    let viewpoint;
    let zoom;
    if (extent && mapType === 'Web Map') {
      const result = determineScaleZoomLevel(extent);
      if (result) {
        viewpoint = {
          targetGeometry: extent,
          scale: result.scale
        };
        zoom = result.zoom;
      }
    }

    // Build layer visibility
    let mapLayers;
    if (layers.length > 0) {
      mapLayers = layers.map((layer: any) => ({
        id: layer.id,
        visible: layer.visibility !== undefined ? layer.visibility : false
      }));
    }

    // Create resource
    const resource = createMapResource(mapId, mapType);
    const resourceId = this.builder.addResource(resource);

    // Create detached node
    const node = createMapNode(resourceId, extent, viewpoint, zoom, mapLayers);
    return this.builder.createDetachedNode(node);
  }

  /**
   * Process title section
   */
  private processTitle(section: any): void {
    const foreground = section.foreground || {};
    const background = section.background || {};

    const title = foreground.title || '';

    // Add title text
    if (title) {
      this.builder.addText(title, 'h2', 'center');
    }

    // Add image if present
    if (background.type === 'image') {
      const imageUrl = background.image?.url;
      if (imageUrl) {
        this.builder.addImage(imageUrl, undefined, undefined, 'float');
      }
    } else {
      // Add separator
      this.builder.addSeparator();
    }
  }

  /**
   * Process credits section (currently disabled)
   */
//  private processCredits(_section: any): void {
//    // Credits functionality is disabled due to API limitations
//    return;
//  }

  /**
   * Process a content block
   */
  private processBlock(block: any, returnContentIds: boolean = false): string[] {
    const blockType = block.type;

    switch (blockType) {
      case 'text':
        return this.processTextBlock(block, returnContentIds);
      case 'image':
        return this.processImageBlock(block, returnContentIds);
      case 'video':
        return this.processVideoBlock(block, returnContentIds);
      case 'webpage':
        return this.processWebpageBlock(block, returnContentIds);
      case 'webmap':
        return this.processWebmapBlock(block, returnContentIds);
      case 'webscene':
        return this.processWebsceneBlock(block, returnContentIds);
      case 'image-gallery':
        return this.processGalleryBlock(block, returnContentIds);
      default:
        return [];
    }
  }

  /**
   * Process text block
   */
  private processTextBlock(block: any, returnIdOnly: boolean = false): string[] {
    const textData = block.text || {};
    const htmlText = textData.value || '';

    if (!htmlText) {
      return [];
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const outermostTag = doc.body.firstElementChild;

    if (!outermostTag) {
      return [];
    }

    // Determine style
    const tagName = outermostTag.tagName.toLowerCase();
    const style = TEXT_STYLES[tagName] || 'paragraph';

    // Determine alignment
    let alignment = 'center';
    if (tagName === 'p') {
      const styleAttr = outermostTag.getAttribute('style') || '';
      if (styleAttr) {
        const alignMatch = styleAttr.match(/text-align:\s*([^;]+)/);
        if (alignMatch) {
          const alignValue = alignMatch[1].trim();
          alignment = ALIGNMENTS[alignValue] || 'start';
        } else {
          alignment = 'start';
        }
      } else {
        alignment = 'start';
      }
    }

    // Clean text
    // Remove color spans
    const spans = outermostTag.querySelectorAll('span');
    spans.forEach((span) => {
      const spanStyle = span.getAttribute('style') || '';
      if (spanStyle.includes('color')) {
        const parent = span.parentNode;
        while (span.firstChild) {
          parent?.insertBefore(span.firstChild, span);
        }
        parent?.removeChild(span);
      }
    });

    // Replace br with newlines
    const brs = outermostTag.querySelectorAll('br');
    brs.forEach((br) => {
      br.replaceWith('\n');
    });

    // Remove style attribute
    outermostTag.removeAttribute('style');

    // Normalize tags (b -> strong, i -> em)
    const bTags = outermostTag.querySelectorAll('b');
    bTags.forEach((b) => {
      const strong = doc.createElement('strong');
      while (b.firstChild) {
        strong.appendChild(b.firstChild);
      }
      b.replaceWith(strong);
    });

    const iTags = outermostTag.querySelectorAll('i');
    iTags.forEach((i) => {
      const em = doc.createElement('em');
      while (i.firstChild) {
        em.appendChild(i.firstChild);
      }
      i.replaceWith(em);
    });

    // Get text content
    let textContent: string;
    if (tagName === 'p') {
      // Unwrap p tag
      textContent = outermostTag.innerHTML;
    } else {
      textContent = outermostTag.outerHTML;
    }

    if (isNonEmptyString(textContent)) {
      // Use detached node for immersive narrative content
      const nodeId = returnIdOnly
        ? this.builder.addTextDetached(textContent, style, alignment)
        : this.builder.addText(textContent, style, alignment);
      return returnIdOnly ? [nodeId] : [];
    }

    return [];
  }

  /**
   * Process image block
   */
  private processImageBlock(block: any, returnIdOnly: boolean = false): string[] {
    const imageData = block.image || {};
    const url = imageData.url || '';
    const caption = imageData.caption;
    const alt = imageData.altText;

    if (url) {
      if (caption) {
        // Remove quotes from caption
        const cleanCaption = caption.replace(/"/g, '');
        // Use detached node for immersive narrative content
        const nodeId = returnIdOnly
          ? this.builder.addImageDetached(url, cleanCaption, alt)
          : this.builder.addImage(url, cleanCaption, alt);
        return returnIdOnly ? [nodeId] : [];
      } else {
        // Use detached node for immersive narrative content
        const nodeId = returnIdOnly
          ? this.builder.addImageDetached(url, undefined, alt)
          : this.builder.addImage(url, undefined, alt);
        return returnIdOnly ? [nodeId] : [];
      }
    }

    return [];
  }

  /**
   * Process video block
   */
  private processVideoBlock(block: any, returnIdOnly: boolean = false): string[] {
    const videoData = block.video || {};
    const url = ensureHttpsProtocol(videoData.url || '');
    const caption = videoData.caption;
    const alt = videoData.altText;
    const title = videoData.title;
    const description = videoData.description;
    const providerUrl = extractProviderUrl(url);

    // Use detached node for immersive narrative content
    const nodeId = returnIdOnly
      ? this.builder.addEmbedDetached(
        url,
        'video',
        'inline',
        caption,
        alt,
        title,
        description,
        undefined,
        providerUrl
      )
      : this.builder.addEmbed(
        url,
        'video',
        'inline',
        caption,
        alt,
        title,
        description,
        undefined,
        providerUrl
      );
    return returnIdOnly ? [nodeId] : [];
  }

  /**
   * Process webpage block
   */
  private processWebpageBlock(block: any, returnIdOnly: boolean = false): string[] {
    const webpageData = block.webpage || {};
    const url = ensureHttpsProtocol(webpageData.url || '');
    const caption = webpageData.caption;
    const alt = webpageData.altText;
    const title = webpageData.title;
    const description = webpageData.description;
    const providerUrl = extractProviderUrl(url);

    // Use detached node for immersive narrative content
    const nodeId = returnIdOnly
      ? this.builder.addEmbedDetached(
        url,
        'link',
        'card',
        caption,
        alt,
        title,
        description,
        undefined,
        providerUrl
      )
      : this.builder.addEmbed(
        url,
        'link',
        'card',
        caption,
        alt,
        title,
        description,
        undefined,
        providerUrl
      );
    return returnIdOnly ? [nodeId] : [];
  }

  /**
   * Process webmap block
   */
  private processWebmapBlock(block: any, returnIdOnly: boolean = false): string[] {
    const webmapData = block.webmap || {};
    const nodeId = returnIdOnly
      ? this.createDetachedMapNode(webmapData, 'Web Map')
      : this.createMapNode(webmapData, 'Web Map');
    return returnIdOnly ? [nodeId] : [];
  }

  /**
   * Process webscene block
   */
  private processWebsceneBlock(block: any, returnIdOnly: boolean = false): string[] {
    const websceneData = block.webscene || {};
    const nodeId = returnIdOnly
      ? this.createDetachedMapNode(websceneData, 'webscene')
      : this.createMapNode(websceneData, 'webscene');
    return returnIdOnly ? [nodeId] : [];
  }

  /**
   * Create a map node (adds to story root)
   */
  private createMapNode(mapData: any, mapType: string): string {
    const mapId = mapData.id;
    const extent = mapData.extent;
    const layers = mapData.layers || [];

    // Calculate viewpoint for webmaps
    let viewpoint;
    let zoom;
    if (extent && mapType === 'Web Map') {
      const result = determineScaleZoomLevel(extent);
      if (result) {
        viewpoint = {
          targetGeometry: extent,
          scale: result.scale
        };
        zoom = result.zoom;
      }
    }

    // Build layer visibility
    let mapLayers;
    if (layers.length > 0) {
      mapLayers = layers.map((layer: any) => ({
        id: layer.id,
        visible: layer.visibility !== undefined ? layer.visibility : false
      }));
    }

    const { nodeId } = this.builder.addMap(
      mapId,
      extent,
      viewpoint,
      zoom,
      mapLayers,
      mapType
    );

    return nodeId;
  }

  /**
   * Process image gallery block
   */
  private processGalleryBlock(block: any, returnIdOnly: boolean = false): string[] {
    const galleryData = block['image-gallery'] || {};
    const images = galleryData.images || [];
    const caption = galleryData.caption;
    const alt = galleryData.altText;

    // Process all images
    const imagePaths: string[] = [];
    for (const image of images) {
      const url = image.url || '';
      if (url) {
        imagePaths.push(url);
      }
    }

    if (imagePaths.length > 0) {
      // Use detached node for immersive narrative content
      const nodeId = returnIdOnly
        ? this.builder.addGalleryDetached(imagePaths, caption, alt, 'square-dynamic')
        : this.builder.addGallery(imagePaths, caption, alt, 'square-dynamic');
      return returnIdOnly ? [nodeId] : [];
    }

    return [];
  }

  /**
   * Get list of local images for cleanup
   */
  getLocalImages(): string[] {
    return this.builder.getLocalImages();
  }
}

