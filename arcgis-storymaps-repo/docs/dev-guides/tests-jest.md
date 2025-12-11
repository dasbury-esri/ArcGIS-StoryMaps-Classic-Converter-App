# Jest Test Author's Guide

Write unit and integration tests to increase stability and confidence, and to provide deeper documentation. This guide does not cover E2E or Storybook. This guide focuses on app-specific testing and does not aim to replace the Jest documentation.

## Commands and testing workflow

Refer to 🔗 [Jest CLI Options](https://jestjs.io/docs/cli) for full list.

| Shell Command                        | Purpose                             | Description                                                                                                                                                |
| ------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn test`                          | Run all tests for all packages      | Run from repo root `arcgis-storymaps`. Runs the `test` script in `package.json`, executing Jest in all packages.                                           |
| `yarn workspace <PACKAGE-NAME> test` | Run tests for a specifc package     | Use [`yarn workspace` command](https://yarnpkg.com/cli/workspace) to do this from the repo root, or `cd` to `packages/<PACKAGE-NAME>` and run `yarn test`. |
| `yarn test:watch`                    | Run tests in watch mode              | Get real-time feedback while authoring code/tests with [Jest watch mode](https://jestjs.io/docs/cli#--watch).                                              |
| `yarn test --t <TEST-SPEC-NAME>`     | Run specific tests, skip all others | Pass in `describe()` or `it/test()` string regex pattern. 🔗 [Jest CLI Options](https://jestjs.io/docs/cli#--testnamepatternregex)                         |

## When: Write tests often

Especially when complexity increases or code is reused (library code). When working on older code, write tests if possible when refactoring, as this provides a safer and more stable platform for guarding against regressions.

- 🔗 [Test-driven development - Wikipedia](https://en.wikipedia.org/wiki/Test-driven_development)
- 🔗 [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)

## How: write test files

Use `.tsx` extensions for JSX (rendering React components, DOM code) and `.ts` for general TypeScript code: libraries, utils, hooks, other non-JSX code.

Import React Testing Library code through `test-utils`. See following example from [`test-utils/react/testing-library/README.md`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/packages/test-utils/react/testing-library):

```tsx
// ✅ Correct way to import
import { render, ... } from 'test-utils/react/testing-library';
// ❌ DO NOT import like this 
import { render, ... } from '@testing-library/react
```

Tests that rely on the DOM will need the following pragma at the top. See [`CardFavoriteButton/index.test.tsx`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/packages/storymaps-builder/src/components/card/CardFavoriteButton/index.test.tsx) for example in action. More on `jsdom` at 🔗 [DOM Manipulation · Jest](https://jestjs.io/docs/tutorial-jquery)

```tsx
/**
 * @jest-environment jsdom
 */
```

### User events and async logic

See [`ItemBrowser`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/packages/storymaps-builder/src/components/ItemBrowser/index.test.tsx) for an example using `async` and `user-event`.

Declare tests with `test(async () => {...})` with [`findBy`](https://testing-library.com/docs/dom-testing-library/api-async/#findby-queries) and [`user-event`](https://testing-library.com/docs/user-event/intro/) (for simulating user events) to avoid async/timing errors with Jest.

Tests can fail on infinite timeouts when using `jest.useFakeTimers` with `userEvent.click`. Configuring `userEvent` with `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })` can prevent timeout. See 🔗 [`userEvent.click` fails due to timeout when used with `jest.useFakeTimers` · Issue #833 · testing-library/user-event](https://github.com/testing-library/user-event/issues/833)

- 🔗 [React Testing Library | Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- 🔗 [Jest · 🃏 Delightful JavaScript Testing](https://jestjs.io/)

### Mocks

Try to avoid testing implementation details. Use _mocks_ to simulate complex external libraries or asynchronous IO code (disk IO, external REST APIs, timers). Mocks should decouple app code from external APIs and state/context and allow tests to run at max
speed.

- Using a `__mocks__` folder, mocking `@arcgis/core`, manual mocks 🔗 [arcgis-storymaps/packages/storymaps-builder/**mocks** at develop · WebGIS/arcgis-storymaps](https://devtopia.esri.com/WebGIS/arcgis-storymaps/tree/develop/packages/storymaps-builder/__mocks__)

Strategies for one-off mocks, and to avoid creating `__mocks__` folders:

- Inline mock example 1: 🔗 [arcgis-storymaps/index.test.ts at develop · WebGIS/arcgis-storymaps](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/packages/storymaps-issue-checker/src/check/map-layer/index.test.ts#L14-L21)
- Inline mock example 2: 🔗 [arcgis-storymaps/index.test.ts at develop · WebGIS/arcgis-storymaps](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/packages/storymaps-issue-checker/src/check/storymap/index.test.ts#L20-L33)

Resources on mocking with Jest:

- 🔗 [Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details)
- Keeping some actual implementation and mocking others: 🔗 [Partially mocking imports in Jest | TypeOfNaN](https://typeofnan.dev/partially-mocking-imports-in-jest/)
- 🔗 [Manual Mocks · Jest](https://jestjs.io/docs/manual-mocks)
- Mocking imported ES modules: 🔗 [ES6 Class Mocks · Jest](https://jestjs.io/docs/es6-class-mocks#calling-jestmock-with-the-module-factory-parameter)
- Mocking timers (fake timers): 🔗 [Timer Mocks · Jest](https://jestjs.io/docs/timer-mocks#enable-fake-timers)

## What: Components, helpers/utils, hooks

Code that is easy to test is generally easier to read and maintain. TDD encourages code to be concise and predictable.

## Other examples of tests

- Unit tests for helpers/utils: [`MediaProviderUpload/geo-utils.test.ts`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/packages/storymaps-builder/src/components/AddMediaModal/providers/MediaProviderUpload/geo-utils.test.ts)
- Component testing: [`Drawer/index.stories.tsx`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/packages/storymaps-components/src/components/Drawer/index.test.tsx)
- Storybook stories: Search for `*.stories.*` filename pattern.
- Find more tests using `fd` CLI: 🔗 [sharkdp/fd: A simple, fast and user-friendly alternative to 'find'](https://github.com/sharkdp/fd) `fd --glob '*.test.*'` or (`git grep`, `ripgrep`)

## Maintaining Jest shared config

**Jest runs via Node**, but has experimental ESM support; therefore, Jest requires the `jsdom` preamble above to test DOM environments.

Jest config is shared amongst packages in [`config/packages/shared-config/jest`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/config/packages/shared-config/jest/README.md).

Jest config relies on `next/jest`, which handles next-specific mocking, config, and code transformation. More details on `next/jest` are in the Next.js docs: 🔗 [Optimizing: Testing | Next.js](https://nextjs.org/docs/pages/building-your-application/optimizing/testing)

`test/utils` package has reusable test utilities, mocks, and wrappers.

- 🔗 [Configuring Jest · Jest](https://jestjs.io/docs/configuration)
