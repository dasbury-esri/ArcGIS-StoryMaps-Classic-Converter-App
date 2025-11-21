import fs from 'node:fs';
import path from 'node:path';
import { createThemeFromClassic } from '../src/refactor/theme/themeMapper.ts';

interface ThemeSummaryEntry {
  file: string;
  title: string;
  themeMajor: string;
  baseThemeId: string;
  panel?: string;
  dotNav?: string;
  text?: string;
  textLink?: string;
  softText?: string;
  // Layout mapping decisions (derived locally, mirrors converter logic)
  classicLayoutId?: string;
  classicLayoutSize?: string;
  classicLayoutPosition?: string;
  mappedSubtype?: string;
  mappedNarrativePanelSize?: string;
  mappedNarrativePanelPosition?: string;
}

interface ThemeBulkSummary {
  processed: number;
  perFile: ThemeSummaryEntry[];
  aggregates: {
    baseThemeSummit: number;
    baseThemeObsidian: number;
    uniquePanelColors: number;
    uniqueDotNavColors: number;
    layoutDistributions: {
      classicLayoutId: Record<string, number>;
      classicLayoutSize: Record<string, number>;
      classicLayoutPosition: Record<string, number>;
      mappedSubtype: Record<string, number>;
      mappedNarrativePanelSize: Record<string, number>;
      mappedNarrativePanelPosition: Record<string, number>;
    };
  }
}

function run() {
  const root = path.resolve(process.cwd(), '..');
  const classicsDir = path.join(root, 'test_data', 'classics', 'MapJournal');
  const outDir = path.join(root, 'test_data', 'output');
  const files = fs.readdirSync(classicsDir).filter(f => f.endsWith('.json'));
  const summaries: ThemeSummaryEntry[] = [];

  for (const file of files) {
    const full = path.join(classicsDir, file);
    let classic: any;
    try { classic = JSON.parse(fs.readFileSync(full,'utf-8')); } catch (e) { console.error('Skip (parse error):', file); continue; }
    const themeJson = createThemeFromClassic(classic);
    const baseName = file.replace(/\.json$/, '');
    const themeOutPath = path.join(outDir, baseName + '_theme.json');
    fs.writeFileSync(themeOutPath, JSON.stringify(themeJson, null, 2));
    const colors = classic?.values?.settings?.theme?.colors || {};
    // Layout mapping replication (same as MapJournalConverter)
    const layoutId = classic?.values?.settings?.layout?.id || 'side';
    const layoutCfg = (classic?.values?.settings?.layoutOptions?.layoutCfg as { size?: string; position?: string }) || {};
    const classicLayoutSize = layoutCfg.size || 'medium';
    const classicLayoutPosition = layoutCfg.position || 'right';
    const mappedSubtype = layoutId === 'float' ? 'floating-panel' : 'docked-panel';
    let mappedNarrativePanelSize: 'small' | 'medium' | 'large' = 'medium';
    if (classicLayoutSize === 'small' || classicLayoutSize === 'medium' || classicLayoutSize === 'large') mappedNarrativePanelSize = classicLayoutSize as any;
    const mappedNarrativePanelPosition: 'start' | 'end' = classicLayoutPosition === 'left' ? 'start' : 'end';
    summaries.push({
      file,
      title: themeJson.title,
      themeMajor: colors.themeMajor || '',
      baseThemeId: themeJson.baseThemeId,
      panel: colors.panel,
      dotNav: colors.dotNav,
      text: colors.text,
      textLink: colors.textLink,
      softText: colors.softText,
      classicLayoutId: layoutId,
      classicLayoutSize,
      classicLayoutPosition,
      mappedSubtype,
      mappedNarrativePanelSize,
      mappedNarrativePanelPosition
    });
  }

  const aggregates = {
    baseThemeSummit: summaries.filter(s => s.baseThemeId === 'summit').length,
    baseThemeObsidian: summaries.filter(s => s.baseThemeId === 'obsidian').length,
    uniquePanelColors: new Set(summaries.map(s => s.panel).filter(Boolean)).size,
    uniqueDotNavColors: new Set(summaries.map(s => s.dotNav).filter(Boolean)).size,
    layoutDistributions: {
      classicLayoutId: countBy(summaries, s => s.classicLayoutId || 'unknown'),
      classicLayoutSize: countBy(summaries, s => s.classicLayoutSize || 'unknown'),
      classicLayoutPosition: countBy(summaries, s => s.classicLayoutPosition || 'unknown'),
      mappedSubtype: countBy(summaries, s => s.mappedSubtype || 'unknown'),
      mappedNarrativePanelSize: countBy(summaries, s => s.mappedNarrativePanelSize || 'unknown'),
      mappedNarrativePanelPosition: countBy(summaries, s => s.mappedNarrativePanelPosition || 'unknown')
    }
  };
  const summary: ThemeBulkSummary = { processed: summaries.length, perFile: summaries, aggregates };
  const summaryPath = path.join(outDir, 'mapjournal_bulk_theme_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log('Theme bulk summary written to', summaryPath, 'Processed:', summaries.length);
}

run();

function countBy<T>(arr: T[], sel: (t: T) => string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const a of arr) { const k = sel(a); m[k] = (m[k] || 0) + 1; }
  return m;
}
