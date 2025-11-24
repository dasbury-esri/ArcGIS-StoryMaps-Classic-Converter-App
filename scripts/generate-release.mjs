#!/usr/bin/env node
/* eslint-env node */
/**
 * generate-release.mjs
 * Generate grouped release notes from commits since previous tag and optionally
 * create a GitHub Release via REST API.
 *
 * Usage examples:
 *   node scripts/generate-release.mjs --version 0.4.0-alpha.2 --notes-only
 *   node scripts/generate-release.mjs --version 0.4.0-alpha.2 --prerelease
 *   node scripts/generate-release.mjs --draft
 *   node scripts/generate-release.mjs                # uses package.json version
 *
 * Flags:
 *   --version <v>      Explicit version (defaults to root package.json version)
 *   --since <tag>      Override previous tag (default: latest tag != current)
 *   --draft            Create release as draft
 *   --prerelease       Mark release as prerelease (auto if version has -alpha/-beta/-rc)
 *   --notes-only       Print notes to stdout; do not call GitHub API
 *   --dry              Alias of --notes-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import fetch from 'node-fetch';

function run(cmd){return execSync(cmd,{encoding:'utf-8'}).trim();}
function die(msg){console.error(msg);process.exit(1);} // eslint-disable-line no-console

const args = process.argv.slice(2);
const opts = { version:null, since:null, draft:false, prerelease:false, notesOnly:false };
for (let i=0;i<args.length;i++) {
  const a=args[i];
  if (a==='--version') opts.version=args[++i];
  else if (a==='--since') opts.since=args[++i];
  else if (a==='--draft') opts.draft=true;
  else if (a==='--prerelease') opts.prerelease=true;
  else if (a==='--notes-only' || a==='--dry') opts.notesOnly=true;
  else die('Unknown arg '+a);
}

const rootPkg = JSON.parse(fs.readFileSync(path.join(process.cwd(),'package.json'),'utf-8'));
if (!opts.version) opts.version = rootPkg.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(opts.version)) die('Invalid version '+opts.version);

// Auto-prerelease detection
if (!opts.prerelease && /-(alpha|beta|rc)/i.test(opts.version)) opts.prerelease = true;

// Determine previous tag
if (!opts.since) {
  const tags = run('git tag --sort=-creatordate').split(/\n/).filter(Boolean);
  opts.since = tags.find(t=>t!==`v${opts.version}`) || null;
}
const range = opts.since ? `${opts.since}..HEAD` : '';
// Tab delimiter to avoid shell issues
const raw = run(`git log ${range} --pretty=format:%H%x09%s`);
if (!raw) die('No commits found for release notes range');
const commits = raw.split(/\n/).map(l=>{const [hash,msg]=l.split('\t');return {hash,msg};}).filter(c=>c.msg);

const groups = {
  Features: [], Fixes: [], Refactors: [], Docs: [], Performance: [], Tests: [], Build: [], CI: [], Chore: [], Other: []
};
for (const c of commits) {
  const m = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(c.msg);
  let type, subject; if (m){ type=m[1].toLowerCase(); subject=m[2]; } else { subject=c.msg; }
  const entry = `- ${subject} (${c.hash.substring(0,7)})`;
  switch(type){
    case 'feat': groups.Features.push(entry); break;
    case 'fix': groups.Fixes.push(entry); break;
    case 'refactor': groups.Refactors.push(entry); break;
    case 'docs': groups.Docs.push(entry); break;
    case 'perf': groups.Performance.push(entry); break;
    case 'test': groups.Tests.push(entry); break;
    case 'build': groups.Build.push(entry); break;
    case 'ci': groups.CI.push(entry); break;
    case 'chore': groups.Chore.push(entry); break;
    default: groups.Other.push(entry); break;
  }
}
const dateStr = new Date().toISOString().slice(0,10);
let body = `## ${opts.version} (${dateStr})\n`;
for (const [title,items] of Object.entries(groups)) {
  if (!items.length) continue; body += `\n### ${title}\n` + items.join('\n') + '\n';
}

if (opts.notesOnly) { console.log(body); process.exit(0); }

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.log(body);
  die('Missing GITHUB_TOKEN environment variable; printed notes instead.');
}

const owner = 'dasbury-esri';
const repo = 'ArcGIS-StoryMaps-Classic-Converter-App';

async function createRelease(){
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method:'POST',
    headers:{
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json'
    },
    body: JSON.stringify({
      tag_name: `v${opts.version}`,
      name: `v${opts.version}`,
      body,
      draft: opts.draft,
      prerelease: opts.prerelease
    })
  });
  if (!res.ok) {
    const txt = await res.text();
    die(`GitHub release failed (${res.status}): ${txt}`);
  }
  const json = await res.json();
  console.log('Release created:', json.html_url);
}
createRelease().catch(e=>die(e.message));
