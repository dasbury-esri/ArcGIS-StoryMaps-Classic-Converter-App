# Documentation Best Practices

Below are best practices for writing various types of documentation. If you are writing a markdown file, you should install and use the recommended markdown extensions for VSCode in the repo settings file. This will automate table of content creation, table layouts, and more.

See also:

- Dev Workshop 2023-08-02: Writing Documentation
  - [Story / presentation](https://storymaps.com/stories/74d361a06e7a435494cca03eb85a7271)
  - [Workshop Recording](https://esriis-my.sharepoint.com/:v:/g/personal/chr12858_esri_com/Edp8C8bV2kFPjuOtmyi6bz4B2Vys02yLTo2RNXGb3XE9VQ)

## Table of Contents <!-- omit in toc -->

- [Inline Code Comments](#inline-code-comments)
- [JSDoc Comments](#jsdoc-comments)
- [Code README's](#code-readmes)
- [Development Guides](#development-guides)
- [Cross-team Guides](#cross-team-guides)
- [Documentation Writing Resources](#documentation-writing-resources)

## Inline Code Comments

Simple code comments should be used to explain what your code is doing or to provide additional information, such as why you made a particular decision. If related to a issue, document with issue number or link to external information.

Some best practices can be found here: https://stackoverflow.blog/2021/12/23/best-practices-for-writing-code-comments/.

Example

```ts
// Account for edge case #123
if (edgeCase) {
  ...
}
```

## JSDoc Comments

Simple [JSDoc comments](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html#handbook-content) (e.g. `/** Comment */`) should be added to any code that can be referenced/called outside of its immediate context. TypeScript will use this to add tooltips/code suggestions as developers reference them. Add to any interface, component props, functions, function arguments, etc.

Examples

```ts
/** Quick Description about New Type */
type NewType = string;
```

```ts
interface Props {
  /** Quick description about prop1 */
  prop1: string;
  /**
   * Quick description about prop1
   * NOTE: Special note can go here
   */
  prop2: boolean;
}
```

```ts
/** Quick description about fn */
const fn = (options: {
  /** Quick description about option1 */
  option1: string;
  /** Quick description about option2 */
  option2: boolean;
}) => {
  return 'something';
};
```

## Code README's

Whenever you are developing a new reusable component, new block, core features, or set of utility functions, you should also include a `README.md` file so other developers on the team can see a high-level guide of how to reuse that code without having to read through the code itself.

These `README` files should live adjacent to the code files they explain and should be updated as the code is updated. This will allow the docs to be versioned alongside the code.

Typically, these `README`'s will include a quick description, usage instructions and examples, history of code, known issues, etc.

Some code `README`'s will be valuable for most of the development team to be aware their contents. In this case, make sure to also include a link in the repo's [root README](../../README.md).

Examples

- [`<ComboBox />` README](https://devtopia.esri.com/WebGIS/arcgis-storymaps/tree/develop/packages/storymaps-components/src/components/ComboBox#combobox)
- [`useLoadMoreFocus` hook](https://devtopia.esri.com/WebGIS/arcgis-storymaps/tree/develop/packages/storymaps-components/src/hooks/useLoadMoreFocus)
- [StoryMaps Issue Checker](https://devtopia.esri.com/WebGIS/arcgis-storymaps/tree/develop/packages/storymaps-issue-checker#storymaps-issue-checker)

## Development Guides

Development guides should be written to explain high-level development topics (a11y, i18n, onboarding), topics that cover several components/files (block architecture, data flow), development team best practices (pull requests, docs), workflow patterns (git flow, technical reviews), or other resources.

All development guides should be written in the `docs/{topic}/subtopic.md` folder (or a sub folder for organization) and linked to in the [root `README`](../../README.md). If documentation is complex enough to require a second level of nesting (e.g. `docs/{topic}/subtopic/addition.md`), add only the main subtopic to the [root `README`](../../README.md). Additional content can be linked from that subtopic page.

Be sure to include a table of contents and links back to the [root `README`](../../README.md) to make navigation easier. It's also helpful to link to other related pages as well.

As code is changed, make sure to also update the supporting documentation. This will allow the docs to be versioned alongside the code.

Examples

- [Getting Started](../setup/getting-started.md)
- [Let's Make a Block!](./docs/dev-guides/new-block-tutorial.md)

## Cross-team Guides

These guides are similar to development guides above but are broadly applicable to the larger StoryMaps team (PE's, design, and/or editorial). Because of this, they will typically live in our Confluence Wiki or another external system. Links to these documents should be added to the [root README](../../README.md) for better discoverability.

Example

- [Glossary](https://mercator1.atlassian.net/wiki/spaces/PROD/pages/116097105/Glossary)

## Documentation Writing Resources

- [Google's technical writing classes](https://developers.google.com/tech-writing/overview) , which are the same educational classes that Software Engineers at Google are required to take.
- [Write the Docs](https://www.writethedocs.org/) website with documentation writing resources
- [Write the Docs Slack Community](https://www.writethedocs.org/slack/)
- [Best Practices For Writing Code Comments](https://stackoverflow.blog/2021/12/23/best-practices-for-writing-code-comments/)
- [Increment online magazine's issue on writing technical documentation](https://increment.com/documentation/)
- Using [Micro benevolences](https://openwebdocs.org/content/posts/micro-benevolences/) for inclusivity.

---

[StoryMaps Documentation (Home)](../../README.md)
