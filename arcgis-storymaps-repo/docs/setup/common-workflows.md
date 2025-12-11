# Common Workflows

<!-- omit in toc -->

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Adding Static Assets](#adding-static-assets)
  - [Where to put new assets](#where-to-put-new-assets)
  - [How to point to an asset via URL in code](#how-to-point-to-an-asset-via-url-in-code)
  - [Referencing images added in packages other than `storymaps-express` or `storymaps-app`](#referencing-images-added-in-packages-other-than-storymaps-express-or-storymaps-app)
  - [How to update a static SVG assets](#how-to-update-a-static-svg-assets)
- [Upgrade ArcGIS JS API library version](#upgrade-arcgis-js-api-library-version)
  - [For @next (testing purposes)](#for-next-testing-purposes)
  - [For @latest](#for-latest)
  - [Note for `ARCGIS_JS_API_ASSETS_PATH`](#note-for-arcgis_js_api_assets_path)

## Adding Static Assets

### Where to put new assets

- `packages/storymaps-app/public/static/` for AGSM
- `packages/storymaps-express/public/static/` for SMX
- `packages/storymaps-website-common/src/static/` for common assets shared by AGSM and SMX
- `packages/storymaps-builder/src/static/` for builder specific assets

❗️ IMPORTANT: Run `yarn copy:static` in `storymaps-app` or `storymaps-express` package after adding the new assets. You can also do it in the root for both apps at once.

❗️ IMPORTANT: Run `yarn optimize-images` in `storymaps-app` or `storymaps-express` package after adding new image files (e.g. `.png` or `.jpg`). If you try to commit a new image file without doing this you should be blocked by a pre-commit hook error. Read more in the [`optimize-image` script docs](https://devtopia.esri.com/WebGIS/arcgis-storymaps/tree/develop/packages/storymaps-components/src/components/Image/build-scripts).

### How to point to an asset via URL in code

#### For AGSM and SMX:

After adding your image to one of the [directories above](#where-to-put-new-assets) and running `yarn optimize-images` you should have updated the `image-dictionary.js` file(s) of the packages that are configured to consume those images (see `image-config.js` at root of SMX or AGSM).

Within the `image-dictionary.js` file look for your image by looking up its relative path, e.g.

```
"storymaps-express/public/static/images/background-textures/topo.png"
```

Use the URI specified under the corresponding `"normalizeSrc"` field:

```json
  "storymaps-express/public/static/images/background-textures/topo.png": {
    "id": "PIVzydefaw7-DoifMcQXE",
    "size": [
      801,
      801
    ],
    "ext": ".png",
    "normalizeSrc": "/static/images/background-textures/topo.png",
    "hash": "U/axTVsnimil4UfipF+TZD0M2t4kAFAji3f+P3gKuc8="
  },
```

Next, in your code construct the URI as follows using the shared app `config` object:

```js
`${config.BASE_URL}/static/images/background-textures/topo.png`;
```

### Referencing images added in packages other than `storymaps-express` or `storymaps-app`

While we have images in packages like `storymaps-builder` those images are ultimately rendered within the AGSM or SMX instance. There is no `image-dictionary.js` at the root of packages like `storymaps-builder`, instead you will need to find the find the image in question in the `image-dictionary.js` file at the root of the package it will be used in.

### How to update a static SVG assets

Because SVG's are scalable there is no need to include them in our image optimization build system which automatically cache busts.

Because of this, we need to add a unique query param to the end of the URL for SVG's to bust cache if the name remains the same. The easiest way is just to add the current app version. `?v=22.1.0`.

## Upgrade ArcGIS JS API library version

Since v4.19 we started using NPM library [`@arcgis/core`](https://www.npmjs.com/package/@arcgis/core).

### For @next (testing purposes)

E.g. `@arcgis/core@4.20.0-next.20210628`

1. Open

   - `packages/storymaps-builder/package.json`
   - `packages/storymaps-xgraphics/package.json`

   and manually change the version `"@arcgis/core": "^{VERSION}",` E.g. `4.20.0-next.20210628`

   ❗️ IMPORTANT: when downgrading, make sure you remove `^` before the version number. This makes sure that the already installed version will be _replaced_ with the older version in the next step.

2. Specify the **assets path** via environment variable `ARCGIS_JS_API_ASSETS_PATH` in `packages/storymaps-app/.env` (or `packages/storymaps-express/.env` based on which product you are working on):

   ```env
   ARCGIS_JS_API_ASSETS_PATH = 'https://js.arcgis.com/4.29/@arcgis/core/assets'
   ```

   See [Note for `ARCGIS_JS_API_ASSETS_PATH`](#note-for-arcgis_js_api_assets_path) for more details.

3. Run (anywhere is fine)

   ```sh
   yarn
   ```

### For @latest

Run (anywhere is fine)

```sh
yarn upgrade-interactive --latest && yarn
```

and then find (<kbd>↓</kbd>/<kbd>↑</kbd>) and select (<kbd>Space</kbd>) `@arcgis/core` to install (<kbd>Return/Enter</kbd>).

### Note for `ARCGIS_JS_API_ASSETS_PATH`

> NOTE: This used to be a config field in `config.js` (converted to a set of environment variables circa Oct/Nov 2023). So now if you need to override it, go to appropriate `.env[.*]` files.

E.g.

```txt
'https://js.arcgis.com/4.20/@arcgis/core/assets'
```

- No trailing slash. See example above. See JS API doc [here](https://developers.arcgis.com/javascript/latest/api-reference/esri-config.html#assetsPath).
- JS API will by default load assets from CDN at runtime if the field is falsy:
  - omitted OR
  - `undefined` OR
  - `''` (empty string)

Most of the time, this environment variable can be left unspecified, and the default assets will be loaded from e.g.

- <https://js.arcgis.com/4.23/@arcgis/core/assets/esri/themes/light/main.css> for @latest
- <https://cdn.jsdelivr.net/npm/@arcgis/core@4.23.0-next.20220224/assets/esri/themes/light/main.css> for @next

In the following cases, specifying this environment variable can be useful:

- test @next releases when @next assets are hosted on external CDN (e.g. jsdelivr.net) instead of the default CDN (js.arcgis.com).
- use @next asset path (e.g., v4.23) for @next JS API (e.g. v4.23.0-next.20220616) when close to JS API release and @next JS API is available publicly.
- use @latest assets path (e.g. v4.23) for @next JS API (e.g. v4.22.0-next.20220224) when @next assets are not available publicly.
- use internal path (instead of the default CDN paths) for enterprise build, since external CDN won't be accessible on enterprise.

---

[StoryMaps Documentation (Home)](../README.md)
