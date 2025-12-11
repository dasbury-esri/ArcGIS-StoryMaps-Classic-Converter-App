# Routing

<!-- omit in toc -->
## Table of Contents
- [Related Documentation](#related-documentation)
- [How to Add a New Route](#how-to-add-a-new-route)
  - [Overview](#overview)
  - [1. Update `StoryRoute` (optional, see note)](#1-update-storyroute-optional-see-note)
  - [2. Update the `routeConverter` for AGSM and SMX](#2-update-the-routeconverter-for-agsm-and-smx)
  - [3. Create a page component](#3-create-a-page-component)
  - [4. Update page strings](#4-update-page-strings)

## Related Documentation

- [Story Routing Context](/packages/storymaps-builder/src/routing/README.md)

## How to Add a New Route

Because AGSM and SMX have slightly different product requirements, they handle routing slightly differently. We'll go over those differences in this guide.

### Overview

To create a new route:

1. (Optional) Update the [`StoryRoute`](/packages/storymaps-builder/src/routing/routes/index.ts) type union.

2. Update `routeConverter` to handle the newly defined route with a switch `case` statement:

- AGSM: [`packages/storymaps-app/utils/routeConverter/index.ts`](/packages/storymaps-app/utils/routeConverter/index.ts)
- SMX: [`packages/storymaps-express/utils/routeConverter/index.ts`](/packages/storymaps-express/utils/routeConverter/index.ts)

3. Create a React component for your page's UI.

- AGSM: `packages/storymaps-app/pages/your-page.tsx`
- SMX: `packages/storymaps-express/src/pages/your-page.tsx`

4. Add strings to your page so you don't get build errors:

- AGSM: [`packages/storymaps-app/strings.config.js`](/packages/storymaps-app/strings.config.js)
- SMX: [`packages/storymaps-express/strings.config.js`](/packages/storymaps-express/strings.config.js)

### 1. Update `StoryRoute` (optional, see note)

> [!NOTE]
> This step is only required if the link will be used within the `storymaps-builder` package (e.g., item pages, my content, etc.). This is not required for product-specific pages (e.g., SMX marketing pages) that are only used in a single product. Product links can use normal product-specific routing methods (`next/router`).

> If your route never actually renders anything and just redirects to an external page (like an Esri page), you can skip this step. See [the SMX privacy page](/packages/storymaps-express/src/pages/privacy/index.tsx) for an example.

Define an interface for your new route (see [Routing — General Concepts](/packages/storymaps-builder/src/routing/README.md#general-concepts)):

```ts
interface MyNewRoute {
  route: 'my-new-route';
  // add any other data you want to forward to the route converter
}
```

Then, update the `StoryRoute` union to include it:

```ts
export type StoryRoute =
  | HomeRoute
  | ...
  | MyNewRoute;
```

> See also [`makeItemRouteDef`](/packages/storymaps-builder/src/routing/index.tsx), a helper utility that allows you to create item-specific routes.

Now that you've defined a payload interface for a route, you can pass it along to the story routing context utils (e.g., `routeTo`):

```ts
const { routeTo } = useStoryRouting();
routeTo({ routeDef: { route: 'my-new-route' }, method: 'push' });
```

Or render a `StoryLink` whose `routeDef` points to your new route.

But the route itself doesn't actually exist yet. For that, you need to update the route converter and create a page component.

### 2. Update the `routeConverter` for AGSM and SMX

> [!NOTE]
> Again, if the link is not specific to `storymaps-builder`, you can skip this step.

AGSM: [`packages/storymaps-app/utils/routeConverter/index.ts`](/packages/storymaps-app/utils/routeConverter/index.ts)
SMX: [`packages/storymaps-express/utils/routeConverter/index.ts`](/packages/storymaps-express/utils/routeConverter/index.ts)

Example:

```ts
switch (routeDef.route) {
  // other cases omitted here...
  case 'my-content': {
    const routeModifier = getStoryTypeRouteModifier(routeDef.itemType, isTemplate);
    return matchRoutingProps(`/${routeModifier}`);
  }
  // Handle your route
  // case 'my-new-route':
}
```

### 3. Create a page component

Now you need to render a page component when a user attempts to navigate to your route.

#### SMX

In SMX, we follow Next.js's file-based routing system, where the path to a file under `src/pages/*` is the pathname that will appear in the browser's address bar. For example, `storymaps.com/stories/:id/edit` is located on the file system under `/packages/storymaps-express/src/pages/stories/[id]/edit/index.tsx`.

> That `[id]` directory is a special Next.js directory known as a [dynamic segment](https://nextjs.org/docs/pages/building-your-application/routing/dynamic-routes#convention). This pattern allows you to handle routing to dynamic pages, as opposed to pages whose full routes are known at compile time (like marketing pages).

Let's look at a simplified example: the SMX pricing page (`/pricing`).

**`/packages/storymaps-express/src/pages/pricing/index.tsx`**

```tsx
import { type DefaultNextPage, withDefaultProps, type CommonPageProps } from '../../utils/page';

// SSR props. Use the default because we don't have any page-specific logic.
export const getServerSideProps = withDefaultProps();

type Props = CommonPageProps & {
  /** The user's subscription type, if they're authenticated. Otherwise, `undefined`. */
  subscriptionType?: SubscriptionType;
};

export const Pricing: DefaultNextPage = (pageProps: Props) => {
  // Here, we can access the page's props from `getServerSideProps`
  const { BASE_URL } = pageProps.config;

  return <PageContainer {...pageProps}>{/* page markup */}</PageContainer>;
};
export default Pricing;
```

This page defines two key things:

- `getServerSideProps` (optional): if your page needs server-side data. This is injected into the component props at request time.
- Page component (required): in this case, `Pricing`

Here's an example of the `/stories/:id` viewer route:

**`/packages/storymaps-express/src/pages/stories/[id]/index.tsx`**

```tsx
import { StoryItemType } from 'storymaps-utils';
import { makeGetServerSideProps } from '../../../components/sharedPages/geminiPage/view';
export { default } from '../../../components/sharedPages/geminiPage/view';

export const getServerSideProps = makeGetServerSideProps({
  itemType: StoryItemType.Story,
  isAutoTranslationEnabled: true,
});
```

Many of the item pages in SMX use shared components to reduce code duplication.

Finally, you may sometimes want to send users a link like `storymaps.com/internal` that redirects to an external Esri link. We do this on `storymaps.com/privacy` by redirecting from `getServerSideProps`:

```tsx
import { PRIVACY_URL } from '../../constants';
import { getRedirectObject } from '../../utils/page';

export const getServerSideProps = () => getRedirectObject(PRIVACY_URL);

const Privacy = () => {
  return null;
};

export default Privacy;
```

For your task, define a new route as a React component in the appropriate location on the file system. Refer to the Next.js docs linked above if you need a more detailed explanation of concepts like `getServerSideProps` or page props.

#### AGSM

Next.js didn't always have a Pages Router, so in older versions you had to write a custom Express server to handle any dynamic routing yourself (e.g., for a route like `/stories/[id]/edit`). Since AGSM was developed long before SMX and before the Pages Router was introduced, we are still using this legacy pattern for pages. See [`packages/storymaps-app/server/src/index.ts`].

Example:

```ts
router.get('/stories/:id/edit', (req: RequestWithServerInjectedProps, res) => {
  const actualUrl = '/stories/edit';
  const queryParams: ParsedUrlQuery = {
    ...getCommonQueryParams(req),
    ...setPropertyIfExists(req.query, 'lab', `${req.query.lab}`, 'areLabFeaturesEnabled'),
    id: req.params.id,
    ...setPropertyIfExists(req.query, 'duplicatePhase', `${req.query.duplicatePhase}`),
  };
  app.render(req, res, actualUrl, queryParams);
});
```

Example of an AGSM page:

```tsx
export default class Page extends Component<PageProps> {
  // If the page needs authentication
  public static requiresAuthentication = true;

  // IMPORTANT: you must use the old getInitialProps pattern because the static version of AGSM (used by Enterprise) does not have a server and therefore doesn't support getServerSideProps
  public static async getInitialProps(context: NextPageContext, appContext: AppCtx) {
    const { id } = context.query;
    const { config, locale, storyMapUserPrivileges, signInUrl, authManager } = appContext;

    // do whatever you want here

    return {
      /** Workaround for https://github.com/zeit/next.js/issues/9992 */
      key: `${id}${context.query.duplicatePhase || 'noDup'}`,
      config,
      locale,
      // return other props
    };
  }

  public override render() {
    return (
      <WebsitePageLayout {...this.props}>
        <YourPageUI />
      </WebsitePageLayout>
    );
  }
}
```

AGSM is still using the legacy [`getInitialProps` API](https://nextjs.org/docs/pages/api-reference/functions/get-initial-props) to inject props into pages, whereas SMX uses `getServerSideProps`. There are two reasons for this:

1. AGSM was developed before the Pages Router was released.
2. AGSM needs to support static builds for Enterprise, which doesn't use a server. SMX does not have a static mode.

See also `makeGetInitialProps` and its associated docs.

### 4. Update page strings

AGSM: [`packages/storymaps-app/strings.config.js`](/packages/storymaps-app/strings.config.js)
SMX: [`packages/storymaps-express/strings.config.js`](/packages/storymaps-express/strings.config.js)

Add viewer or builder strings as needed to your new route.

AGSM example:

```js
stories: [],
'stories/edit': [VIEWER, BUILDER],
'stories/new': [],
'stories/preview': [VIEWER],
'stories/view': [VIEWER],
```

SMX example:

```js
stories: {
  index: [COMMON_AUTHENTICATED_CHICLETS],
  new: {
    index: [],
  },
  '[id]': {
    edit: {
      print: {
        index: [VIEWER], // internally using /preview so VIEWER is good enough
      },
      index: [VIEWER, BUILDER],
    },
    preview: {
      print: {
        index: [VIEWER],
      },
      index: [VIEWER],
    },
    'embedded-preview': {
      index: [VIEWER],
    },
    print: {
      index: [VIEWER],
    },
    index: [VIEWER],
  },
},
```

Notice how the string configs are structured identically to the app's routing behavior: In AGSM, the config is flat because it doesn't use the page router, whereas SMX uses a nested object config that follows the same pattern as its Pages Router.
