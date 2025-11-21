import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { convertClassicToJsonRefactored } from '../src/refactor/index.ts';
import { detectClassicTemplate } from '../src/refactor/util/detectTemplate.ts';
import type { ClassicStoryMapJSON } from '../src/refactor/types/classic.ts';
import type { StoryMapJSON, StoryMapNode, StoryMapImageNode, StoryMapResource } from '../src/refactor/types/core.ts';

interface FileResultSummary {
  file: string;
  template: string;
  sections: number;
  imageNodes: number;
  imageResources: number;
  captionedImages: number;
  altImages: number;
  altWebMaps: number;
  altEmbeds: number;
  altVideos: number;
  totalAltMedia: number;
  actionButtons: number;
  navigateButtons: number;
  navigateButtonsLinked: number;
  navigateButtonsMissingLinks: number;
  inlineNavigateAnchors: number;
  inlineNavigateAnchorsLinked: number;
  inlineNavigateAnchorsMissingLinks: number;
}

async function run() {
  const root = path.resolve(process.cwd(), '..');
  const dir = path.join(root, 'test_data', 'classics', 'MapJournal');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const results: FileResultSummary[] = [];

  const uploader = async (url: string) => {
    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0,8);
    return { originalUrl: url, resourceName: `img_${hash}.json`, transferred: true };
  };
  const progress = () => {};

  for (const file of files) {
    const full = path.join(dir, file);
    let classic: ClassicStoryMapJSON;
    try { classic = JSON.parse(fs.readFileSync(full,'utf-8')); } catch (e) { console.error('Failed parsing', file, e); continue; }
    const template = detectClassicTemplate(classic);
    if (template !== 'Map Journal') {
      continue; // skip non map journal just in case
    }
    try {
      const result = await convertClassicToJsonRefactored({
        classicJson: classic,
        storyId: 'STORY_ID',
        classicItemId: file.replace(/\.json$/, ''),
        username: 'tester',
        token: 'FAKE',
        themeId: 'summit',
        progress,
        uploader: (u)=>uploader(u)
      });
      const json: StoryMapJSON = result.storymapJson;
      const nodes: StoryMapNode[] = Object.values(json.nodes) as StoryMapNode[];
      const imageNodes: StoryMapImageNode[] = nodes.filter(n => n.type === 'image') as StoryMapImageNode[];
      const captionedImages = imageNodes.filter(n => n.data.caption && n.data.caption.trim()).length;
      const altImages = imageNodes.filter(n => n.data.alt && n.data.alt.trim()).length;
      const webmapNodes = nodes.filter(n => n.type === 'webmap');
      const altWebMaps = webmapNodes.filter(n => (n as any).data?.alt && (n as any).data.alt.trim()).length;
      const embedNodes = nodes.filter(n => n.type === 'embed');
      const altEmbeds = embedNodes.filter(n => (n as any).data?.alt && (n as any).data.alt.trim()).length;
      const videoNodes = nodes.filter(n => n.type === 'video');
      const altVideos = videoNodes.filter(n => (n as any).data?.alt && (n as any).data.alt.trim()).length;
      const totalAltMedia = altImages + altWebMaps + altEmbeds + altVideos;
      const imageResources = Object.values(json.resources).filter((r: StoryMapResource) => r.type === 'image').length;
      const sections = nodes.filter(n => n.type === 'immersive-slide').length;
      const actionButtons = nodes.filter(n => n.type === 'action-button').length;
      const buttonNodes = nodes.filter(n => n.type === 'button');
      const navigateButtons = buttonNodes.length;
      // link integrity: non-empty link, matches #ref- pattern, and referenced node exists
      let navigateButtonsLinked = 0;
      for (const b of buttonNodes) {
        const link = (b as any).data?.link as string | undefined;
        if (!link || !link.trim()) continue;
        if (!link.startsWith('#ref-')) continue;
        const targetId = link.replace('#ref-','');
        if (json.nodes[targetId]) {
          navigateButtonsLinked++;
        }
      }
      const navigateButtonsMissingLinks = navigateButtons - navigateButtonsLinked;

      // Inline navigate anchors inside rich text nodes (preserveHtml)
      const BUTTON_CLASS_REGEX = /^btn-(green|orange|purple|yellow|red)$/i;
      let inlineNavigateAnchors = 0;
      let inlineNavigateAnchorsLinked = 0;
      for (const n of nodes) {
        if (n.type !== 'text') continue;
        const data: any = n.data;
        if (!data || !data.preserveHtml || typeof data.text !== 'string') continue;
        const html = data.text as string;
        const anchorRegex = /<a[^>]*data-storymaps=["'][^"'>]+["'][^>]*data-storymaps-type=["']navigate["'][^>]*>[\s\S]*?<\/a>/gi;
        const anchors = html.match(anchorRegex) || [];
        for (const a of anchors) {
          const classAttr = /class=["']([^"'>]+)["']/i.exec(a)?.[1] || '';
          const hasButtonClass = classAttr.split(/\s+/).some(c => BUTTON_CLASS_REGEX.test(c));
          if (hasButtonClass) continue; // those became button nodes, not inline
          inlineNavigateAnchors++;
          const hasHref = /href=["']#ref-[^"'>]+["']/i.test(a);
          if (hasHref) inlineNavigateAnchorsLinked++;
        }
      }
      const inlineNavigateAnchorsMissingLinks = inlineNavigateAnchors - inlineNavigateAnchorsLinked;
      results.push({ file, template, sections, imageNodes: imageNodes.length, imageResources, captionedImages, altImages, altWebMaps, altEmbeds, altVideos, totalAltMedia, actionButtons, navigateButtons, navigateButtonsLinked, navigateButtonsMissingLinks });
      // Append inline metrics to last pushed result (simpler: replace last element)
      const last = results[results.length - 1];
      Object.assign(last, { inlineNavigateAnchors, inlineNavigateAnchorsLinked, inlineNavigateAnchorsMissingLinks });
    } catch (e) {
      console.error('Conversion failed for', file, e);
    }
  }

  const summary = {
    totalFiles: files.length,
    processed: results.length,
    aggregates: {
      sections: sum(results, r=>r.sections),
      imageNodes: sum(results, r=>r.imageNodes),
      imageResources: sum(results, r=>r.imageResources),
      captionedImages: sum(results, r=>r.captionedImages),
      altImages: sum(results, r=>r.altImages),
      altWebMaps: sum(results, r=>r.altWebMaps),
      altEmbeds: sum(results, r=>r.altEmbeds),
      altVideos: sum(results, r=>r.altVideos),
      totalAltMedia: sum(results, r=>r.totalAltMedia),
      actionButtons: sum(results, r=>r.actionButtons),
      navigateButtons: sum(results, r=>r.navigateButtons),
      navigateButtonsLinked: sum(results, r=>r.navigateButtonsLinked),
      navigateButtonsMissingLinks: sum(results, r=>r.navigateButtonsMissingLinks),
      inlineNavigateAnchors: sum(results, r=>r.inlineNavigateAnchors),
      inlineNavigateAnchorsLinked: sum(results, r=>r.inlineNavigateAnchorsLinked),
      inlineNavigateAnchorsMissingLinks: sum(results, r=>r.inlineNavigateAnchorsMissingLinks)
    },
    perFile: results
  };
  const outPath = path.join(root,'test_data','output','mapjournal_bulk_refactor_summary.json');
  fs.writeFileSync(outPath, JSON.stringify(summary,null,2));
  console.log('Map Journal bulk refactor summary written to', outPath);
  console.log('Processed', summary.processed, 'files. Total image nodes:', summary.aggregates.imageNodes);
  console.log('Captioned images:', summary.aggregates.captionedImages, 'Alt images:', summary.aggregates.altImages);
}

function sum<T>(arr:T[], sel:(t:T)=>number){return arr.reduce((acc,t)=>acc+sel(t),0);} 

run().catch(e=>{console.error(e);process.exit(1);});
