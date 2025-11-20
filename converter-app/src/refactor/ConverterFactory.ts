import type { ClassicStoryMapJSON } from './types/classic';
import { MapJournalConverter } from './converters/MapJournalConverter';
import type { ConverterResult } from './types/core';

export interface ConverterFactoryOptions {
  classicJson: ClassicStoryMapJSON;
  themeId: string;
  progress: (e: { stage: 'convert'; message: string }) => void;
}

export class ConverterFactory {
  static create(opts: ConverterFactoryOptions): ConverterResult {
    const template = ConverterFactory.detectTemplate(opts.classicJson);
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

  private static detectTemplate(classic: ClassicStoryMapJSON): string {
    const v = classic.values as any;
    return (
      v?.templateName || (typeof v?.template === 'string' ? v.template : 'Map Journal')
    );
  }
}
