# Spacing Variables

We have two sets of spacing variables that we use to add margins, padding, widths and heights etc.

Both sets of spacing variables undergo a scaling when rendered via the script embed flow.

In our app we set the HTML font-size to 10px to simplify the conversion of pixels to rem values. For instance, 16px would correspond to 1.6rem. But when a user utilizes our embed workflow to render a story within their own web page this makes all of their rem sizes incorrect on their website.

We no longer set that html font-size override when embedding, instead we scale all of our variables based on whatever their html font-size is.

## Product Spacing Variables

The product spacing variables can be found in the `storymaps-components` package: `storymaps-components > src > variables`

These variables have their values changed depending on breakpoints like mobile tablet and desktop.

**We should use the product spacing variables when working on any UI that is part of the product and NOT UI that is only displayed in the viewer.**

Examples of this would be any builder UI that is not also rendered in the viewer, like the item picker or RichText toolbar.

To use these variables you will first need to import them in your component:

```ts
import { variables } from 'storymaps-components';
```

and then use them inside your CSS:

```js
<style jsx>
  {`
    .example {
      width: ${variables.spacing.xxl};
    }
  `}
</style>
```

If you need a custom size use the `custom` method. NOTE: we should try to avoid this when possible, and instead use the sizes that are already defined.

```js
<style jsx>
  {`
    .example {
      width: ${variables.spacing.custom('3.1rem')};
    }
  `}
</style>
```

This custom method will insure this rem size works correctly when the item is embedded

## Story Theme Spacing Variables

The story theme spacing variables can be found in the `storymaps-builder` package: `storymaps-builder > src > design > themes > common`

These variables have the same exact base values as the product variables and same API but they differ in how they scale. The story theme spacing variables (when used within the `AspectRatioCanvas` component) smoothly scale based on the size of the `AspectRatioCanvas`.

When a component using a story theme spacing variable is rendered in an output that does not use the `AspectRatioCanvas` to wrap its content it will function exactly the same as the product spacing variables.

Two of our outputs currently utilize the `AspectRatioCanvas`; Briefings and Frames. These scalable variables let Briefings and Frames scale the entire content area (viewer UI) to be exactly the same no matter the screen size.

**We should use the story theme spacing variables when working on UI that exists in both the builder and the viewer.**

To use these variables you will first need to import the custom hook into your component:

```ts
import { useThemeVariables } from '../../../../design/context';
```

Then you will need to use the custom hook within your component to get the returned `themeVariables` object:

```ts
const themeVariables = useThemeVariables();
```

and then use them inside your CSS:

```js
<style jsx>
  {`
    .example {
      width: ${themeVariables.spacing.xxl};
    }
  `}
</style>
```

If you need a custom scaled size use the `custom` method. NOTE: we should try to avoid this when possible, and instead use the sizes that are already defined.

```js
<style jsx>
  {`
    .example {
      width: ${themeVariables.spacing.custom('19rem')};
    }
  `}
</style>
```

This custom method will insure this rem size works correctly when the item is embedded, and scales correctly for Briefings/Frames
