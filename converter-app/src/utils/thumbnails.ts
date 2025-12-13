export function deriveWebmapThumbnailUrl(id: string): string {
  return `https://www.arcgis.com/sharing/rest/content/items/${id}/info/thumbnail/thumbnail.png`;
}
export function deriveImageThumbnailUrl(url: string): string {
  return url;
}
export function deriveEmbedThumbnailUrl(url: string = ''): string {
  return url;
}
export function getDefaultThumbnailUrl(): string {
  return 'https://js.arcgis.com/4.30/esri/images/logo.png';
}
export function buildProxiedThumbnailUrl(url: string, _maxSize?: number): string {
  return url;
}
