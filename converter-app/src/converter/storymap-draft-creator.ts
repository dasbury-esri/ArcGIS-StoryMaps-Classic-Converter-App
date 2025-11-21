/**
 * Empty StoryMap / Theme Creator
 * Uses the ArcGIS REST API to create draft StoryMap and Theme items.
 */

import { createBaseStorymapJson } from "./storymap-schema";
import { createThemeWithDecisions } from '../refactor/theme/themeMapper.ts';

// --- Types ------------------------------------------------------------------

// Base StoryMap draft JSON (schema external to this file). Represent as unknown key map.
export type StoryMapDraftJson = Record<string, unknown>;

// Theme variable set (subset used by converter; extend if needed)
export interface StoryMapThemeVariables {
  headerFooterBackgroundColor: string;
  backgroundColor: string;
  titleFontId: string;
  titleColor: string;
  bodyFontId: string;
  bodyColor: string;
  bodyMutedColor: string;
  themeColor1: string;
  themeColor2: string;
  themeColor3: string;
  borderRadius: number;
}

export interface StoryMapThemeDraft {
  title: string;
  baseThemeId: string;
  isFromOrgTheme?: boolean;
  variables: StoryMapThemeVariables;
  resources: Record<string, unknown>;
}

interface AddItemResponse {
  success?: boolean;
  id?: string;
  error?: { message?: string };
}

interface AddResourcesResponse {
  success?: boolean;
  error?: { message?: string };
}

// Mapping decisions structure (from themeMapper). Layout mapping may be appended elsewhere.
export interface ThemeMappingDecisions {
  baseThemeId: string;
  colorMappings: {
    panelToBackgroundColor?: string;
    dotNavToHeaderFooterBackgroundColor?: string;
    textToBodyColor?: string;
    textLinkToBodyColor?: string | undefined;
    textLinkToThemeColor1?: string;
    softTextToBodyMutedColor?: string;
    chosenBodyColorSource?: 'text' | 'textLink' | undefined;
  };
  fontMappings: {
    classicTitleFontValue?: string;
    mappedTitleFontId?: string | undefined;
    classicBodyFontValue?: string;
    mappedBodyFontId?: string | undefined;
  };
  variableOverridesApplied: string[];
  // Allow future extensions (e.g., layoutMapping) without widening all usages
  [key: string]: unknown;
}

/**
 * Create a draft StoryMap item and return its item id.
 * Adds draft_* resource id in typeKeywords so we can later overwrite its draft JSON.
 */
export async function createDraftStoryMap(username: string, token: string, title: string): Promise<string> {
  const timestamp = Date.now();
  const draftResourceName = `draft_${timestamp}.json`;
  const typeKeywords = [
    "StoryMap",
    `smdraftresourceid:${draftResourceName}`,
    "smstatusdraft",
    "smeditorapp:converter-v3alpha"
  ];

  const minimalStoryMapJson: StoryMapDraftJson = createBaseStorymapJson() as StoryMapDraftJson;

  const params = new URLSearchParams({
    f: "json",
    type: "StoryMap",
    title,
    text: JSON.stringify(minimalStoryMapJson),
    typeKeywords: typeKeywords.join(","),
    token
  });

  const response = await fetch(
    `https://www.arcgis.com/sharing/rest/content/users/${username}/addItem`,
    { method: "POST", body: params }
  );
  const data: AddItemResponse = await response.json();
  if (!data.success) throw new Error(data.error?.message || "Failed to create StoryMap");
  return data.id;
}

/* THEME CREATION FLOW
   1. createDraftThemeItem() → returns { themeItemId, draftResourceName }
   2. build theme JSON from classic values (outside this file)
   3. uploadThemeDraftResource(themeItemId, draftResourceName, json)
   4. (Optional fast publish) write published_data.json with same JSON via publishThemeResource()
      This skips opening builder UI.
*/

/**
 * Create a draft StoryMap Theme item.
 * Returns the new theme item id and the generated draft resource name.
 */
