import fs from 'node:fs';
import path from 'node:path';

interface AnalysisSummary {
  legacy: StructureSummary;
  refactor: StructureSummary;
  fieldDifferences: {
    legacyOnly: string[];
    refactorOnly: string[];
  };
}

interface StructureSummary {
  nodeTypes: Record<string, number>;
  resourceTypes: Record<string, number>;
  topKeys: string[];
  avgChildrenPerNode: number;
}

function loadJson(p: string) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function summarize(json: any): StructureSummary {
  const nodeTypes: Record<string, number> = {};
  const resourceTypes: Record<string, number> = {};
  let childCount = 0;
  let nodeCount = 0;

  if (json.nodes) {
    for (const n of Object.values<any>(json.nodes)) {
      nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
      if (Array.isArray(n.children)) childCount += n.children.length;
      nodeCount++;
    }
  }
  if (json.resources) {
    for (const r of Object.values<any>(json.resources)) {
      resourceTypes[r.type] = (resourceTypes[r.type] || 0) + 1;
    }
  }

  const topKeys = Object.keys(json).sort();
  return {
    nodeTypes,
    resourceTypes,
    topKeys,
    avgChildrenPerNode: nodeCount ? childCount / nodeCount : 0
  };
}

function diffTopKeys(a: string[], b: string[]) {
  const aSet = new Set(a);
  const bSet = new Set(b);
  const legacyOnly = [...aSet].filter(k => !bSet.has(k));
  const refactorOnly = [...bSet].filter(k => !aSet.has(k));
  return { legacyOnly, refactorOnly };
}

async function main() {
  const root = path.resolve(process.cwd(), '..');
  const legacyPath = path.resolve(root, 'test_data/output/converted_storymap_json.json');
  const refactorPath = path.resolve(root, 'test_data/output/converted_storymap_json_refactor.json');
  if (!fs.existsSync(legacyPath) || !fs.existsSync(refactorPath)) {
    console.error('Missing required JSON outputs for analysis.');
    process.exit(1);
  }
  const legacy = loadJson(legacyPath);
  const refactor = loadJson(refactorPath);
  const legacySummary = summarize(legacy);
  const refactorSummary = summarize(refactor);
  const fieldDifferences = diffTopKeys(legacySummary.topKeys, refactorSummary.topKeys);

  const result: AnalysisSummary = {
    legacy: legacySummary,
    refactor: refactorSummary,
    fieldDifferences
  };

  const outPath = path.resolve(root, 'test_data/output/legacy_structure_analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('Legacy Structure Analysis written to', outPath);
  console.log('Node type counts (legacy):', legacySummary.nodeTypes);
  console.log('Node type counts (refactor):', refactorSummary.nodeTypes);
  console.log('Resource type counts (legacy):', legacySummary.resourceTypes);
  console.log('Resource type counts (refactor):', refactorSummary.resourceTypes);
  console.log('Legacy-only top-level keys:', fieldDifferences.legacyOnly);
  console.log('Refactor-only top-level keys:', fieldDifferences.refactorOnly);
  console.log('Avg children per node (legacy vs refactor):', legacySummary.avgChildrenPerNode, refactorSummary.avgChildrenPerNode);
}

main().catch(err => {
  console.error('Analysis error:', err);
  process.exit(1);
});
