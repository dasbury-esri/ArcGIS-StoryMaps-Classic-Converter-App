/**
 * DEPRECATED: This legacy Map Journal converter is retained for reference only.
 * New conversions should use `src/converters/MapJournalConverter`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Journal JSON Converter
 * Converts Map Journal to StoryMap JSON
 * Ported from JournalSeriesJSONConverter class in converter_json.py
 */

import type { ClassicStoryMapJSON, ClassicSection } from '../types/storymap';
import { StoryMapJSONBuilder } from './storymap-builder';
import { 
  collectImageUrls, 
  transferImages, 
  // updateImageUrlsInJson,
  updateImageResourcesInJson,
  collectClassicJournalImageUrls
} from '../api/image-transfer';
import {
  determineScaleZoomLevel,
  ensureHttpsProtocol,
  removeSpanTags,
  isNonEmptyString,
  extractProviderUrl,
  detectTheme
} from './utils';
import { EMBEDLY_TYPES } from './storymap-schema';
console.log("[MapJournalConverter] File loaded");
export class MapJournalConverter {
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
    console.log("[MapJournalConverter] Constructor called");    
    this.classicJson = classicJson;
    this.themeId = themeId;
    this.builder = new StoryMapJSONBuilder(themeId);
    this.username = username;
    this.token = token;
    this.targetStoryId = targetStoryId;
    detectTheme(this.classicJson, 'mapjournal');
  }

  /**
  * Main conversion method
  */
  async convert(username: string, token: string, targetStoryId: string): Promise<any>{
    console.log("[MapJournalConverter] Entering convert()")
    // Get title
    const coverTitle = this.classicJson.values?.title || 'Untitled Story';

    // Create sidecar
    const { sidecarId, slideId: initialSlideId, narrativeId: initialNarrativeId } =
      this.builder.addSidecar('docked-panel');
    // Sidecar data fields
    (this.builder.getJson().nodes[sidecarId].data.narrativePanelPosition = 'start');
    (this.builder.getJson().nodes[sidecarId].data.narrativePanelSize = 'small');

    // Get sections
    const sections =
      (this.classicJson.values?.story?.sections as ClassicSection[]) || [];

    const hasSections = sections.length > 0;
    console.log("[MapJournalConverter] # of Journal sections", sections.length)
    // Process each section as a slide
    for (const section of sections) {
      await this.processSection(section, sidecarId);
    }

    // Remove initial empty slide produced by addSidecar if we added real slides
    if (hasSections) {
      const storymap = this.builder.getJson();
      const sidecarNode = storymap.nodes[sidecarId];
      const idx = sidecarNode.children.indexOf(initialSlideId);
      if (idx > -1) sidecarNode.children.splice(idx, 1);

      // if (sidecarNode.children) {
      //   const index = sidecarNode.children.indexOf(initialSlideId);
      //   if (index !== -1) {
      //     sidecarNode.children.splice(index, 1);
      //   }
      // }
      delete storymap.nodes[initialSlideId];
      delete storymap.nodes[initialNarrativeId];
    }

    // Set cover
    this.builder.setCover(`${coverTitle}`);
        console.log("[MapJournalConverter] Cover set")
    // Set theme
    this.builder.setTheme(this.themeId);
    console.log("[MapJournalConverter] Theme set")
    // Image transfer 
    // Get the current storymap JSON
    let storymapJson = this.builder.getJson();
    console.log("[MapJournalConverter] Beginning image transfer")
    // Collect image URLs from classic JSON
    const imageUrls = collectClassicJournalImageUrls(this.classicJson);
    console.log("[MapJournalConverter] imageUrls:", imageUrls)
    // Transfer images and get mapping
    const transferResults: Record<string, string> = {};
    if (imageUrls.length > 0 && this.token && this.token !== this.username) {
      const transfers = await transferImages(
        imageUrls,
        this.targetStoryId,
        this.username,
        this.token
      );
      transfers.forEach(t => (transferResults[t.originalUrl] = t.resourceName));
      console.log("[MapJournalConverter] Transfer complete")
      console.log("[MapJournalConverter] Transfer results", transferResults)
      storymapJson = updateImageResourcesInJson(storymapJson, transferResults);
    }
    return storymapJson;
  }

  /**
   * Process a single section as a sidecar slide
   */
  private async processSection(section: ClassicSection, sidecarId: string): Promise<void> {
    // Get media
    const mediaNodeId = this.processSectionMedia(section);
    // Get narrative content
    const narrativeContentIds = await this.buildNarrative(section);
    // Add slide to sidecar
    this.builder.addSlideToSidecar(sidecarId, mediaNodeId, narrativeContentIds);
  }