export async function createDraftThemeItem(
  username: string,
  token: string,
  title: string,
  baseThemeId: string = 'summit'
): Promise<{ themeItemId: string; draftResourceName: string }> {
  const timestamp = Date.now();
  const draftResourceName = `draft_${timestamp}.json`;

  // Minimal base theme JSON (ArcGIS StoryMaps Theme schema subset)
  const minimalThemeJson: StoryMapThemeDraft = buildMinimalThemeJson(title, baseThemeId);

  // Theme typeKeywords mimic StoryMap pattern but differ in editor app tag
  const typeKeywords = [
    "StoryMap",
    "StoryMapTheme",
    `smdraftresourceid:${draftResourceName}`,
    "smstatusdraft",
    "smeditorapp:theme-converter"
  ];

  const params = new URLSearchParams({
    f: "json",
    type: "StoryMap Theme",
    title,
    text: JSON.stringify(minimalThemeJson),
    typeKeywords: typeKeywords.join(","),
    token
  });

  const response = await fetch(
    `https://www.arcgis.com/sharing/rest/content/users/${username}/addItem`,
    { method: "POST", body: params }
  );
  const data: AddItemResponse = await response.json();
  if (!data.success) throw new Error(data.error?.message || "Failed to create Theme");
  return { themeItemId: data.id, draftResourceName };
}

/**
 * Upload (overwrite) the draft JSON resource for a theme item.
 * This replaces draft_* resource content without opening the theme builder.
 */
export async function uploadThemeDraftResource(
  username: string,
  token: string,
  themeItemId: string,
  draftResourceName: string,
  themeJson: StoryMapThemeDraft
): Promise<void> {
  const url = `https://www.arcgis.com/sharing/rest/content/users/${username}/items/${themeItemId}/addResources`;
  const form = new FormData();
  form.append("f", "json");
  form.append("token", token);
  form.append("fileName", draftResourceName);
  form.append("resourcesPrefix", "/");
  form.append("file", new Blob([JSON.stringify(themeJson)], { type: "application/json" }), draftResourceName);

  const res = await fetch(url, { method: "POST", body: form });
  const data: AddResourcesResponse = await res.json();
  if (!data.success) throw new Error(data.error?.message || "Failed to upload draft theme resource");
}

/**
 * (Optional) Publish theme by writing published_data.json directly.
 * Skips UI publish click. If builder normally transforms the draft, ensure
 * themeJson already matches required published schema.
 */
export async function publishThemeResource(
  username: string,
  token: string,
  themeItemId: string,
  themeJson: StoryMapThemeDraft
): Promise<void> {
  const url = `https://www.arcgis.com/sharing/rest/content/users/${username}/items/${themeItemId}/addResources`;
  const form = new FormData();
  form.append("f", "json");
  form.append("token", token);
  form.append("fileName", "published_data.json");
  form.append("resourcesPrefix", "/");
  form.append("file", new Blob([JSON.stringify(themeJson)], { type: "application/json" }), "published_data.json");

  const res = await fetch(url, { method: "POST", body: form });
  const data: AddResourcesResponse = await res.json();
  if (!data.success) throw new Error(data.error?.message || "Failed to publish theme resource");
}

/**
 * Helper: construct minimal valid theme JSON with variable overrides.
 */
function buildMinimalThemeJson(title: string, baseThemeId: string): StoryMapThemeDraft {
  const variables: StoryMapThemeVariables = {
    headerFooterBackgroundColor: '#ffffff',
    backgroundColor: '#ffffff',
    titleFontId: 'avenirNext',
    titleColor: '#002625',
    bodyFontId: 'notoSerif',
    bodyColor: '#304e4e',
    bodyMutedColor: '#3d6665',
    themeColor1: '#087f9b',
    themeColor2: '#fc3b36',
    themeColor3: '#126057',
    borderRadius: 0
  };
  return {
    title,
    baseThemeId,
    isFromOrgTheme: false,
    variables,
    resources: {}
  };
}

