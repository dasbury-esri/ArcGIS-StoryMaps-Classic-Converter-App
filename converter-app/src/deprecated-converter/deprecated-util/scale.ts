// Utility to derive approximate scale/zoom level from extent height (WebMercator meters)
export function determineScaleZoomLevel(extent: { ymax: number; ymin: number }) {
  const height = Math.abs(extent.ymax - extent.ymin);
  // Simple heuristic: map height to zoom bucket
  if (height <= 500) return { scale: 500, zoom: 20 };
  if (height <= 1_000) return { scale: 1000, zoom: 19 };
  if (height <= 5_000) return { scale: 5000, zoom: 17 };
  if (height <= 10_000) return { scale: 10000, zoom: 16 };
  if (height <= 50_000) return { scale: 50000, zoom: 14 };
  if (height <= 100_000) return { scale: 100000, zoom: 13 };
  if (height <= 500_000) return { scale: 500000, zoom: 11 };
  if (height <= 1_000_000) return { scale: 1000000, zoom: 10 };
  if (height <= 5_000_000) return { scale: 5000000, zoom: 8 };
  if (height <= 10_000_000) return { scale: 10000000, zoom: 7 };
  return { scale: 25000000, zoom: 6 };
}
