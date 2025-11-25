import { execSync } from 'node:child_process';
import { StoryMapJSONBuilder } from '../src/refactor/schema/StoryMapJSONBuilder.ts';
import { SwipeConverter } from '../src/refactor/converters/SwipeConverter.ts';

function fetchClassicSwipe(appid: string): any {
  const url = `https://www.arcgis.com/sharing/rest/content/items/${appid}/data?f=json`;
  const out = execSync(`curl -sL '${url}'`, { encoding: 'utf-8' });
  return JSON.parse(out);
}

const appid = process.argv[2] || '6b58de911fa44d309431d8b3cf7bba6c';
const classic = fetchClassicSwipe(appid);
const builder = new StoryMapJSONBuilder('summit');
const nodeId = SwipeConverter.buildInlineSwipeBlock(builder, classic.values, 'swipe');
console.log('Inline swipe node:', nodeId);
