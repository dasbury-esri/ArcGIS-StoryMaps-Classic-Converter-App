export type ClassicEntryMedia = {
  image?: { url?: string } | string;
  imageUrl?: string;
  photo?: string;
  video?: { source?: string } | string;
  videoUrl?: string;
  webpage?: { url?: string };
  embed?: { url?: string };
  url?: string;
  webmap?: string;
  appid?: string;
  appId?: string;
};

export type ClassicEntry = {
  title?: string;
  subtitle?: string;
  description?: string;
  webmap?: string;
  headline?: string;
  media?: ClassicEntryMedia;
  content?: ClassicEntryMedia;
  classicJson?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

export type ProgressEvent = {
  stage: 'fetch' | 'detect' | 'draft' | 'convert' | 'media' | 'finalize' | 'done' | 'error';
  message: string;
  current?: number;
  total?: number;
};
