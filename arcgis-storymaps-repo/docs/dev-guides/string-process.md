# Strings Process

Both AGSM and SMX support numerous cultures around the world. Because of this, all public facing text needs to be extracted from the source code and included in a strings file so it can be translated.

<!-- omit in toc -->

## Table of Contents

- [Table of Contents](#table-of-contents)
- [String Files](#string-files)
  - [Where to Put Strings](#where-to-put-strings)
- [String ID Naming Convention](#string-id-naming-convention)
- [Strings Config](#strings-config)
- [Compile Strings](#compile-strings)
- [Manifest File](#manifest-file)
- [VSCode Strings Extension](#vscode-strings-extension)

## String Files

English strings are split into several smaller string files across multiple packages. Strings are generally organized according to use and separated by product (AGSM vs SMX) as needed (see `t9nmanifest.txt` for all locations).

At build time, we run the `compile-string` script which will create a single file per page for each language. These file will be a combination of multiple string files from source files according to the strings config file.

### Where to Put Strings

It's easier to think about strings based on which **file or folder** they appear in.
Use VSCode to search through the repo for that id.

#### `storymaps-builder/src/strings/viewer.json`

- Ids which are used **only** in the storymaps-builder package that are common to all viewer pages

#### `storymaps-builder/src/strings/builder.json`

- Ids which are used **only** in the storymaps-builder package, that are common to all builder/preview pages

#### `storymaps-builder/src/strings/{OUTPUT_TYPE}-viewer.json`

- Ids which are used **only** in the storymaps-builder package, that are used in a viewer of a specific output type

#### `storymaps-builder/src/strings/{OUTPUT_TYPE}-builder.json`

- Ids which are used **only** in the storymaps-builder package, that are common to all builder/preview pages of a specific output type

#### `storymaps-builder/src/strings/{OUTPUT_TYPE}-common.json`

- Ids which are used **only** in the storymaps-builder package, that are common to all builder/preview pages of a specific output type

#### `storymaps-website-common/src/strings/common.json`

- Ids which are common to most pages in both SMX and AGSM

#### `storymaps-express/src/strings/pages/{PAGE_NAME}.json`

- Ids that are specific to a single page in the SMX website

#### `storymaps-express/src/strings/shared/{CATEGORY}.json`

- Ids that are shared across more than one page in the SMX website but less than the majority of pages

## String ID Naming Convention

String ID's should start with the file they are found in to make is easy for devs/PE's to locate, and to trace overrides easier.
The only exception is the overriding strings themselves.

```json5
// viewer.json
{
  "viewer.share.facebook": "Share on Facebook", // Used only story viewer
  "viewer.embed": "Embed this story" // Used in story viewer and builder context menu
}
// builder.json
{
  "builder.immersive.duplicateSlide": "Duplicate Slide", // Used only in builder
  "builder.addMedia.image.upload": "Upload an Image" // Used only in builder
}
```

## Strings Config

In the root of each product pkg is a configuration used for strings compilation script below: `storymaps-app/stings.config.js` and `storymaps-express/stings.config.js`. This holds the following information:

1. Supported languages and cultures
2. String configuration for each page
3. Build script parameters

In general, the main information that needs to be updated on a common bases is the `pageStringDependencies`. This identifies which string from above should be included for a given page in production.

Any time you add/remove a page or change which string files are needed for a given page, you will need to update the `pageStringDependencies` entry for that page and rerun the string compilation script below.

## Compile Strings

After adding or editing strings in a `json` file or the strings config file, run `yarn compile-strings` to allow them to render/update in the UI.

## Manifest File

The internationalization team at Esri has automated scripts that will pick up our string changes both for pseudo translation and full translation. Their scripts rely on the `t9nmanifest.txt` file in the repository root being up to date. This manifest file specifies all the locations in our codebase that contain string files.

**IMPORTANT:** Any changes to this file must also be communicated to the internationalization team so they can update their script.

This is generated automatically by the update-t9nmanifest.js script:

```sh
# From repository root
node build-scripts/update-t9nmanifest.js
```

## VSCode Strings Extension

A strings extension to help developers efficiently navigate the process of working with strings in our codebase.

[VSCode Extension Doc](/extensions/strings-extension/README.md)

---

[StoryMaps Documentation (Home)](../../README.md)
