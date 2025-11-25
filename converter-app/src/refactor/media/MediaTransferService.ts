import type { ProgressCallback } from '../types/core.ts';

export interface TransferResult {
  originalUrl: string;
  resourceName: string;
  transferred: boolean;
}

export interface MediaTransferParams {
  urls: string[];
  storyId: string;
  username: string;
  token: string;
  progress: ProgressCallback;
  uploader: (url: string, storyId: string, username: string, token: string) => Promise<TransferResult>;
  isCancelled?: () => boolean;
}

export class MediaTransferService {
  static async transferBatch(params: MediaTransferParams): Promise<Record<string, string>> {
    const { urls, storyId, username, token, progress, uploader, isCancelled } = params;
    const mapping: Record<string, string> = {};
    for (let i = 0; i < urls.length; i++) {
      if (isCancelled && isCancelled()) throw new Error('Conversion cancelled by user intervention');
      const url = urls[i];
      progress({ stage: 'media', message: `Transferring media ${i + 1}/${urls.length}`, current: i + 1, total: urls.length });
      try {
        if (isCancelled && isCancelled()) throw new Error('Conversion cancelled by user intervention');
        const result = await uploader(url, storyId, username, token);
        if (result.transferred) {
          mapping[result.originalUrl] = result.resourceName;
        }
      } catch (err) {
        // swallow errors for individual media; continue batch
      }
    }
    if (isCancelled && isCancelled()) throw new Error('Conversion cancelled by user intervention');
    return mapping;
  }
}
