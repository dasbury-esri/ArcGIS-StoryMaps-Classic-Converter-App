# Telemetry Tracking

## Where Telemetry tracking is used

Generally Telemetry analytics are captured in the Builder of both web products, with the exception of sometimes tracking data in content browsers. There are also a few exceptions where data is tracked in the Viewer, but this is generally avoided.

## Implementation

1. Add respective `Category` `Action` and if relevant, `Name` or `Value(s)`, to [Tracking Events](../../packages/storymaps-utils/src/tracking/Events/index.ts) to be referenced as arguments to the below described `Tracker.trackEvent()` method.

   - `Category` (Required): The type of event you want to track (ex: `Builder`, `Frame`, `Briefing`, `Collection`, etc.)
   - `Action` (Required): The specific action the user has taken (ex: `DesignPanel_ChangeCollectionLogo` or `PublishTheme`)
   - `Name` (Optional): The title of the element being interacted with, to aid in analysis (ex: `ThematicMap_Region`, `Sidecar`, `GiphyImage_PublishedStory_Count` etc.)
   - `Value` (Optional): A value necessary to the analysis of the event. Typically a number or final result (ex: `url`, `filterName`, `7` etc.). The values are usually averaged out to get the overall number for all events with the same Category, Action, and Name.

2. Import the `Tracker` class from the `'storymaps-utils'` directory, and call the `Tracker.trackEvent()` method to capture analytics within the function that handles the desired data to be tracked.

Always pass a `Category` and `Action` as arguments to the `Tracker.trackEvent()` method. In some cases a `Name` can be added as a 3rd argument if/when necessary. A 3rd/4th argument should be passed to the `trackEvent()` method if local data needs to be captured.

Ex:

```js
Tracker.trackEvent(
  Tracker.Category.Builder,
  Tracker.Action.Builder_Embed_DisplayAsInlineImage,
  mediaData.url
);
```

## Testing

To test Telemetry tracking in your local environment, set "debug" to `true` [Here](../../packages//storymaps-utils//src/tracking/index.ts) (L30). Then add `DISABLE_TELEMETRY = false` to your `.env.local`.

If testing in SMX be sure to have "Enable analytics" turned on in settings > preferences:

![screenshot of settings showing "enable analytics" to be enabled](../img/smx-enable-analytics.png)

[StoryMaps Documentation (Home)](../../README.md)
