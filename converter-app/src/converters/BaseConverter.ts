/**
 * BaseConverter
 *
 * Role:
 * - Shared base for all classic → StoryMaps converter implementations.
 * - Defines options, progress callback shape, and common helpers used by converters.
 *
 * Placement (src/converters/):
 * - Sits with concrete converters to provide shared foundations.
 * - Imported by strategy classes and `ConverterFactory` for typing/contracts.
 */
import type { ConverterResult, ProgressCallback, StoryMapJSON } from '../types/core.ts';
import type { ClassicStoryMapJSON } from '../types/classic';

export interface BaseConverterOptions {
  classicJson: ClassicStoryMapJSON;
  themeId: string;
  progress: ProgressCallback;
  // Inline upload (optional)
  storyId?: string;
  username?: string;
  token?: string;
  uploader?: (url: string, storyId: string, username: string, token: string) => Promise<{ originalUrl: string; resourceName: string; transferred: boolean }>;
  inlineUpload?: boolean; // when true, converter attempts image upload immediately
}

export abstract class BaseConverter {
  protected readonly classicJson: ClassicStoryMapJSON;
  protected readonly themeId: string;
  protected readonly progress: ProgressCallback;
  protected readonly storyId?: string;
  protected readonly username?: string;
  protected readonly token?: string;
  protected readonly uploader?: (url: string, storyId: string, username: string, token: string) => Promise<{ originalUrl: string; resourceName: string; transferred: boolean }>;
  protected readonly inlineUpload?: boolean;

  constructor(options: BaseConverterOptions) {
    this.classicJson = options.classicJson;
    this.themeId = options.themeId;
    this.progress = options.progress;
    this.storyId = options.storyId;
    this.username = options.username;
    this.token = options.token;
    this.uploader = options.uploader;
    this.inlineUpload = options.inlineUpload;
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
