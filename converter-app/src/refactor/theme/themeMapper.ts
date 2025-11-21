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
  const values: any = (classic as any).values || {};
  const settings = values.settings || {};
  const classicTheme = settings.theme || {};
  const colors = classicTheme.colors || {};
  const fonts = classicTheme.fonts || {};
  const title = (values.title || '').trim() + ' (Theme)';

  // Determine baseThemeId from themeMajor
  const baseThemeId = colors.themeMajor === 'black' ? 'obsidian' : 'summit';
  const baseTemplate = baseThemeId === 'obsidian' ? OBSIDIAN_TEMPLATE : SUMMIT_TEMPLATE;

  // Start with deep clone of base template variables
  const variables: Record<string, any> = { ...baseTemplate.variables };

  // 4) panel -> backgroundColor
  if (colors.panel) variables.backgroundColor = colors.panel;
  // 5) dotNav -> headerFooterBackgroundColor
  if (colors.dotNav) variables.headerFooterBackgroundColor = colors.dotNav;
  // 8) textLink -> themeColor1
  if (colors.textLink) variables.themeColor1 = colors.textLink;
  // 9) textLink -> bodyColor (per instruction though unusual)
  if (colors.textLink) variables.bodyColor = colors.textLink;

  // Fonts mapping
  const titleFont = mapClassicFontToId(fonts.sectionTitle?.value, variables.titleFontId);
  if (titleFont) variables.titleFontId = titleFont;
  const bodyFont = mapClassicFontToId(fonts.sectionContent?.value, variables.bodyFontId);
  if (bodyFont) variables.bodyFontId = bodyFont;

  return {
    title,
    baseThemeId,
    isFromOrgTheme: false,
    variables,
    resources: {}
  };
}
