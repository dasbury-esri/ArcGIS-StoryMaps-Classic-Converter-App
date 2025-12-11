# Browser Support for New Features in ArcGIS StoryMaps

## TLDR

- We provide informal support for the latest two to three major updates of Chrome, Firefox, and Safari.
- To decide if a feature can be safely used in production, check the browser vendor's baseline support tag:
  - "Widely Available" - This means it's safe to use.
  - "Newly Available" and "Limited Available" - Use these only after receiving approval, and as exceptions.

## Table of Contents <!-- omit in toc -->

- [TLDR](#tldr)
- [Guidance](#guidance)
  - [Supported Browsers](#supported-browsers)
  - [Determining Feature Support](#determining-feature-support)

## Guidance

When implementing new web browser APIs or CSS features, it’s crucial to consider browser support before deploying to production, especially for high-visibility or high-impact areas. Features within the item viewers require the strictest browser support.

### Supported Browsers

Officially, ArcGIS StoryMaps supports the latest versions of major evergreen browsers including: Safari, Chrome, Edge, and Firefox ([ArcGIS StoryMaps Docs](https://doc.arcgis.com/en/arcgis-storymaps/reference/system-requirements.htm)). However, to ensure compatibility for users who may not have the latest updates, we also unofficially support the following versions:

- **Chrome, Edge, and Firefox:** The last three major versions.
- **Safari (macOS and iOS):** Versions released within the last two years (typically the last 2-3 major versions).
The `browserslist` field in [`package.json`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/packages/storymaps-app/package.json) in `storymaps-app` and [`storymaps-express`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/packages/storymaps-express/package.json) configures the build toolchain to support specific browsers using the [Browserslist query result](https://browsersl.ist/#q=defaults%2C+not+ie+11).
### Determining Feature Support

Web browser providers are now embracing [Baseline](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility) badges. They use these to highlight the best times for developers to start using new features. You can find these badges on websites like [Can I Use](https://caniuse.com/) and [MDN](https://developer.mozilla.org/en-US/), among other developer documentation sites. The three key badges you should know are "Widely Available", "Newly Available", and "Limited Availability".

- "Widely available" features have been consistently supported by all major browsers for at least 2.5 years. They are safe to use throughout the production codebase.
- "Newly available" features are those recently adopted by all the browsers we support. Generally, you should avoid using these features in production unless a lead developer approves them. The decision will depend on our internal usage statistics at that time and the development cost required by widely available methods.
- "Limited availability" features are only supported by a small subset of browsers, possibly only in the most recent release. Avoid these features unless a lead developer or lead PE advises that a feature can be made available to a subset of our users. An example is the [EyeDropper](https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper_API) tool in our color picker.

---

[StoryMaps Documentation (Home)](../../README.md)
