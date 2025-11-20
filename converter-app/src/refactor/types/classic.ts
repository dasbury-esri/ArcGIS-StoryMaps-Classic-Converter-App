/* Classic StoryMap JSON refined types (avoid 'any').
   These interfaces are derived from observed patterns in classic templates.
   Unknown or template-specific extension points use Record<string, unknown> or template-specific unions.
*/

export type ClassicTemplateName =
  | 'MapJournal'
  | 'Cascade'
  | 'MapSeries'
  | 'MapTour'
  | 'Shortlist'
  | 'Swipe'
  | 'Crowdsource'
  | 'Basic'
  | string; // fallback for future templates

/**
 * Refactored version of Classic StoryMap type accounting for all templates 
 */
export interface ClassicStoryMapJSON {
  /** Optional metadata about source */
  source?: string;
  /** Parent folder reference */
  folderId?: string | null;
  /** SSL hint field (opaque) */
  _ssl?: unknown;
  /** Primary classic values payload */
  values: ClassicValues;
}

export interface ClassicValues {
  template?: ClassicTemplateName | Record<string, unknown>; // Some templates embed config object
  templateName?: ClassicTemplateName;
  name?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  sidePanelDescription?: string;
  layout?: string; // template-specific layout identifiers
  colors?: string; // semicolon-delimited palette (Map Tour / Swipe)
  webmap?: string; // Item ID where applicable
  settings?: ClassicSettings;
  order?: Array<{ id: string | number; visible?: boolean }>; // Map Tour order
  firstRecordAsIntro?: boolean; // Map Tour intro media
  story?: { sections?: ClassicSection[]; entries?: ClassicSection[] };
  series?: unknown[]; // Map Series variations
  sections?: ClassicSection[]; // Cascade, others
  headerLinkText?: Record<string, unknown>;
  headerLinkURL?: Record<string, unknown>;
  logoURL?: Record<string, unknown>;
  logoTarget?: Record<string, unknown>;
  social?: Record<string, { facebook?: Record<string, unknown>; twitter?: Record<string, unknown>; bitly?: Record<string, unknown> }>; // legacy social config
  tabs?: Record<string, ClassicShortlistTab> | ClassicShortlistTab[]; // Shortlist tabs
  shortlistLayerId?: Record<string, unknown>;
  dataModel?: string; // Swipe data model
  webmaps?: unknown[]; // Swipe multi-webmap variant
  layers?: unknown[]; // Swipe layer variant
  popupColors?: string[]; // Swipe popup palette
  // Allow additional fields for Basic/unknown templates
  [key: string]: unknown;
}

export interface ClassicSettings {
  theme?: {
    colors?: Record<string, string>;
    fonts?: Record<string, unknown>;
    themeMajor?: string;
  };
  themeOptions?: { headerColor?: string };
  layoutOptions?: Record<string, unknown>;
  generalOptions?: Record<string, unknown>;
  header?: Record<string, ClassicHeaderConfig>;
  components?: ClassicCrowdsourceComponents; // Crowdsource template structure
  layout?: Record<string, unknown>; // Crowdsource layout key
}

export interface ClassicHeaderConfig {
  linkText?: Record<string, unknown>;
  linkUrl?: Record<string, unknown>;
  logoUrl?: Record<string, unknown>;
  logoTarget?: Record<string, unknown>;
  social?: Record<string, { facebook?: Record<string, unknown>; twitter?: Record<string, unknown>; bitly?: Record<string, unknown> }>;
}

export interface ClassicCrowdsourceComponents {
  common: Record<string, unknown>;
  contribute: Record<string, unknown>;
  gallery: Record<string, unknown>;
  header: Record<string, unknown>;
  intro: Record<string, unknown>;
  map: { crowdsourceLayer: { id: string }; webmap: string };
  shareDisplay: Record<string, unknown>;
}

export interface ClassicShortlistTab {
  title?: string;
  id?: number | string;
  color?: string;
  extent?: unknown;
  [key: string]: unknown;
}

export interface ClassicSection {
  title?: string;
  content?: string;
  description?: string;
  media?: ClassicSectionMedia;
  foreground?: unknown;
  background?: unknown;
  views?: unknown[];
  type?: string; // Cascade uses types like 'sequence'
  [key: string]: unknown;
}

export interface ClassicSectionMedia {
  type: string; // image, webmap, video, webpage, audio, etc.
  webmap?: ClassicWebMap;
  image?: ClassicMedia;
  video?: ClassicMedia;
  webpage?: ClassicMedia;
  audio?: ClassicMedia;
  [key: string]: unknown;
}

export interface ClassicWebMap {
  id: string;
  extent?: ClassicExtent;
  layers?: ClassicLayer[];
  [key: string]: unknown;
}

export interface ClassicExtent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference?: { wkid: number };
}

export interface ClassicLayer {
  id: string;
  title?: string;
  visibility: boolean;
  [key: string]: unknown;
}

export interface ClassicMedia {
  url: string;
  altText?: string;
  caption?: string;
  title?: string;
  description?: string;
  frameTag?: string;
  [key: string]: unknown;
}

export interface MapTourPlace {
  id: string | number;
  name?: string;
  description?: string;
  pic_url?: string;
  thumb_url?: string;
  geometry?: { x?: number; y?: number; [key: string]: unknown };
  visible?: boolean;
  [key: string]: unknown;
}

export interface MapTourValuesSubset {
  title?: string;
  subtitle?: string;
  layout?: string;
  order?: Array<{ id: string | number; visible?: boolean }>;
  places?: MapTourPlace[];
  placardPosition?: string;
  colors?: string;
  webmap?: string;
  [key: string]: unknown;
}
