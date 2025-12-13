import type { ClassicStoryMapJSON } from '../types/classic.ts';

export function detectClassicTemplate(classic: ClassicStoryMapJSON | unknown): string {
  const values = (classic as any)?.values || {};
  const template = (values?.settings?.template) || values?.template || (classic as any)?.template || '';
  return String(template);
}
