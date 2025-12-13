#!/usr/bin/env tsx
/*
Search ArcGIS Online for classic StoryMaps (type:"Web Mapping Application" AND typekeywords:"Story Map")
Supports scope options: user, org, livingAtlas, public.
Optional template filters: Swipe, Spyglass, Map Journal, MapJournal.
Parses item data for template and version fields (template, templateCreation, templateLastEdit).

Auth:
- Prefer ARCGIS_TOKEN (OAuth2 token) from env for AGO REST
- If not present, attempt username/password via ARCGIS_USERNAME/ARCGIS_PASSWORD to request a token

Usage:
  npx --yes tsx scripts/search-classic-storymaps.ts --scope user --templates Swipe,MapJournal --limit 100
  SM_USERNAME="$ARCGIS_USERNAME" SM_PASSWORD="$ARCGIS_PASSWORD" npx --yes tsx scripts/search-classic-storymaps.ts --scope org --limit 200

Outputs:
- Prints a summary grouped by template and version counts
- Writes raw results to test-results/search-classic-storymaps-<scope>-<timestamp>.json
*/

import fs from 'node:fs';
import path from 'node:path';
import { URLSearchParams } from 'node:url';
import { getOrgBase } from './orgBase';

type Scope = 'user' | 'org' | 'livingAtlas' | 'public';
const ORG_BASE = getOrgBase();

interface Args {
  scope: Scope;
  templates?: string[];
  limit: number;
  orgId?: string;
  username?: string;
  out?: 'json' | 'csv';
  access?: 'public' | 'org' | 'private' | 'shared';
  dataModel?: 'TWO_WEBMAPS' | 'TWO_LAYERS';
}
// Flexible template keyword synonyms for classic apps
const TEMPLATE_SYNONYMS: Record<string, string[]> = {
  'Story Map Basic': [
    'Story Map Basic', 'Basic', 'story map basic', 'storymapbasic', 'basic storymap'
  ],
  'Cascade': [
    'Cascade', 'Story Map Cascade', 'story map cascade', 'storymapcascade', 'cascade storymap'
  ],
  'Crowdsource': [
    'Crowdsource', 'Story Map Crowdsource', 'story map crowdsource', 'storymapcrowdsource', 'crowdsource storymap'
  ],
  'Map Journal': [
    'Map Journal', 'Story Map Journal', 'MapJournal', 'map journal', 'mapjournal', 'storymapjournal', 'story map journal'
  ],
  'Map Tour': [
    'Map Tour', 'Story Map Tour', 'MapTour', 'map tour', 'maptour', 'storymaptour', 'story map tour'
  ],
  'Map Series': [
    'Map Series', 'Story Map Series', 'MapSeries', 'map series', 'mapseries', 'storymapseries', 'story map series'
  ],
  'Shortlist': [
    'Shortlist', 'Story Map Shortlist', 'story map shortlist', 'storymapshortlist', 'shortlist storymap'
  ],
  'Swipe': [
    'Swipe', 'Story Map Swipe', 'story map swipe', 'storymapswipe', 'swipe storymap'
  ],
  'Spyglass': [
    'Spyglass', 'Story Map Spyglass', 'story map spyglass', 'storymapspyglass', 'spyglass storymap'
  ],
  'Playlist': [
    'Playlist', 'Story Map Playlist', 'story map playlist', 'storymapplaylist', 'playlist storymap'
  ],
  'Countdown': [
    'Countdown', 'Story Map Countdown', 'story map countdown', 'storymapcountdown', 'countdown storymap'
  ]
};


interface AgoItem {
  id: string;
  title: string;
  owner: string;
  orgId?: string;
  type: string;
  typeKeywords?: string[];
  tags?: string[];
  snippet?: string;
  access?: string;
}

