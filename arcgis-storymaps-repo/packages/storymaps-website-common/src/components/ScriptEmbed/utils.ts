import {
  fetchThemeItemInfo,
  type StoryItemData,
  type StoryMapsEmbedConfig,
} from 'storymaps-builder';
import { fetchViewerData } from 'storymaps-utils';
import {
  FONT_BODY_ERROR,
  FONT_CONFIG_ERROR,
  FONT_TITLE_ERROR,
  STANDALONE_ERROR,
  TOP_OFFSET_ERROR,
} from './constants';
import type { EmbedData, ScriptConfig } from './types';

/**
 * retrieves the {@link EmbedData} needed to render the story. Specifically published item data, item details, strings, and the config
 * @param param0
 * @returns
 */
export async function getEmbedData({
  baseUrl,
  storyId,
}: Pick<ScriptConfig, 'baseUrl' | 'storyId'>): Promise<EmbedData> {
  try {
    const dataRes = await fetch(`${baseUrl}/embed/view/${storyId}/data`);
    const { config: reqConfig, ...data } = (await dataRes.json()) as Omit<
      EmbedData,
      'initialThemeItemInfo'
    >;

    const initialThemeItemInfo = await fetchViewerData<typeof fetchThemeItemInfo>(
      fetchThemeItemInfo,
      (signal) => [
        {
          storyItemData: data.publishedData as StoryItemData,
          // authManager,
          portalHost: reqConfig.PORTAL_HOST,
          signal,
        },
      ],
      { function: 'test', itemType: 'story', id: storyId }
    );

    return {
      config: {
        ...reqConfig,
        // Use full source URL the baseURL since relative URLs are hosted on main app, not embed.
        BASE_URL: baseUrl,
      },
      ...data,
      initialThemeItemInfo,
    };
  } catch (error) {
    console.error('Failed to load story data', error);
    throw error;
  }
}

/** Validates the topOffset config for script embed and throws an error if it is invalid */
export const validateConfigOffset = (topOffset: StoryMapsEmbedConfig['topOffset']) => {
  if (!topOffset) {
    return;
  }

  if (typeof topOffset !== 'string' && typeof topOffset !== 'number') {
    throw new Error(TOP_OFFSET_ERROR);
  }
};

/** Validates the font config for script embed and throws an error if it is invalid */
export const validateConfigFont = (font: StoryMapsEmbedConfig['font']) => {
  // font object is not required
  if (typeof font === 'undefined') {
    return;
  }

  const { title, body } = font;

  // if user has defined a font object then it should have at least have a title or body property
  if (!title && !body) {
    throw new Error(FONT_CONFIG_ERROR);
  }

  if (title) {
    const { fontFamily, weight } = title;
    const isFontFamilyValid = typeof fontFamily === 'string';
    const isWeightValid = typeof weight.bold === 'number' && typeof weight.normal === 'number';

    if (!isFontFamilyValid || !isWeightValid) {
      throw new Error(FONT_TITLE_ERROR);
    }
  }
  if (body) {
    const { fontFamily, weight } = body;
    const isFontFamilyValid = typeof fontFamily === 'string';
    const isWeightValid = typeof weight.bold === 'number' && typeof weight.normal === 'number';

    if (!isFontFamilyValid || !isWeightValid) {
      throw new Error(FONT_BODY_ERROR);
    }
  }
};

/** Validates the standalone block config */
export const validateConfigStandalone = (standalone: StoryMapsEmbedConfig['standalone']) => {
  if (!standalone) {
    return;
  }

  if (typeof standalone !== 'string' || !standalone.startsWith('n-')) {
    throw new Error(STANDALONE_ERROR);
  }
};

// Validates the embed config for script embed and throws errors if it is invalid
export const validateEmbedConfig = (config: StoryMapsEmbedConfig) => {
  const { font, topOffset, standalone } = config;

  try {
    // validate font config
    validateConfigFont(font);
    // validate top offset config
    validateConfigOffset(topOffset);
    // validate standalone config
    validateConfigStandalone(standalone);
  } catch (error) {
    console.error('Invalid config', error);
    throw error;
  }
};
