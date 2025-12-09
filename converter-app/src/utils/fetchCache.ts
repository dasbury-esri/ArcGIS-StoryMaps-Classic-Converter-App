// Simple in-memory fetch cache for browser runtime
// Stores JSON responses keyed by URL; optional TTL support.

type CacheEntry<T> = {
  data: T
  expiresAt?: number
}

const cache = new Map<string, CacheEntry<unknown>>()

// Minimal event emitter for cache changes
type CacheListener = (size: number) => void
const listeners = new Set<CacheListener>()

function emitCacheChange() {
  const size = cache.size
  for (const fn of Array.from(listeners)) {
    try { fn(size) } catch { /* ignore listener errors */ }
  }
}

export async function fetchJsonWithCache<T = unknown>(
  url: string,
  options?: RequestInit,
  ttlMs?: number
): Promise<T> {
  const now = Date.now()
  const entry = cache.get(url)
  if (entry) {
    if (!entry.expiresAt || entry.expiresAt > now) {
      return entry.data as T
    } else {
      cache.delete(url)
    }
  }

  const res = await fetch(url, options)
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status}: ${url}`)
  }
  const data = (await res.json()) as T
  const expiresAt = ttlMs ? now + ttlMs : undefined
  cache.set(url, { data, expiresAt })
  emitCacheChange()
  return data
}

export function clearFetchCache(url?: string): void {
  if (url) {
    cache.delete(url)
  } else {
    cache.clear()
  }
  emitCacheChange()
}

export function getFetchCacheSize(): number {
  return cache.size
}

export function onFetchCacheChange(listener: CacheListener): void {
  listeners.add(listener)
}

export function offFetchCacheChange(listener: CacheListener): void {
  listeners.delete(listener)
}
