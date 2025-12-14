import type { ClassicStoryMapJSON } from '../types/classic.ts';
import type { ConversionContext, ConverterResult, StoryMapJSON } from '../types/core.ts';
import { MapJournalConverter } from '../converters/MapJournalConverter';
import { detectClassicTemplate } from '../utils/detectTemplate';
import { MediaTransferService } from '../media/MediaTransferService';
import { ResourceMapper } from '../media/ResourceMapper';

export interface PipelineOptions {
  classicJson: ClassicStoryMapJSON;
  context: ConversionContext;
  uploader: (url: string, storyId: string, username: string, token: string) => Promise<{ originalUrl: string; resourceName: string; transferred: boolean }>;
}

export interface PipelineOutput {
  storymapJson: StoryMapJSON;
  mediaMapping: Record<string, string>;
}

export class ConversionPipeline {
  private readonly classicJson: ClassicStoryMapJSON;
  private readonly ctx: ConversionContext;
  private readonly uploader: PipelineOptions['uploader'];

  constructor(opts: PipelineOptions) {
    this.classicJson = opts.classicJson;
    this.ctx = opts.context;
    this.uploader = opts.uploader;
  }

  async run(): Promise<PipelineOutput> {
    this.emit('Starting pipeline');

    // Detect template (simple heuristic placeholder)
    const templateName = detectClassicTemplate(this.classicJson);
    this.emit(`Detected template: ${templateName}`);

    // Instantiate converter (only Map Journal stub for now)
    const converterResult = await this.instantiateConverter();

    // Transfer media
    const mediaMapping = await MediaTransferService.transferBatch({
      urls: converterResult.mediaUrls,
      storyId: this.ctx.storyId,
      username: this.ctx.username,
      token: this.ctx.token,
      progress: this.ctx.progress,
      uploader: this.uploader
    });

    // Apply mapping
    const updated = ResourceMapper.apply(converterResult.storymapJson, mediaMapping);

    this.emit('Pipeline complete');
    return { storymapJson: updated, mediaMapping };
  }

  private async instantiateConverter(): Promise<ConverterResult> {
    // Extend switch for other templates later (ignore templateName for now)
    return await MapJournalConverter.convert({
      classicJson: this.classicJson,
      themeId: this.ctx.themeId,
      progress: (e) => this.ctx.progress(e)
    });
  }


  private emit(message: string): void {
    this.ctx.progress({ stage: 'convert', message });
  }
}
