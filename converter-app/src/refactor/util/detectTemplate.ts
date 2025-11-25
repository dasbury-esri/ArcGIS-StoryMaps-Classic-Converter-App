import type { ClassicStoryMapJSON } from '../types/classic.ts';

// ...existing code...
export function detectClassicTemplate(classic: ClassicStoryMapJSON): string {
  // (no change; retained for dynamic status messaging)
  const v: unknown = classic.values || {};
  const settings: unknown = v.settings || {};
  let templateName: string | undefined;
  if (typeof v.templateName === 'string' && v.templateName.trim()) templateName = v.templateName;
  if (typeof v.template === 'string' && v.template.trim()) templateName = v.template;
  if (v.template && typeof v.template === 'object' && typeof v.template.name === 'string') templateName = v.template.name;
  if (templateName) return normalize(templateName);
  if (!templateName && settings && settings.components) return 'Crowdsource';
  if (Array.isArray(v.series)) return 'Map Series';
  if (v.tabs || Array.isArray(v.tabs)) return 'Shortlist';
  if (v.order && Array.isArray(v.order)) return 'Map Tour';
  if (v.dataModel || v.layers || v.webmaps) return 'Swipe';
  if (v.components && v.components.contribute) return 'Crowdsource';
  if (v.story && Array.isArray(v.story.sections)) {
    const sections = v.story.sections;
    if (sections.some((s: unknown) => s.type === 'sequence')) return 'Cascade';
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
