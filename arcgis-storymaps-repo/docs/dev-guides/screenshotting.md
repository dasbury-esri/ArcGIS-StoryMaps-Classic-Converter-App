# Screenshotting

Some blocks in StoryMaps make use of screenshotting a part of their UI for the print preview page in viewer mode. It is also used in the StoryMaps mobile apps in place of some interactive content. Currently, these are only map related blocks such as the Express Map, Thematic Map, Tour Map, etc.

## Map Blocks

The following is a summary of how screenshotting works in map related blocks:

- The map screenshotting process only happens when a user publishes their story. As a result, only a block's `builder` needs to be aware of the `takeScreenshot` util.

- The screenshot image is used in place of the interactive map when the user views the print preview page in viewer mode. It is also used in the StoryMaps mobile apps in place of the interactive map until a user touches the map, at which point the interactive map is loaded.

  - Note that in the print preview page of builder mode we still render the interactive version of the map.
  - Note that if the screenshot fails then the last published screenshot or an interactive map will still be shown in the viewer mode's print preview.

- Creating the screenshot of an interactive web map utilizes the ArcGIS JS SDK's [`(Map|Scene)View.takeScreenshot`](https://developers.arcgis.com/javascript/latest/api-reference/esri-views-MapView.html#takeScreenshot) method.

  - Note that prior to calling `view.takeScreenshot` optional steps may be taken to ensure that the map is ready for a screenshot (See `prepareMapForScreenshot`).

- `ScreenshotViewerProps` is the shared viewer props interface used for map blocks that utilize screenshots:

  - `screenshotItemIds` is a `ScreenshotResourceMap` which has a key of `ScreenshotSize` and a value of the Gemini resource id `string` of the screenshot Image resource.

  - `setTakeScreenshotMethod` is a block method used to pass up the `takeScreenshots` util from `CoreMap` or `ArcGISWebMap` to the parent block's `states` property.

- Screenshots have been implemented in a way that is intended to be flexible for handling multiple screenshot image sizes in the future. Thus this is why it appears in our code that multiple screenshots are expected to be taken and stored, when in fact there is only one screenshot size currently supported (`PRINT`).
  - We cannot depend on our usual server-side image resizing method because it distorts image labels and graphics when the sizes are smaller or larger. Multiple image sizes were not implemented in v1 because both mobile devices and print sizes display similar dimensions.

### Utils and Components

> Note: All of the following paths are relative to the `storymaps-builder` package's `src/` directory.

- `block/utils/screenshotting/index`

  - `isScreenshottableBlock`: returns whether the block is a screenshottable block by using a type predicate.

  - `saveScreenshot`: calls the `takeScreenshots` util (see below) and creates a Gemini item resource from the result adding it to the block's `Data` (in `data.screenshots`) as a `Record<ScreenshotSize, string>`.

  - `getScreenshotResources`: returns an array of `ImageResource` representing the screenshot Image resources.

  - `getScreenshotItemIds`: returns a `ScreenshotResourceMap` with a key of `ScreenshotSize` and value of Gemini resource `id`.

  - `shouldSkipScreenshotting` returns whether a screenshottable block should be skipped during the screenshotting process. E.g. a hidden map in an immersive.

  - `makeBlockScreenshottable`: injects the initial screenshot related states to the block.

- `components/map-shared/utils/screenshotting/index`

  - `takeScreenshots`: creates the map screenshot (using `view.takeScreenshot`) and if successful returns `ScreenshotResults` Record with a key of `ScreenshotSize` and value of `ScreenshotResultData`

  - `getShouldShowScreenshot`: returns a boolean for whether a screenshot should be shown in the UI. Typically this is used in a block's `viewer` component in order to decide whether or not to pass its `screenshotItemIds` to its `Displayer` child component.

- `components/map-shared/constants`

  - `SCREENSHOT_SIZE_MAP`: dimensions (width & height) for each `ScreenshotSize`.

