# Code Style

Most style aspects are automated through linters, formatters, shared IDE settings, and code generator templates. This guide disambiguates and provides context to these preferences.

<!-- omit in toc -->

## Table of Contents

- [Code generators serve as style examples](#code-generators-serve-as-style-examples)
- [File naming and structure](#file-naming-and-structure)
  - [React Components](#react-components)
  - [Types](#types)
  - [Constants](#constants)
  - [Utils](#utils)
- [Style goals](#style-goals)

## Code generators serve as style examples

The code templates used in generators reflect preferred code patterns and style.

See [code generation docs](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/generator/README.md) for a guide on scaffolding code with generators.

## File naming and structure

### React Components

The [React Component generator](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/generator/generators/component) outputs a "top-level" component of the following structure. Be sure to fill out the templates in each file!

````txt
/ComponentName
    ./README.md (High-level overview of component, with code owners and context)
    ./ComponentName.tsx (Don’t forget to add inline TSDoc to component code)
    ./ComponentName.test.ts (Jest tests)
    ./ComponentName.stories.tsx (Storybook)
    ./index.tsx (Barrel file, used only for convenient import/export)

Loosely inspired by 🔗 [Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/)

Helper components do not need a folder and barrel file:

```txt
./ComponentName
    ./HelperComponent.tsx
````

Very small single-use helper components can be placed in the same file they are used in, while larger helper components can be placed in the main folder alongside the main component. If these helpers are not re-used elsewhere, omit them from `index.ts`.

IMPORTANT:

Prefer named exports over `default`. 🔗 [Avoid Export Default | TypeScript Deep Dive](https://basarat.gitbook.io/typescript/main-1/defaultisbad)

Avoid wildcard imports/exports: `import * from './component';`. These can lead to unused imports and improper tree-shaking.

### Types

Types specific to a component can be defined within the component file itself. Do not export such types outside the file.

Types that are shared between multiple component files within a component directory can be defined in a separate `types.ts` file.

Types that are shared among components spread across multiple directories can be defined in a generic `types.ts` file that is normally placed under the package's `src` directory.

#### Type-only imports

Types should be exported/imported with the `type` keyword to maximize optimization.

```typescript
import type { Component } from 'react';
```

🔗 [Type-Only Imports and Export - Documentation - TypeScript 3.8](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export)

### Constants

Constants specific to a component can be defined within the component file itself. Do not export such constants outside the file.

Constants that are shared between multiple component files within a component directory can be defined in a separate `constants.ts` file.

Constants that are shared among components spread across multiple directories can be defined in a generic `constants.ts` file that is normally placed under the package's `src` directory.

### Utils

Helper methods/utils used within a component directory can be defined in a separate `utils.ts` file.

Utils that are shared among components spread across multiple directories can be defined in a generic `utils.ts` file that is normally placed under the package's `src` directory.

If utils can be differentiated into separate categories, you may consider creating a `utils` directory with each category being a sub-directory under the /utils directory.

IMPORTANT: Try to add unit tests to your utility methods whenever possible to ensure that they are reliable.

## Style goals

- Name files after their components or members when possible
- Prevent folder hierarchy from growing excessively deep
- Maximize code re-use
- Maximize tree-shaking and bundler optimization
- Avoid exporting/importing unused code

---

[StoryMaps Documentation (Home)](../../README.md)
