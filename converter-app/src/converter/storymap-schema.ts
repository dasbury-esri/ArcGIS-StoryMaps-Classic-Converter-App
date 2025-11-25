/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * StoryMap JSON schema utilities
 * Node and resource creators following official ArcGIS StoryMap schema
 * Ported from storymap_json_schema.py
 */

import type {
  StoryMapJSON,
  StoryMapNode,
  StoryMapResource,
  Extent,
  Viewpoint,
  MapLayer
} from '../types/storymap';
import { generateNodeId, generateResourceId } from './utils.ts';

// Standard themes
export const STANDARD_THEMES = [
  'summit',
  'obsidian',
  'mesa',
  'ridgeline',
  'tidal',
  'slate'
];

// Text style mappings
export const TEXT_STYLES: Record<string, string> = {
  h1: 'h2',
  h2: 'h3',
  h3: 'h4',
  p: 'paragraph',
  blockquote: 'quote'
};

// Alignment mappings
export const ALIGNMENTS: Record<string, string> = {
  left: 'start',
  center: 'center',
  right: 'end'
};

// Embed type mappings
export const EMBEDLY_TYPES: Record<string, string> = {
  video: 'video',
  webpage: 'link'
};

/**
 * Create base StoryMap JSON structure
 * Matches Python storymap_json_schema.py output exactly
 */
export function createBaseStorymapJson(): any {
  const rootId = generateNodeId();
  const coverId = generateNodeId();
  const navId = generateNodeId();
  const creditsId = generateNodeId();
  const themeId = generateResourceId();

  return {
    root: rootId,
    nodes: {
      [coverId]: {
        type: 'storycover',  // NOT 'cover'
        data: {
          type: 'minimal',
          title: '',
          summary: '',
          byline: '',
          titlePanelVerticalPosition: 'top',
          titlePanelHorizontalPosition: 'start',
          titlePanelStyle: 'gradient'
        }
      },
      [navId]: {
        type: 'navigation',
        data: {
          links: []
        },
        config: {
          isHidden: true
        }
      },
      [creditsId]: {
        type: 'credits',
        children: []
      },
      [rootId]: {
        type: 'story',
        data: {
          storyTheme: themeId
        },
        config: {
          coverDate: ''
        },
        children: [coverId, navId, creditsId]
      }
    },
    resources: {
      [themeId]: {
        type: 'story-theme',
        data: {
          themeId: 'summit',
          themeBaseVariableOverrides: {}
        }
      }
    }
  };
}

/**
 * Create a credits node with three children: heading, paragraph, attribution
 */
export function createCreditsNode(
  heading: string = '',
  paragraph: string = '',
  attribution: string = ''
): { creditsId: string; childIds: string[]; nodes: Record<string, any> } {
  const creditsId = generateNodeId();
  const headingId = generateNodeId();
  const paragraphId = generateNodeId();
  const attributionId = generateNodeId();

  const nodes: Record<string, any> = {
    [headingId]: {
      type: 'text',
      data: {
        text: heading,
        type: 'h4',
        textAlignment: 'start'
      },
      config: { size: 'wide' }
    },
    [paragraphId]: {
      type: 'text',
      data: {
        text: paragraph,
        type: 'paragraph',
        textAlignment: 'start'
      },
      config: { size: 'wide' }
    },
    [attributionId]: {
      type: 'attribution',
      data: {
        content: '',
        attribution: attribution
      }
    },
    [creditsId]: {
      type: 'credits',
      children: [headingId, paragraphId, attributionId]
    }
  };

  return { creditsId, childIds: [headingId, paragraphId, attributionId], nodes };
}

/**
 * Create a text node
 */
export function createTextNode(
  text: string,
  style: string = 'paragraph',
  alignment: string = 'start'
): StoryMapNode {
  return {
    type: 'text',
    data: {
      type: style,
      text: text,
      textAlignment: alignment
    },
    config: {
      size: 'wide'
    }
  };
}

/**
 * Create an image node
 * Matches Python schema exactly
 */
export function createImageNode(
  resourceId: string,
  caption?: string,
  alt?: string,
  display: string = 'standard',
  floatAlignment: string = 'start'
): any {
  const node: any = {
    type: 'image',
    data: {
      image: resourceId
    },
    config: {
      size: display
    }
  };

  if (display === 'float') {
    node.config.floatAlignment = floatAlignment;
  }

  if (caption && caption.trim()) {
    node.data.caption = caption;
  }
  if (alt && alt.trim()) {
    node.data.alt = alt;
  }

  return node;
}

/**
 * Create an image resource
 * Matches Python schema exactly
 */
