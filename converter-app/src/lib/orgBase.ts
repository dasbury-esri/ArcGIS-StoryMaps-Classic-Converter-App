// Centralized org base resolution for runtime code
// Prefer avoiding direct usage of globalThis.__ORG_BASE in components.

let cachedOrgBase: string | undefined;

/**
 * Get the ArcGIS portal base URL to use for REST calls and links.
 * Resolution order:
 * 1) Explicitly set via setOrgBase()
 * 2) globalThis.__ORG_BASE (if app bootstraps it)
 * 3) Environment variable VITE_ORG_BASE (Vite runtime env)
 * 4) Default ArcGIS Online host
 */
export function getOrgBase(): string {
  if (cachedOrgBase) return cachedOrgBase;

  const fromGlobal =
    typeof globalThis !== 'undefined' &&
    (globalThis as any).__ORG_BASE &&
    typeof (globalThis as any).__ORG_BASE === 'string'
      ? ((globalThis as any).__ORG_BASE as string)
      : undefined;

  const fromEnv = typeof import.meta !== 'undefined' && (import.meta as any).env
    ? ((import.meta as any).env.VITE_ORG_BASE as string | undefined)
    : undefined;

  cachedOrgBase = fromGlobal || fromEnv || 'https://www.arcgis.com';
  return cachedOrgBase;
}

/**
 * Set and cache the org base URL for subsequent getOrgBase() calls.
 * Also mirrors to globalThis.__ORG_BASE for any legacy consumers.
 */
export function setOrgBase(baseUrl: string): void {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') return;
  cachedOrgBase = baseUrl.trim();
  try {
    (globalThis as any).__ORG_BASE = cachedOrgBase;
  } catch {
    // no-op: environments without global assignment
  }
}

/**
 * Clear cached org base to force re-resolution on next getOrgBase().
 */
export function resetOrgBaseCache(): void {
  cachedOrgBase = undefined;
}
