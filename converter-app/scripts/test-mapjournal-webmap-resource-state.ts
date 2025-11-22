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
  const outPath = path.join(root,'test_data','output','mapjournal_webmap_resource_state_sample.json');
  fs.writeFileSync(outPath, JSON.stringify(result.storymapJson,null,2));
  const wmResources = Object.entries(result.storymapJson.resources).filter(([_,r]:any)=>r.type==='webmap');
  console.log('Webmap resource count:', wmResources.length);
  let differing = 0;
  const extents: string[] = [];
  for (const [id,res] of wmResources.slice(0,10)) {
    const extentObj = res.data?.initialState?.extent;
    const layers = res.data?.initialState?.mapLayers?.slice(0,3);
    const summary = extentObj ? JSON.stringify(extentObj) : 'none';
    if (extents.length && summary !== extents[extents.length-1]) differing++;
    extents.push(summary);
    console.log('Resource snippet', id, { extent: extentObj, layers });
  }
  console.log('Differing sequential extent count among first 10 resources:', differing);
  console.log('Wrote output JSON to', outPath);
}
run().catch(e=>{console.error(e);process.exit(1);});
