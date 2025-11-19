/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Converter Factory
 * Selects appropriate converter based on classic story type
 * Ported from JSONConverterFactory in converter_json.py
 */

import type { ClassicStoryMapJSON } from '../types/storymap';
import { BasicConverter} from './basic-converter';
import { CascadeConverter } from './cascade-converter';
import { CrowdsourceConverter } from './crowdsource-converter';
import { MapJournalConverter } from './mapjournal-converter';
import { MapSeriesConverter } from './mapseries-converter';
import { MapTourConverter } from './maptour-converter';
import { ShortlistConverter} from './shortlist-converter';
import { SwipeConverter } from './swipe-converter';
import { detectClassicAppType } from './utils';

export class ConverterFactory {
  /**
   * Get appropriate converter based on classic story type
   */
  static getConverter(
    classicJson: ClassicStoryMapJSON,
    themeId: string = 'summit',
    username?: string,
    token?: string,
    targetStoryId?: string
  ): BasicConverter | CascadeConverter | CrowdsourceConverter | MapJournalConverter | MapSeriesConverter | 
  MapTourConverter | ShortlistConverter | SwipeConverter {
    const values = classicJson.values;
    if (!values) {
      throw new Error('Invalid classic story JSON: missing "values" key');
    }
    const appType = detectClassicAppType(classicJson);
    switch (appType) {
      case 'maptour':
        return new MapTourConverter(classicJson, themeId, username || '', token || '', targetStoryId || '');
      case 'mapjournal':
        return new MapJournalConverter(classicJson, themeId, username || '', token || '', targetStoryId || '');
      case 'mapseries':
        return new MapSeriesConverter(classicJson, themeId, username || '', token || '', targetStoryId || '');
      case 'cascade':
        return new CascadeConverter(classicJson, themeId, username || '', token || '', targetStoryId || '');
      case 'swipe':
        return new SwipeConverter(classicJson, themeId, username || '', token || '', targetStoryId || '');
      case 'shortlist':
        return new ShortlistConverter(classicJson, themeId, username || '', token || '', targetStoryId || '');
      case 'crowdsource':
        return new CrowdsourceConverter(classicJson, themeId, username || '', token || '', targetStoryId || ''); // this is a placeholder
      case 'basic':
        return new BasicConverter(classicJson, themeId, username || '', token || '', targetStoryId || '');
      default:
        throw new Error(`Unknown classic story type: ${appType}`);
    }
  }
}

/**
 * Main conversion function
 */
export async function convertClassicToJson(
  classicJson: ClassicStoryMapJSON,
  themeId: string = 'summit',
  username: string,
  token: string,
  targetStoryId: string
): Promise<any> {
  const converter = ConverterFactory.getConverter(classicJson, themeId, username, token, targetStoryId);
  const storymapJson = await converter.convert(username, token, targetStoryId);

  // // 1. Collect image URLs before any update
  // const imageUrls = collectImageUrls(storymapJson);

  // // 2. Transfer images and get mapping
  // const transferResultsArray = await transferImages(
  //   imageUrls,
  //   targetStoryId,
  //   username,
  //   token
  // );
  // const transferResults: Record<string, string> = {};
  // for (const result of transferResultsArray) {
  //   transferResults[result.originalUrl] = result.resourceName;
  // }

  // // 3. Update resources in JSON
  // storymapJson = updateImageUrlsInJson(storymapJson, transferResults);

  return storymapJson;
}

