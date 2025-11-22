import type { ClassicStoryMapJSON } from './types/classic.ts';
import type { ConversionContext, StoryMapJSON } from './types/core.ts';
import { ConverterFactory } from './ConverterFactory.ts';
import { MediaTransferService } from './media/MediaTransferService.ts';
import { ResourceMapper } from './media/ResourceMapper.ts';

export interface AdapterParams {
  classicJson: ClassicStoryMapJSON;
  storyId: string;
  classicItemId: string;
  username: string;
  token: string;
  themeId: string;
  progress: (e: { stage: string; message: string; current?: number; total?: number }) => void;
  enrichScenes?: boolean; // toggle enrichment of web scenes
  uploader: (url: string, storyId: string, username: string, token: string) => Promise<{
    originalUrl: string; resourceName: string; transferred: boolean;
  }>;
}

export interface RefactorConversionOutput {
  storymapJson: StoryMapJSON;
  mediaMapping: Record<string, string>;
}

// Unified orchestration for refactored flow
export async function convertClassicToJsonRefactored(params: AdapterParams): Promise<RefactorConversionOutput> {
  const ctx: ConversionContext = {
    classicItemId: params.classicItemId,
    storyId: params.storyId,
    username: params.username,
    token: params.token,
    themeId: params.themeId,
    progress: params.progress
  };

  params.progress({ stage: 'convert', message: '[Refactor] Starting converter factory...' });
  const converterResult = await ConverterFactory.create({
    classicJson: params.classicJson,
    themeId: params.themeId,
    progress: (e) => params.progress(e),
    enrichScenes: params.enrichScenes
  });

  params.progress({ stage: 'media', message: '[Refactor] Transferring media...' });
  const mediaMapping = await MediaTransferService.transferBatch({
    urls: converterResult.mediaUrls,
    storyId: ctx.storyId,
    username: ctx.username,
    token: ctx.token,
    progress: ctx.progress,
    uploader: params.uploader
  });

  params.progress({ stage: 'finalize', message: '[Refactor] Applying media mapping...' });
  const updated = ResourceMapper.apply(converterResult.storymapJson, mediaMapping);

  params.progress({ stage: 'done', message: '[Refactor] Conversion pipeline complete.' });
  return { storymapJson: updated, mediaMapping };
}

