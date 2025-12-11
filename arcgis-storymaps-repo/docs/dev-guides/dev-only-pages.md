# Dev Only Pages

Developers: Stephen Sylvia

## Overview

Development-only pages are pages that are only accessible during development. They are not included in the production build of the application. These pages are useful for testing components and features without exposing them to end users.

## Creating Dev Only Pages

The AGSM and SMX apps both support development-only pages from their respective `pages/` directories. To make your page accessible only in local development, rename the file to `{PAGE_NAME}.dev.{FILE_EXTENSION}`. For instance, `example.dev.tsx`.

Although this method works in all subdirectories of the `pages/` directory, we highly recommend adding them to the `pages/_dev/` directory. This ensures all pages under the `pages/_dev/` directory use the `.dev.{FILE_EXTENSION}` format, preventing accidental exposure to production. It's a safer and more organized approach.

All other features and requirements of the app will still function just like any other page within the app. Also, don't forget to add an entry to the strings configuration.

---

[StoryMaps Documentation (Home)](../../README.md)
