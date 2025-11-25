/* Core types for refactored StoryMap pipeline (no any usage) */

export interface StoryMapJSON {
  root: string; // root node id
  nodes: Record<string, StoryMapNode>;
  resources: Record<string, StoryMapResource>;
  actions?: StoryMapAction[];
}

export interface ConverterMetadataPayload {
  type: 'storymap' | 'storymapTheme';
  version: string;
  classicType: string; // e.g. MapJournal, Cascade
  classicMetadata?: {
    theme?: any;
    mappingDecisions?: {
      baseThemeId: string;
      colorMappings: {
        panelToBackgroundColor?: string;
        dotNavToHeaderFooterBackgroundColor?: string;
        textToBodyColor?: string;
        textLinkToBodyColor?: string;
        textLinkToThemeColor1?: string;
        softTextToBodyMutedColor?: string;
        chosenBodyColorSource?: 'text' | 'textLink';
      };
      fontMappings?: {
        classicTitleFontValue?: string;
        mappedTitleFontId?: string;
        classicBodyFontValue?: string;
        mappedBodyFontId?: string;
      };
      variableOverridesApplied?: string[];
      layoutMapping?: {
        classicLayoutId: string;
        classicSize?: string;
        classicPosition?: string;
        mappedSubtype: 'docked-panel' | 'floating-panel';
        mappedNarrativePanelSize: 'small' | 'medium' | 'large';
        mappedNarrativePanelPosition: 'start' | 'end';
      };
    };
  };
}

export interface ConverterMetadataResource {
  type: 'converter-metadata';
  data: ConverterMetadataPayload;
}

// Resource types
export interface StoryMapImageResource {
  type: 'image';
  data: {
    resourceId?: string; // when attached
    src?: string; // when external
    provider: 'item-resource' | 'uri';
    width?: number;
    height?: number;
    caption?: string;
    alt?: string;
  };
}

export interface StoryMapThemeResource {
  type: 'story-theme';
  data: {
    themeId: string;
    themeBaseVariableOverrides?: Record<string, string>;
  };
}

export interface StoryMapWebMapResource {
  type: 'webmap';
  data: {
    itemId: string;
    type: 'Web Map' | 'Web Scene';
    extent?: number[]; // (legacy simple array form)
    scale?: number;
    // Extended per-slide initial state (optional)
    initialState?: {
      extent?: any; // classic extent object with spatialReference
      mapLayers?: Array<{ id: string; title: string; visible: boolean }>;
      overview?: { enable: boolean; openByDefault: boolean };
      legend?: { enable: boolean; openByDefault: boolean };
      geocoder?: { enable: boolean };
      popup?: unknown;
      viewpoint?: { targetGeometry?: any; scale?: number };
      zoom?: number;
      scale?: number;
    };
  };
}

export interface StoryMapVideoResource {
  type: 'video';
  data: {
    resourceId?: string;
    src?: string; // external URL when not transferred
    provider: 'item-resource' | 'uri' | 'youtube' | 'vimeo';
    caption?: string;
    alt?: string;
    width?: number;
    height?: number;
  };
}

export type StoryMapResource =
  | StoryMapImageResource
  | StoryMapThemeResource
  | StoryMapWebMapResource
  | StoryMapVideoResource;

// Node types
export interface StoryMapTextNode {
  type: 'text';
  data: {
    text: string;
    type: 'paragraph' | 'h2' | 'h3' | 'h4' | 'quote';
    textAlignment?: 'start' | 'center' | 'end';
  };
  config?: { isWide?: boolean };
}

export interface StoryMapImageNode {
  type: 'image';
  data: {
    resourceId?: string;
    provider: 'item-resource' | 'uri';
    display?: 'standard' | 'wide' | 'float';
    caption?: string;
    alt?: string;
    floatAlignment?: 'start' | 'center' | 'end';
    width?: number;
    height?: number;
    src?: string;
  };
}

export interface StoryMapVideoNode {
  type: 'video';
  data: {
    resourceId?: string;
    provider: 'item-resource' | 'uri' | 'youtube' | 'vimeo';
    caption?: string;
    alt?: string;
    width?: number;
    height?: number;
    src?: string;
  };
}

export interface StoryMapWebMapNode {
  type: 'webmap';
  data: {
    resourceId?: string; // reference to StoryMapWebMapResource
    provider: 'item' | 'portal-item';
    caption?: string;
    alt?: string;
    itemId?: string; // fallback when resource not established
  };
}

export interface StoryMapEmbedNode {
  type: 'embed';
  data: {
    url: string;
    embedType: 'video' | 'link' | 'rich';
    display: 'inline' | 'card';
    embedSrc?: string; // resolved embed source (iframe src)
    provider?: 'youtube' | 'vimeo' | 'unknown';
    videoId?: string;
    title?: string;
    description?: string;
    caption?: string;
    alt?: string;
    isEmbedSupported?: boolean;
    aspectRatio?: string; // e.g. '16:9'
  };
}

export interface StoryMapGalleryNode {
  type: 'gallery';
  data: {
    galleryLayout: 'square-dynamic' | 'horizontal-scroll' | 'grid';
    caption?: string;
    alt?: string;
  };
  children: string[];
}

