# Let's Make a Block!

## TL;DR <!-- omit from toc -->

This is a step by step tutorial for new or current devs to learn how blocks work in StoryMaps. It is meant to be followed along interactively. In this tutorial we will be creating a fictitious Markdown block for demonstration purposes only. Note that our text editor block already supports some markdown syntax such as for heading levels one through three.

## Steps <!-- omit from toc -->

These are the **required steps**\* for creating a new block in StoryMaps:

1. [Add the four required files/modules](#step-1-add-the-required-modules)
2. [Define the block's data model](#step-2-define-the-block-data-model)
3. [Create the [BlockName] class](#step-3-create-the-markdown-block-class)
4. [Add viewer & builder props, getters, setters to the [BlockName] class](#step-4-viewer--builder-component-props-getters-setters)
5. [Create the Viewer & Builder React components](#step-5-create-the-viewer--builder-react-components)
6. [Update Registries (Block & Inserter)](#step-6-update-registries)
7. [Add block palette i18n strings](#step-7-add-block-palette-i18n-strings)
8. [Refining persisted data with toJSON](#step-8-optional-refining-persisted-data-with-tojson)

> Note: All paths here are relative to `/packages/storymaps-builder/src/`

> Note: "undo/redo" is not covered here as it is not used by all blocks.

### Step 1: Add the Required Modules

All of StoryMaps' blocks live in the sub-directory `blocks/{BLOCK_TYPE}`, e.g. `blocks/code` or `blocks/image`.

Start by creating a new directory for our Markdown block:

`blocks/markdown`

Next we need to add at least four files. These are:

- `README.md`: block data schema + version history + dev notes
- `index.ts`: block class definition and related TypeScript types
- `builder.tsx`: UI component for the block's `builder`
- `viewer.tsx`: UI component for the block's `viewer`

Additionally, we:

- add a component that returns an empty `<div>` element to both the `viewer` and `builder` files
- make sure both of these files have a default export for their component

```tsx
// viewer.tsx

const MarkdownViewer = () => {
  return <div></div>;
};

export default MarkdownViewer;
```

```tsx
// builder.tsx

const MarkdownBuilder = () => {
  return <div></div>;
};

export default MarkdownBuilder;
```

We'll add more code to these files later in this tutorial.

### Step 2: Define the block data model

We need to define our block's **data model**. At the top level the data model consists of a `type: string` property and a `data: Object` property.

1. We'll specify the `type` property as `"markdown"`, this property should be unique amongst all block types and use kebab case. Existing block types may be viewed in the builder package's `registry/index.ts` file or `blocks` directory.

2. For now the block's `data` property will only have a single `value` property consisting of the string entered by the user in the `builder` component which will be converted to Markdown in the `viewer` component. As we'll see later, the `data` properties are passed to the block's React `viewer` and `builder` components.

Given the above, our data model's `interface` will be as follows:

```ts
interface DataModel {
  type: 'markdown';
  data: {
    value: string;
  };
}
```

Note that we don't actually code this TypeScript interface in our app, it is more or less implied in the `Inserter` registry which we'll go over in step 6.

Generally speaking, all blocks specify their data model in their top level README file, so let's add it there:

```md
# Markdown

A block that converts markdown syntax into HTML.

## Data Model

<!-- NOTE: you may use backticks here instead of <pre> & <code>; their usage here is to prevent issues with code formatting and rendering of markdown to html in this markdown file -->
<pre>
   <code>
      interface MarkdownDataModel {
        type: 'markdown';
        data: {
          /** the markdown entered by the user */
          value: string;
        };
      }
   </code>
</pre>
```

### Step 3: Create the Markdown block class

In our `index.ts` file we will do the following:

- use `React.lazy` to lazy load / import our block's `builder` and `viewer` components.
- add the `Markdown` block class that contains boilerplate properties and methods common in all blocks.

```ts
// index.ts

import { lazy } from 'react';
import Block, {
  BlockBuilderProps,
  BlockInitProps,
  BlockInsertOptions,
  BlockViewerProps,
  getInitPropsHelper,
} from '../../block';

const MarkdownViewer = lazy(() => import('./viewer'));
const MarkdownBuilder = lazy(() => import('./builder'));

interface Data {
  value: string;
}

export class Markdown extends Block {
  public static override type = 'markdown';

  public static override getInstance = async (options: BlockInsertOptions) => {
    return new Markdown(getInitPropsHelper<Data>(options, Markdown.type));
  };

  public override data: Data;
  public override componentProps: BlockViewerProps | BlockBuilderProps;

  constructor(initProps: BlockInitProps) {
    super(initProps);
  }

  public override async getViewerProps(): Promise<BlockViewerProps> {
    return {
      // TODO: viewer props go here
    };
  }

  public override async getBuilderProps(): Promise<BlockBuilderProps> {
    return {
      ...(await this.getViewerProps()),
      // TODO: additional builder props go here
    };
  }

  public override getBlockComponent() {
    return this.mode === 'viewer' ? MarkdownViewer : MarkdownBuilder;
  }
}

export default Markdown;
```

#### Things to note about our Markdown block class

The `getBlockComponent` method is responsible for providing the block's React component. It's mostly boilerplate code but can be customized as needed (see our `'immersive'` blocks for examples of this).

We declare dynamic imports via `React.lazy` for loading the Viewer and Builder components as top-level variables. Otherwise, they will `import` _every time the block is re-rendered_ and suspend the Block's parent component, causing a layout shift due to React Suspense.

<!-- TODO: clarify why we use React.lazy here instead of next/dynamic -->
<!-- Note that we only pass static strings as paths for `import()`, per [Next.js docs](https://nextjs.org/docs/advanced-features/dynamic-import#example). -->

We specify methods for returning component props for the block's `viewer` and `builder` components as separate methods. Note that the `builder`'s props interface _always_ extends the `viewer`'s props interface. We'll customize the interfaces for these as well as add setter methods to update our block's data in the next step.

### Step 4: Viewer & Builder component props, getters, setters

We need to define interfaces for the React props for the block's `builder` and `viewer` components. They will be used by:

- the `viewer` and `builder` components (obviously)
- the following public block class methods:
  - `getViewerProps`
  - `getBuilderProps`

#### Viewer Props

Note that the `ViewerProps` extends `BlockViewerProps`. In many of StoryMaps blocks, values from the block's `data` property are passed to its `ViewerProps` to be accessed by its components. It is up to the developer of the block to decide whether to either extend the block's `ViewerProps` from its `Data` interface or to pick individual properties from the `Data` interface to avoid dumping all of the values from `data` into the block's `viewer` and `builder` components.

Example extending `ViewerProps` from `Data`:

```ts
// index.ts
export type ViewerProps = BlockViewerProps & Data;
```

Example picking a single property from `Data` to `ViewerProps`:

```ts
// index.ts
export interface ViewerProps extends BlockViewerProps, Pick<Data, 'value'> {}
```

For the purposes of this tutorial either approach is valid.

#### Builder Props

Note that the `BuilderProps` extends `BlockBuilderProps` _and the `ViewerProps`_. The `BuilderProps` include additional functions (methods on the block class) that the component can call to update block's data, states, and config properties; or to delete the current block.

```ts
// index.ts
export interface BuilderProps extends ViewerProps, BlockBuilderProps {
  setValue: (value: string) => void;
  delete: () => Promise<void>;
}
```

#### Props getter methods

Respectively, the two "props getter" methods assemble the component props objects:

```ts
// index.ts
// within the body of our `class Markdown`:

constructor(params) {
  super(params);
  // `remove` is a method on the base Block class
  this.delete = this.remove.bind(this);
}

public override async getViewerProps(): Promise<ViewerProps> {
  return {
    value: this.data.value,
  }
}

public override async getBuilderProps(): Promise<BuilderProps> {
  return {
    ...(await this.getViewerProps()),
    setValue: this.setValue,
    delete: this.delete,
  }
}
```

We will implement the `setValue` class method next.

#### Props setter methods

Each block needs property setter methods to update its `data`, `states`, and `config` properties\*. Property setters are typically passed along to a block's `builder` component via `getBuilderProps` so you can hook them up to React child components (e.g., the `onChange` event listener for an input or a button's `onClick` event listener).

> \* NOTE: `states` and `config` properties will be discussed in subsequent tutorials.

Importantly, **property setters should NOT be declared as inline functions**:

```ts
public override async getBuilderProps(): Promise<BuilderProps> {
  return {
    // ❌ DON'T do this! This creates a new function on every re-render 😬
    setValue: async (newValue: string) => {
      if (this.data.value === newValue) return;
      this.data.value = newValue;
      await this.update();
    }
  }
}
```

Similarly, **do NOT declare setters as methods on the class prototype**:

```ts
// ❓ At first glance, this seems pretty harmless
private async setValue(newValue: string) {
  if (this.data.value === newValue) return;
  this.data.value = newValue;
  await this.update();
}

public override async getBuilderProps(): Promise<BuilderProps> {
  return {
    // ❌ But because `setValue` will be called by downstream code without a reference to the block instance
    // itself (dot notation), the value of `this` will be rebound and cause an error to be thrown.
    setValue: this.setValue,
  }
}
```

Instead, use a [public class field](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Public_class_fields) so that your builder/viewer UI receives a stable function reference on re-render. Additionally, use an arrow function so that the value of `this` is lexically bound to the class instance:

```ts
// index.ts
// within the body of the `class Markdown`:

// ✅ `this` is ALWAYS bound to the block instance
private setValue = async (newValue: string) => {
  if (this.data.value === newValue) return;
  this.data.value = newValue;
  await this.update();
}

public override async getBuilderProps(): Promise<BuilderProps> {
  return {
    ...(await this.getViewerProps()),
    // ✅ We are no longer creating a new function on every re-render!
    setValue: this.setValue;
    delete: this.delete,
  }
}
```

> NOTE: that typically we specify viewer and builder props "getter" methods prior to specifying "setter" methods in the body of a block class. They are reversed above for clarification and readability purposes for this tutorial.

### Step 5: Create the Viewer & Builder React components

Next we will add the functionality for our Markdown block's `viewer` and `builder` components. The `builder` component will be rendered when a user is editing their story and the `viewer` component will be rendered when the user previews, prints, or publishes their story.

#### Pre-Step: Add the npm `marked` package

We'll be using the [marked](https://www.npmjs.com/package/marked) package to parse the user generated Markdown string into HTML for the viewer, so we need to add it as a dependency in the `storymaps-builder` package.

Make sure to change the working directory to `packages/storymaps-builder` before proceeding. Then install the following packages using `yarn`:

```bash
yarn add marked
yarn add -D @types/marked
```

#### Update the MarkdownBuilder Component

In our `builder.tsx` component we provide a simple `<textarea>` UI for the user to enter markdown text into. In the following code we:

- use an `onChange` event handler to update our block's `data.value` when the user enters text.
- sanitize the input provided by the user to prevent any malicious code from being inserted into a story.
- pass the value of `data.value` back to our `<textarea>` via `props.value` to keep the textarea in sync with our block's data.

```tsx
// builder.tsx

import { ChangeEvent, useId } from 'react';
import { sanitizeAllTags } from 'storymaps-utils';
import { BuilderProps } from '.';

const MarkdownBuilder = (props: BuilderProps) => {
  const id = useId();
  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const sanitized = sanitizeAllTags(event.target.value);
    props.setValue(sanitized);
  };

  return (
    <div>
      <label htmlFor={id}>Enter Markdown below:</label>
      <textarea
        id={id}
        value={props.value}
        onChange={onChange}
        rows={5}
        cols={33}
        placeholder="Write your markdown here"
      />
      <button onClick={props.delete}>Remove</button>
      <style jsx>{`
        div {
          font-size: 1.6rem;
          display: flex;
          flex-direction: column;
          gap: 1.6rem;
        }
      `}</style>
    </div>
  );
};

export default MarkdownBuilder;
```

A few things worth noting about the above Builder code that differ from our real blocks in StoryMaps:

- A block's delete button usually lives in a toolbar that appears when hovering over the block. The button we've added here is for demonstrative purposes only.
- Normally we use an i18n string that is passed to `React Intl`'s `formatMessage` util for the `textarea`'s `placeholder` attribute value rather than use a hardcoded English language string like we are doing above.
- When styling our components we use mixins for applying font styles and spacing variables for things like margin, padding, and flex / grid `gap`.
- Normally the user's input will be debounced so that we don't update the Block's `data` property too frequently. This is especially important for preventing race conditions and other issues with our undo/redo feature.

#### Update the MarkdownViewer Component

In our `viewer.tsx` component we will render our `value` prop as HTML by parsing it with the [`marked` npm module](https://marked.js.org/). We make sure to sanitize it to prevent a cross-scripting attack. This is an important step to take for any user provided data when creating a new block.

```tsx
// viewer.tsx

import { marked } from 'marked';
import { ViewerProps } from '.';

const MarkdownViewer = (props: ViewerProps) => {
  const html = marked.parse(props.value);

  return (
    <>
      {/* eslint-disable-next-line react/no-danger, @typescript-eslint/naming-convention */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <style jsx>{`
        div {
          width: 100%;
          padding: 1.6rem;
          font-size: 1.6rem;
        }
      `}</style>
    </>
  );
};

export default MarkdownViewer;
```

A few things worth noting about the above Viewer code:

- We avoid the use of React's `dangerouslySetInnerHTML` whenever possible due to the vulnerability of [XSS attacks](https://developer.mozilla.org/en-US/docs/Glossary/Cross-site_scripting). We use it here for demonstrative purposes of this tutorial.
- Similar to the CSS in the `MarkdownBuilder`, we normally use our app's spacing variables rather than hardcode them here.

### Step 6: Update Registries

We need to make sure that the new block is registered in two places:

- Block registry
- Inserter registry

> Note: An exception to this is that there is no need to register a "root block" (e.g. `'story'`) in the inserter registry, as we don't allow users to insert them.

#### Block registry

In the file `src/registry/index.ts`, we add a new entry in `registry.node`, e.g.,

```ts
markdown: {
  load: () => import('../blocks/markdown'),
},
```

This is for [Gemini](../glossary.md#gemini) to know which block sub-class to load for a given block type.

When a block has a resource we make sure to add an entry in `registry.resource`.

#### Inserter registry

In the file `src/registry/inserter.tsx`, we define an inserter item `markdownInserterItem`. Place the following code block at the top of the file just below the `import` statements:

```ts
// src/registry/inserter.tsx
import type Markdown from '../blocks/markdown';

const markdownInserterItem = makeInserterItem<Markdown>({
  id: 'markdown',
  defaultData: {
    type: 'markdown',
    data: {
      value: 'Hello _Markdown_!', // default value
    },
  },
  display: {
    title: <FormattedMessage id="builder.blockInserter.markdown" />,
    titleAlt: <FormattedMessage id="builder.mediaPanel.addMarkdown" />,
    description: <FormattedMessage id="builder.blockInserter.markdown.description" />,
    mediaPath: '/static/images/builder/block-palette/markdown.jpg', // ask your PE or Designer to determine which asset to use
    iconProps: {
      path: code16, // ask your PE or Designer to determine which calcite icon to use
      size: 16 as const,
    },
  },
});
```

- Note that in the `defaultData` property we provide the default values for the block's data model.
  - When we want a block's `data` property to be hydrated with initial data at the insertion time we add our initial data to `defaultData.data`.
  - If we want a block's `data` property to be updated at runtime, a good place to do so is in the block's `public onNodeAssembled` method. For more, see the [documentation for `onNodeAssembled`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/packages/storymaps-builder/src/blocks/README.md#public-onnodeassembled-optional).
- Note that in the `display` property we
  - add i18n strings for the block palette (the UI which enables the user to insert / add a new block).
  - specify the block's thumbnail image's file path (we provide a preview of the block in the block palette UI)
  - specify what Calcite icon SVG path to use (this icon appears next to the block's name in the block palette UI)

We then add the `markdownInserterItem` in the `getInserterItems`'s `inserterItems` array so the new option will show up in the block palette UI when a user is creating a story:

```ts
// src/registry/inserter.tsx

export const getInserterItems = (featureDecisions: FeatureDecisions): (InserterItem | string)[] => {
  const inserterItems = [
    markdownInserterItem,
    // other inserter items follow...
```

### Step 7: Add Block Palette i18n Strings

You probably noticed the use of the `<FormatMessage />` component from `ReactIntl` in our `markdownInserterItem`'s `display` property. This handles translating i18n strings to the user's preferred language in the [Block Palette UI](../glossary.md#block-palette). We need to make sure to add these strings to the `builder.json` file which contains all the strings used in the StoryMaps builder UI.

In the `strings/builder.json` file add the following:

```json
{
  //...
  "builder.blockInserter.markdown": "Markdown",
  "builder.blockInserter.markdown.description": "Write formatted text using markdown syntax.",
  "builder.mediaPanel.markdown": "Add markdown"
  // ...
}
```

> Note that Esri uses a translation service to translate strings to the dozens of languages supported by our app, so we don't need to worry about translating them ourselves.

After doing this make sure to compile the i18n strings in our app by running the `compile-strings` script on the command line in the root directory of the StoryMaps apps (AGSM: `/packages/storymaps-app/` or SMX: `/packages/storymaps-express/`):

```bash
yarn compile-strings
```

> Note that anytime i18n string JSON files are updated in the app this script will need to be run in order for the strings to be used in the app's UI.

Now start either AGSM or SMX locally and create a new story. When inserting a block into the story using the block palette, you should now see "Markdown" in the block palette UI as well as the descriptive string "Write formatted text using markdown syntax" when hovering on it.

Try adding some markdown to the block and then previewing the story to see the formatted HTML in the story's DOM.

### Step 8 (Optional): Refining persisted data with `toJSON`

All blocks inherit the base Gemini Node's `toJSON` method; this is used to serialize `this.data` (a JavaScript object) to a JSON string for persistence in our remote storage.

While you typically want to keep all of your block's data, other times you need to prune certain runtime data that doesn't need to be persisted. For examples of this, see [the table block](../../packages/storymaps-builder/src/blocks/table/README.md).

To handle this, you can override the `toJSON` method in your block. Here's an example from the table block:

```ts
public override toJSON(options: NodeJSONOptions) {
  // Call the base toJSON
  const json = super.toJSON(options);
  if (!json.data) {
    return json;
  }
  // Prepare the data for persistence
  json.data = convertRuntimeTableBlockDataToPersistedData(json.data as RuntimeTableBlockData);
  // Return the final JSON for persistence
  return json;
}
```

## Extra credit

Obviously having to preview our story to view the markdown as HTML isn't a very good user experience. Can you think of a way to show a preview of the markdown in the builder as the user is typing it?

## The End

Congrats! Hopefully upon completing the above steps you now have a working Markdown block that you can add to a story in StoryMaps. In future tutorials we will cover additional topics related to using blocks in StoryMaps such as rendering child blocks, undo/redo, block config, block state, communicating between blocks, etc.

You may also view the [Blocks API documentation](../../packages/storymaps-builder/src/blocks/README.md) for more detailed documentation on blocks in StoryMaps.

## Contributors

This tutorial was written, contributed to, and edited by the following StoryMaps team members:

- Aleksandr Hovhannisyan
- Alison Sizer
- Anusha Mysore Swamy
- Chris Henrick
- Yankuan Zhang

---

[StoryMaps Documentation (Home)](../../README.md)
