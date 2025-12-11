# Authentication

**TLDR**: Authentication with AGSM and SMX rely on a [ArcGISIdentityManager](https://developers.arcgis.com/arcgis-rest-js/api-reference/arcgis-rest-request/ArcGISIdentityManager) as the core user session singleton that is reused throughout the application. The [ArcGISIdentityManager](https://developers.arcgis.com/arcgis-rest-js/api-reference/arcgis-rest-request/ArcGISIdentityManager) is created using OAuth workflow that receives a `access_token` to validate user access. All requests to ArcGIS Online/Enterprise or our server, that require authentication, pass either the full [ArcGISIdentityManager](https://developers.arcgis.com/arcgis-rest-js/api-reference/arcgis-rest-request/ArcGISIdentityManager) to a [ArcGIS REST JS](https://developers.arcgis.com/arcgis-rest-js/) methods `authentication` property, or pass the `token` (from the [ArcGISIdentityManager](https://developers.arcgis.com/arcgis-rest-js/api-reference/arcgis-rest-request/ArcGISIdentityManager)) to a custom fetch request.

<!-- omit in toc -->
## Table of Contents

- [Creating the ArcGISIdentityManager](#creating-the-arcgisidentitymanager)
  - [Sign-in](#sign-in)
  - [AGSM User Session Persistence and ArcGISIdentityManager creation](#agsm-user-session-persistence-and-arcgisidentitymanager-creation)
  - [SMX User Session Persistence and ArcGISIdentityManager creation](#smx-user-session-persistence-and-arcgisidentitymanager-creation)
  - [Validating User Session](#validating-user-session)
- [Accessing the ArcGISIdentityManager](#accessing-the-arcgisidentitymanager)
- [Authenticating a Request](#authenticating-a-request)

## Creating the ArcGISIdentityManager

### Sign-in

To initiate the OAuth workflow, redirect the application to the `signInUrl` that injected in the NextJS `Context` object. In AGSM, this can be found in the `PageProps`. In SMX, it can be found in the `SiteInfoContext`.

After the user logs into ArcGIS Online OAuth page, the browser will be redirected to our `pages/oauth-callback.tsx` page with the `access_token` set in the hash of the URL.

#### Private Maps in Public Stories

In rare cases, an author may add a private map to publicly accessible story. To prevent the reader from losing their place, [we initiate the JS SDK's popup login method](https://developers.arcgis.com/documentation/mapping-apis-and-services/security/arcgis-identity/serverless-web-apps/).

After the popup redirects back to our `oauth-callback` page (still in a popup), we [PostMessage the token](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/c3ce944d42c081f637c1107d74c596bf6729f920/packages/storymaps-app/pages/oauth-callback.tsx#L67) back the original page with the story in it. The app then [registers the token with the JS SDK](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/c3ce944d42c081f637c1107d74c596bf6729f920/packages/storymaps-builder/src/components/AppAuthenticationRegisterer/index.tsx#L23) to load the private map when the user has not logged into the story maps app.

### AGSM User Session Persistence and ArcGISIdentityManager creation

The ArcGIS Online OAuth page will also set the `esri_aopc` cookie (http only). This same cookie is shared by most other AGO applications and allows us to support single sign-on across other ArcGIS web applications.

**NOTE**: Because of the `esri_aopc` cookie's security, the storymaps application must be hosted on the same site (domain or subdomain) of the portal host.

As the page loads, AGSM will send a request to ArcGIS Online's `oauth2/platformSelf` endpoint. Esri's `esri_aopc` cookie will automatically be sent along with this request to authenticate the user. This request will return a serialized user session, including token data that is pass to the `ArcGISIdentityManager` constructor.

### SMX User Session Persistence and ArcGISIdentityManager creation

While on the `oauth-callback` page, SMX will store a serialized user session data in by setting the `smx_auth` browser cookie.

As the page loads, SMX will read the `smx_auth` cookie and pass its data to the `ArcGISIdentityManager` constructor.

### Validating User Session

After the  [ArcGISIdentityManager](https://developers.arcgis.com/arcgis-rest-js/api-reference/arcgis-rest-request/ArcGISIdentityManager) is generated, one last step is performed to validate the user has access to the StoryMaps app. This is done by calling `getUserAuthorization` before the `ArcGISIdentityManager` is returned for the the application to store and use as a singleton.

The `ArcGISIdentityManager` is now ready to be used throughout the application to authenticate requests.

## Accessing the ArcGISIdentityManager

The `ArcGISIdentityManager` can generally be accessed from four locations:

1. `PageProps`: The main page props will include a reference the auth manager
2. UserInfo context: React context from the storymaps-components package. (e.g. `const { authManager } = useUserInfo`).
3. Gemini Global state: Use this global state in block or resource classes (e.g. `this.getGlobalStates().authManager`)
4. StoryItem: The `StoryItemViewer.authManager`/`StoryItemBuilder.authManager` class also holds a reference to the user session.

## Authenticating a Request

- ArcGIS REST JS method: Pass the `ArcGISIdentityManager` in as the [authentication](https://developers.arcgis.com/arcgis-rest-js/api-reference/arcgis-rest-demographics/IRequestOptions#authentication) property.
- Custom Fetch: If you only need the token for a custom fetch method, you can access the token directly with `ArcGISIdentityManager.token`

---

[StoryMaps Documentation (Home)](../../README.md)

