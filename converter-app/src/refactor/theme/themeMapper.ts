import type { ClassicStoryMapJSON } from '../types/classic.ts';

export interface StoryMapThemeJSON {
  title: string;
  baseThemeId: string;
  isFromOrgTheme: boolean;
  variables: Record<string, any>;
  resources: Record<string, any>;
}

interface BaseThemeTemplate {
  baseThemeId: string;
  variables: Record<string, any>;
}

// Embedded fallback templates (subset pulled from test_data/storymaps/themes)
const SUMMIT_TEMPLATE: BaseThemeTemplate = {
  baseThemeId: 'summit',
  variables: {
    headerFooterBackgroundColor: '#ffffff',
    backgroundColor: '#ffffff',
    titleFontId: 'avenirNext',
    titleColor: '#002625',
    titleColorDark: '#002625',
    titleColorLight: '#ffffff',
    bodyFontId: 'notoSerif',
    bodyColor: '#304e4e',
    bodyColorDark: '#002625',
    bodyColorLight: '#ffffff',
    bodyMutedColor: '#3d6665',
    themeColor1: '#087f9b',
    themeColor2: '#fc3b36',
    themeColor3: '#126057',
    borderRadius: 0,
    shape: 'hexagon',
    colorRamps: [
      'seq-single-blues',
      'seq-multi-ylgn',
      'seq-orange-red-light',
      'seq-yellow-darkblue-bright-reversed'
    ],
    basemapPrimary: 'humanGeographyLight',
    basemapAlt: 'lightGrayCanvas',
    basemapImagery: 'worldImagery'
  }
};

const OBSIDIAN_TEMPLATE: BaseThemeTemplate = {
  baseThemeId: 'obsidian',
  variables: {
    headerFooterBackgroundColor: '#000000',
    backgroundColor: '#0e1116',
    titleFontId: 'charterBT',
    titleColor: '#f3f3f3',
    titleColorDark: '#0E1116',
    titleColorLight: '#f3f3f3',
    bodyFontId: 'arial',
    bodyColor: '#e6f2f2',
    bodyColorDark: '#0E1116',
    bodyColorLight: '#E6F2F2',
    bodyMutedColor: '#809e9d',
    themeColor1: '#ea5b41',
    themeColor2: '#4d6aff',
    themeColor3: '#0ec2db',
    borderRadius: 9999,
    colorRamps: [
      'seq-blue-bright-5',
      'seq-yellow-bright-3',
      'seq-green-bright-3',
      'seq-red-bright-4'
    ],
    basemapPrimary: 'darkGrayCanvas',
    basemapAlt: 'humanGeographyDark',
    basemapImagery: 'worldImagery'
  }
};

