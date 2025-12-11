# Glossary

- [Backend](#backend)
- [Block](#block)
- [Block Palette](#block-palette)
- [Data Model](#data-model)
- [Gemini](#gemini)
- [Gemini item](#gemini-item)
- [Gemini item data model](#gemini-item-data-model)
- [Registry](#registry)
- [Resource](#resource)
- [Story item](#story-item)
  - [Difference between "story item" and "Gemini item"](#difference-between-story-item-and-gemini-item)
  - [Difference between "StoryMap item" and "StoryMap Theme item"](#difference-between-storymap-item-and-storymap-theme-item)
- [StoryItemBuilder and StoryItemViewer](#storyitembuilder-and-storyitemviewer)

## Backend

ArcGIS Online (AGOL) or ArcGIS Enterprise.

## Block

Blocks in StoryMaps are the foundational "building blocks" of a story. A user may create, edit, and delete blocks while using the StoryMaps builder. In the StoryMaps viewer they are "read only" and cannot be altered. Blocks range in complexity from very simple (e.g. [Separator](../packages/storymaps-builder/src/blocks/separator/)) to very complex (e.g. [Tour](../packages/storymaps-builder/src/blocks/tour/), [Timeline](../packages/storymaps-builder/src/blocks/timeline/)). All blocks are defined in the `storymaps-builder` package in [`src/blocks`](../packages/storymaps-builder/src/blocks/).

For more information see [Gemini/Blocks/Resources](../README.md#geminiblocksresources) in the root README file of this repository.

## Block Palette

The UI that enables a user to select a new block to be added to their story when they are using StoryMaps builder. This UI is displayed as a dialog modal after the user clicks on the blue / green icon button with a plus symbol (+) in it that appears while hovering in the builder's main content area.

Note that some blocks such as the Separator and Text blocks are immediately rendered and revealed to the user after the user selects them while more complex blocks such as media or map related blocks present the user with a Modal to configure the block's settings prior to rendering the block.

For the Block Palette's source code and further documentation see: [`storymaps-builder/src/components/inserter/`](../packages/storymaps-builder/src/components/inserter/).

## Data Model

Most commonly used to refer to a Block's persisted `data` in a [StoryItem](#story-item). May also refer to the data persisted by a [Resource](#resource) in [AGOL](#backend) or the `interface` of other objects such as a `Basemap` (used by map related blocks).

## Gemini

The `storymaps-gemini` package that helps convert [Gemini item data model](#gemini-item-data-model) to a tree.

## Gemini item

[Story item](#story-item)s that can be built with Gemini.

> **🧑‍💻 Dev Note:** `GeminiItemType` is the type used in the code.

> **Note:** A StoryMap Theme item CANNOT be built with Gemini (yet), so it is NOT a Gemini item.

## Gemini item data model

[Gemini item](#gemini-item) data is in such interface:

```ts
interface GeminiItemDataModel {
  root: `n-${string}`;
  nodes: Record<`n-${string}`, BlockJSONData>;
  resources: Record<`r-${string}`, ResourceJSONData>;
}
```

> **Note:**
>
> - `nodes` means "blocks" here (even though both `Block` and `Resource` are extending base class `Node`).
> - Both `BlockJSONData` and `ResourceJSONData` are defined in the codebase. Both of them have a `type` field and a `data` field.
> - The **n**ode (block) ID is prefixed with `n-`; the **r**esource ID is prefixed with `r-`.

> <a id="live-data-model"></a> **Tip**: to see such data model live on a story/collection builder page, locate the `draft_{TIMESTAMP}.json` file (by filtering with `draft` keyword) in **DevTools** | **Network** tab and inspect its **Preview** or **Response** tab.

## Registry

A Gemini registry is a mapping where a block/resource type is mapped to its own dynamically imported subclass of `Block`/`Resource`. Take `'audio'` block, its entries are defined thus:

```ts
const registry = {
  nodes: {
    audio: {
      load: () => import('../blocks/audio'),
    },
    // other block entries...
  },
  resources: {
    audio: {
      load: () => import('../resources/audio'),
    },
    // other resource entries...
  },
};
```

This is the lookup table for Gemini to instantiate each block/resource while building the block tree.

## Resource

A class that is used to persist data too large in size to be stored on the Block's [data model](#data-model). Handles coordinating data updates and retrievals via the [backend](#backend). A resource is associated with a Block using a resource id in the form of `r-xxxxxx` in the [StoryItem](#story-item). This id appears both in the Block's data model and in the StoryItem's resources entries. Common examples of resources are PDFs, images, videos, audio files, and geospatial data.

## Story item

The ArcGIS item types that can be built and viewed with the app:

- [**StoryMap** item](https://developers.arcgis.com/rest/users-groups-and-items/items-and-item-types.htm#:~:text=StoryMap) (equivalent to [Gemini Item](#gemini-item))
  - Briefing
  - Collection
  - Frame
  - Story
- [**StoryMap Theme** item](https://developers.arcgis.com/rest/users-groups-and-items/items-and-item-types.htm#:~:text=StoryMap%20Theme)

> **🧑‍💻 Dev Note:** `StoryItemType` is the type used in the code.

### Difference between "story item" and "Gemini item"

| `StoryItemType` | Is a "Story Item" | Is a "Gemini Item" |
| :-------------: | :---------------: | :----------------: |
|   `Briefing`    |        ✅         |         ✅         |
|  `Collection`   |        ✅         |         ✅         |
|     `Frame`     |        ✅         |         ✅         |
|     `Story`     |        ✅         |         ✅         |
|     `Theme`     |        ✅         |         ❌         |

### Difference between "StoryMap item" and "StoryMap Theme item"

...in terms of certain fields in the [item details](https://esri.github.io/arcgis-rest-js/api/types/IItem/):

| `StoryItemType` | Item details `type` | Item details `typeKeywords`          |
| :-------------: | :------------------ | :----------------------------------- |
|   `Briefing`    | `"StoryMap"`        | `"StoryMap"`, `"storymapbriefing"`   |
|  `Collection`   | `"StoryMap"`        | `"StoryMap"`, `"storymapcollection"` |
|     `Frame`     | `"StoryMap"`        | `"StoryMap"`, `"storymapframe"`      |
|     `Story`     | `"StoryMap"`        | `"StoryMap"`                         |
|     `Theme`     | `"StoryMap Theme"`  | `"StoryMap"`, `"StoryMap Theme"`     |

## StoryItemBuilder and StoryItemViewer

The classes that hold the instance of a story item and includes methods to save and load the item. Specifically,

- `StoryItemViewer` is for story viewer, where the **published data** (as field `itemData`) is fetched and consumed
- `StoryItemBuilder` (extending `StoryItemViewer`)is for story builder, where **draft data** (as field `itemDraftData`) and **published data** (as field `itemData`) are fetched, consumed, and saved

---

[StoryMaps Documentation (Home)](../README.md)
