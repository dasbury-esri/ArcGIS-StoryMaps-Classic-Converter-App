# Work with Enterprise and static mode

> [!NOTE]
> The app is built in **static mode** for **Enterprise**. When you work on an Enterprise-specific feature, you may not have to always run the app in the static mode for local development, but you should test to see if it works in static mode.

- [Summary](#summary)
- [Before you start](#before-you-start)
  - [Enterprise version](#enterprise-version)
  - [Portal host](#portal-host)
  - [Login credentials](#login-credentials)
  - [Base URL](#base-url)
- [Run the app locally in dev mode](#run-the-app-locally-in-dev-mode)
- [Run the static app locally](#run-the-static-app-locally)
- [Run the static app locally with custom base URL](#run-the-static-app-locally-with-custom-base-url)
- [Troubleshooting](#troubleshooting)
  - [Invalid redirect_uri](#invalid-redirect_uri)
  - [Basemaps don’t load](#basemaps-dont-load)
  - [Infinite login/redirect when submitting credentials:](#infinite-loginredirect-when-submitting-credentials)
- [Key concepts](#key-concepts)
  - [About `config.json`](#about-configjson)
  - [How static site works](#how-static-site-works)
  - [How to develop features in server mode vs static mode](#how-to-develop-features-in-server-mode-vs-static-mode)

## Summary

This documentation covers 3 cases for working with the app locally for Enterprise:

1. [Run the app locally in dev mode](#run-the-app-locally-in-dev-mode)
2. [Run the static app locally](#run-the-static-app-locally)
3. [Run the static app locally with custom base URL](#run-the-static-app-locally-with-custom-base-url)

## Before you start

Determine the following information:

### Enterprise version

> [!TIP]
> The Enterprise version looks something like this: `11.5`

You will be most likely to work on a `11.*` version of Enterprise. The rest of the doc uses 11.5 as example.

> [!NOTE]
> For different Enterprise versions, use the corresponding URLs, e.g. for 11.5 use the following:
>
> - [https://rpublicservers.esri.com/11.**5**.php](https://rpublicservers.esri.com/11.5.php)
> - [https://ragsreports.ags.esri.com/information/11.**5**\_users.htm](https://ragsreports.ags.esri.com/information/11.5_users.htm)

### Portal host

> [!TIP]
> The portal host looks something like this: `rpubs22501.ags.esri.com/portal`

This rest of the doc uses this `rpubs22501.ags.esri.com/portal` as the example portal host.

Talk to your PE to confirm which portal host to use, because for some repro/bugfixes you need to access particular items that are only available on certain portal hosts.

Or pick one from the list [https://rpublicservers.esri.com/11.5.php](https://rpublicservers.esri.com/11.5.php)

> [!NOTE]
> How to determine the `PORTAL_HOST` from a portal URL?
>
> - https://rqawinbi01pt.ags.esri.com/gis/home/index.html
>   - `"PORTAL_HOST": "rqawinbi01pt.ags.esri.com/gis"`
> - https://rpubs22501.ags.esri.com/portal/home/index.html
>   - `"PORTAL_HOST": 'rpubs22501.ags.esri.com/portal'`

### Login credentials

Ask your PE if you don’t know the login credentials of the portal host, or visit here if you have access: [https://ragsreports.ags.esri.com/information/11.5_users.htm](https://ragsreports.ags.esri.com/information/11.5_users.htm) for 11.5. Ensure the login credentials works for your portal URL.

### Base URL

> [!TIP]
> It looks something like this: `/enterprise` or just an empty string.

You will be most likely to work with an empty-string base URL.

## Run the app locally in dev mode

Relevant files:

- `/etc/hosts`
- `packages/storymaps-app/.env.local`
- `packages/storymaps-app/public/static/config.json`

Steps:

1. **Use Enterprise branch:** Point your local repo to the latest branch

   ```txt
   builds/windowslinux/11.5
   ```

2. **Modify** `/etc/hosts`: Modify the `/etc/hosts` file on your machine to map `story.rpubs22401.ags.esri.com` to `127.0.0.1` (see the code snippet below). The `story.` prefix here is arbitrary; you just want to make sure that the domain part (e.g., `rpubs22401.ags.esri.com`) matches whatever portal you selected above, excluding the trailing /portal from the portal host.

   ```hosts
   127.0.0.1 story.rpubs22401.ags.esri.com
   ```

> [!IMPORTANT]  
> Make sure you’re not hopping on/off VPN after you do this. If you turn on/off VPN, as the VPN app may clear out the new host rule that you add.

3. **Modify** `.env.local`: Navigate to `packages/storymaps-app/.env.local`, add `IS_PORTAL = true` and set `LOCAL_DEV_HOSTNAME` as:

   ```dotenv
   LOCAL_DEV_HOSTNAME = "story.rpubs22401.ags.esri.com"
   IS_PORTAL = true
   ```

4. **Modify** `packages/storymaps-app/public/static/config.json`

   ```json
   "PORTAL_HOST": "rpubs22401.ags.esri.com/portal",
   ```

5. **Run the app:** Run `yarn dev` in `storymaps-app` package.

> [!NOTE]
> If you see an “invalid redirect_uri” error, please see the [Troubleshooting | Invalid redirect_uri](#invalid-redirect_uri) below.

## Run the static app locally

Follow steps 1–4 from the section [Run the app locally in dev mode](#run-the-app-locally-in-dev-mode).

5. **Build the app:** Run one of the following in `storymaps-app` package

   - `yarn build:enterprise` for production env build
   - `yarn export` for development env build

6. **Run the app:** `yarn start:enterprise` in `storymaps-app` package

Now open the browser and navigate to the URL outputted (something like `https://story.rpubs22401.ags.esri.com:3443`) in the terminal. Specify the https protocol explicitly.

> [!WARNING]
> There’s no HMR.

> [!IMPORTANT]
>
> ### Debugging using production build
>
> If you are trying to debug an issue with static app using production build and unable to see the console logs in the browser, make sure that you comment out [these couple lines](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/b28b63fc9429d3ef56c36759ca7ab2e04a702243/packages/storymaps-app/pages/_app.tsx#L55-L58) including the `setNoDebugConsole` import, and try again
>
> ### Debugging using development build
>
> Console logs should automatically appear when you are running the static app in development mode. No additional changes need to be made for this.

Optionally, update the following properties in `.env.local` before running step 5:

```dotenv
# Enable lab features
ENABLE_LAB_FEATURES = false
# whether features currently in beta should be enabled
ENABLE_BETA_FEATURES = false
# Enable access to esri.com sites
ENABLE_ESRI_ACCESS = false
# Enable sharing via social media
ENABLE_SOCIAL_SHARING = false
# Enable reporting abuse
ENABLE_REPORT_ABUSE = false
# Enable switching accounts
ENABLE_SWITCH_ACCOUNTS = false
# Enable callout with access to Living Atlas website
ENABLE_LA_CALLOUT = false
# Enable expressmap blocks
ENABLE_EXPRESS_MAPS = true
# Enable linking to internet or intranet resources
ENABLE_LINKED_MEDIA = true
# Enable previewing collections
ENABLE_COLLECTION_PREVIEW = false
# Enable new types of items that can be used in collections
ENABLE_COLLECTION_TYPES_NEW = false
# Enable duplication of express map in sidecar media panel
ENABLE_EXPRESS_MAP_DUPLICATION = false
```

## Run the static app locally with custom base URL

Follow steps from [Run the static app locally](#run-the-static-app-locally), except:

- In step 3, in `.env.local`, also add your custom base URL, e.g. `BASE_URL = '/custom-enterprise'`
- between step 5 and step 6, go to directory `/packages/storymaps-app/out` and move all the files and directories into a new directory within `/packages/storymaps-app/out` called `custom-enterprise` (same as the custom base URL, without the leading slash).

Now you can navigate to the terminal-outputted URL (ending with your custom base URL) for your testing.

## Troubleshooting

### Invalid redirect_uri

When you sign in (after the app is up and running locally), you sometimes may see an Invalid redirect_uri error.

> [!NOTE]
> This happens each time the portal instance is rebuilt. When it’s rebuilt, the `redirectURIs` in “App Info” is reset, so we need to manually update it to allow local dev URI.

To resolve this error, do the following:

1. Go to [https://rpubs22401.ags.esri.com/portal/portaladmin](https://rpubs22401.ags.esri.com/portal/portaladmin), and sign in with admin credentials.
2. Go to Security → OAuth → Get App Info.
3. Type `arcgisstorymaps` in the App ID and click on ‘Get App Info’.
4. Copy everything in the text box which looks something like this:

   ```json
   {
     "appId": "arcgisstorymaps",
     "redirectURIs": [
       "urn:ietf:wg:oauth:2.0:oob",
       "http://*.arcgis.com",
       "https://*.arcgis.com",
       "https://rpubs22401.ags.esri.com"
     ]
   }
   ```

5. Go to OAuth → Update App Info.
6. Paste in the App Info text box.
7. In `redirectURIs` array, append one more URL `"https://*.rpubs22401.ags.esri.com"` (providing a subdomain wildcard match) to make it look like this:

   ```json
   {
     "appId": "arcgisstorymaps",
     "redirectURIs": [
       "urn:ietf:wg:oauth:2.0:oob",
       "http://*.arcgis.com",
       "https://*.arcgis.com",
       "https://rpubs22401.ags.esri.com",
       "https://*.rpubs22401.ags.esri.com"
     ]
   }
   ```

8. Click ‘Update App’.
9. Try again to go to `https://story.rpubs22401.ags.esri.com:3443` and sign in. It should work now.

### Basemaps don’t load

If you see no basemap loading, then the problem could be the basemap items provided in the config are not on the portal you are working with. To resolve this problem:

1. Go to file `packages/storymaps-app/public/static/config.json` and copy the value of `BASEMAP_ITEMS`
2. Go to `packages/storymaps-app/.env.local` and add a value for `BASEMAP_ITEMS`

> [!TIP]
> In `.env.local` it should look like this (note the quotes):
> `BASEMAP_ITEMS = '{"chartedTerritory" ... "d0135822507947b2a3809af36f2d91e6"}'`

3. Restart the local dev server to pick up the latest env file change

> [!NOTE]  
> For any existing map block that misses the basemap, you need to re-add the block, since the existing map block is still trying to load the invalid basemap item.

### Infinite login/redirect when submitting credentials:

Check capitalization of `PORTAL_HOST` as it is specific. You can check the portal’s response for the correct portal host by going to `https://{portalhost}.ags.esri.com/portal/sharing/rest/portals/self?f=json`

---

## Key concepts

### About `config.json`

> [!NOTE]
> This is the static mode specific, runtime config.

This is the runtime config file that people can change after the site is built. During static build process, `public/static/config.json` will get copied to `/out/static/config.json`. However, it has limited options. If you change it and refresh the site, you will be able to see the your changes.

> [!NOTE]
> Both server mode configs and the static mode configs will be available in app's "config props" during runtime. See this [doc](../dev-guides/add-config-property.md) about how to add new config property.

### How static site works

[Lucid chart link](https://lucid.app/lucidchart/c3e829ea-877e-41f3-80e2-2d54fcf55c66/edit?shared=true&page=0_0#)

Render process comparison:

|            Server mode             |            Static mode             |
| :--------------------------------: | :--------------------------------: |
| ![](./server-mode-render-flow.png) | ![](./static-mode-render-flow.png) |

Data flow comparison:

|           Server mode            |           Static mode            |
| :------------------------------: | :------------------------------: |
| ![](./server-mode-data-flow.png) | ![](./static-mode-data-flow.png) |

### How to develop features in server mode vs static mode

#### `isStatic()`

Our site can run in either server mode (SSR) or static mode. Please use `isStatic` utility from `storymaps-utils` package to tell which mode the site is built in. The util uses `IS_STATIC` env variable to determine the mode, so it will enable tree shaking during build process to eliminate dead code.

#### `isPortal`

This is a boolean property which indicates whether the app is connected to an Enterprise ArcGIS portal. This value is available from the portal self response object (which you can get from the `getPortalSelfResponse` page helper utility). This is then passed down to components via siteEnvironment context.

There is also an `IS_PORTAL` flag in the configs; however, this should only be used when both the `siteEnvironment` context and `getPortalSelfResponse` can't be used.
