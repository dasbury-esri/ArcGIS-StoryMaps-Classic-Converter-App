# React-Intl

[React-Intl](https://formatjs.io/docs/react-intl) is the main library that we use to format strings, dates, numbers, etc. across the frontend codebase to ensure readability in all supported cultures.

## Table of Contents<!-- omit in toc -->

- [Render Components](#render-components)
- [Call Imperative APIs](#call-imperative-apis)

`react-intl` is used to internationalize strings, numbers, etc.

> Exception: For map UI (e.g. map zoom button tooltip text), [ArcGIS API for JavaScript handles the localization (including translating strings)](https://developers.arcgis.com/javascript/latest/localization).

There are two ways of obtaining the translated strings to be used in UI:

1. Render components: `<FormattedMessage>`, `<FormattedNumber>`, etc.
2. Call imperative APIs: `formatMessage()`, `formatNumber()`, etc.

With either way, you can obtain the translated string by providing

- a string ID, e.g. `'common.submit'`
- (and) an optional object containing the values to be interpolated with, e.g. `{ width: imgWidth, height: imgHeight }` for string ID `"builder.imageEditor.meta.cropped": "Cropped: {width} × {height}"`

## Render Components

Take `<FormattedMessage>` as an example...

```tsx
import { FormattedMessage } from 'react-intl';
// ...
<FormattedMessage id="component.avatar.admin" />;
```

## Call Imperative APIs

Take `formatMessage()` as an example...

```ts
import { injectIntl, WrappedComponentProps as InjectedIntlProps } from 'react-intl';
// Extend props with InjectedIntlProps
// ...
this.props.intl.formatMessage({ id: 'component.avatarImage.altText' });
// ...
export injectIntl(Component);
```

Also available as custom hooks defined in `packages/storymaps-builder/src`:

- `useFormatMessage`
- `useFormatNumber`

```tsx
const formatMessage = useFormatMessage();
// ...
{
  formatMessage('settings.general.personalInfo.subtitle', {
    profilePage: (
      <Link href="/profile" as={`${BASE_URL}/profile`}>
        <a>{formatMessage('settings.general.personalInfo.subtitle.placeholder')}</a>
      </Link>
    ),
  });
}
```

```json
// String syntax in JSON:
"settings.general.personalInfo.subtitle": "This information is only visible to you. You can manage your public profile {profilePage}."
```

There's another syntax using tags for interpolating strings/elements:

```tsx
const giphyAttribution = formatMessage('builder.mediaProviders.poweredBy.giphy', {
  link: (msg) => (
    <a href="https://giphy.com/" target="_blank" rel="noreferrer noopener">
      {msg}
    </a>
  ),
});
```

```json
// String syntax in JSON:
"builder.mediaProviders.poweredBy.giphy": "Powered by <link>Giphy</link>"
```

And here is an example of using both string interpolation and rich text formatting:

```tsx
const someValue = 100;
const myMessage = formatMessage('viewer.someBlock.someMessage', {
  strong: (msg) => <strong>{msg}</strong>,
  value: someValue,
});
```

```json
"viewer.someBlock.someMessage": "Look! Rich text: <strong>{value}</strong>"
```

See the [FormatJS docs](https://formatjs.io/docs/react-intl/components#rich-text-formatting) for more information.

---

[StoryMaps Documentation (Home)](../../README.md)
