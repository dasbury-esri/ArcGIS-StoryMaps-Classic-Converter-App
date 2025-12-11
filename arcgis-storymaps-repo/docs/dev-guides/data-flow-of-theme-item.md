# Data flow of theme item

- [Entry point](#entry-point)
- [Build UI](#build-ui)
- [Save](#save)

## Entry point

We first need to fetch the data for that theme before we can render the corresponding UI.

> **Note:** For StoryMap Theme item, there's only UI for builder: the "theme builder."

For this to happen, a user will need to navigate to

```txt
/themes/:id/edit
```

where `:id` is the portal item ID.

When the user lands on this routes, we instantiate class `StoryItemBuilder`.

This instance uses the portal item ID to fetch the data model. Once the data has been fetched, the data will be used to build the UI.

## Build UI

The theme builder has two main pieces of UI:

```txt
+-------+--------------------------+
| side  |      theme preview       |
| panel | (embedded story preview) |
+-------+--------------------------+
```

The fetched StoryMap Theme item **draft data** (`itemDraftData`) is used to construct the side panel UI in a pretty standard way: set as the React component state which in turn is used for rendering the corresponding UI.

As for the theme preview UI, a JSON (assembled from the state) in the shape of `ThemeItemData` is sent from theme builder page to the embedded story preview page, and the story preview page takes care of the rest as if it's coming from its own linked theme item.

## Save

Theme builder generates the data model object from the component states via `ThemeItemBuilder.getItemData()` method.

---

[StoryMaps Documentation (Home)](../../README.md)