export interface StoryMapSidecarNode {
  type: 'sidecar';
  data: {
    sidecarType: 'docked-panel' | 'floating-panel';
    narrativePanelPosition?: 'start' | 'end';
    narrativePanelSize?: 'small' | 'medium' | 'large';
  };
  children: string[];
}

export interface StoryMapSlideNode {
  type: 'slide';
  children: string[];
}

export interface StoryMapStoryNode {
  type: 'story';
  data: {
    storyTheme: string;
    coverDate?: string;
  };
  children: string[];
}

export interface StoryMapCreditsNode {
  type: 'credits';
  children: string[];
}

export interface StoryMapCoverNode {
  type: 'storycover';
  data: {
    type: 'minimal';
    title: string;
    summary?: string;
    byline?: string;
    titlePanelVerticalPosition?: 'top' | 'center' | 'bottom';
    titlePanelHorizontalPosition?: 'start' | 'center' | 'end';
    titlePanelStyle?: 'gradient' | 'solid';
  };
}

export interface StoryMapNavigationNode {
  type: 'navigation';
  data: { links: { label: string; target: string }[] };
  config?: { isHidden?: boolean };
}

// Additional node interfaces introduced by refactor

export interface StoryMapAttributionNode {
  type: 'attribution';
  data: { content: string; attribution: string };
}

export interface StoryMapActionButtonNode {
  type: 'action-button';
  data: { text: string };
  config?: { size?: 'wide' | 'standard' };
}

export interface StoryMapButtonNode {
  type: 'button';
  data: { text: string; link?: string };
  config?: { size?: 'wide' | 'standard' };
}

export interface StoryMapImmersiveNode {
  type: 'immersive';
  data: {
    type: 'sidecar';
    subtype: 'docked-panel' | 'floating-panel';
    narrativePanelPosition: 'start' | 'end';
    narrativePanelSize: 'small' | 'medium' | 'large';
  };
  children: string[]; // immersive-slide ids
}

export interface StoryMapImmersiveSlideNode {
  type: 'immersive-slide';
  data: { transition: 'fade' | 'swipe' | 'none' };
  children: string[]; // includes immersive-narrative-panel and optional media node
}

export interface StoryMapImmersiveNarrativePanelNode {
  type: 'immersive-narrative-panel';
  data: { panelStyle: 'themed' | 'custom' };
  children: string[]; // narrative content nodes
}

export interface TourGeometry {
  id: string;
  type: 'POINT_NUMBERED_TOUR';
  nodes: Array<{ long: number; lat: number }>;
  viewpoint: Record<string, unknown>;
  scale?: number;
}

export interface TourPlace {
  id: string;
  featureId: string;
  contents: string[];
  media?: string;
  title: string;
  config?: { isHidden?: boolean };
}

export interface StoryMapTourMapNode {
  type: 'tour-map';
  data: {
    geometries: Record<string, TourGeometry>;
    mode: '2d' | '3d';
    basemap: { type: 'name' | 'resource'; value: string };
  };
}

export interface StoryMapCarouselNode {
  type: 'carousel';
  children: string[]; // image node ids
}

export interface StoryMapTourNode {
  type: 'tour';
  data: {
    type: 'guided-tour' | 'explorer';
    subtype: 'media-focused' | 'map-focused' | 'grid';
    narrativePanelPosition: 'start' | 'end';
    map: string; // tour-map node id
    places: TourPlace[];
    narrativePanelSize: 'small' | 'medium' | 'large';
    accentColor: string;
  };
}

export type StoryMapNode =
  | StoryMapTextNode
  | StoryMapImageNode
  | StoryMapVideoNode
  | StoryMapWebMapNode
  | StoryMapEmbedNode
  | StoryMapGalleryNode
  | StoryMapSidecarNode
  | StoryMapSlideNode
  | StoryMapStoryNode
  | StoryMapCreditsNode
  | StoryMapCoverNode
  | StoryMapNavigationNode
  | StoryMapAttributionNode
  | StoryMapActionButtonNode
  | StoryMapButtonNode
  | StoryMapImmersiveNode
  | StoryMapImmersiveSlideNode
  | StoryMapImmersiveNarrativePanelNode
  | StoryMapTourMapNode
  | StoryMapCarouselNode
  | StoryMapTourNode;

export interface StoryMapAction {
  origin: string; // action-button node id
  trigger: 'ActionButton_Apply';
  target: string; // immersive-slide id
  event: 'ImmersiveSlide_ReplaceMedia';
  data: { media: string }; // media node id to swap in
}

export type ProgressStage =
  | 'fetch'
  | 'detect'
  | 'draft'
  | 'convert'
  | 'media'
  | 'finalize'
  | 'done'
  | 'error';

export interface ProgressEventBase {
  stage: ProgressStage;
  message: string;
}

export interface MediaProgressEvent extends ProgressEventBase {
  stage: 'media';
  current: number;
  total: number;
}

export type ProgressEvent = ProgressEventBase | MediaProgressEvent;

export type ProgressCallback = (event: ProgressEvent) => void;

export interface ConverterResult {
  storymapJson: StoryMapJSON;
  mediaUrls: string[]; // original media URLs to transfer
}

export interface ConversionContext {
  classicItemId: string;
  storyId: string; // target story item id (draft)
  username: string;
  token: string;
  themeId: string;
  progress: ProgressCallback;
}
