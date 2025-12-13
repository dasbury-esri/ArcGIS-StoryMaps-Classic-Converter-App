type ExtentLike = { ymax: number; ymin: number } | { xmin: number; xmax: number } | Record<string, unknown>;

export function determineScaleZoomLevel(input?: number | ExtentLike): { scale: number; zoom: number } | undefined {
  if (typeof input === 'number') {
    const scale = input;
    if (!scale || scale <= 0) return undefined;
    const zoom = Math.min(Math.max(Math.round(Math.log2(591657527.5 / scale)), 0), 24);
    return { scale, zoom };
  }
  if (input && typeof input === 'object') {
    // Heuristic default when given an extent-like object
    const scale = 50000;
    const zoom = 10;
    return { scale, zoom };
  }
  return undefined;
}
