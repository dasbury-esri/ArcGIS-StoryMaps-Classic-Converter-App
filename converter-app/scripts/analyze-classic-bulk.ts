import fs from 'node:fs';
import path from 'node:path';
import { detectClassicTemplate } from '../src/refactor/util/detectTemplate.ts';

interface ClassicStats {
  file: string;
  template: string;
  sectionCount: number;
  topLevelWebMap?: string;
  sectionWebMaps: number;
  imageCount: number;
  videoCount: number;
  webpageCount: number;
  audioCount: number;
  hasDescription: boolean;
  hasSubtitle: boolean;
}

interface AggregateStats {
  totalFiles: number;
  templateCounts: Record<string, number>;
  avgSections: number;
  avgImagesPerStory: number;
  avgVideosPerStory: number;
  avgWebMapsPerStory: number;
  avgWebMapsTopLevel: number;
}

function safeGet(obj: any, pathStr: string): any {
  return pathStr.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function analyzeClassic(json: any, file: string): ClassicStats {
  const values = json.values || {};
  const template = detectClassicTemplate(json);
  const sections: any[] = safeGet(values, 'story.sections') || [];
  let imageCount = 0;
  let videoCount = 0;
  let webpageCount = 0;
  let audioCount = 0;
  let sectionWebMaps = 0;
  for (const sec of sections) {
    const media = sec.media || {};
    if (media.image?.url) imageCount++;
    if (media.video?.url) videoCount++;
    if (media.webpage?.url) webpageCount++;
    if (media.audio?.url) audioCount++;
    if (media.webmap?.id) sectionWebMaps++;
  }
  const topLevelWebMap = values.webmap;
  return {
    file: path.basename(file),
    template,
    sectionCount: sections.length,
    topLevelWebMap,
    sectionWebMaps,
    imageCount,
    videoCount,
    webpageCount,
    audioCount,
    hasDescription: !!values.description,
    hasSubtitle: !!values.subtitle
  };
}

function aggregate(stats: ClassicStats[]): AggregateStats {
  const templateCounts: Record<string, number> = {};
  let totalSections = 0;
  let totalImages = 0;
  let totalVideos = 0;
  let totalWebMaps = 0; // section webmaps
  let totalTopLevelWebMaps = 0;
  for (const s of stats) {
    templateCounts[s.template] = (templateCounts[s.template] || 0) + 1;
    totalSections += s.sectionCount;
    totalImages += s.imageCount;
    totalVideos += s.videoCount;
    totalWebMaps += s.sectionWebMaps;
    if (s.topLevelWebMap) totalTopLevelWebMaps += 1;
  }
  const totalFiles = stats.length;
  return {
    totalFiles,
    templateCounts,
    avgSections: totalFiles ? totalSections / totalFiles : 0,
    avgImagesPerStory: totalFiles ? totalImages / totalFiles : 0,
    avgVideosPerStory: totalFiles ? totalVideos / totalFiles : 0,
    avgWebMapsPerStory: totalFiles ? totalWebMaps / totalFiles : 0,
    avgWebMapsTopLevel: totalFiles ? totalTopLevelWebMaps / totalFiles : 0
  };
}

async function main() {
  const root = path.resolve(process.cwd(), '..');
  const classicsDir = path.resolve(root, 'test_data/classics/bulk');
  const files = fs.readdirSync(classicsDir).filter(f => f.endsWith('.json'));
  const stats: ClassicStats[] = [];
  for (const f of files) {
    try {
      const json = JSON.parse(fs.readFileSync(path.join(classicsDir, f), 'utf8'));
      stats.push(analyzeClassic(json, f));
    } catch (err) {
      console.error('Failed to parse', f, err);
    }
  }
  const agg = aggregate(stats);
  const result = { aggregate: agg, stories: stats };
  const outPath = path.resolve(root, 'test_data/output/classic_bulk_analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('Bulk classic analysis written to', outPath);
  console.log('Template distribution:', agg.templateCounts);
  console.log('Avg sections/images/videos/webmaps(top-level,section):', agg.avgSections, agg.avgImagesPerStory, agg.avgVideosPerStory, agg.avgWebMapsTopLevel, agg.avgWebMapsPerStory);
}

main().catch(err => {
  console.error('Bulk analysis error:', err);
  process.exit(1);
});
