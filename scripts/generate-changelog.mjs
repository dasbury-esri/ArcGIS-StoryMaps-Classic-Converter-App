#!/usr/bin/env node
/* eslint-env node */
/**
 * generate-changelog.mjs
 * Appends a changelog entry for the current (un-tagged) version.
 * Assumes package.json version has already been updated & committed.
 * Usage: node scripts/generate-changelog.mjs [--since <tag>] [--next <version>] [--dry]
 * If --since omitted, uses latest existing tag reachable from HEAD.
 * If --next omitted, uses version from root package.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function run(cmd){return execSync(cmd,{encoding:'utf-8'}).trim();}
function die(msg){console.error(msg);process.exit(1);} // eslint-disable-line no-console

const args = process.argv.slice(2);
const opts = { since:null, next:null, dry:false };
for (let i=0;i<args.length;i++) {
  const a=args[i];
  if (a==='--since') opts.since=args[++i];
  else if (a==='--next') opts.next=args[++i];
  else if (a==='--dry') opts.dry=true;
  else die('Unknown arg '+a);
}

const rootPkg = JSON.parse(fs.readFileSync(path.join(process.cwd(),'package.json'),'utf-8'));
if (!opts.next) opts.next = rootPkg.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(opts.next)) die('Invalid next version '+opts.next);

// Determine previous tag
if (!opts.since) {
  const tags = run('git tag --sort=-creatordate').split(/\n/).filter(Boolean);
  // pick latest tag other than the new version tag if already created
  opts.since = tags.find(t=>t!==`v${opts.next}`) || null;
}

// Collect commits since previous tag (or all if none)
let range = '';
if (opts.since) range = `${opts.since}..HEAD`;
// Use placeholder to avoid shell interpreting % sequences unexpectedly
// Use %x09 (tab) as delimiter to avoid shell pipe interpretation
const raw = run(`git log ${range} --pretty=format:%H%x09%s`);
if (!raw) die('No commits found for changelog range');

const commits = raw.split(/\n/).map(l=>{
  const [hash,msg] = l.split('\t');
  return { hash, msg };
}).filter(c=>c.msg);

// Conventional commit grouping
const groups = {
  Features: [],
  Fixes: [],
  Refactors: [],
  Docs: [],
  Performance: [],
  Tests: [],
  Build: [],
  CI: [],
  Chore: [],
  Other: []
};
for (const c of commits) {
  const m = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(c.msg);
  let type, subject;
  if (m) { type=m[1].toLowerCase(); subject=m[2]; } else { subject=c.msg; }
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
let section = `\n## [${opts.next}] - ${dateStr}\n`;
for (const [title,items] of Object.entries(groups)) {
  if (!items.length) continue;
  section += `\n### ${title}\n` + items.join('\n') + '\n';
}

const changelogPath = path.join(process.cwd(),'CHANGELOG.md');
let existing = '';
if (fs.existsSync(changelogPath)) existing = fs.readFileSync(changelogPath,'utf-8');
if (!existing) {
  existing = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
}
const updated = existing + section + '\n';

if (opts.dry) {
  console.log(updated);
  process.exit(0);
}
fs.writeFileSync(changelogPath, updated);
console.log('CHANGELOG updated: added section for', opts.next);
