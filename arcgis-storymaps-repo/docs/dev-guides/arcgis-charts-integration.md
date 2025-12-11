# ArcGIS Charts Integration

## Packages Needed

- `@arcgis/charts-components` - the main chart components package that contains the web components we use to render the charts
- `@arcgis/charts-components-react` - react wrappers for the charts components. This allows us to treat chart components like any other React component instead of having to jump through hurdles.
- `@arcgis/charts-spec` - contains all of the typing needed for the ArcGIS charts configs.
- `@arcgis/core` - we should already have this package, but it is required for the charts components

## Define Web Components

The first step to using the `@arcgic/charts-components` package is to define the [Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components). I'll be following part of this [this tutorial](https://developers.arcgis.com/javascript/latest/tutorials/charts-components-with-map-components/).

We need to do this:

```
import { defineCustomElements } from '@arcgis/charts-components/dist/loader';

defineCustomElements(window, {resourcesUrl: 'https://js.arcgis.com/charts-components/4.30/t9n'})

```

We call this code in the [useArcGISCharts](/packages/storymaps-builder/src/hooks/useArcGISCharts.ts) hook. With some additional protections to ensure the components aren't redefined for a second time. The component returns an object with `areChartsReady` and `isError` properties.

We also added a `ARCGIS_CHARTS_ASSETS_URL` property to the config instead of hard coding the value, this also allows us to support enterprise.

NOTE: We need a value for `ARCGIS_CHARTS_ASSETS_URL` as of `4.30` there isn't a fallback value in the ArcGIS Charts library.

### Additional Info

We need to add `@arcgis/charts-components` and `@arcgis/charts-components-react` to the [ESM_PACKAGES array](/config/packages/shared-config/app/config.js). Both packages seemingly support common js, but trying to references those compiled outputs causes additional errors. We may be able to remove these in future releases.

## Upgrading the ArcGIS Charts version

In addition to updating the package version, we need to update the values for `ARCGIS_CHARTS_ASSETS_URL`. The default can be changed in the [commonSitePublicConfigProps](/packages/storymaps-utils/src/config/propInfo/index.ts) object, but we need to inform the Devops teams and enterprise teams of the version change.
