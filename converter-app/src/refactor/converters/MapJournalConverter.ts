import { BaseConverter } from './BaseConverter';
import type { ClassicStoryMapJSON, ClassicMapJournalSection, ClassicMapJournalValues } from '../types/classic';
import type { ConverterResult, StoryMapJSON } from '../types/core';
import { StoryMapJSONBuilder } from '../schema/StoryMapJSONBuilder';

export interface MapJournalConverterOptions {
  classicJson: ClassicStoryMapJSON;
  themeId: string;
  progress: (e: { stage: 'convert'; message: string }) => void;
}

export class MapJournalConverter extends BaseConverter {
  private builder: StoryMapJSONBuilder;
  private sectionCount = 0;
  private sections: ClassicMapJournalSection[] = [];
  private media: Set<string> = new Set();

  constructor(opts: MapJournalConverterOptions) {
    super({ classicJson: opts.classicJson, themeId: opts.themeId, progress: opts.progress });
    this.builder = new StoryMapJSONBuilder(opts.themeId);
  }

  protected extractStructure(): void {
    const values = this.classicJson.values as ClassicMapJournalValues;
    this.sections = values?.story?.sections ?? [];
    this.sectionCount = this.sections.length;
    this.emit(`Found ${this.sectionCount} sections in Map Journal`);
  }

  protected convertContent(): void {
    // Create story root
    const rootId = this.builder.createStoryRoot(this.themeId);
    this.emit('Created story root node');
    // Placeholder: iterate sections
    for (const section of this.sections) {
      if (section.title) {
        this.builder.addTextBlock(rootId, section.title, 'h2');
      }
      if (section.media?.image?.url) {
        this.builder.addImageResource(section.media.image.url);
        this.builder.addImageNode(rootId, { src: section.media.image.url, provider: 'uri', caption: section.media.image.caption, alt: section.media.image.altText });
        this.media.add(section.media.image.url);
      }
      if (section.media?.video?.url) {
        this.media.add(section.media.video.url);
      }
    }
  }

  protected applyTheme(): void {
    this.builder.applyTheme({ themeId: this.themeId });
    this.emit(`Applied theme ${this.themeId}`);
  }

  protected collectMedia(): string[] {
    // Already collected during convertContent
    this.emit(`Collected ${this.media.size} media URL(s)`);
    return Array.from(this.media);
  }

  protected getStoryMapJson(): StoryMapJSON {
    return this.builder.getJson();
  }

  // Convenience static
  static convert(opts: MapJournalConverterOptions): ConverterResult {
    const converter = new MapJournalConverter(opts);
    return converter.convert();
  }
}
