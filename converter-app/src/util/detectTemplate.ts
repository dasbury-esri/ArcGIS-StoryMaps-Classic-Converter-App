import type { ClassicStoryMapJSON } from '../types/classic.ts';

// ...existing code...
export function detectClassicTemplate(classic: ClassicStoryMapJSON): string {
  // (no change; retained for dynamic status messaging)
  const v: unknown = classic.values || {};
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
  const settings = isObj(v) && isObj((v as any).settings) ? ((v as any).settings as Record<string, unknown>) : {};
  let templateName: string | undefined;
  if (isObj(v) && typeof (v as any).templateName === 'string' && ((v as any).templateName as string).trim()) templateName = (v as any).templateName as string;
  if (isObj(v) && typeof (v as any).template === 'string' && ((v as any).template as string).trim()) templateName = (v as any).template as string;
  if (isObj(v) && isObj((v as any).template) && typeof (v as any).template.name === 'string') templateName = (v as any).template.name as string;
  if (templateName) return normalize(templateName);
  if (!templateName && settings && (settings as any).components) return 'Crowdsource';
  if (isObj(v) && Array.isArray((v as any).series)) return 'Map Series';
  if (isObj(v) && (((v as any).tabs) || Array.isArray((v as any).tabs))) return 'Shortlist';
  if (isObj(v) && (v as any).order && Array.isArray((v as any).order)) return 'Map Tour';
  if (isObj(v) && (((v as any).dataModel) || (v as any).layers || (v as any).webmaps)) return 'Swipe';
  if (isObj(v) && (v as any).components && (v as any).components.contribute) return 'Crowdsource';
  if (isObj(v) && (v as any).story && Array.isArray((v as any).story.sections)) {
    const sections = (v as any).story.sections as unknown[];
    if (sections.some((s: unknown) => (s as any)?.type === 'sequence')) return 'Cascade';
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
