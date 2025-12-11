# Internationalization

StoryMaps has an international audience and we support several different languages and culture formats to ensure readability.

<!-- omit in toc -->
## Table of Contents

- [Key Terms](#key-terms)
- [Determining User's Locale](#determining-users-locale)
- [AGSM Architecture](#agsm-architecture)
  - [Setting a page specific override (AGSM)](#setting-a-page-specific-override-agsm)
- [FAQ](#faq)
  - [Will every page support every language?](#will-every-page-support-every-language)
  - [Will every culture for a supported language also be supported?](#will-every-culture-for-a-supported-language-also-be-supported)

## Key Terms

- **Language**: The UI/UX translation for a website page. Each unique language will have a it's own set of translated string files (e.g. "en" for English, "es" for Spanish).
- **Culture**: Some languages support different cultural formatting (e.g., date, time, number formatting). Culture formatting is applied using built-in web browser APIs. 
- **Locale**: The full locale code consists of the language and region (e.g., en-US, English – United States; en-UK, English – United Kingdom).

NOTE: When fetching supported [locale information from ArcGIS Online/Enterprise](https://www.arcgis.com/sharing/rest/portals/languages?f=json), the REST API refers to our `language` term as "culture" and our `cultures` as "cultureFormats.format"

## Determining User's Locale

A user's locale is decided in the following order for all pages:

1. User override in URL query param: This is for testing purposes in AGSM only (e.g. `locale=fr-fr`).
2. Page level override: If a page only supports a specific language, the locale will be set by the page. Most stories are only available in a single language and should always follow the author's language.
3. Authenticated user's settings: All users set a default locale in their user settings.
4. Browser locale or language: Use the `accepted-languages` header set by the browser to determine the user's preference.
5. Fallback: If no supported language or locale is found, fallback to `en-us`.

## AGSM Architecture

In AGSM, all locales use the same URL to display the contents in the all languages. Once the locale is determined, the strings are fetched and the locale is set on React Intl's `<IntlProvider />` component.

The page locale is determined on the [initial load](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/16608b58683d4516004133d62757cd30a2330e18/packages/storymaps-app/pages/_app.tsx#L200) and stored in the app state for each subsequent client side route change. The [`setLocaleClientSide` method is used to override and reset](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/16608b58683d4516004133d62757cd30a2330e18/packages/storymaps-app/pages/_app.tsx#L631) the locale during client side routing in the `_app.tsx` page logic.

### Setting a page specific override (AGSM)

If the page Component sets the static property `Component.hasPageSpecificLocale` to `true` and returns `pageLocale: {LOCALE}` as a prop returned from the `getInitialProps` function, the page will set a temporary override. This locale override will only remain for that single page. The next time the page is routed, the user will return to their original locale as determined above.

In stories, this page locale override is [extracted from the story data](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/6e5604b94bca5a49166a11c8bfa7e8ae6e07f129/packages/storymaps-website-common/src/utils/item/index.ts#L101) as set by the story author.

## FAQ

### Will every page support every language?

No, most pages will support all languages when the strings are translated and come from the app source code. However, when the string come from user generated content (e.g. stories), we will only support the languages as specified in the story data. The page locale should always match the user's content locale to provide consistency of strings displayed in the page.

### Will every culture for a supported language also be supported?

Yes, the culture formatting (date, number, currency, etc.) are handled by browser APIs and do not require additional dependencies.

---

#### Esri has dedicated internationalization (i18n) and translation (t9n) teams that support the development of global-ready software and products. You can learn more about these teams by visiting their website, reaching out via email, or joining the conversation on their Microsoft Teams channels.
🌐[i18n & t9n website](https://esriis.sharepoint.com/sites/i18n_t9n)

✉️[i18n email](mailto:i18n_services@esri.com)

✉️[t9n email](mailto:translation_services@esri.com)

[i18n Microsoft Teams Channel](https://teams.microsoft.com/l/team/19:c32d1e8541074788ab3605e7a99456ab%40thread.tacv2/conversations?groupId=5ce32401-894d-48f2-8795-14c90792022e&tenantId=aee6e3c9-711e-4c7c-bd27-04f2307db20d)

[t9n Microsoft Teams Channel](https://teams.microsoft.com/l/channel/19:56b6ff3337cd42ec98bcedad94caeb19%40thread.tacv2/General?groupId=b31a2151-a6a3-452b-972a-687e6a6d7153&tenantId=aee6e3c9-711e-4c7c-bd27-04f2307db20d)

--- 

[StoryMaps Documentation (Home)](../../README.md)
