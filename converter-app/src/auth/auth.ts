/**
 * Authentication utilities
 * Note: Due to browser Same-Origin Policy, we cannot read esri_aopc cookie
 * from arcgis.com when running on localhost. Users must manually provide token.
 */

/**
 * Validate token format (basic check)
 */
export function isValidTokenFormat(token: string): boolean {
    // Basic validation - token should be a non-empty string
    // ArcGIS tokens are typically alphanumeric with some special chars
    return !!token && token.length > 20 && !token.includes(' ');
}

/**
 * Get instructions for finding token
 */
export function getTokenInstructions(): string {
    return `How to find your ArcGIS token:

1. Sign in to ArcGIS StoryMaps in another tab
   → Go to https://storymaps.arcgis.com and log in
   → Navigate to any story or your stories list

2. Open Browser Developer Tools
   → Press F12 (Windows) or Cmd+Option+I (Mac)
   → Or right-click page and select "Inspect"

3. Go to the Network tab
   → Click on the "Network" tab in DevTools
   → Keep DevTools open

4. Refresh the page or navigate to a story
   → Press F5 to reload the page
   → Look for network requests in the list

5. Find a request with "token=" in the URL
   → Look for requests to "sharing/rest/content/items/"
   → Click on any request (usually one with "resources" or "data")
   → In the Headers section, find the Request URL
   → The URL will contain "token=" followed by a long string

6. Copy the token value
   → Find "token=" in the URL
   → Copy everything after "token=" up to the next "&" or end
   → Example: token=3NKHt6i2urmWtqOuugvr...
   → Copy only the alphanumeric string part

7. Paste the value into the token field above
   → The token is stored in your browser session only
   → It will be cleared when you close this tab`;
}

/**
 * Attempt to get token from session storage (if previously saved)
 */
export function getStoredToken(): string | null {
    try {
        return sessionStorage.getItem('arcgis_token');
    } catch {
        return null;
    }
}

/**
 * Store token in session storage (temporary, cleared on tab close)
 */
export function storeToken(token: string): void {
    try {
        sessionStorage.setItem('arcgis_token', token);
    } catch (error) {
        console.warn('Could not store token in session storage:', error);
    }
}

/**
 * Clear stored token
 */
export function clearStoredToken(): void {
    try {
        sessionStorage.removeItem('arcgis_token');
    } catch (error) {
        console.warn('Could not clear token from session storage:', error);
    }
}

