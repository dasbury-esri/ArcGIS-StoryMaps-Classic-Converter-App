/*
 * Test detectClassicTemplate across bulk classic JSON samples.
 * Usage: npx ts-node scripts/test-detect-classic-template-bulk.ts [--details] [--filter=TemplateName]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectClassicTemplate } from '../src/refactor/util/detectTemplate.ts';

interface ClassicStoryMapJSON { // minimal typing needed for detection
  values?: any;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bulkDir = path.resolve(__dirname, '../../test_data/classics/bulk');

function readJson(file: string): ClassicStoryMapJSON | null {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse', file, e);
    return null;
  }
}

const args = process.argv.slice(2);
const showDetails = args.includes('--details');
const filterArg = args.find(a => a.startsWith('--filter='));
const filterValue = filterArg ? filterArg.split('=')[1] : null;

const files = fs.readdirSync(bulkDir).filter(f => f.endsWith('.json'));
const counts: Record<string, number> = {};
const results: { file: string; template: string }[] = [];

for (const f of files) {
  const full = path.join(bulkDir, f);
  const json = readJson(full);
  if (!json) continue;
  const template = detectClassicTemplate(json as any);
  counts[template] = (counts[template] || 0) + 1;
  results.push({ file: f, template });
}

// Output summary
console.log('\nTemplate detection summary:');
Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([tpl, count]) => {
  console.log(`${tpl.padEnd(12)} : ${count}`);
});

// Potential ambiguity heuristics
const ambiguous = results.filter(r => r.template === 'Basic');
if (ambiguous.length) {
  console.log(`\nPotentially ambiguous detections (Basic) count: ${ambiguous.length}`);
}

if (showDetails) {
  console.log('\nDetailed detections:');
  results
    .filter(r => !filterValue || r.template === filterValue)
    .sort((a,b) => a.template.localeCompare(b.template) || a.file.localeCompare(b.file))
    .forEach(r => console.log(`${r.template.padEnd(12)} | ${r.file}`));
} else if (filterValue) {
  console.log(`\nFiltered (${filterValue}) detections:`);
  results.filter(r => r.template === filterValue).forEach(r => console.log(r.file));
}

// Simple exit code heuristic: exit 1 if all are Basic (likely detection issue)
const uniqueTemplates = Object.keys(counts);
if (uniqueTemplates.length === 1 && uniqueTemplates[0] === 'Basic') {
  console.error('\nWARNING: All templates detected as Basic; detection logic may be failing.');
  process.exitCode = 1;
}
