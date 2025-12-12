/**
 * ArcGIS REST API Client
 * Client-side functions that make direct fetch() calls to ArcGIS REST API
 * All calls go directly from browser to https://www.arcgis.com/sharing/rest/
 */
import type { StoryMapJSON } from '../types/core';

const BASE_URL = 'https://www.arcgis.com/sharing/rest';

/**
 * Get item data (classic story JSON)
 */
export async function getItemData(itemId: string, token: string): Promise<unknown> {
        const url = `${BASE_URL}/content/items/${itemId}/data?f=json&token=${token}`;
        console.debug('[arcgis-client.getItemData] GET', url);

        const response = await fetch(url);
        if (!response.ok) {
                throw new Error(`Failed to fetch item data: ${response.statusText}`);
        }

        const json = await response.json();
        // Classic APIs sometimes return 200 with an error payload; surface that clearly
        try {
            const err = (json as { error?: { code?: number; message?: string } }).error;
            if (err) {
                throw new Error(`ArcGIS error ${err.code || ''}: ${err.message || 'Unknown error'}`);
            }
        } catch (e) {
            if (e instanceof Error) throw e; // rethrow
        }
        try {
            const keys = Object.keys(json || {});
            const hasValues = typeof (json as any)?.values === 'object';
            const hasEntries = Array.isArray((json as any)?.values?.story?.entries);
            const hasSections = Array.isArray((json as any)?.values?.story?.sections);
            console.debug('[arcgis-client.getItemData] Top-level keys:', keys, 'hasValues:', hasValues, 'hasEntries:', hasEntries, 'hasSections:', hasSections);
        } catch { /* ignore logging errors */ }
        return json as unknown;
}

/**
 * Get item details (metadata, keywords, etc.)
 */
export async function getItemDetails(itemId: string, token: string): Promise<unknown> {
    const url = `${BASE_URL}/content/items/${itemId}?f=json&token=${token}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch item details: ${response.statusText}`);
    }

    return response.json() as Promise<unknown>;
}

/**
 * Get item resources list
 */
export async function getItemResources(itemId: string, token: string): Promise<unknown> {
    const url = `${BASE_URL}/content/items/${itemId}/resources?f=json&token=${token}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch item resources: ${response.statusText}`);
    }

    return response.json() as Promise<unknown>;
}

/**
 * Remove a resource from an item
 */
export async function removeResource(
    itemId: string,
    username: string,
    resourcePath: string,
    token: string
): Promise<unknown> {
    const url = `${BASE_URL}/content/users/${username}/items/${itemId}/removeResources`;

    const formData = new URLSearchParams();
    formData.append('resource', resourcePath);
    formData.append('f', 'json');
    formData.append('token', token);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
    });

    if (!response.ok) {
        throw new Error(`Failed to remove resource: ${response.statusText}`);
    }

    return response.json() as Promise<unknown>;
}

/**
 * Add a resource to an item
 */
export async function addResource(
    itemId: string,
    username: string,
    file: Blob,
    resourcePath: string,
    token: string
): Promise<{ success?: boolean } | unknown> {
    const url = `${BASE_URL}/content/users/${username}/items/${itemId}/addResources`;

    const formData = new FormData();
    formData.append('file', file, resourcePath);
    formData.append('fileName', resourcePath);
    formData.append('f', 'json');
    formData.append('token', token);

    const response = await fetch(url, {
        method: 'POST',
        body: formData
    });
    // Add this log right after receiving the response:
    const result: unknown = await response.json();
    console.log("[addResource] Upload API response:", result);
    const ok = response.ok;
    const success = (result as { success?: boolean } | null)?.success === true;
    const errorMsg = (result as { error?: { message?: string } } | null)?.error?.message;
    if (!ok || !success) {
        throw new Error(`Failed to add resource: ${errorMsg || response.statusText}`);
    }
    return result;
}

/**
 * Update item keywords
 */
