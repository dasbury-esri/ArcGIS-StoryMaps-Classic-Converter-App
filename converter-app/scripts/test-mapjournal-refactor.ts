import fs from 'node:fs';
import path from 'node:path';
import { convertClassicToJsonRefactored } from '../src/refactor/index.ts';
import { createThemeFromClassic } from '../src/refactor/theme/themeMapper.ts';
import crypto from 'node:crypto';

function load(p:string){return JSON.parse(fs.readFileSync(p,'utf-8'));}

async function run(){
  const root = path.resolve(process.cwd(),'..');
  const sampleDir = path.join(root,'test_data','classics','MapJournal');
  const files = fs.readdirSync(sampleDir).filter(f=>f.endsWith('.json'));
  const sample = path.join(sampleDir, files[0]);
  const classic = load(sample);
  const uploader = async (url: string) => {
    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0,8);
    return { originalUrl: url, resourceName: `img_${hash}.json`, transferred: true };
  };
  const progress = (e:any)=>{};
  const result = await convertClassicToJsonRefactored({
    classicJson: classic,
    storyId: 'STORY_ID',
    classicItemId: 'CLASSIC_ID',
    username: 'tester',
    token: 'FAKE',
    themeId: 'summit',
    progress,
    uploader: (u)=>uploader(u)
  });
  const outPath = path.join(root,'test_data','output','mapjournal_refactor_sample.json');
  fs.writeFileSync(outPath, JSON.stringify(result.storymapJson,null,2));
  // Theme mapping output
  const themeJson = createThemeFromClassic(classic as any);
  const themeOut = path.join(root,'test_data','output','mapjournal_refactor_sample_theme.json');
  fs.writeFileSync(themeOut, JSON.stringify(themeJson,null,2));
  console.log('Theme JSON written to', themeOut);
  const images = Object.values(result.storymapJson.nodes).filter((n:any)=>n.type==='image');
  console.log('Image node count:', images.length);
  const imageResources = Object.values(result.storymapJson.resources).filter((r:any)=>r.type==='image');
  console.log('Image resource count:', imageResources.length);
  const sampleSrcs = imageResources.slice(0,5).map((r:any)=>r.data.src || r.data.resourceId);
  console.log('Sample image resource src/resourceIds:', sampleSrcs);
}
run().catch(e=>{console.error(e);process.exit(1);});
