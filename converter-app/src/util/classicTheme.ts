import type { ClassicStoryMapJSON } from '../types/classic.ts';
import { detectClassicTemplate } from './detectTemplate';
import { createThemeWithDecisions } from '../theme/themeMapper';

export type DerivedTheme = { themeId: 'summit' | 'obsidian'; variableOverrides?: Record<string, string> };

/**
 * Derive StoryMaps theme and optional variable overrides from a Classic JSON.
 * - Map Journal / Map Series / Cascade: use themeMapper (colors/fonts → variables)
 * - Map Tour: parse values.colors (semicolon separated)
 * - Swipe: parse values.colors if present
 * - Others: default to summit with no overrides
 */
function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object';
}
function get(obj: unknown, key: string): unknown {
  if (!isObj(obj)) return undefined;
  return (obj as Record<string, unknown>)[key];
}

export function deriveClassicTheme(classic: ClassicStoryMapJSON | unknown): DerivedTheme {
  const template = detectClassicTemplate(classic as ClassicStoryMapJSON);
  const values = (isObj(classic) && isObj(get(classic, 'values'))) ? (get(classic, 'values') as Record<string, unknown>) : {};

  const fromMajor = (major?: string): 'summit' | 'obsidian' => {
    const m = String(major || '').toLowerCase();
    if (m === 'dark' || m === 'black') return 'obsidian';
    return 'summit';
  };

  if (/Map Journal|Map Series|Cascade/i.test(template)) {
    try {
      const { theme, decisions } = createThemeWithDecisions(classic as ClassicStoryMapJSON);
      const base = (theme.baseThemeId === 'obsidian') ? 'obsidian' : 'summit';
      const overrides: Record<string,string> = {};
      if (Array.isArray(decisions?.variableOverridesApplied)) {
        for (const k of decisions.variableOverridesApplied) {
          if (k in theme.variables) overrides[k] = String(theme.variables[k]);
        }
      }
      return { themeId: base, variableOverrides: overrides };
    } catch {
      const settings = get(values, 'settings') as Record<string, unknown> | undefined;
      const themeObj = settings && (get(settings, 'theme') as Record<string, unknown> | undefined);
      const colors = themeObj && (get(themeObj, 'colors') as Record<string, unknown> | undefined);
      const major = colors && (get(colors, 'themeMajor') as string | undefined);
      return { themeId: fromMajor(major) };
    }
  }

  if (/Map Tour/i.test(template)) {
    const colorStr: string = String(get(values, 'colors') || '');
    const parts = String(colorStr).split(';');
    const header = parts[0]?.trim();
    const background = parts[1]?.trim();
    const themeId: 'summit' | 'obsidian' = 'summit';
    const variableOverrides: Record<string,string> = {};
    if (header) variableOverrides.headerFooterBackgroundColor = header;
    if (background) variableOverrides.backgroundColor = background;
    return { themeId, variableOverrides: Object.keys(variableOverrides).length ? variableOverrides : undefined };
  }

  if (/Swipe/i.test(template)) {
    const colorStr: string = String(get(values, 'colors') || '');
    const parts = String(colorStr).split(';');
    const header = parts[0]?.trim();
    const background = parts[1]?.trim();
    const settings = get(values, 'settings') as Record<string, unknown> | undefined;
    const themeObj = settings && (get(settings, 'theme') as Record<string, unknown> | undefined);
    const colorsObj = themeObj && (get(themeObj, 'colors') as Record<string, unknown> | undefined);
    const major = colorsObj && (get(colorsObj, 'themeMajor') as string | undefined);
    const themeId = fromMajor(major);
    const variableOverrides: Record<string,string> = {};
    if (header) variableOverrides.headerFooterBackgroundColor = header;
    if (background) variableOverrides.backgroundColor = background;
    return { themeId, variableOverrides: Object.keys(variableOverrides).length ? variableOverrides : undefined };
  }

  // Shortlist / Crowdsource / Basic: try settings theme colors
  const settings = get(values, 'settings') as Record<string, unknown> | undefined;
  const themeObj = settings && (get(settings, 'theme') as Record<string, unknown> | undefined);
  const colors = themeObj && (get(themeObj, 'colors') as Record<string, unknown> | undefined);
  const major = colors && (get(colors, 'themeMajor') as string | undefined);
  return { themeId: fromMajor(major) };
}

/**
 * Choose final theme to apply given user selection and derived classic theme.
 */
export function computeTheme(themeIdInput: 'auto' | 'summit' | 'obsidian', classic: ClassicStoryMapJSON | unknown): DerivedTheme {
  const derived = deriveClassicTheme(classic as ClassicStoryMapJSON);
  const finalId: 'summit' | 'obsidian' = (themeIdInput === 'auto') ? derived.themeId : themeIdInput;
  return { themeId: finalId, variableOverrides: derived.variableOverrides };
}
