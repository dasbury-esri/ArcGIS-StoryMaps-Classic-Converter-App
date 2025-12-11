# Data Flow

<!--
TODO:

- call out which steps are sync vs. async in this doc
- use an example Block (`'audio'`) to talk about as you describe the data flow and persistence. This way we could permalink to the relevant parts of the code for each thing you're describing, e.g. Viewer and Builder. This might help someone make the connection from the abstract concepts to actual Blocks and components in the code.
-->

## TL;DR

This document describes the data flow in StoryMaps, from fetching persisted data, to populating Nodes and Resources with Gemini, to rendering the final UI with React.

> **Note:** Theme specific data flow will not be covered here. Please see its dedicated doc: [Data flow of theme item](./data-flow-of-theme-item.md).

## TOC <!-- omit in toc -->

- [TL;DR](#tldr)
- [Entry point](#entry-point)
- [Fetching a story item's data](#fetching-a-story-items-data)
- [From Gemini item data to UI](#from-gemini-item-data-to-ui)
  - [Building block tree](#building-block-tree)
  - [Generate React element](#generate-react-element)
- [Save Gemini item data](#save-gemini-item-data)

## Entry point

StoryMaps stories and collections (and blocks in general) support two rendering modes:

1. Builder, where the author edits their story in a WYSIWYG format, and
2. Viewer, where a user views a story in its final form.

In both cases, we first need to fetch the data for that story/collection before we can render the corresponding UI. For this to happen, a user will need to navigate to one of two URLs:

- Builder: `/(stories|collections)/:id/edit`. (e.g., storymaps.com/stories/05b5ef044bbb4b2ab19e856e0fe9c018/edit).
- Viewer: `/(stories|collections)/:id/` (e.g., storymaps.com/stories/05b5ef044bbb4b2ab19e856e0fe9c018)

`:id` here is the story item's ID on the portal (TODO: clarify what "portal" means).

## Fetching a story item's data

When the user lands on one of these routes (builder or viewer), we instantiate a corresponding class:

- Builder: `StoryItemBuilder`
- Viewer: `StoryItemViewer`

This instance uses the item ID to fetch that particular [story item](../glossary.md#story-item)'s JSON data from the [backend](../glossary.md#backend) using [ArcGIS Rest JS](https://developers.arcgis.com/arcgis-rest-js/). Once the data has been fetched, it will live in the story instance under one of two variables, depending on the rendering mode:

- Builder: `itemDraftData`, representing **draft data**
- Viewer: `itemData`, representing **published data**

The **published data** (`itemData`) is later used to construct the viewer UI, whereas the **draft data** (`itemDraftData`) is later used to construct the builder UI.

## From Gemini item data to UI

The entry point of Gemini's data consumption is the `build()` function call. There are two call sites:

> **Tip**: search `build({` in the codebase to quickly locate them)

- Gemini item viewer component: `packages/storymaps-builder/src/item-components/gemini-item/viewer/index.tsx`
- Gemini item builder component: `packages/storymaps-builder/src/item-components/gemini-item/builder/index.tsx`

In these two files, you will see how the data model is converted to the UI: Gemini `build()`s a block tree from the [Gemini item data model](../glossary.md#gemini-item-data-model) JSON, and the Gemini item viewer/builder component holds onto the reference to the tree's root node, `itemBlock`, as an instance variable. `itemBlock.render()` returns a React element tree (in `JSX.Element`) of the block tree. The returned React element is directly set as the component state which is then rendered as UI by the component.

Essentially,

```txt
          +-----------+
          | item JSON |
          +-----------+
            /
           / (1)
          v
+------------+ (2) +--------------+
| block tree |---->| element tree |
+------------+     +--------------+
                       /
                      / done by React
                     v
           +---------+
           | item UI |
           +---------+
```

1. A block tree is built from the Gemini item JSON
2. Each block in the tree generates a piece of React element

Let's take a closer look at each.

### Building block tree

> - Input: [Gemini item data model](../glossary.md#gemini-item-data-model)
> - Output: block tree

In the data model, each **block** (entry in `nodes`) has a `type` field and a `data` field. Gemini uses the `type` to look up the corresponding subclass of `Block` from the [registry](../glossary.md#registry) to instantiate the block with the `data`. The `data` will be maintained as the block instance variable `Block.data`. Changes can be later made to `Block.data` and it will be eventually persisted back in the data model (see [Save data](#save-data) section).

Some blocks also have `children` field (e.g. `'story'` block) that contains a list of children block IDs, with which Gemini can build the "parent–child" tree structure for all blocks.

Meanwhile, a block may have one or more custom fields that point to its resources by resource ID. Take `'image'` block, it may contain three resource-pointing fields:

- `image`: pointing to an `'image'`-type resource
- `expressImage`: pointing to an `'image'`-type resource
- `expressImageDataId`: pointing to an `'express-image-data'`-type resource

> **Tip**: Details of what fields and what each points to can be usually found in each block's `README.md` file, or [check out a live data model JSON](../glossary.md#live-data-model).

Prior to Gemini building the block tree, a resource mapping (resource ID => resource instance) is created synchronously.

> **Note:** A `Resource` instance is used for maintaining the information/metadata (e.g. URLs) about an external "web resource" such as an image or a JSON file. It doesn't fetch/contain the actual file itself.

Each resource instance is instantiated in the same way as the block: by looking up the subclass of `Resource` from the [registry](../glossary.md#registry) by the resource `type`, and then creating the instance with the resource `data`. With this mapping in place, a block can access a resource by a resource ID with a simple lookup (see `getResourceById()` method in the codebase).

> **Note:** Generally, a resource instance cannot lookup another resource instance.

### Generate React element

> - Input: one block node from the block tree
> - Output: React element

A block is the place where persisted data (`Block.data`) and UI (React component) are connected.

To generate any React component, two ingredients are usually needed:

- component class
- component props

In each block, `getBlockComponent()` is responsible for providing the component class, and `get[Builder|Viewer]Props()` methods are responsible for providing the component props.

> **Note:** There are two `mode`s for a block: `'builder'` and `'viewer'`. For each mode there's an individual React component class (`builder.tsx` and `viewer.tsx` in each block folder) as well as the corresponding props interface (`[Builder|Viewer]Props`).

Block fields such as `data` and `config` are used to assemble the props in `get[Builder|Viewer]Props()` methods. The base `Block` class will apply the props on the component, and then the React element is rendered for this block.

```txt
|<---------- Block ---------->|<--------- React --------->|

+--------+
|  data  |\
+--------+ \   +-----------+
| states |--+->|   props   |\
+--------+ /   +-----------+ \   +---------------+   +----+
| config |/                   +->| React element |-->| UI |
+--------+     +-----------+ /   +---------------+   +----+
               | component |/
               +-----------+
```

## Save Gemini item data

A `StoryItemBuilder` instance will get the data for saving from the story item builder page (see call sites of `StoryItemBuilder.setGetStoryDataMethod()` method), and then save the JSON on the backend.

Gemini item builder generates the data model object from the aforementioned `itemBlock` through the Gemini event system (see block event `'getStoryDataForSave'`).

At a higher level, the JSON for the whole block tree is generated. It's essentially the opposite operation of [building the block tree](#building-block-tree). This means all the blocks are saved into one indexable object `nodes`, and any referenced-by-block resources are also into `resources`.

At the block level, fields such as data and config in each block can be updated by the end user through the UI (e.g., updating the caption text of a media block will update `Block.data.caption` field). Method `toJSON()` on the `Node` class (which `Block` extends) and `Resource` class will take these instance fields and convert them into JSON for data model persistence. This means each block/resource can override this method if needed (the main use case is to remove runtime-only data from `data` field).

> **Note:** Files like images or certain JSON are persisted on the backend as portal item resources of the story item.

---

[StoryMaps Documentation (Home)](../../README.md)
