# How to write a Storybook story in CSF3?

<!-- omit in toc -->

## Table of Contents

- [Table of Contents](#table-of-contents)
- [What is CSF?](#what-is-csf)
  - [CSF 3.0](#csf-30)
- [Key ingredients of CSF](#key-ingredients-of-csf)
  - [`1. Default export`](#1-default-export)
  - [`2. Named exports`](#2-named-exports)
- [`Decorators`](#decorators)
- [`Parameters`](#parameters)
- [`Automatic title generation`](#automatic-title-generation)
- [`Play functions` for scripted interactions (since SB 6.5)](#play-functions-for-scripted-interactions-since-sb-65)
- [`Sample starter template`](#sample-starter-template)
- [`Caveats`](#caveats)
- [Legacy Storybook files with the `storiesOf` API](#legacy-storybook-files-with-the-storiesof-api)

## What is CSF?

CSF (Component Story Format) is the recommended way to write stories. It's an open standard based on ES6 modules that is portable beyond Storybook. CSF was first introduced in Storybook 5.2.

In CSF, stories and component metadata are defined as ES Modules. Every component story file consists of a required `default export` and one or more `named exports`. CSF is supported in all frameworks except React Native, where you should use the storiesOf API instead.

🔗 From [Component Story Format (CSF)](https://storybook.js.org/docs/react/api/csf#component-story-format)

### CSF 3.0

Component Story Format 3 marks an evolution in stories that trims boilerplate code and improves ergonomics. This makes stories more concise and faster to write.

Improvements include:

- ♻️ Spreadable story objects to easily extend stories
- 🌈 Default render functions for brevity
- 📓 Automatic titles for convenience
- ▶️ Play functions for scripted interactions and tests
- ✅ 100% backwards compatible with CSF 2

🔗 From [Component Story Format 3.0](https://storybook.js.org/blog/component-story-format-3-0/)

## Key ingredients of CSF

### `1. Default export`

The default export defines metadata about your component, including the component itself, its [title](#automatic-title-generation) (where it will show up in the navigation UI story hierarchy), [decorators](#decorators), and [parameters](#parameters).

The component field is required and used by addons for automatic prop table generation and display of other component metadata. The title field is optional and should be unique (i.e., not re-used across files).

```ts
import type { Meta } from '@storybook/react';
import { MyComponent } from './MyComponent';

const meta: Meta<typeof MyComponent> = {
  title: 'Path/To/MyComponent', // optional
  component: MyComponent,
  decorators: [ ... ],
  parameters: { ... },
};

export default meta;
```

🔗 From [Default export](https://storybook.js.org/docs/react/api/csf#default-export)

### `2. Named exports`

With CSF, every named export in the file represents a story object by default.

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MyComponent } from './MyComponent';

const meta: Meta<typeof MyComponent> = {
  title: 'Path/To/MyComponent', // optional
  component: MyComponent,
};

export default meta;

type Story = StoryObj<typeof MyComponent>;

export const Basic: Story = {};

export const WithProp: Story = {
  render: ({ label, onClick }) => <MyComponent label={label} onClick={onClick} />,
  // 🔗 [Read more about args](https://storybook.js.org/docs/react/writing-stories/args)
  args: {
    label: 'Hello',
    onClick: action('clicked'),
  },
};
```

🔗 From [Named story exports](https://storybook.js.org/docs/react/api/csf#named-story-exports)

## `Decorators`

A decorator is a way to wrap a story in extra “rendering” functionality. Many addons define decorators to augment your stories with extra rendering or gather details about how your story renders. When writing stories, decorators are typically used to wrap stories with extra markup or context mocking.

🔗 From [Decorators](https://storybook.js.org/docs/react/writing-stories/decorators)

## `Parameters`

Parameters are a set of static, named metadata about a story, typically used to control the behavior of Storybook features and addons.

🔗 From [Parameters](https://storybook.js.org/docs/react/writing-stories/parameters)

## `Automatic title generation`

In CSF, a story’s title determines where it shows up in the navigation hierarchy in the UI. In CSF3, the title can be automatically generated based on the file’s location relative to the root. Less to type, and nothing to update if you reorder your files.

You can still specify a title like in CSF 2.0, but if you don't specify one, it can be inferred from the story's path on disk.

## `Play functions` for scripted interactions (since SB 6.5)

Storybook's play functions are small snippets of code executed when the story renders in the UI. They are convenient helper methods to help you test use cases that otherwise weren't possible or required user intervention.

When the story renders in the UI, Storybook executes each step defined in the play function and runs the assertions without the need for user interaction.

🔗 From [Play function](https://storybook.js.org/docs/react/writing-stories/play-function)

A good use case for the play function is a form component 👇

```ts
import { userEvent, within } from '@storybook/testing-library';
import { expect } from '@storybook/jest';

// ...

export const FilledForm = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const emailInput = canvas.getByLabelText('email', {
      selector: 'input',
    });
    await userEvent.type(emailInput, 'example-email@email.com', {
      delay: 100,
    });

    const passwordInput = canvas.getByLabelText('password', {
      selector: 'input',
    });
    await userEvent.type(passwordInput, 'ExamplePassword', {
      delay: 100,
    });

    const submitButton = canvas.getByRole('button');
    await userEvent.click(submitButton);

    // 👇 Assert DOM structure
    await expect(canvas.getByText('Your account is ready')).toBeInTheDocument();
  },
};
```

## `Sample starter template`

You can copy the sample starter template to create stories of your component from [story-template.tsx](../../config/packages/shared-config/storybook/story-template.tsx)

## `Caveats`

One thing to keep in mind when using `render` property to render a component in Story Book is that if you attempt to use a hook like `useState`, ES Lint will flag it with the following error - "React Hook "useState" is called in function "render" that is neither a React function component nor a custom React Hook function.". The issue has been flagged in the Storybook repo as well - https://github.com/storybookjs/storybook/issues/21115.

This will not work and ES Lint will flag an error on the line that has `useState` 👇

```tsx
export const Default: Story = {
  render: (args) => {
    const [selectedOptionId, setSelectedOptionId] = useState(() => args.selectedOptionId); // Error thrown on this line
    const onChange = (optionId: string) => {
      setSelectedOptionId(optionId);
      args.onChange(optionId);
    };
    return <ComboBoxWithLabel {...args} selectedOptionId={selectedOptionId} onChange={onChange} />;
  },
};
```

Workaround that helps navigate this error without using `eslint-disable-next-line` 👇

```tsx
const Template = (args) => {
  const [selectedOptionId, setSelectedOptionId] = useState(() => args.selectedOptionId);
  const onChange = (optionId: string) => {
    setSelectedOptionId(optionId);
    args.onChange(optionId);
  };
  return <ComboBoxWithLabel {...args} selectedOptionId={selectedOptionId} onChange={onChange} />;
};

export const Default: Story = {
  render: (args) => <Template {...args} />,
};
```

## Legacy Storybook files with the `storiesOf` API

These stories are deprecated and were deleted to facilitate upgrading from Storybook v7 to v8, where the legacy `storiesOf` API is not supported.

A machine-readable list of these deleted stories are at [`./docs/misc/storiesof-files.txt`](../misc/storiesof-files.txt).

Read the code for these stories with git or devtopia by navigating to a pre-deletion commit; ex: [v25.40.1](https://devtopia.esri.com/WebGIS/arcgis-storymaps/releases/tag/v25.40.1). View them on devtopia with `https://devtopia.esri.com/WebGIS/arcgis-storymaps/tree/v25.40.1/<FILE_PATH>`; ex: `https://devtopia.esri.com/WebGIS/arcgis-storymaps/tree/v25.40.1/packages/storymaps-builder/src/blocks/button/index.stories.tsx`
If any of these stories are needed, they will need to be manually rebuilt as CSF3 stories. See the [Storybook migration guide](https://storybook.js.org/docs/8/migration-guide/from-older-version).