/**
 * Convenience: end-to-end create + upload + publish theme.
 * Returns themeItemId.
 */
export async function createAndPublishTheme(
  username: string,
  token: string,
  title: string,
  baseThemeId: string,
  themeJsonOverrides: Partial<{ variables: Partial<StoryMapThemeVariables> }>
): Promise<string> {
  const { themeItemId, draftResourceName } = await createDraftThemeItem(username, token, title, baseThemeId);
  const minimal = buildMinimalThemeJson(title, baseThemeId);
  if (themeJsonOverrides.variables) {
    minimal.variables = { ...minimal.variables, ...themeJsonOverrides.variables };
  }
  await uploadThemeDraftResource(username, token, themeItemId, draftResourceName, minimal);
  // Fast publish (skip UI)
  await publishThemeResource(username, token, themeItemId, minimal);
  return themeItemId;
}

/**
 * Create & publish a theme directly from a classic StoryMap JSON.
 * Applies mapping decisions produced by themeMapper and stores those decisions
 * as an auxiliary resource (mapping_decisions.json) for provenance.
 */
export async function createAndPublishThemeFromClassic(
  username: string,
  token: string,
  classic: { values?: { title?: string; settings?: unknown } } & Record<string, unknown>
): Promise<{ themeItemId: string; decisions: ThemeMappingDecisions }> {
  // createThemeWithDecisions expects ClassicStoryMapJSON; use structural compatibility
  const { theme, decisions } = createThemeWithDecisions(classic as unknown as import('../refactor/types/classic.ts').ClassicStoryMapJSON);
  const title = theme.title || (classic.values?.title?.trim() + ' (Theme)') || 'Converted Theme';
  const classicTheme = (classic.values && (classic.values as { settings?: { theme?: unknown } }).settings?.theme) || {};
  // Create draft theme item with baseThemeId derived from decisions
  const { themeItemId, draftResourceName } = await createDraftThemeItem(username, token, title, theme.baseThemeId);
  // Overwrite draft_* with fully mapped theme JSON
  // Strip any legacy top-level type/version if present and move into _classicConverter
  const themeDraft = theme as StoryMapThemeDraft;
  // Inject converter-metadata resource
  const metaResId = `r-${Math.random().toString(36).slice(2,8)}`;
  (themeDraft.resources as Record<string, unknown>)[metaResId] = {
    type: 'converter-metadata',
    data: {
      type: 'storymapTheme',
      version: '1.0.0',
      classicType: 'MapJournal',
      classicMetadata: {
        theme: classicTheme,
        mappingDecisions: decisions
      }
    }
  };
  await uploadThemeDraftResource(username, token, themeItemId, draftResourceName, themeDraft);
  // Publish immediately (write published_data.json)
  await publishThemeResource(username, token, themeItemId, themeDraft);
  // Persist decisions for audit as separate resource
  await uploadAuxResource(username, token, themeItemId, 'mapping_decisions.json', decisions as ThemeMappingDecisions);
  return { themeItemId, decisions: decisions as ThemeMappingDecisions };
}

/** Upload arbitrary JSON resource (non-draft/published) for provenance */
async function uploadAuxResource(
  username: string,
  token: string,
  itemId: string,
  fileName: string,
  json: unknown
): Promise<void> {
  const url = `https://www.arcgis.com/sharing/rest/content/users/${username}/items/${itemId}/addResources`;
  const form = new FormData();
  form.append('f','json');
  form.append('token', token);
  form.append('fileName', fileName);
  form.append('resourcesPrefix','/');
  form.append('file', new Blob([JSON.stringify(json)], { type: 'application/json' }), fileName);
  const res = await fetch(url, { method: 'POST', body: form });
  const data: AddResourcesResponse = await res.json();
  if (!data.success) throw new Error(data.error?.message || `Failed to upload resource ${fileName}`);
}
// ...existing code...