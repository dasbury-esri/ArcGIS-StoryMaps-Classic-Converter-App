import type { ClassicStoryMapJSON } from '../types/classic';

// Accept unknown and guard to avoid runtime exceptions when shape varies in UI
export function detectClassicTemplate(classic: ClassicStoryMapJSON | unknown): string {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
  if (!isObj(classic)) return 'unknown';
  const v: unknown = (classic as Record<string, unknown>).values || {};
  const get = <T = unknown>(obj: unknown, key: string): T | undefined => {
    if (!isObj(obj)) return undefined;
    const val = obj[key as keyof typeof obj];
    return (val as T) ?? undefined;
  };
  const settings = get<Record<string, unknown>>(v, 'settings') ?? {};
  // Strong priority: explicit Map Journal structure wins
  const story = get<Record<string, unknown>>(v, 'story');
  const storySections = story && Array.isArray(story['sections']) ? (story['sections'] as unknown[]) : undefined;
  if (storySections && storySections.length) return 'Map Journal';

  let templateName: string | undefined;
  const templateNameStr = get<string>(v, 'templateName');
  if (typeof templateNameStr === 'string' && templateNameStr.trim()) templateName = templateNameStr;
  const templateStr = get<string>(v, 'template');
  if (typeof templateStr === 'string' && templateStr.trim()) templateName = templateStr;
  const templateObj = get<Record<string, unknown>>(v, 'template');
  const templateObjName = templateObj && typeof templateObj['name'] === 'string' ? (templateObj['name'] as string) : undefined;
  if (templateObjName) templateName = templateObjName;
  // Only return Swipe when values.template explicitly says "Swipe"
  if (templateName && /\bswipe\b/i.test(templateName)) return 'Swipe';
  if (templateName) return normalize(templateName);
  if (!templateName && settings && isObj(settings) && isObj(settings['components'])) return 'Crowdsource';
  const series = get<unknown[]>(v, 'series');
  if (Array.isArray(series)) return 'Map Series';
  const tabs = get<unknown[]>(v, 'tabs') ?? get<unknown>(v, 'tabs');
  if (Array.isArray(tabs) || !!tabs) return 'Shortlist';
  const order = get<unknown[]>(v, 'order');
  if (Array.isArray(order)) return 'Map Tour';
  // Do not infer Swipe from inner signatures if story.sections exists (handled above)
  if (get<unknown>(v, 'dataModel') || get<unknown>(v, 'layers') || get<unknown>(v, 'webmaps')) return 'Swipe';
  const components = get<Record<string, unknown>>(v, 'components');
  if (components && isObj(components) && !!components['contribute']) return 'Crowdsource';
  // If a cascade sequence is present without earlier Map Journal match
  if (storySections) {
    if (storySections.some((s: unknown) => isObj(s) && (s['type'] as unknown) === 'sequence')) return 'Cascade';
    return 'Map Journal';
  }
  return 'Basic';
}

function normalize(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('journal')) return 'Map Journal';
  if (n.includes('tour')) return 'Map Tour';
  if (n.includes('series')) return 'Map Series';
  if (n.includes('cascade')) return 'Cascade';
  if (n.includes('shortlist')) return 'Shortlist';
  if (n.includes('swipe')) return 'Swipe';
  if (n.includes('crowdsource')) return 'Crowdsource';
  if (n.includes('basic')) return 'Basic';
  return name; // fallback to original for future templates
}
