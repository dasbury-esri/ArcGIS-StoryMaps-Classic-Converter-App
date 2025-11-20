import type { ClassicStoryMapJSON } from './types/classic';
import { ConversionPipeline } from './pipeline/ConversionPipeline';
import type { ConversionContext } from './types/core';

export interface AdapterParams {
  classicJson: ClassicStoryMapJSON;
  storyId: string;
  classicItemId: string;
  username: string;
  token: string;
  themeId: string;
  progress: (e: { stage: string; message: string; current?: number; total?: number }) => void;
  uploader: (url: string, storyId: string, username: string, token: string) => Promise<{ originalUrl: string; resourceName: string; transferred: boolean }>;
}

export async function convertClassicToJsonRefactored(params: AdapterParams) {
  const ctx: ConversionContext = {
    classicItemId: params.classicItemId,
    storyId: params.storyId,
    username: params.username,
    token: params.token,
    themeId: params.themeId,
    progress: params.progress
  };

  const pipeline = new ConversionPipeline({
    classicJson: params.classicJson,
    context: ctx,
    uploader: params.uploader
  });

  return pipeline.run();
}
