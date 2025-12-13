export interface OperationalLayer {
  id: string;
  title?: string;
  visibility?: boolean;
  featureCollection?: { layers?: Array<{ featureSet?: { features?: any[] } }> };
}

export interface WebmapJson {
  operationalLayers?: OperationalLayer[];
  baseMap?: { baseMapLayers?: Array<{ title?: string; visibility?: boolean }> };
  center?: { x: number; y: number; spatialReference?: Record<string, unknown> };
  extent?: { xmin: number; ymin: number; xmax: number; ymax: number; spatialReference?: Record<string, unknown> };
}

export interface PrefetchedFeature {
  attributes?: Record<string, unknown>;
  geometry?: Record<string, unknown>;
}
