#!/usr/bin/env node
/*
 * bump-version.mjs
 * Lightweight semantic/hybrid version bump utility.
 * Supports:
 *   node scripts/bump-version.mjs 0.5.0-alpha.0          # set explicit version
 *   node scripts/bump-version.mjs --type patch           # increment patch
 *   node scripts/bump-version.mjs --type prerelease --pre alpha   # increment/create alpha pre-release
 *   node scripts/bump-version.mjs --dry                  # show what would change
 * Flags:
 *   --type major|minor|patch|prerelease
 *   --pre <identifier>  (used with --type prerelease)
 *   --alpha (shortcut for --type prerelease --pre alpha)
 *   --beta  (shortcut for --type prerelease --pre beta)
 *   --no-changelog (skip CHANGELOG generation)
 *   --release (create GitHub Release after tagging)
 *   --no-release (skip release even if default enabled)
 *   --no-tag            (skip creating git tag)
 *   --no-push           (skip pushing commit/tag)
 *   --dry               (do not modify files or run git)
 */

/* eslint-env node */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const ROOT_PKG = path.join(ROOT,'package.json');
const APP_PKG = path.join(ROOT,'converter-app','package.json');
const VERSION_TS = path.join(ROOT,'converter-app','src','version.ts');

function die(msg){console.error(msg);process.exit(1);} // eslint-disable-line no-console
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf-8'));}
function writeJson(p,obj){fs.writeFileSync(p, JSON.stringify(obj,null,2)+"\n");}

function parseArgs(){
  const args = process.argv.slice(2);
  const out = { explicit: null, type: null, pre: null, dry: false, tag: true, push: true, changelog: true, release: false };
  for (let i=0;i<args.length;i++) {
    const a = args[i];
    if (a === '--type') { out.type = args[++i]; }
    else if (a === '--pre') { out.pre = args[++i]; }
    else if (a === '--alpha') { out.type = 'prerelease'; out.pre = 'alpha'; }
    else if (a === '--beta') { out.type = 'prerelease'; out.pre = 'beta'; }
    else if (a === '--dry') { out.dry = true; }
    else if (a === '--no-tag') { out.tag = false; }
    else if (a === '--no-push') { out.push = false; }
    else if (a === '--no-changelog') { out.changelog = false; }
    else if (a === '--release') { out.release = true; }
    else if (a === '--no-release') { out.release = false; }
    else if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(a)) { out.explicit = a; }
    else die(`Unrecognized argument: ${a}`);
  }
  return out;
}

function parseVersion(v){
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v);
  if (!m) die(`Invalid existing version: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || null };
}

function buildVersion({major,minor,patch,pre}){
  return `${major}.${minor}.${patch}` + (pre ? `-${pre}` : '');
}

function increment(vObj, type, preIdent){
  if (!type) die('Missing --type for incremental bump.');
  if (type === 'major') { vObj.major++; vObj.minor=0; vObj.patch=0; vObj.pre=null; }
  else if (type === 'minor') { vObj.minor++; vObj.patch=0; vObj.pre=null; }
  else if (type === 'patch') { vObj.patch++; vObj.pre=null; }
  else if (type === 'prerelease') {
    if (!preIdent) die('Use --pre <identifier> with --type prerelease');
    if (vObj.pre) {
      const parts = vObj.pre.split('.');
      if (parts[0] === preIdent) {
        // increment numeric part if present, else append .1
        if (parts.length > 1 && /^\d+$/.test(parts[1])) {
          parts[1] = String(+parts[1] + 1);
        } else {
          parts.push('1');
        }
        vObj.pre = parts.join('.');
      } else {
        vObj.pre = `${preIdent}.0`;
      }
    } else {
      vObj.patch++; // typical prerelease increments patch baseline
      vObj.pre = `${preIdent}.0`;
    }
  } else die(`Unsupported bump type: ${type}`);
  return vObj;
}

const args = parseArgs();
const rootPkg = readJson(ROOT_PKG);
const appPkg = readJson(APP_PKG);

const current = rootPkg.version || die('Root package.json missing version');
let nextVersion;
if (args.explicit) {
  nextVersion = args.explicit;
} else {
  const vObj = parseVersion(current);
  nextVersion = buildVersion(increment(vObj, args.type, args.pre));
}

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(nextVersion)) die(`Resulting version invalid: ${nextVersion}`);

// Safety: prevent overwriting existing tag unless forced manually
try {
  const existing = execSync(`git tag --list ${JSON.stringify('v'+nextVersion)}`, {encoding:'utf-8'}).trim();
  if (existing === 'v'+nextVersion) die(`Tag v${nextVersion} already exists. Choose a different version or delete the tag first.`);
} catch {/* ignore */}

console.log(`Current: ${current}`);
console.log(`Next:    ${nextVersion}`);

if (args.dry) {
  console.log('Dry run: no files modified.');
  process.exit(0);
}

rootPkg.version = nextVersion;
appPkg.version = nextVersion;
writeJson(ROOT_PKG, rootPkg);
writeJson(APP_PKG, appPkg);
fs.writeFileSync(VERSION_TS, `export const APP_VERSION = '${nextVersion}';\n`);

execSync(`git add ${JSON.stringify('package.json')} ${JSON.stringify('converter-app/package.json')} ${JSON.stringify('converter-app/src/version.ts')}`);
execSync(`git commit -m ${JSON.stringify('chore(version): bump to '+nextVersion)}`);
// Generate changelog after commit (so diff includes version bump) but before tagging
if (args.changelog) {
  try {
    execSync(`node scripts/generate-changelog.mjs --next ${JSON.stringify(nextVersion)}`); 
    execSync(`git add CHANGELOG.md`);
    execSync(`git commit -m ${JSON.stringify('docs(changelog): add '+nextVersion+' entry')}`);
  } catch (e) {
    console.error('Changelog generation failed:', e.message); // eslint-disable-line no-console
  }
}
if (args.tag) {
  execSync(`git tag -a v${nextVersion} -m ${JSON.stringify('Release v'+nextVersion)}`);
}
if (args.push) {
  execSync('git push origin HEAD');
  if (args.tag) execSync('git push origin --tags');
}

// Optionally create GitHub Release (requires GITHUB_TOKEN)
if (args.release) {
  try {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      console.warn('Skipping release: missing GITHUB_TOKEN'); // eslint-disable-line no-console
    } else {
      const prerelease = /-(alpha|beta|rc)/i.test(nextVersion);
      execSync(`node scripts/generate-release.mjs --version ${JSON.stringify(nextVersion)} ${prerelease ? '--prerelease' : ''}`.trim(), { stdio: 'inherit' });
    }
  } catch (e) {
    console.error('Release generation failed:', e.message); // eslint-disable-line no-console
  }
}

console.log('Version bump complete.');
