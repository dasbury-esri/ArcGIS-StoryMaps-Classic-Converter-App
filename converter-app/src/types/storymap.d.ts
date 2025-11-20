/* eslint-disable @typescript-eslint/no-explicit-any */

export { ClassicStoryMapJSON } from '../../types/storymap';
/**
 * TypeScript interfaces for ArcGIS StoryMap JSON structures
 * Based on official ArcGIS StoryMaps schema
 */

export interface StoryMapJSON {
  type: 'storymap';
  version: string;
  root: string;
  nodes: Record<string, StoryMapNode>;
  resources: Record<string, StoryMapResource>;
}

export interface StoryMapNode {
  type: string;
  data?: Record<string, any>;
  config?: Record<string, any>;
  children?: string[];
}

export interface StoryMapResource {
  type: string;
  data: Record<string, any>;
}

// Specific node types
export interface TextNode extends StoryMapNode {
  type: 'text';
  data: {
    type: 'h2' | 'h3' | 'h4' | 'paragraph' | 'quote';
    text: string;
    textAlignment?: 'start' | 'center' | 'end';
  };
}

export interface ImageNode extends StoryMapNode {
  type: 'image';
  data: {
    image: string; // resource ID
    alt?: string;
    caption?: string;
  };
  config: {
    size: 'small' | 'medium' | 'large' | 'full-width' | 'float';
    display?: 'standard' | 'float' | 'wide';
    floatAlignment?: 'start' | 'center' | 'end';
  };
}

export interface MapNode extends StoryMapNode {
  type: 'webmap';
  data: {
    map: string; // resource ID
    extent?: Extent;
    viewpoint?: Viewpoint;
    zoom?: number;
    mapLayers?: MapLayer[];
    caption?: string;
    alt?: string;
  };
}

export interface EmbedNode extends StoryMapNode {
  type: 'embed';
  data: {
    url: string;
    embedType: 'video' | 'link' | 'rich';
    display?: 'card' | 'inline';
    isEmbedSupported?: boolean;
    allowSmallEmbeds?: boolean;
    embedSrc?: string;
    caption?: string;
    alt?: string;
    title?: string;
    description?: string;
    thumbnailUrl?: string;
    providerUrl?: string;
  };
}

export interface GalleryNode extends StoryMapNode {
  type: 'gallery';
  data: {
    caption?: string;
    alt?: string;
  };
  config: {
    galleryLayout: 'square-dynamic' | 'horizontal-scroll' | 'grid';
  };
  children: string[]; // image node IDs
}

export interface SidecarNode extends StoryMapNode {
  type: 'immersive';
  data: {
    type: 'sidecar';
    subtype: 'docked-panel' | 'floating-panel';
  };
  children: string[]; // slide IDs
}

export interface SlideNode extends StoryMapNode {
  type: 'immersive-slide';
  data: {
    transition?: 'fade' | 'slide';
  };
  children: string[]; // [narrative panel ID, media node ID]
}

export interface NarrativePanelNode extends StoryMapNode {
  type: 'immersive-narrative-panel';
  data: {
    panelStyle?: 'themed' | 'custom';
  };
  children: string[]; // content node IDs
}

// Resources
export interface ImageResource extends StoryMapResource {
  type: 'image';
  data: {
    type: 'image';
    resourceId?: string;
    path?: string;
    url?: string;
  };
}

export interface MapResource extends StoryMapResource {
  type: 'webmap';
  data: {
    type: 'minimal';
    itemId: string;
    itemType: 'Web Map' | 'Web Scene';
  };
}

export interface ThemeResource extends StoryMapResource {
  type: 'story-theme';
  data: {
    themeId?: string;
    themeItemId?: string;
  };
}

// Supporting types
export interface Extent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference?: {
    wkid: number;
  };
}

export interface Viewpoint {
  targetGeometry: Extent;
  scale: number;
}

export interface MapLayer {
  id: string;
  title?: string;
  visible: boolean;
}

// Classic StoryMap types
// export interface ClassicStoryMapJSON {
//   values: {
//     title?: string;
//     story?: {
//       sections?: ClassicSection[];
//       entries?: ClassicSection[];
//     };
//     sections?: ClassicSection[];
//     settings?: {
//       theme?: {
//         colors?: {
//           themeMajor?: string;
//         };
//       };
//     };
//   };
// }

/**
 * Refactored version of Classic StoryMap type accounting for all templates 
 */
export interface ClassicStoryMapJSON {
  source?: string;
  folderId?: string | null;
  _ssl?: any;