- `components/map-shared/PrintScreenshotPlaceholder/index`: React component that is used to render the screenshot image in place of the `Displayer` component in viewer's print preview.

### Screenshot logic steps

Runtime workflow of the screenshot process.

1. In the builder the `setTakeScreenshotMethod` "passes up" the `CoreMap | ArcGISMapBase`'s private method `takeScreenshotOfMap` to the block and updates its `states` property with the `takeScreenshot` util.

2. The `prepareMapForScreenshot` function prop is passed down to the `CoreMap | ArcGISMapBase`. This is where we may optionally specify tasks to run prior to calling `view.takeScreenshot`. Example tasks might be verifying that any additional map layers added by the user, such as drawings, are present before screenshotting the map.

3. After the user clicks "Publish" and the app's publish workflow starts,the block's `public saveScreenshot` method is called invoking its `states.saveScreenshot` kicking off the screenshotting process.

4. Assuming all goes well in `saveScreenshot`, the block now has a screenshot Image resource associated with it and its `data` property has been updated with a `screenshots` entry containing a `ScreenshotResourceMap` which will persist the Image Resource in the story JSON.

5. When the user visits the print preview page from viewer, if `getShouldShowScreenshot` returns `true`, we pass the `screenshotItemIds` to the `Displayer` component in order to render the `PrintScreenshotPlaceholder` component instead of the `CoreMap` or `ArcGISMapBase` instance.

## How to make your block screenshottable?

There are a couple of things that you need to enable screenshotting for your block

1. Update the [ScreenshottableBlock](../../packages/storymaps-builder/src/block/utils/screenshotting/types.ts) type to include your block. This will create some errors, but we're going to resolve those in the following steps.
2. Add the following type import to your block `import type { ScreenshottableBlockStates, ScreenshotData, ScreenshotViewerProps } from '../../block/utils/screenshotting/types';`
3. Update the block's `Data` interface so it extends `ScreenshotData`. This adds the `screenshots?: ScreenshotResourceMap;` property to it.
4. Update the block's `State` interface so it extends `ScreenshottableBlockStates`. This adds `setTakeScreenshotMethod?: SetTakeScreenshotMethod;` and `getScreenshotProps: () => Record<string, SetTakeScreenshotMethod>;` to your block state.
5. Update the block's `ViewerProps` interface so it extends `ScreenshotViewerProps`. This adds the `setTakeScreenshotMethod` and `screenshotItemIds` viewer props definition.
6. In your `getViewerProps` function, you need to add `...this.states.getScreenshotProps()` and `screenshotItemIds: getScreenshotItemIds(this)`. This adds the state to the props when we initialize the screenshot state.
7. Add the following import to your block `import { getScreenshotItemIds, getScreenshotResources, makeBlockScreenshottable, saveScreenshot } from '../../block/utils/screenshotting';`
8. In your block class's `constructor` call `makeBlockScreenshottable(this)` after the `super`. This will set up the `getScreenshotProps` function that returns `setTakeScreenshotMethod`, which allows your components to pass up the function for screenshotting. NOTE: you've already passed this into the viewer props.
9. Add a `public screenshotResources: ImageResource[];` property to your block class and initialize it in your block's class constructor with `this.screenshotResources = getScreenshotResources(this)`
10. We need to make sure these resources are not deleted during the publish process, we need to update the block's `getResources` function to add the screenshot resources e.g. `resources.push(...this.screenshotResources);`.
11. The block needs a `saveScreenshot` function definition. Add the following your block
    ```typescript
      public saveScreenshot = async () => {
      try {
        await saveScreenshot(this);
      } catch {
        // TODO: handle error if screenshotting fails, or do we handle this in onBeforeGeminiItemPublish?
        console.error('Failed to save screenshot for <block type>');
      }
      };
    ```
12. Now your components can call `setTakeScreenshotMethod` with a callback for taking a screenshot. This implementation may differ across blocks.
