// Helper to get portal base URL for REST calls from scripts
// Prefers ORG_BASE env var; falls back to ArcGIS Online default
export function getOrgBase(): string {
  const base = process.env.ORG_BASE;
  if (typeof base === 'string' && base.trim().length) return base.trim();
  return 'https://www.arcgis.com';
}
