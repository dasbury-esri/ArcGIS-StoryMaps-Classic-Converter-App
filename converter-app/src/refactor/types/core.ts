/* Core types for refactored StoryMap pipeline (no any usage) */

export interface StoryMapJSON {
  type: 'storymap';
  version: string;
  root: string; // root node id
  nodes: Record<string, StoryMapNode>;
  resources: Record<string, StoryMapResource>;
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
    extent?: number[]; // [xmin,ymin,xmax,ymax]
    scale?: number;
  };
}

export type StoryMapResource =
  | StoryMapImageResource
  | StoryMapThemeResource
  | StoryMapWebMapResource;

// Node types
export interface StoryMapTextNode {
  type: 'text';
  data: {
    text: string;
    type: 'paragraph' | 'h2' | 'h3' | 'h4' | 'quote';
    alignment?: 'start' | 'center' | 'end';
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

export interface StoryMapEmbedNode {
  type: 'embed';
  data: {
    url: string;
    display: 'inline' | 'card';
    embedType: 'video' | 'link' | 'rich';
    isEmbedSupported?: boolean;
    providerUrl?: string;
    caption?: string;
    alt?: string;
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

export type StoryMapNode =
  | StoryMapTextNode
  | StoryMapImageNode
  | StoryMapEmbedNode
  | StoryMapGalleryNode
  | StoryMapSidecarNode
  | StoryMapSlideNode
  | StoryMapStoryNode
  | StoryMapCreditsNode
  | StoryMapCoverNode
  | StoryMapNavigationNode;

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
