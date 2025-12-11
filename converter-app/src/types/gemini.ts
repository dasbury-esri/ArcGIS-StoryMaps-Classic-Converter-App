// Types copied/adapted from ArcGIS StoryMaps (Gemini) to validate converter output
// Minimal subset needed for draft validation and shaping

export type NodeConfig = Record<string, unknown>;

export interface ItemResourceData {
  /** Resource type (e.g., webmap, image, converter-metadata) */
  type: string;
  /** Resource data payload; structure varies by type */
  data?: Record<string, unknown>;
}

export interface ItemNodeData {
  /** Type of block/node (e.g., map, group, swipe-left, swipe-right, journal-entry) */
  type: string;
  /** Data payload for the node */
  data?: Record<string, unknown> & {
    /** Deprecated: string IDs of child nodes (legacy) */
    children?: string[];
  };
  /** Current structure: string IDs of child nodes */
  children?: string[];
  /** Node configurations */
  config?: NodeConfig;
  /** Node states (UI control), not persisted normally */
  states?: Record<string, unknown>;
  /** Dependent node metadata */
  dependents?: Record<string, unknown>;
}

export interface ItemData {
  /** Root node id like `n-xxxxx` */
  root: string;
  /** Node map keyed by `n-xxxxx` */
  nodes: Record<string, ItemNodeData>;
  /** Resource map keyed by `r-xxxxx` */
  resources: Record<string, ItemResourceData>;
  /** Optional user actions */
  actions?: Array<Record<string, unknown>>;
}

export type GeminiItemDataModel = ItemData;
