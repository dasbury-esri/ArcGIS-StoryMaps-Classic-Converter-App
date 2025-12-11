# Maintaining monorepo modules and packages

## Resources

- [SurviveJS – Maintenance](https://survivejs.com/books/maintenance/)
- [Module Mania: Understanding the difference between CJS, AMD, UMD and ESM](https://shivarajbakale.com/blog/react/module-mania-understanding-difference-cjs-amd-umd-esm/)

### Module resolution

Set `package.json`'s `exports` field to set entrypoints alongside the `paths` field in `tsconfig.json` to allow `storymaps-` identifiers to resolve with aliases correctly across the TypeScript toolchain. See [TypeScript docs on `paths`](https://www.typescriptlang.org/tsconfig/#paths).
`tsconfig` `extends` property does not deep-merge properties, and will overwrite existing properties in the referenced `extends` config. See [extends on TypeScript docs](https://www.typescriptlang.org/tsconfig/#extends).

For `package.json`'s `exports` field, [subpath resolution](https://hirok.io/posts/package-json-exports#subpaths-resolution-advanced) requires the use of file extensions (per ESM standard) when importing. We rely on `tsconfig`'s `paths` and the bundler's resolution algorithm (webpack) which is less strict and does not require file extensions.

Reference material for the relevant systems: Node.js, webpack, SWC, TypeScript...

- [Modules: Packages | Node.js v24.10.0 Documentation](https://nodejs.org/docs/latest/api/packages.html#nodejs-packagejson-field-definitions)
- [Package exports | webpack](https://webpack.js.org/guides/package-exports/)
- [TypeScript: Documentation - Modules - Theory](https://www.typescriptlang.org/docs/handbook/modules/theory.html#module-resolution)
- [TypeScript: Documentation - Modules - Reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html#paths)
- [`swc-loader`](https://swc.rs/docs/usage/swc-loader) - Mostly for webpack in AGSM _server_ (`storymaps-app/server`)
- [Stack Overflow - swc not resolving import path aliases](https://stackoverflow.com/questions/75522940/swc-not-resolving-import-path-aliases)
