import type { ConverterResult, ProgressCallback, StoryMapJSON } from '../types/core';
import type { ClassicStoryMapJSON } from '../types/classic';

export interface BaseConverterOptions {
  classicJson: ClassicStoryMapJSON;
  themeId: string;
  progress: ProgressCallback;
}

export abstract class BaseConverter {
  protected readonly classicJson: ClassicStoryMapJSON;
  protected readonly themeId: string;
  protected readonly progress: ProgressCallback;

  constructor(options: BaseConverterOptions) {
    this.classicJson = options.classicJson;
    this.themeId = options.themeId;
    this.progress = options.progress;
  }

  protected emit(message: string): void {
    this.progress({ stage: 'convert', message });
  }

  /** Extract structural elements (sections, entries, places) */
  protected abstract extractStructure(): void;
  /** Convert content nodes into StoryMap nodes */
  protected abstract convertContent(): void;
  /** Apply theme settings to resulting JSON */
  protected abstract applyTheme(): void;
  /** Collect media URLs for later transfer */
  protected abstract collectMedia(): string[];
  /** Return built StoryMap JSON */
  protected abstract getStoryMapJson(): StoryMapJSON;

  convert(): ConverterResult {
    this.emit('Beginning conversion');
    this.extractStructure();
    this.convertContent();
    this.applyTheme();
    const mediaUrls = this.collectMedia();
    const storymapJson = this.getStoryMapJson();
    return { storymapJson, mediaUrls };
  }
}
