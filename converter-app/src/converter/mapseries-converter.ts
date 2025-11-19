/* eslint-disable @typescript-eslint/no-explicit-any */

// export class MapSeriesConverter {
//   private classicJson: ClassicStoryMapJSON;
//   private themeId: string;
//   private builder: StoryMapJSONBuilder;
//   private classicType: 'series';

//   constructor(classicJson: ClassicStoryMapJSON, themeId: string = 'summit') {
//     this.classicJson = classicJson;
//     this.themeId = themeId;
//     this.builder = new StoryMapJSONBuilder(themeId);
//     this.classicType = this.detectType();
//   }

  // Need to replicate the python notebook workflow in typescript
  // Convert Classic Esri Story Map Map Series to ArcGIS StoryMap Collection via AGO Juypter Notebook.ipynb

import type { ClassicStoryMapJSON, ClassicSection } from '../types/storymap';
import { StoryMapJSONBuilder } from './storymap-builder';
import { parseHtmlText, ensureHttpsProtocol } from './utils';
import { createTextNode, createImageNode, createEmbedNode, createMapNode } from './storymap-schema';

export class MapSeriesConverter {
  private classicJson: ClassicStoryMapJSON;
  private themeId: string;

  constructor(classicJson: ClassicStoryMapJSON, themeId: string = 'summit') {
    this.classicJson = classicJson;
    this.themeId = themeId;
  }

  /**
   * Converts each entry/tab to a separate StoryMap JSON object.
   * Returns an array of StoryMap JSONs and a collection object.
   */
  convert(): { storymaps: any[]; collection: any } {
    const values = this.classicJson.values || {};
    const entries: ClassicSection[] = values.story?.entries || [];
    const title = values.title || 'Untitled Story';
    const subtitle = values.subtitle || '';

    // Theme mapping (Python: determine_theme)
    const themeGroup = values.settings?.theme?.colors?.group;
    const mappedTheme = themeGroup === 'dark' ? 'obsidian' : 'summit';

    // Convert each entry/tab to its own StoryMap
    const storymaps = entries.map((entry, idx) => {
      const builder = new StoryMapJSONBuilder(mappedTheme);

      // Suppress cover (hide/minimize)
      builder.setCover(`(CONVERSION) ${entry.title || title} [${idx + 1}]`, subtitle, '', undefined, { isHidden: true });

      // Parse side panel HTML for narrative
      const descriptionHtml = entry.description || entry.content || '';
      const narrativeText = parseHtmlText(descriptionHtml);
      const narrativeNodeId = builder.addTextDetached(narrativeText, 'paragraph', 'start');

      // Convert main stage media
      let mediaNodeId: string | undefined;
      if (entry.media) {
        mediaNodeId = this.processMedia(entry.media, builder);
      }

      // Add slide/sidecar node (Python: sidecar.add_slide)
      builder.addSlideToSidecar(mediaNodeId, [narrativeNodeId]);

      // Set theme
      builder.setTheme(mappedTheme);

      // Return StoryMap JSON
      return builder.getJson();
    });

    // Create a collection object referencing all new StoryMaps
    const collection = {
      title: `(CONVERSION) ${title}`,
      description: subtitle,
      theme: mappedTheme,
      items: storymaps.map((sm, idx) => ({
        title: sm.rootTitle || `Entry ${idx + 1}`,
        id: sm.root, // or use a generated/published item ID
      })),
    };

    return { storymaps, collection };
  }

  /**
   * Convert main stage media to StoryMap node
   * Python: convert_mainstage
   */
  private async processMedia(media: any, builder: StoryMapJSONBuilder): string | undefined {
    const mediaType = media.type;
    if (mediaType === 'image' && media.image?.url) {
      const url = ensureHttpsProtocol(media.image.url);
      return await builder.addImageDetached(url, media.image.caption, media.image.alt, 'wide');
    } else if (mediaType === 'webmap' && media.webmap?.id) {
      const mapId = media.webmap.id;
      const extent = media.webmap.extent;
      const layers = media.webmap.layers || [];
      return builder.addMapDetached(mapId, extent, undefined, undefined, layers, 'webmap').nodeId;
    } else if (mediaType === 'webpage' && media.webpage?.url) {
      const url = ensureHttpsProtocol(media.webpage.url);
      return builder.addEmbedDetached(url, 'link', 'inline', media.webpage.caption, media.webpage.alt, media.webpage.title, media.webpage.description, undefined, undefined);
    }
    return undefined;
  }
}