/**
   * Build ordered narrative: title first, then parsed elements
   */
  private async buildNarrative(section: ClassicSection): Promise<string[]> {
    const out: string[] = [];
    const titleText = section.title || '';
    if (titleText) {
      const cleanedTitle = titleText.replace(/&nbsp;/g, '').trim();
      if (isNonEmptyString(cleanedTitle)) {
        const titleId = this.builder.addTextDetached(cleanedTitle, 'h2', 'start', true);
        out.push(titleId);
      }
    }
    // if (titleHtml) {
    //   const titleText = parseHtmlText(titleHtml).trim();
    //   if (titleText) {
    //     const titleId = this.builder.addTextDetached(titleText, 'h3', 'start', true);
    //     out.push(titleId);
    //   }
    // }

    const raw = section.content || '';
    if (!raw) return out;

    // Parse HTML; do NOT inject whole raw content separately (avoid duplicates)
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'text/html');

    for (const el of Array.from(doc.body.children)) {
      const ids = await this.extractElementNodes(el);
      out.push(...ids);
    }
    return out;
  }

  /**
   * Map a single HTML element to detached nodes (wide by default)
   */
  private async extractElementNodes(element: Element): Promise<string[]> {
    const ids: string[] = [];

    // FIGURE (possibly nested)
    if (element.tagName === 'FIGURE') {
      // If this figure contains another figure, process the deepest one only
      const inner = element.querySelector('figure figure');
      if (inner) {
        return this.extractElementNodes(inner);
      }
      const img = element.querySelector('img');
      if (img) {
        const url = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || undefined;
        const captionEl = element.querySelector('figcaption');
        let caption: string | undefined;
        if (captionEl) {
          const rawCaption = captionEl.innerHTML.replace(/&nbsp;/g, ' ').trim();
          if (rawCaption.length > 0) caption = rawCaption;
        }
        ids.push(await this.builder.addImageDetached(url, caption, alt, 'wide'));
      }
      return ids;
    }

    // Skip standalone figcaption (handled in figure)
    if (element.tagName === 'FIGCAPTION') {
      return ids;
    }

    // IMG alone
    if (element.tagName === 'IMG') {
      const url = element.getAttribute('src') || '';
      const alt = element.getAttribute('alt') || undefined;
      ids.push(await this.builder.addImageDetached(url, undefined, alt, 'wide'));
      return ids;
    }

    // Paragraph
    if (element.tagName === 'P') {
      // Inline images
      for (const img of element.querySelectorAll('img')) {
        const url = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || undefined;
        ids.push(await this.builder.addImageDetached(url, undefined, alt, 'wide'));
      };
      let html = removeSpanTags(element.innerHTML);
      if (/^(\s|&nbsp;|<br\s*\/?>)*$/i.test(html)) return ids; // empty
      html = html.replace(/&nbsp;/g, ' ').trim();
      if (isNonEmptyString(html)) {
        ids.push(this.builder.addTextDetached(html, 'paragraph', 'start', true));
      }
      return ids;
    }

    // Containers that just wrap images/figures/captions
    if (element.classList.contains('image-container') || element.classList.contains('caption')) {
      for (const child of Array.from(element.children)) {
        const childIds = await this.extractElementNodes(child);
        ids.push(...childIds);
      }
      return ids;
    }

    // Iframe/embed container
    if (element.classList.contains('iframe-container')) {
      const iframe = element.querySelector('iframe');
      if (iframe) {
        let url = (iframe.getAttribute('src') || '').trim().replace(/\/$/, '');
        url = ensureHttpsProtocol(url);
        const embedlyType = element.classList.contains('mj-video-by-url') ? 'video' : 'link';
        const display = embedlyType === 'video' ? 'inline' : 'card';
        const providerUrl = extractProviderUrl(url);
        ids.push(
          this.builder.addEmbedDetached(
            url,
            embedlyType,
            display,
            undefined,
            undefined,
            iframe.getAttribute('title') || undefined,
            undefined,
            undefined,
            providerUrl,
            true
          )
        );
      }
      return ids;
    }

    // Generic DIV (avoid double-processing figures/images already handled)
    if (element.tagName === 'DIV') {
      // If it only wraps figures/images, recurse children
      if (
        element.querySelector('figure') &&
        !element.textContent?.trim().replace(/\u00a0/g, '')
      ) {
        for (const child of Array.from(element.children)) {
          const childIds = await this.extractElementNodes(child);
          ids.push(...childIds);
        }
        return ids;
      }
      let html = removeSpanTags(element.innerHTML);
      if (!/^(\s|&nbsp;|<br\s*\/?>)*$/i.test(html)) {
        html = html.replace(/&nbsp;/g, ' ').trim();
        if (isNonEmptyString(html)) {
          ids.push(this.builder.addTextDetached(html, 'paragraph', 'start', true));
        }
      }
      return ids;
    }

    return ids;
  }

  /**
   * Process section media (map, image, video, webpage)
   */
  private processSectionMedia(section: ClassicSection): string | undefined {
    const media = section.media;
    if (!media) return undefined;

    const mediaType = media.type;

    if (mediaType === 'webmap') {
      return this.processWebmapMedia(media);
    } else if (mediaType === 'image') {
      return this.processImageMedia(media);
    } else if (mediaType === 'video' || mediaType === 'webpage') {
      return this.processEmbedMedia(media, mediaType);
    }

    return undefined;
  }

  /**
   * Process webmap media
   */
  private processWebmapMedia(media: any): string | undefined {
    const webmapData = media.webmap;
    if (!webmapData) return undefined;

    const mapId = webmapData.id;
    const extent = webmapData.extent;
    const layers = webmapData.layers || [];

    // Calculate viewpoint
    let viewpoint;
    let zoom;
    if (extent) {
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
        visible: layer.visibility !== undefined ? layer.visibility : true
      }));
    }

    // Add map as detached node for sidecar (don't add to story root)
    const { nodeId } = this.builder.addMapDetached(
      mapId,
      extent,
      viewpoint,
      zoom,
      mapLayers,
      'Web Map'
    );

    return nodeId;
  }

  /**
   * Process image media
   */
  private async processImageMedia(media: any): Promise<string[]> {
    const imageData = media.image;
    if (!imageData) return undefined;

    const url = imageData.url || '';
    const alt = imageData.altText || undefined;
    const caption = imageData.caption || undefined;

    // In browser, we can't download cross-origin images, so just pass URL
    // Add as detached node for sidecar (don't add to story root)
    const nodeId = await this.builder.addImageDetached(url, caption, alt);

    return nodeId;
  }

  /**
   * Process video/webpage embed media
   */
  private processEmbedMedia(media: any, mediaType: string): string | undefined {
    const embedData = media[mediaType];
    if (!embedData) return undefined;

    let url = embedData.url || '';

    // Get iframe URL if available
    if (embedData.frameTag) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(embedData.frameTag, 'text/html');
      const iframe = doc.querySelector('iframe');
      if (iframe?.src) {
        url = iframe.src;
      }
    }

    // Ensure https
    url = ensureHttpsProtocol(url.trim().replace(/\/$/, ''));

    // Determine embed type
    const embedlyType = EMBEDLY_TYPES[mediaType] || 'link';

    // Extract metadata
    const alt = embedData.altText;
    const title = embedData.title;
    const description = embedData.description;
    const caption = embedData.caption;
    const providerUrl = extractProviderUrl(url);

    // Add embed as detached node for sidecar (don't add to story root)
    const nodeId = this.builder.addEmbedDetached(
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

    return nodeId;
  }

  // /**
  //  * Process narrative content for a section
  //  */
  // private processNarrativeContent(section: ClassicSection): string[] {
  //   const contentIds: string[] = [];

  //   // Add title
  //   const title = section.title || '';
  //   if (title) {
  //     const titleText = parseHtmlText(title);
  //     if (titleText.trim()) {
  //       // Use detached node for sidecar narrative content
  //       const titleId = this.builder.addTextDetached(titleText, 'h2', 'start');
  //       contentIds.push(titleId);
  //     }
  //   }

  //   // Get content
  //   const content =
  //     this.classicType === 'journal'
  //       ? section.content || ''
  //       : section.description || '';

  //   if (!content) {
  //     return contentIds;
  //   }

  //   // Always add a paragraph node for the raw content (even if not HTML)
  //   const cleanedContent = removeSpanTags(content);
  //   if (isNonEmptyString(cleanedContent)) {
  //     const paragraphId = this.builder.addTextDetached(cleanedContent, 'paragraph', 'start');
  //     contentIds.push(paragraphId);
  //   }
  //   // Parse HTML content
  //   const parser = new DOMParser();
  //   const doc = parser.parseFromString(content, 'text/html');

  //   for (const element of Array.from(doc.body.children)) {
  //     try {
  //       const nodeIds = this.processContentElement(element);
  //       contentIds.push(...nodeIds);
  //     } catch (ex) {
  //       console.error('Error processing content element:', ex);
  //     }
  //   }

  //   return contentIds;
  // }

  // /**
  //  * Process a single content element
  //  */
  // private processContentElement(element: Element): string[] {
  //   const nodeIds: string[] = [];

  //   // Handle images
  //   if (element.tagName === 'IMG') {
  //     const url = element.getAttribute('src') || '';
  //     const alt = element.getAttribute('alt') || undefined;
  //     // Use detached node for sidecar narrative content
  //     const nodeId = this.builder.addImageDetached(url, undefined, alt, 'wide');
  //     nodeIds.push(nodeId);
  //   }
  //   // Handle paragraphs
  //   else if (element.tagName === 'P') {
  //     // Check for images in paragraph
  //     const images = element.querySelectorAll('img');
  //     images.forEach((img) => {
  //       const url = img.getAttribute('src') || '';
  //       const alt = img.getAttribute('alt') || undefined;
  //       // Use detached node for sidecar narrative content
  //       const nodeId = this.builder.addImageDetached(url, undefined, alt, 'wide');
  //       nodeIds.push(nodeId);
  //     });

  //     // Get text content (use innerHTML to avoid the outer <p> tag)
  //     const text = element.innerHTML;
  //     if (text && text.length > 0) {
  //       const cleanedText = removeSpanTags(text);
  //       if (isNonEmptyString(cleanedText)) {
  //         // Use detached node for sidecar narrative content
  //         const nodeId = this.builder.addTextDetached(cleanedText, 'paragraph', 'start');
  //         nodeIds.push(nodeId);
  //       }
  //     }
  //   }
  //   // Handle elements with classes (check this BEFORE generic divs)
  //   else if (element.classList.length > 0) {
  //     if (
  //       element.classList.contains('caption') ||
  //       element.classList.contains('image-container')
  //     ) {
  //       // Process all direct children of the container
  //       // This handles cases where the container has both text and images
  //       const children = Array.from(element.children);
  //       for (const child of children) {
  //         const childNodeIds = this.processContentElement(child);
  //         nodeIds.push(...childNodeIds);
  //       }
  //     } else if (element.classList.contains('iframe-container')) {
  //       const iframe = element.querySelector('iframe');
  //       if (iframe) {
  //         let url = (iframe.getAttribute('src') || '').trim().replace(/\/$/, '');
  //         url = ensureHttpsProtocol(url);

  //         // Determine type
  //         const embedlyType = element.classList.contains('mj-video-by-url')
  //           ? 'video'
  //           : 'link';
  //         const display = element.classList.contains('mj-video-by-url')
  //           ? 'inline'
  //           : 'card';

  //         const title = iframe.getAttribute('title') || undefined;
  //         const providerUrl = extractProviderUrl(url);

  //         // Use detached node for sidecar narrative content
  //         const nodeId = this.builder.addEmbedDetached(
  //           url,
  //           embedlyType,
  //           display,
  //           undefined,
  //           undefined,
  //           title,
  //           undefined,
  //           undefined,
  //           providerUrl
  //         );
  //         nodeIds.push(nodeId);
  //       }
  //     }
  //   }
  //   // Handle generic divs (after checking for specific classes)
  //   else if (element.tagName === 'DIV') {
  //     const text = element.innerHTML;
  //     const cleanedText = removeSpanTags(text);
  //     if (isNonEmptyString(cleanedText)) {
  //       // Use detached node for sidecar narrative content
  //       const nodeId = this.builder.addTextDetached(cleanedText, 'paragraph', 'start');
  //       nodeIds.push(nodeId);
  //     }
  //   }

  //   return nodeIds;
  // }

  /**
   * Get list of local images for cleanup
   */
  getLocalImages(): string[] {
    return this.builder.getLocalImages();
  }
}