export function createImageResource(
  path: string,
  isItemResource: boolean = false,
  width: number = 1024,
  height: number = 1024
): any {
  if (isItemResource) {
    // For uploaded item resources - use resourceId (filename only)
    const filename = path.split('/').pop() || path;
    return {
      type: 'image',
      data: {
        resourceId: filename,
        provider: 'item-resource',
        height: height,
        width: width
      }
    };
  } else {
    // For external URLs - use url with provider: uri
    return {
      type: 'image',
      data: {
        src: path,  // External URLs use "src"
        provider: 'uri',
        height: height,
        width: width
      }
    };
  }
}

/**
 * Create a map node
 * Matches Python schema exactly
 */
export function createMapNode(
  resourceId: string,
  extent?: Extent,
  viewpoint?: Viewpoint,
  zoom?: number,
  mapLayers?: MapLayer[]
): any {
  const node: any = {
    type: 'webmap',
    config: {
      size: 'standard'
    },
    data: {
      map: resourceId
    }
  };

  if (mapLayers) {
    node.data.mapLayers = mapLayers.map(layer => ({
      id: layer.id,
      title: layer.title || '',
      visible: layer.visible !== undefined ? layer.visible : true
    }));
  }

  if (extent) {
    node.data.extent = extent;
  }
  if (viewpoint) {
    node.data.viewpoint = viewpoint;
  }
  if (zoom !== undefined) {
    node.data.zoom = zoom;
  }

  return node;
}

/**
 * Create a map resource
 */
export function createMapResource(
  itemId: string,
  itemType: string = 'Web Map'
): StoryMapResource {
  return {
    type: 'webmap',
    data: {
      type: 'minimal',
      itemId: itemId,
      itemType: itemType as string
    }
  };
}

/**
 * Create an embed node
 * Matches Python schema exactly
 */
export function createEmbedNode(
  url: string,
  embedType: string = 'video',
  display: string = 'card',
  caption?: string,
  alt?: string,
  title?: string,
  description?: string,
  thumbnailUrl?: string,
  providerUrl?: string
): any {
  const node: any = {
    type: 'embed',
    config: {
      size: 'standard'
    },
    data: {
      url: url,
      display: display,
      embedType: embedType,
      isEmbedSupported: true,
      embedSrc: url,
      allowSmallEmbeds: true
    }
  };

  if (caption) {
    node.data.caption = caption;
  }
  if (alt) {
    node.data.alt = alt;
  }
  if (title) {
    node.data.title = title;
  }
  if (description) {
    node.data.description = description;
  }
  if (thumbnailUrl) {
    node.data.thumbnailUrl = thumbnailUrl;
  }
  if (providerUrl) {
    node.data.providerUrl = providerUrl;
  }

  return node;
}

/**
 * Create a gallery node
 * Matches Python schema exactly
 */
export function createGalleryNode(
  imageNodeIds: string[],
  caption?: string,
  alt?: string,
  layout: string = 'square-dynamic'
): any {
  const node: any = {
    type: 'gallery',
    config: {
      size: 'standard'
    },
    data: {
      galleryLayout: layout  // REQUIRED by schema
    },
    children: imageNodeIds
  };

  if (caption && caption.trim()) {
    node.data.caption = caption;
  }
  if (alt && alt.trim()) {
    node.data.alt = alt;
  }

  return node;
}

/**
 * Create a separator node
 * Matches Python schema exactly
 */
export function createSeparatorNode(): any {
  return {
    type: 'separator',
    data: {}
  };
}

/**
 * Create a sidecar structure (immersive + slide + narrative panel)
 * Matches Python schema exactly
 */
export function createSidecarStructure(
  sidecarType: string = 'docked-panel'
): {
  sidecarId: string;
  slideId: string;
  narrativeId: string;
  nodes: Record<string, any>;
} {
  const sidecarId = generateNodeId();
  const slideId = generateNodeId();
  const narrativeId = generateNodeId();

  const nodes: Record<string, any> = {
    [sidecarId]: {
      type: 'immersive',
      data: {
        type: 'sidecar',
        subtype: sidecarType
      },
      children: [slideId]
    },
    [slideId]: {
      type: 'immersive-slide',
      data: {
        transition: 'fade'
      },
      children: [narrativeId]
    },
    [narrativeId]: {
      type: 'immersive-narrative-panel',
      data: {
        position: 'start',
        size: 'small',
        panelStyle: 'themed'
      },
      children: []
    }
  };

  return { sidecarId, slideId, narrativeId, nodes };
}

/**
 * Create a slide structure for adding to sidecar
 * Matches Python schema exactly
 */