  values: {
    // Common fields
    template?: string | Record<string, any>; // Map Journal uses a Record, with "name" as a subkey
    templateName?: string;
    name?: string;
    title?: string;
    subtitle?: string; 
    description?: string;
    sidePanelDescription?: string;    
    layout?: string; // Swipe ["swipe" or "spyglass"], Map Tour ["integrated", "three-panel", "side-panel"]
    colors?: string; // Map Tour, Swipe (semicolon-separated)
    webmap?: string; // Basic, Map Tour, Shortlist, Swipe
    settings?: {
      theme?: {
        colors?: Record<string, string>;
        fonts?: Record<string, any>;
        themeMajor?: string;
      };
      themeOptions?: {
        headerColor?: string; // Shortlist
      };
      layoutOptions?: Record<string, any>; // Shortlist description
      generalOptions?: Record<string, any>; // Shortlist settings
      header?: Record<string, {
        linkText?: Record<string, any>;
        linkUrl?: Record<string, any>;
        logoUrl?: Record<string, any>;
        logoTarget?: Record<string, any>;
        social?: Record<string, {
          facebook?: Record<string, any>;
          twitter?: Record<string, any>;
          bitly?: Record<string, any>;
        }>;
      }>; 
      components?: { // Crowdsource
        common: Record<string, any>;
        contribute: Record<string, any>;
        gallery: Record<string, any>;
        header: Record<string, any>;
        intro: Record<string, any>;
        map: {
          crowdsourceLayer: {
            id: string;
          };
          webmap: string;
        };
        shareDisplay: Record<string, any>;
      };
      layout?: Record<string, any>; // Crowdsource
    };

    // Map Tour
    order?: Array<{ id: string | number; visible?: boolean }>; // Map Tour
    firstRecordAsIntro?: bool; // Use media for cover image

    // Map Journal or Map Series
    story?: {
      sections?: any[];
      entries?: any[];
    };

    // Map Series (some versions)
    series?: any[];

    // Cascade
    sections?: any[];

    // Older versions don't have a "settings" key
    headerLinkText?: Record<string, any>;
    headerLinkURL?: Record<string, any>;
    logoURL?: Record<string, any>;
    logoTarget?: Record<string, any>;
    social?: Record<string, {
      facebook?: Record<string, any>;
      twitter?: Record<string, any>;
      bitly?: Record<string, any>;
    }>;

    // Shortlist (sometimes an object keyed by tab index, sometimes an array
    tabs?: Record<string, {
      title?: string;
      id?: number | string;
      color?: string;
      extent?: any;
    }> | Array<{
      title?: string;
      id?: number | string;
      color?: string;
      extent?: any;
    }>;
    shortlistLayerId?: Record<string, any>;

    // Swipe
    dataModel?: string; // "TWO_WEBMAPS" or "TWO_LAYERS" for Swipe
    webmaps?: any[]; // same as "webmap" above if "TWO_LAYERS" 
    layers?: any[]; // don't remember what this is for exactly
    popupColors?: string[];
    series?: any[] // need to find an example of this

    // Basic
    [key: string]: any; // Allow for unknown fields in basic and future templates
  };
}


export interface ClassicSection {
  title?: string;
  content?: string;
  description?: string;
  media?: {
    type: string;
    webmap?: ClassicWebMap;
    image?: ClassicMedia;
    video?: ClassicMedia;
    webpage?: ClassicMedia;
  };
  foreground?: any;
  background?: any;
  views?: any[];
  type?: string;
}

export interface ClassicWebMap {
  id: string;
  extent?: Extent;
  layers?: ClassicLayer[];
}

export interface ClassicLayer {
  id: string;
  title?: string;
  visibility: boolean;
}

export interface ClassicMedia {
  url: string;
  altText?: string;
  caption?: string;
  title?: string;
  description?: string;
  frameTag?: string;
}

interface MapTourFeature {
  attributes: Record<string, unknown>;
  geometry?: {
    x?: number;
    y?: number;
    [key: string]: unknown;
  };
}

export interface MapTourOrderItem {
  id: string | number;
  visible?: boolean;
}

export interface MapTourPlace {
  id: string | number;
  name?: string;
  description?: string;
  pic_url?: string;
  thumb_url?: string;
  geometry?: {
    x?: number;
    y?: number;
    [key: string]: unknown;
  };
  visible?: boolean;
  [key: string]: unknown; // For any additional properties
}
export interface MapTourValues {
  title?: string;
  subtitle?: string;
  layout?: string;
  order?: MapTourOrderItem[];
  places?: MapTourPlace[];
  placardPosition?: string;
  colors?: string;
  webmap?: string;
  [key: string]: unknown; // Allow extra keys
}