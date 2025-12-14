import type { ClassicStoryMapJSON } from '../types/classic.ts';

export function detectClassicTemplate(classic: ClassicStoryMapJSON | unknown): string {
  const values = (classic as any)?.values || {};
  const template = (values?.settings?.template) || values?.template || (classic as any)?.template || '';
  if (typeof template === 'string' && template.trim().length > 0) return template;
  // Heuristics fallback
  try {
    // Map Series: entries array
    if (Array.isArray(values?.entries) && values.entries.length > 0) return 'Map Series';
    // Map Journal: story.sections array (and often contentActions, media)
    if (values?.story && Array.isArray(values.story.sections)) return 'Map Journal';
    // Swipe: TWO_WEBMAPS or webmaps array, or layout key
    if (Array.isArray(values?.webmaps) || typeof values?.layout === 'string') return 'Swipe';
    // Map Tour: has 'tour' or 'media' entries typical of Map Tour
    if (Array.isArray((values as any)?.media?.items) || String(values?.theme || '').toLowerCase().includes('tour')) return 'Map Tour';
    // Crowdsource
    if (String(values?.template || '').toLowerCase().includes('crowd')) return 'Crowdsource';
    // Cascade
    if (String(values?.template || '').toLowerCase().includes('cascade')) return 'Cascade';
    // Shortlist
    if (String(values?.template || '').toLowerCase().includes('shortlist')) return 'Shortlist';
    // Basic
    if (String(values?.template || '').toLowerCase().includes('basic')) return 'Basic';
  } catch { /* noop */ }
  return 'unknown';
}