export function createSlideStructure(): {
  slideId: string;
  narrativeId: string;
  nodes: Record<string, any>;
} {
  const slideId = generateNodeId();
  const narrativeId = generateNodeId();

  const nodes: Record<string, any> = {
    [slideId]: {
      type: 'immersive-slide',
      data: {
        transition: 'fade'
      },
      children: [narrativeId]
    },
    [narrativeId]: {
      type: 'immersive-narrative-panel',
      data: {
        position: 'start',
        size: 'small',
        panelStyle: 'themed'
      },
      children: []
    }
  };

  return { slideId, narrativeId, nodes };
}

/**
 * Add a child to a node
 */
export function addChildToNode(
  storymap: StoryMapJSON,
  parentId: string,
  childId: string
): void {
  if (!storymap.nodes[parentId].children) {
    storymap.nodes[parentId].children = [];
  }
  storymap.nodes[parentId].children!.push(childId);
}

/**
 * Insert a node before credits
 */
export function insertNodeBeforeCredits(
  storymap: StoryMapJSON,
  nodeId: string
): void {
  const root = storymap.nodes[storymap.root];
  if (!root.children) {
    root.children = [];
  }

  // Find credits node
  const creditsIndex = root.children.findIndex(
    (id) => storymap.nodes[id]?.type === 'credits'
  );

  if (creditsIndex !== -1) {
    // Insert before credits
    root.children.splice(creditsIndex, 0, nodeId);
  } else {
    // No credits found, just append
    root.children.push(nodeId);
  }
}

/**
 * Set cover data
 */
export function setCoverData(
  storymap: StoryMapJSON,
  title: string,
  summary: string = '',
  byLine: string = '',
  imageResourceId?: string
): void {
  const root = storymap.nodes[storymap.root];
  const coverNodeId = root.children?.[0];

  if (coverNodeId) {
    const coverNode = storymap.nodes[coverNodeId];
    coverNode.data = {
      type: imageResourceId ? 'full' : 'minimal',
      title: title,
      summary: summary,
      byline: byLine,
      titlePanelVerticalPosition: 'top',
      titlePanelHorizontalPosition: 'start',
      titlePanelStyle: 'gradient',
    };

    if (imageResourceId) {
      coverNode.data.image = imageResourceId;
    }
  }
}

/**
 * Set theme
 */
export function setTheme(storymap: StoryMapJSON, themeId: string): void {
  // Find theme resource
  for (const [ resource ] of Object.entries(storymap.resources)) {
    if (resource.type === 'story-theme') {
      if (STANDARD_THEMES.includes(themeId)) {
        resource.data.themeId = themeId;
        delete resource.data.themeItemId;
      } else {
        resource.data.themeItemId = themeId;
        delete resource.data.themeId;
      }
      break;
    }
  }
}

/**
 * Create a tour-map geometry
 * Matches Python create_tour_map_geometry
 */
export function createTourMapGeometry(
  id: string,
  long: number,
  lat: number,
  type: string = 'POINT_NUMBERED_TOUR',
  scale?: number,
  viewpoint?: any
): any {
  const geometry: any = {
    id,
    type,
    nodes: [
      { long, lat }
    ]
  };
  if (scale !== undefined) geometry.scale = scale;
  if (viewpoint !== undefined) geometry.viewpoint = viewpoint;
  return geometry;
}

/**
 * Create a tour-map node
 * Matches Python create_tour_map_node
 */
export function createTourMapNode(
  geometries: Record<string, any>,
  mode: string = '2d',
  basemapType: string = 'name',
  basemapValue: string = 'worldImagery',
  alt?: string
): any {
  const node: any = {
    type: 'tour-map',
    data: {
      geometries,
      mode,
      basemap: {
        type: basemapType,
        value: basemapValue
      }
    }
  };
  if (alt) node.data.alt = alt;
  return node;
}

/**
 * Create a carousel node
 * Matches Python create_carousel_node
 */
export function createCarouselNode(children: any[]): any {
  return {
    type: 'carousel',
    children: children.slice(0, 5) // up to 5 images
  };
}

/**
 * Create a tour node
 * Matches Python create_tour_node
 */
export function createTourNode(
  places: any[],
  mapNodeId: string,
  accentColor: string,
  narrativePanelPosition: string = 'start',
  narrativePanelSize: string,
  tourType: string,
  subtype: string
): any {
  return {
    type: 'tour',
    data: {
      type: tourType,
      subtype,
      narrativePanelPosition,
      map: mapNodeId,
      places,
      narrativePanelSize,
      accentColor
    }
  };
}
/**
 * Create a single place node for a tour
 * Matches Python create_tour_place
 */
export function createTourPlace(
  id: string,
  featureId: string,
  contents: string[],
  media: string,
  title: string,
  visible: boolean = true
): any {
  if (!media || !title) throw new Error('Media and title are required for a tour place');
  const place: any = {
    id,
    featureId,
    contents,
    media,
    title
  };
  if (!visible) place.config = { isHidden: true };
  return place;
}
