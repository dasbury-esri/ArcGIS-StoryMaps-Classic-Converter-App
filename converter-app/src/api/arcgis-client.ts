/**
 * ArcGIS REST API Client
 * Client-side functions that make direct fetch() calls to ArcGIS REST API
 * All calls go directly from browser to https://www.arcgis.com/sharing/rest/
 */

const BASE_URL = 'https://www.arcgis.com/sharing/rest';

/**
 * Get item data (classic story JSON)
 */
export async function getItemData(itemId: string, token: string): Promise<any> {
    const url = `${BASE_URL}/content/items/${itemId}/data?f=json&token=${token}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch item data: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get item details (metadata, keywords, etc.)
 */
export async function getItemDetails(itemId: string, token: string): Promise<any> {
    const url = `${BASE_URL}/content/items/${itemId}?f=json&token=${token}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch item details: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get item resources list
 */
export async function getItemResources(itemId: string, token: string): Promise<any> {
    const url = `${BASE_URL}/content/items/${itemId}/resources?f=json&token=${token}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch item resources: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Remove a resource from an item
 */
export async function removeResource(
    itemId: string,
    username: string,
    resourcePath: string,
    token: string
): Promise<any> {
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

    return response.json();
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
): Promise<any> {
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
    const result = await response.json()
    console.log("[addResource] Upload API response:", result);
    if (!response.ok || !result.success) {
        throw new Error(`Failed to add resource: ${result.error?.message || response.statusText}`);
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
): Promise<any> {
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

    return response.json();
}

/**
 * Find draft resource name from item details
 * Looks for "smdraftresourceid:draft_*.json" in typeKeywords
 */
export function findDraftResourceName(itemDetails: any): string | null {
    const typeKeywords = itemDetails.typeKeywords || [];

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

