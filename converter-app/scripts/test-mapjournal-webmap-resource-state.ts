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
  // Validate action-created replace-media webmap nodes carry viewpoint/zoom/scale and resources mirror these
  const actions: any[] = Array.isArray(result.storymapJson.actions) ? result.storymapJson.actions : [];
  const replaceMediaActions = actions.filter(a => a.event === 'ImmersiveSlide_ReplaceMedia' && a.data?.media);
  let missingNodeState = 0;
  let missingResourceState = 0;
  for (const act of replaceMediaActions) {
    const mediaId: string = act.data.media;
    const node = (result.storymapJson.nodes as any)[mediaId];
    if (!node || node.type !== 'webmap') continue;
    const d = node.data || {};
    const nodeViewpoint = (d as any).viewpoint;
    const nodeZoom = (d as any).zoom;
    const nodeScale = (d as any).scale;
    if (!nodeViewpoint || typeof nodeZoom !== 'number' || typeof nodeScale !== 'number') {
      missingNodeState++;
      console.warn('Missing node state for action media', mediaId, { viewpoint: nodeViewpoint, zoom: nodeZoom, scale: nodeScale });
    }
    const resId = (d as any).map;
    const res = (result.storymapJson.resources as any)[resId];
    const rs = res?.data?.initialState || {};
    if (!rs.viewpoint || typeof rs.zoom !== 'number' || typeof rs.scale !== 'number') {
      missingResourceState++;
      console.warn('Missing resource initialState for action media', resId, { viewpoint: rs.viewpoint, zoom: rs.zoom, scale: rs.scale });
    }
  }
  console.log('Action media nodes without full state:', missingNodeState);
  console.log('Action media resources without full state:', missingResourceState);
  if (missingNodeState || missingResourceState) {
    throw new Error(`State parity check failed (nodes: ${missingNodeState}, resources: ${missingResourceState})`);
  }
  console.log('Wrote output JSON to', outPath);
}
run().catch(e=>{console.error(e);process.exit(1);});
