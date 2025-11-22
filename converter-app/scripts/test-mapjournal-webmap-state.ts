import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { convertClassicToJsonRefactored } from '../src/refactor/index.ts';

function load(p:string){return JSON.parse(fs.readFileSync(p,'utf-8'));}

async function run(){
  const root = path.resolve(process.cwd(),'..');
  const sample = path.join(root,'test_data','classics','MapJournal','1fe5bdf7a7d741b48605c995455c176b.json');
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
    enrichScenes: false,
    uploader: (u)=>uploader(u)
  });
  const outPath = path.join(root,'test_data','output','mapjournal_webmap_state_sample.json');
  fs.writeFileSync(outPath, JSON.stringify(result.storymapJson,null,2));
  const webmapNodes = Object.values(result.storymapJson.nodes).filter((n:any)=>n.type==='webmap');
  console.log('Webmap node count:', webmapNodes.length);
  for (const wm of webmapNodes.slice(0,5)) {
    console.log('Webmap node snippet:', { caption: wm.data?.caption, extent: wm.data?.extent, mapLayers: wm.data?.mapLayers?.slice(0,3) });
  }
  console.log('Wrote output JSON to', outPath);
}
run().catch(e=>{console.error(e);process.exit(1);});