interface ItemDataInfo {
  id: string;
  template?: string;
  templateCreation?: string;
  templateLastEdit?: string;
  templateVersion?: string;
  dataModel?: 'TWO_WEBMAPS' | 'TWO_LAYERS';
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { scope: 'public', limit: 100, out: 'json' } as any;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope') {
      args.scope = argv[++i] as Scope;
    } else if (a === '--templates') {
      args.templates = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (a === '--limit') {
      args.limit = parseInt(argv[++i], 10) || 100;
    } else if (a === '--orgId') {
      args.orgId = argv[++i];
    } else if (a === '--username') {
      args.username = argv[++i];
    } else if (a === '--out') {
      const v = (argv[++i] || '').toLowerCase();
      args.out = v === 'csv' ? 'csv' : 'json';
    } else if (a === '--access') {
      const v = (argv[++i] || '').toLowerCase();
      if (v === 'public' || v === 'org' || v === 'private' || v === 'shared') {
        args.access = v as any;
      }
    } else if (a === '--dataModel') {
      const v = (argv[++i] || '').toUpperCase();
      if (v === 'TWO_WEBMAPS' || v === 'TWO_LAYERS') args.dataModel = v as any;
    }
  }
  return args;
}

async function getToken(): Promise<string | undefined> {
  const envToken = process.env.ARCGIS_TOKEN || process.env.SM_TOKEN;
  if (envToken) return envToken;
  const username = process.env.ARCGIS_USERNAME || process.env.SM_USERNAME;
  const password = process.env.ARCGIS_PASSWORD || process.env.SM_PASSWORD;
  if (!username || !password) return undefined;
  const params = new URLSearchParams({
    username,
    password,
    referer: ORG_BASE,
    f: 'json'
  });
  const resp = await fetch(`${ORG_BASE}/sharing/rest/generateToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const json = await resp.json().catch(() => ({}));
  return json.token;
}

function buildSearchQuery(args: Args, username?: string): string {
  const parts: string[] = [];
  parts.push('type:"Web Mapping Application"');
  parts.push('typekeywords:"Story Map"');
  if (args.templates && args.templates.length) {
    // add OR clauses for template keywords with synonyms
    const tmplClauses: string[] = [];
    for (const t of args.templates) {
      const key = Object.keys(TEMPLATE_SYNONYMS).find(k => k.toLowerCase() === t.toLowerCase()) || t;
      const syns = TEMPLATE_SYNONYMS[key] || [t];
      // Build typekeywords ORs; prefer exact TitleCase and known camelCase variations
      const kwOrs = new Set<string>();
      for (const s of syns) {
        // Normalized forms
        const exact = s.trim();
        const camel = exact.replace(/\s+/g, '');
        const title = exact
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        kwOrs.add(`typekeywords:"${title}"`);
        if (camel !== title.replace(/\s+/g, '')) kwOrs.add(`typekeywords:"${camel}"`);
      }
      tmplClauses.push(`(${Array.from(kwOrs).join(' OR ')})`);
    }
    parts.push(`(${tmplClauses.join(' OR ')})`);
  }
  // scope
  if (args.scope === 'user' && username) {
    parts.push(`owner:${username}`);
  } else if (args.scope === 'org' && args.orgId) {
    parts.push(`orgid:${args.orgId}`);
  } else if (args.scope === 'public') {
    parts.push('access:public');
  } else if (args.scope === 'livingAtlas') {
    // Best available filter flag; presence may vary by item
    parts.push('isPartOfLivingAtlas:true');
  }
  // explicit access filter flag, if provided
  if (args.access) {
    parts.push(`access:${args.access}`);
  }
  return parts.join(' AND ');
}

async function getOrgId(token?: string): Promise<string | undefined> {
  if (!token) return undefined;
  const url = `${ORG_BASE}/sharing/rest/community/self?f=json&token=${encodeURIComponent(token)}`;
  const resp = await fetch(url);
  if (!resp.ok) return undefined;
  const json = await resp.json();
  return json.orgId;
}

async function searchAgo(query: string, limit: number, token?: string): Promise<AgoItem[]> {
  const params = new URLSearchParams({
    q: query,
    num: String(limit),
    sortField: 'title',
    sortOrder: 'asc',
    f: 'json'
  });
  if (token) params.set('token', token);
  const url = `${ORG_BASE}/sharing/rest/search?${params.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Search failed: ${resp.status} ${text}`);
  }
  const json = await resp.json();
  return (json.results || []) as AgoItem[];
}

async function fetchItemInfo(id: string, token?: string): Promise<Partial<AgoItem>> {
  const params = new URLSearchParams({ f: 'json' });
  if (token) params.set('token', token);
  const url = `${ORG_BASE}/sharing/rest/content/items/${id}?${params.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) return { id } as Partial<AgoItem>;
  try {
    const json = await resp.json();
    return {
      id: json.id,
      title: json.title,
      owner: json.owner,
      orgId: json.orgId,
      type: json.type,
      typeKeywords: json.typeKeywords,
      tags: json.tags,
      snippet: json.snippet,
      access: json.access,
      created: json.created,
      modified: json.modified,
    } as Partial<AgoItem>;
  } catch {
    return { id } as Partial<AgoItem>;
  }
}

async function fetchItemData(id: string, token?: string): Promise<ItemDataInfo> {
  const params = new URLSearchParams({ f: 'json' });
  if (token) params.set('token', token);
  const url = `${ORG_BASE}/sharing/rest/content/items/${id}/data?${params.toString()}`;
  const resp = await fetch(url);
  const info: ItemDataInfo = { id };
  if (!resp.ok) return info;
  // Attempt to parse as JSON; some classic apps return HTML if private
  try {
    const json = await resp.json();
    const values = (json && (json.values || json)) as any;
    // Flexible template name discovery
    const tVal = values?.template;
    if (typeof tVal === 'string') {
      info.template = tVal;
    } else if (tVal && typeof tVal === 'object') {
      info.template = tVal.name ?? String(tVal);
      // Shortlist-like schemas
      if (typeof tVal.editedWith === 'string') info.templateVersion = tVal.editedWith;
      if (!info.templateVersion && typeof tVal.createdWith === 'string') info.templateVersion = tVal.createdWith;
    }
    // Map Tour-like schemas
    if (typeof values?.templateVersion === 'string') info.templateVersion = values.templateVersion;
    // Swipe/Map Journal-like schemas
    if (typeof values?.templateLastEdit === 'string') info.templateLastEdit = values.templateLastEdit;
    if (typeof values?.templateCreation === 'string') info.templateCreation = values.templateCreation;

    // Detect Swipe/Spyglass data model via explicit values.dataModel
    const tmplName = (info.template || '').toLowerCase();
    const isSwipeOrSpyglass = tmplName.includes('swipe') || tmplName.includes('spyglass');
    if (isSwipeOrSpyglass && typeof values?.dataModel === 'string') {
      const dm = values.dataModel;
      if (dm === 'TWO_WEBMAPS' || dm === 'TWO_LAYERS') {
        info.dataModel = dm;
      }
    }
  } catch {
    // ignore
  }
  return info;
}

function groupSummary(items: (AgoItem & ItemDataInfo)[]) {
  const byTemplate = new Map<string, Map<string, number>>(); // template -> version -> count
  for (const it of items) {
    const rawTmpl = (it.template ?? 'Unknown') as any;
    const rawVer = (it.templateVersion ?? it.templateLastEdit ?? it.templateCreation ?? 'Unknown') as any;
    const tmpl = typeof rawTmpl === 'string' ? rawTmpl : String(rawTmpl);
    const ver = typeof rawVer === 'string' ? rawVer : String(rawVer);
    if (!byTemplate.has(tmpl)) byTemplate.set(tmpl, new Map());
    const m = byTemplate.get(tmpl)!;
    m.set(ver, (m.get(ver) || 0) + 1);
  }
  const summary: any[] = [];
  for (const [tmpl, versions] of byTemplate.entries()) {
    summary.push({
      template: tmpl,
      versions: Array.from(versions.entries()).map(([v, c]) => ({ version: v, count: c }))
    });
  }
  return summary.sort((a, b) => String(a.template).localeCompare(String(b.template)));
}

async function main() {
  const args = parseArgs();
  const token = await getToken();
  const username = process.env.ARCGIS_USERNAME || process.env.SM_USERNAME || args.username;
  let orgId = args.orgId;
  if (args.scope === 'org' && !orgId) {
    orgId = await getOrgId(token);
  }
  const query = buildSearchQuery({ ...args, orgId }, username);
  console.log('[query]', query);
  const results = await searchAgo(query, args.limit, token);
  console.log(`[results] ${results.length}`);
  const enriched: (AgoItem & ItemDataInfo)[] = [];
  for (const it of results) {
    const info = await fetchItemInfo(it.id, token);
    const data = await fetchItemData(it.id, token);
    enriched.push({ ...it, ...info, ...data });
  }
  // Enforce strict org filter using item orgId when org scope. Drop items with missing or mismatched orgId.
  if (args.scope === 'org') {
    if (!orgId) {
      console.warn('[org-filter] No orgId resolved from community/self; results may include non-org items.');
    } else {
      const before = enriched.length;
      const filtered = enriched.filter(e => e.orgId === orgId);
      const dropped = before - filtered.length;
      if (dropped > 0) {
        console.log(`[org-filter] dropped ${dropped} items not in orgId=${orgId}`);
      }
      enriched.length = 0;
      enriched.push(...filtered);
    }
  }
  // Optional explicit access filter (post-fetch) to ensure exact match on item.access
  if (args.access) {
    const before = enriched.length;
    const filtered = enriched.filter(e => (e.access || '').toLowerCase() === args.access);
    const dropped = before - filtered.length;
    if (dropped > 0) {
      console.log(`[access-filter] dropped ${dropped} items not matching access=${args.access}`);
    }
    enriched.length = 0;
    enriched.push(...filtered);
  }
  // Optional dataModel filter (applies to Swipe/Spyglass items only)
  if (args.dataModel) {
    const before = enriched.length;
    const filtered = enriched.filter(e => e.dataModel === args.dataModel);
    const dropped = before - filtered.length;
    if (dropped > 0) {
      console.log(`[dataModel-filter] dropped ${dropped} items not matching dataModel=${args.dataModel}`);
    }
    enriched.length = 0;
    enriched.push(...filtered);
  }
  const summary = groupSummary(enriched);
  const outDir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (args.out === 'csv') {
    // Sort by created descending (undefined treated as 0)
    enriched.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    const outfile = path.join(outDir, `search-classic-storymaps-${args.scope}-${stamp}.csv`);
    const headers = ['id','title','classic-template','classic-template-version','dataModel','url','created','modified','owner','orgId','access'];
    const lines = [headers.join(',')];
    for (const it of enriched) {
      const tmpl = it.template ?? '';
      const ver = it.templateVersion ?? it.templateLastEdit ?? it.templateCreation ?? '';
      const dataModel = it.dataModel ?? '';
      const createdDate = it.created ? new Date(it.created).toISOString() : '';
      const modifiedDate = it.modified ? new Date(it.modified).toISOString() : '';
      const url = `${ORG_BASE}/home/item.html?id=${it.id}`;
      const safe = (v: any) => String(v ?? '').replace(/\r|\n/g,' ').replace(/,/g,' ');
      const row = [it.id, safe(it.title), safe(tmpl), safe(ver), safe(dataModel), url, createdDate, modifiedDate, safe(it.owner), safe(it.orgId), safe(it.access)].map(v => v ?? '');
      lines.push(row.join(','));
    }
    fs.writeFileSync(outfile, lines.join('\n'));
    console.log('[summary]', JSON.stringify(summary, null, 2));
    console.log('[saved]', outfile);
  } else {
    const outfile = path.join(outDir, `search-classic-storymaps-${args.scope}-${stamp}.json`);
    fs.writeFileSync(outfile, JSON.stringify({ query, scope: args.scope, summary, items: enriched }, null, 2));
    console.log('[summary]', JSON.stringify(summary, null, 2));
    console.log('[saved]', outfile);
  }
}

main().catch(err => {
  console.error('[error]', err?.message || err);
  process.exit(1);
});
