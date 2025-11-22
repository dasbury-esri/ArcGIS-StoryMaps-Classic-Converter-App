import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { convertClassicToJsonRefactored } from '../src/refactor/index.ts';

function load(p:string){return JSON.parse(fs.readFileSync(p,'utf-8'));}

async function run(){
  const sample = path.join('..','test_data','classics','MapJournal','app1-c3706b1a27e5457aacedb11a0beec6ce.json');
  const classic = load(sample);
  const uploader = async (url: string) => {
    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0,8);
    return { originalUrl: url, resourceName: `img_${hash}.json`, transferred: true };
  };
  const result = await convertClassicToJsonRefactored({
    classicJson: classic,
    storyId: 'STORY_ID',
    classicItemId: 'CLASSIC_ID',
    username: 'tester',
    token: 'FAKE',
    themeId: 'summit',
    progress: ()=>{},
    uploader: (u)=>uploader(u)
  });
  const embedVideos = Object.values(result.storymapJson.nodes).filter((n:any)=>n.type==='embed' && n.data?.embedType==='video');
  const plainVideos = Object.values(result.storymapJson.nodes).filter((n:any)=>n.type==='video');
  console.log('Video embed nodes:', embedVideos.length);
  if (embedVideos.length) {
    console.log(embedVideos.map((n:any)=>({provider:n.data.provider, videoId:n.data.videoId, embedSrc:n.data.embedSrc})));
  }
  console.log('Plain video nodes:', plainVideos.length);
  const decisions = (Object.values(result.storymapJson.resources).find((res:any)=>res.type==='converter-metadata') as any)?.data?.classicMetadata?.mappingDecisions;
  console.log('Decisions.videoEmbeds:', decisions?.videoEmbeds);
}
run().catch(e=>{console.error(e);process.exit(1);});
