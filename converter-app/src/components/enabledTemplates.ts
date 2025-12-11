// Single source of truth for enabled classic templates in the UI
export const ENABLED: Record<string, boolean> = {
  mapTour: false,
  mapJournal: true,
  mapSeries: false,
  cascade: false,
  shortlist: false,
  crowdsource: false,
  swipe: true,
  basic: false,
};

// Normalize runtime template labels to keys in ENABLED
export function isClassicTemplateEnabled(runtimeTemplate: string | null | undefined): boolean {
  const t = (runtimeTemplate || '').toLowerCase();
  const key = (
    t === 'map journal' ? 'mapJournal' :
    t === 'mapjournal' ? 'mapJournal' :
    t === 'map tour' ? 'mapTour' :
    t === 'maptour' ? 'mapTour' :
    t === 'map series' ? 'mapSeries' :
    t === 'series' ? 'mapSeries' :
    t === 'cascade' ? 'cascade' :
    t === 'shortlist' ? 'shortlist' :
    t === 'crowdsource' ? 'crowdsource' :
    t === 'swipe' ? 'swipe' :
    t === 'basic' ? 'basic' :
    ''
  );
  return !!(key && ENABLED[key]);
}