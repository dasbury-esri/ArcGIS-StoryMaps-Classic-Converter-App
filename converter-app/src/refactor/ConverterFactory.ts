import type { ClassicStoryMapJSON } from './types/classic.ts';
import { MapJournalConverter } from './converters/MapJournalConverter.ts';
import type { ConverterResult } from './types/core.ts';
import { detectClassicTemplate } from './util/detectTemplate.ts';

export interface ConverterFactoryOptions {
  classicJson: ClassicStoryMapJSON;
  themeId: string;
  progress: (e: { stage: 'convert'; message: string }) => void;
}

export class ConverterFactory {
  static create(opts: ConverterFactoryOptions): ConverterResult {
    const template = detectClassicTemplate(opts.classicJson);
    opts.progress({ stage: 'convert', message: `ConverterFactory detected template: ${template}` });
    // Only Map Journal supported currently; extend switch as more converters added
    switch (template.toLowerCase()) {
      case 'map journal':
      case 'journal':
      default:
        return MapJournalConverter.convert({
          classicJson: opts.classicJson,
          themeId: opts.themeId,
          progress: opts.progress
        });
    }
  }
}