// Map classic font-family CSS value to StoryMaps font id.
function mapClassicFontToId(value?: string, fallback?: string): string | undefined {
  if (!value || !value.includes('font-family')) return fallback;
  // Extract first font token between quotes or before comma
  let font = value;
  const quoted = /font-family:\s*'([^']+)'/.exec(value) || /font-family:\s*"([^"]+)"/.exec(value);
  if (quoted) font = quoted[1];
  else {
    const after = /font-family:\s*([^;]+);?/.exec(value);
    if (after) font = after[1].split(',')[0].trim().replace(/["']/g,'');
  }
  const norm = font.toLowerCase().replace(/\s+/g,'');
  const map: Record<string,string> = {
    'open_sansregular': 'openSans',
    'opensans': 'openSans',
    'roboto': 'roboto',
    'noto': 'notoSerif',
    'notoserif': 'notoSerif',
    'lato': 'lato',
    'sourcesanspro': 'sourceSansPro',
    'avenirnext': 'avenirNext',
    'charterbt': 'charterBT',
    'arial': 'arial'
  };
  return map[norm] || fallback;
}

export function createThemeFromClassic(classic: ClassicStoryMapJSON): StoryMapThemeJSON {
  return createThemeWithDecisions(classic).theme;
}

export function createThemeWithDecisions(classic: ClassicStoryMapJSON): { theme: StoryMapThemeJSON; decisions: any } {
  const values: any = (classic as any).values || {};
  const settings = values.settings || {};
  const classicTheme = settings.theme || {};
  const colors = classicTheme.colors || {};
  const fonts = classicTheme.fonts || {};
  const title = (values.title || '').trim() + ' (Theme)';

  const themeMajor = (colors.themeMajor || '').toLowerCase();
  const baseThemeId = themeMajor === 'black' ? 'obsidian' : 'summit';
  const baseTemplate = baseThemeId === 'obsidian' ? OBSIDIAN_TEMPLATE : SUMMIT_TEMPLATE;
  // Start with full template variable set
  const variables: Record<string, any> = { ...baseTemplate.variables };
  // Ensure required keys present even if template changes (forward compatibility)
  const requiredKeys: Record<string, any> = baseThemeId === 'obsidian'
    ? OBSIDIAN_TEMPLATE.variables
    : SUMMIT_TEMPLATE.variables;
  for (const [k,v] of Object.entries(requiredKeys)) {
    if (!(k in variables)) variables[k] = v;
  }
  const overridesApplied: string[] = [];

  let chosenBodyColorSource: 'text' | 'textLink' | undefined;
  if (colors.panel) { variables.backgroundColor = colors.panel; overridesApplied.push('backgroundColor'); }
  if (colors.dotNav) { variables.headerFooterBackgroundColor = colors.dotNav; overridesApplied.push('headerFooterBackgroundColor'); }
  if (colors.text) { variables.bodyColor = colors.text; overridesApplied.push('bodyColor'); chosenBodyColorSource = 'text'; }
  // Preserve dark/light variants from template; do not remove
  if (!variables.bodyColorDark && requiredKeys.bodyColorDark) variables.bodyColorDark = requiredKeys.bodyColorDark;
  if (!variables.bodyColorLight && requiredKeys.bodyColorLight) variables.bodyColorLight = requiredKeys.bodyColorLight;
  if (!variables.titleColorDark && requiredKeys.titleColorDark) variables.titleColorDark = requiredKeys.titleColorDark;
  if (!variables.titleColorLight && requiredKeys.titleColorLight) variables.titleColorLight = requiredKeys.titleColorLight;
  if (colors.textLink) { variables.themeColor1 = colors.textLink; overridesApplied.push('themeColor1'); }
  if (!colors.text && colors.textLink) { variables.bodyColor = colors.textLink; overridesApplied.push('bodyColor'); chosenBodyColorSource = 'textLink'; }
  if (colors.softText) { variables.bodyMutedColor = colors.softText; overridesApplied.push('bodyMutedColor'); }
  // Guarantee colorRamps & basemap keys retained
  if (!variables.colorRamps && requiredKeys.colorRamps) variables.colorRamps = requiredKeys.colorRamps;
  if (!variables.basemapPrimary && requiredKeys.basemapPrimary) variables.basemapPrimary = requiredKeys.basemapPrimary;
  if (!variables.basemapAlt && requiredKeys.basemapAlt) variables.basemapAlt = requiredKeys.basemapAlt;
  if (!variables.basemapImagery && requiredKeys.basemapImagery) variables.basemapImagery = requiredKeys.basemapImagery;
  if (baseThemeId === 'summit' && !variables.shape && requiredKeys.shape) variables.shape = requiredKeys.shape;

  const titleFontRaw = fonts.sectionTitle?.value;
  const bodyFontRaw = fonts.sectionContent?.value;
  const titleFont = mapClassicFontToId(titleFontRaw, variables.titleFontId);
  const bodyFont = mapClassicFontToId(bodyFontRaw, variables.bodyFontId);
  if (titleFont && titleFont !== variables.titleFontId) { variables.titleFontId = titleFont; overridesApplied.push('titleFontId'); }
  if (bodyFont && bodyFont !== variables.bodyFontId) { variables.bodyFontId = bodyFont; overridesApplied.push('bodyFontId'); }

  const theme: StoryMapThemeJSON = {
    title,
    baseThemeId,
    isFromOrgTheme: false,
    variables,
    resources: {}
  };
  const decisions = {
    baseThemeId,
    colorMappings: {
      panelToBackgroundColor: colors.panel,
      dotNavToHeaderFooterBackgroundColor: colors.dotNav,
      textToBodyColor: colors.text,
      textLinkToBodyColor: !colors.text ? colors.textLink : undefined,
      textLinkToThemeColor1: colors.textLink,
      softTextToBodyMutedColor: colors.softText,
      chosenBodyColorSource
    },
    fontMappings: {
      classicTitleFontValue: titleFontRaw,
      mappedTitleFontId: titleFont,
      classicBodyFontValue: bodyFontRaw,
      mappedBodyFontId: bodyFont
    },
    variableOverridesApplied: overridesApplied
  };
  return { theme, decisions };
}
