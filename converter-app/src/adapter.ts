import type { ClassicStoryMapJSON } from './types/classic.ts';
import type { ConversionContext, StoryMapJSON } from './types/core.ts';
import { ConverterFactory } from './ConverterFactory';
import { MediaTransferService } from './media/MediaTransferService';
import { ResourceMapper } from './media/ResourceMapper';
import { assertStoryMapJson, formatAssertionReport } from './utils/assertions';

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
  isCancelled?: () => boolean; // optional cancellation callback
}

export interface RefactorConversionOutput {
  storymapJson: StoryMapJSON;
  mediaMapping: Record<string, string>;
}

// Unified orchestration for refactored flow
export async function convertClassicToJsonRefactored(params: AdapterParams): Promise<RefactorConversionOutput> {
  const checkCancelled = () => {
    if (params.isCancelled && params.isCancelled()) {
      params.progress({ stage: 'error', message: 'Cancellation requested – aborting.' });
      throw new Error('Conversion cancelled by user intervention');
    }
  };
  const ctx: ConversionContext = {
    classicItemId: params.classicItemId,
    storyId: params.storyId,
    username: params.username,
    token: params.token,
    themeId: params.themeId,
    progress: params.progress
  };

  params.progress({ stage: 'convert', message: '[Refactor] Starting converter factory...' });
  checkCancelled();
  const converterResult = await ConverterFactory.create({
    classicJson: params.classicJson,
    themeId: params.themeId,
    progress: (e) => params.progress(e),
    enrichScenes: params.enrichScenes,
    isCancelled: params.isCancelled,
    classicItemId: params.classicItemId
  });
  checkCancelled();

  params.progress({ stage: 'media', message: '[Refactor] Transferring media...' });
  checkCancelled();
  const mediaMapping = await MediaTransferService.transferBatch({
    urls: converterResult.mediaUrls,
    storyId: ctx.storyId,
    username: ctx.username,
    token: ctx.token,
    progress: ctx.progress,
    uploader: params.uploader,
    isCancelled: params.isCancelled
  });
  checkCancelled();

  params.progress({ stage: 'finalize', message: '[Refactor] Applying media mapping...' });
  checkCancelled();
  const updated = ResourceMapper.apply(converterResult.storymapJson, mediaMapping);

  // Post-mapping assertions to guard schema correctness
  const assertion = assertStoryMapJson(updated);
  if (assertion.errors.length) {
    params.progress({ stage: 'error', message: '[Refactor] Assertion errors detected. Aborting.' });
    throw new Error(formatAssertionReport(assertion));
  }
  if (assertion.warnings.length) {
    params.progress({ stage: 'warn', message: `[Refactor] Assertions warnings: ${assertion.warnings.length}` });
  }

  params.progress({ stage: 'done', message: '[Refactor] Conversion pipeline complete.' });
  return { storymapJson: updated, mediaMapping };
}