export async function updateItemKeywords(
    itemId: string,
    username: string,
    keywords: string[],
    token: string
): Promise<unknown> {
    const url = `${BASE_URL}/content/users/${username}/items/${itemId}/update`;

    const formData = new URLSearchParams();
    formData.append('typeKeywords', JSON.stringify(keywords));
    formData.append('f', 'json');
    formData.append('token', token);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
    });

    if (!response.ok) {
        throw new Error(`Failed to update item keywords: ${response.statusText}`);
    }

    return response.json() as Promise<unknown>;
}

/**
 * Find draft resource name from item details
 * Looks for "smdraftresourceid:draft_*.json" in typeKeywords
 */
export function findDraftResourceName(itemDetails: unknown): string | null {
    const tk = (itemDetails && typeof itemDetails === 'object') ? (itemDetails as { typeKeywords?: unknown }).typeKeywords : undefined;
    const typeKeywords: string[] = Array.isArray(tk) ? tk.filter((s): s is string => typeof s === 'string') : [];

    for (const keyword of typeKeywords) {
        if (keyword.startsWith('smdraftresourceid:')) {
            const resourceName = keyword.substring('smdraftresourceid:'.length);
            return resourceName;
        }
    }

    return null;
}

/**
 * Get username from portal self info
 */
export async function getUsername(token: string): Promise<string> {
    const url = `${BASE_URL}/community/self?f=json&token=${token}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }

    const data = await response.json();
    return data.username;
}

/**
 * Create base StoryMap JSON structure
 * Matches Python storymap_json_schema.py output exactly
 */
export function createBaseStorymapJson(): StoryMapJSON {
  const rootId = generateNodeId();
  const coverId = generateNodeId();
  const navId = generateNodeId();
  const creditsId = generateNodeId();
  const themeId = generateResourceId();

    const json = {
    root: rootId,
    nodes: {
      [coverId]: {
        type: 'storycover',  // NOT 'cover'
        data: {
          type: 'minimal',
          title: '',
          summary: '',
          byline: '',
          titlePanelVerticalPosition: 'top',
          titlePanelHorizontalPosition: 'start',
          titlePanelStyle: 'gradient'
        }
      },
      [navId]: {
        type: 'navigation',
        data: {
          links: []
        },
        config: {
          isHidden: true
        }
      },
      [creditsId]: {
        type: 'credits',
        children: []
      },
      [rootId]: {
        type: 'story',
        data: {
          storyTheme: themeId
        },
        config: {
          coverDate: '',
          shouldPushMetaToAGOItemDetails: false 
        },
        children: [coverId, navId, creditsId]
      }
    },
    resources: {
      [themeId]: {
        type: 'story-theme',
        data: {
          themeId: 'summit',
          themeBaseVariableOverrides: {}
        }
      }
    }
    } as unknown as StoryMapJSON;
    return json;
}

// Local helpers to generate ids consistent with builder conventions
function generateNodeId(): string {
    return `n-${Math.random().toString(36).slice(2, 8)}`;
}
function generateResourceId(): string {
    return `r-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new StoryMaps draft item and return its item id.
 * Uses ArcGIS REST addItem on the user's content with type 'StoryMap'.
 */
export async function createDraftStory(
    username: string,
    token: string,
    title: string
): Promise<string> {
    const url = `${BASE_URL}/content/users/${encodeURIComponent(username)}/addItem`;
    const formData = new URLSearchParams();
    formData.append('f', 'json');
    formData.append('token', token);
    formData.append('title', title);
    formData.append('type', 'StoryMap');
    // Minimal description and tags; keywords will be updated later
    formData.append('typeKeywords', JSON.stringify(['StoryMaps', 'smdraftresourceid:draft.json']));

    // Provide a complete base StoryMap JSON via the 'text' field so the item has data immediately
    // Matches our schema and ensures publish checkbox (shouldPushMetaToAGOItemDetails) defaults to false
    const baseJson = createBaseStorymapJson();
    formData.append('text', JSON.stringify(baseJson));

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
    });
    const result = await response.json();
    if (!response.ok || !result || !result.success || !result.id) {
        const msg = (result && result.error && result.error.message) || response.statusText || 'addItem failed';
        throw new Error(`Failed to create draft story: ${msg}`);
    }
    return String(result.id);
}

