import { GetServerSidePropsContext, NextPageContext } from 'next';
import type { UrlObject } from 'url';
import type { IItem } from '@esri/arcgis-rest-portal';
import type { ArcGISIdentityManager } from '@esri/arcgis-rest-request';
import {
  doesItemMatchItemType,
  fetchThemeItemInfo,
  GeminiItemType,
  getDefaultStoryThemeId,
  getLocaleFromStoryItemData,
  getStoryTypeRouteModifier,
  getThemePreviewSampleStory,
  makeItemRouteDef,
  StoryBuilderError,
  StoryItemBuilder,
  StoryItemData,
  StoryItemViewer,
  THEME_PREVIEW_STORY_ID,
  ThemeItemInfo,
  type WithTemplateMode,
} from 'storymaps-builder';
import {
  convertObjectToQueryString,
  FeatureDecisions,
  fetchViewerData,
  getItemDetailsProperties,
  getLanguageCodeFromLocale,
  getNormalizedSiteUrl,
  getStoryItemTypeFromItem,
  hasTypeKeyword,
  isCopiedItem,
  isPublishedFromExternalApp,
  isTemplateItem,
  type ObfuscatedItemDetails,
  obfuscateItemDetails,
  SitePublicConfig,
  StoryItemType,
} from 'storymaps-utils';
import { RouteConverter } from '../../components/RoutingProvider/types';
import { redirectApp } from '../next';
import { redirectOnLoadError } from '../next/redirectOnLoadError';
import { getUserAuthorization } from '../user';

/** Returns a URL for the requested page context. Works for both client- and server-side navigation. Used for item route viewer and preview validation. */
const getContextUrl = (ctx: PrepareViewDataParams['ctx']): string | undefined => {
  if (typeof ctx === 'undefined') {
    return;
  }
  // `ctx.req.url` will be present for server-side navigation
  if (ctx.req?.url) {
    return ctx.req.url;
  }
  // narrow type of ctx to NextPageContext
  if ('pathname' in ctx) {
    // NOTE: check asPath first for SMX and then fall back to pathname for AGSM (item IDs as query param)
    return ctx.asPath ?? `${ctx.pathname}${convertObjectToQueryString(ctx.query)}`;
  }
  return;
};

// TODO: reuse for builder route validation? We never did this in v1 of route validation

/** Checks if the given item is being accessed from the correct route. If not, throws a `StoryBuilderError`.
 * @throws StoryBuilderError
 */
export const validateItemRoute = (params: {
  /** The fetched item details of the item. */
  itemDetails: IItem;
  /** The EXPECTED item type for this route. */
  expectedItemType: StoryItemType;
  /** The current URL the user is requesting. Only relevant when checking template access. */
  url?: string;
}) => {
  const { itemDetails, expectedItemType, url } = params;
  const isTemplate = isTemplateItem(itemDetails);

  // NOTE: we can't just check if the url starts with /templates because this request could be client side which looks like /_next/data/development/en/templates/...
  const isTemplateRoute = url && url.includes('/templates') && url.includes(itemDetails.id);

  // NOT ALLOWED: Viewing a template item from a different route. It's not enough to check the item type because templates are not an item type; they are a "mode" set in `itemDetails.typeKeywords`. For example, a story template would still have an `itemType` of `StoryItemType.Story`. So without this check, a user could illegally access a template through /stories/:d.
  const isViewingTemplateFromNonTemplateRoute = isTemplate && !isTemplateRoute;

  // NOT ALLOWED: Viewing a non-template item from a /templates route. Again, we can't just check for an item type mismatch because, for example, templates can be stories.

  const isViewingNonTemplateItemFromTemplateRoute = !isTemplate && isTemplateRoute;

  // NOT ALLOWED: Viewing an item from the wrong item type route (e.g., a story on /collections).
  const isWrongItemType = !doesItemMatchItemType(itemDetails, expectedItemType);

  if (
    isWrongItemType ||
    isViewingTemplateFromNonTemplateRoute ||
    isViewingNonTemplateItemFromTemplateRoute
  ) {
    // The redirect will correctly handle templates thanks to makeItemRouteDef, so we don't need to pass anything else
    const correctItemType = getStoryItemTypeFromItem(itemDetails);
    throw new StoryBuilderError({
      type: 'item-not-supported-on-route',
      itemType: correctItemType,
    });
  }
};

export interface PrepareViewDataParams {
  ctx?: GetServerSidePropsContext | NextPageContext;
  id?: string;
  config: SitePublicConfig;
  authManager?: ArcGISIdentityManager;
  signInUrl: string;
  itemType: StoryItemType;
  skipCache?: boolean;
  /** If provided, try fetching the translated version of the story item data */
  translationOptions?: {
    /** A list of supported/allowed languages. These may be just the language code with no culture (e.g., `'en'`) or "special" languages like `'zh-cn'` or `'pt-br'`. */
    supportedLanguages: string[];
    /** A default/fallback language for scenarios where the locale is not supported. */
    fallbackLanguage?: string;
    /** The full locale string that includes language and culture (e.g., `'fr-ch'` for Swiss French or `'en-gb'` for British English). See `getLocaleFromContext` for how to get this on the server side. */
    locale?: string;
    /** This is only defined in SMX package */
    autoTranslationTypeKeyword: string;
  };
  /**
   * Should allow the function to redirect.
   *
   * NOTE: The function will return an object regardless of `shouldRedirect`'s value to fulfill the return type.
   *
   * Two usages:
   *
   * ```ts
   * const preparedViewData = await prepareViewData({ ..., shouldRedirect: true });
   * if (!preparedViewData.success) {
   *   return; // nothing else to do
   * }
   * ```
   * or
   * ```ts
   * const preparedViewData = await prepareViewData({ ..., shouldRedirect: false });
   * if (!preparedViewData.success) {
   *   return getRedirectObject(preparedViewData.redirect.asPath); // manually redirect at call site
   * }
   * ```
   */
  convertRoute: RouteConverter;
  shouldRedirect: boolean;
}

export interface PreparedViewData {
  success: true;
  id: string;
  itemDetails: ObfuscatedItemDetails;
  host: string;
  publishedData: StoryItemData;
  initialThemeItemInfo: ThemeItemInfo;
  /** NOTE: to be correctly serialized, omit the field if it's calculated as `undefined` */
  pageLocale?: string;
}

export interface PrepareDataError {
  success: false;
  redirect: {
    asPath: string;
  };
  error?: Error;
}

export type PrepareViewDataResponse = PreparedViewData | PrepareDataError;

/**
 * NOTE:
 *
 * Q: Why define it in current package? Doesn't it return gemini item page specific props?
 *
 * A: It has the dependencies of
 *   - `NextPageContext` (`next` won't be available in builder later)
 *   - `redirectApp`/`redirectOnLoadError` (defined in current package).
 */
export const prepareViewData = async (
  params: PrepareViewDataParams
): Promise<PrepareViewDataResponse> => {
  const { id, authManager, config, ctx, itemType, translationOptions, shouldRedirect } = params;

  if (!id) {
    throw new Error(`no ${itemType} id`);
  }

  // Bust browser cache if user logs out of item viewer to hide avatar for presentations
  // https://devtopia.esri.com/WebGIS/arcgis-storymaps/issues/13179
  if (typeof ctx !== 'undefined') {
    const { res } = ctx;
    res?.setHeader?.('Vary', 'Cookie');
  }

  const detailOptions = {
    itemId: id,
    authManager,
    portalHost: config.PORTAL_HOST,
    timeStamp: typeof ctx?.query.ts === 'string' ? ctx.query.ts : undefined,
  };

  let isTemplate = false; // we'll read this off itemDetails below after fetching it
  const dataOptions = { ...detailOptions, type: itemType, config };
  try {
    // `itemDetails` won't be re-assigned, but publishedData will. For better readability we disable the eslint here:
    // eslint-disable-next-line prefer-const
    let [itemDetails, publishedData]: [
      IItem,
      StoryItemData, // CollectionItemData uses the StoryItemData structure
    ] = await Promise.all([
      fetchViewerData<typeof StoryItemViewer.fetchItemDetails>(
        StoryItemViewer.fetchItemDetails,
        (signal) => [{ ...detailOptions, signal }],
        { function: 'StoryItemViewer.fetchItemDetails', id, itemType }
      ),
      fetchViewerData<typeof StoryItemViewer.fetchPublishedItemData>(
        StoryItemViewer.fetchPublishedItemData,
        (signal) => [{ ...dataOptions, signal }],
        { function: 'StoryItemViewer.fetchPublishedItemData', id, itemType }
      ),
    ]);
    isTemplate = isTemplateItem(itemDetails);

    // IMPORTANT: validate the route to ensure the user is accessing this item correctly (e.g., route mismatch)
    validateItemRoute({
      itemDetails,
      expectedItemType: itemType,
      // If ctx is undefined, we need to use window.location.pathname for enterprise
      url: getContextUrl(ctx) || window?.location.pathname,
    });

    // check to see if a locale has been set by author in the story item data
    let pageLocale = getLocaleFromStoryItemData(publishedData);
    const translatedLanguage = translationOptions?.locale
      ? getLanguageCodeFromLocale(
          translationOptions.locale,
          translationOptions.supportedLanguages,
          translationOptions.fallbackLanguage
        )
      : undefined;

    // check to see if the story has been automatically translated, and retrieved the translated version of the data
    if (
      translatedLanguage && // check language first to avoid hasTypeKeyword check if it's not needed
      getItemDetailsProperties(itemDetails)?.translations?.[translatedLanguage] &&
      translationOptions?.autoTranslationTypeKeyword &&
      hasTypeKeyword({
        typeKeywords: itemDetails.typeKeywords,
        typeKeywordId: translationOptions.autoTranslationTypeKeyword,
      })
    ) {
      pageLocale = pageLocale ? translationOptions.locale : undefined;
      publishedData = await fetchViewerData<typeof StoryItemViewer.fetchPublishedItemData>(
        StoryItemViewer.fetchPublishedItemData,
        (signal) => [
          {
            ...dataOptions,
            language: translatedLanguage,
            signal,
          },
        ],
        { function: 'fetchPublishedItemData', id, itemType }
      );
    }
    // Edge case: cookie is en-gb, but en is not in itemDetails.properties?.translations, so pageLocale needs to respect user's culture (GB)
    else if (
      translatedLanguage &&
      translationOptions?.locale &&
      pageLocale?.startsWith(translatedLanguage)
    ) {
      pageLocale = translationOptions.locale;
    }

    const initialThemeItemInfo = await fetchViewerData<typeof fetchThemeItemInfo>(
      fetchThemeItemInfo,
      (signal) => [
        {
          storyItemData: publishedData as StoryItemData,
          authManager,
          portalHost: config.PORTAL_HOST,
          signal,
        },
      ],
      { function: 'fetchThemeItemInfo', id, itemType }
    );

    // If created (Python API), or duplicated outside of our builder, redirect to builder to finish cleanup phase
    if (
      isCopiedItem(itemDetails) ||
      (isPublishedFromExternalApp(itemDetails) &&
        (itemDetails.itemControl === 'admin' || itemDetails.itemControl === 'update'))
    ) {
      const routePrefix = getStoryTypeRouteModifier(itemType, isTemplate);
      const href = `/${routePrefix}/edit?id=${id}`;
      const asPath = `${config.BASE_URL}/${routePrefix}/${id}/edit`;

      if (shouldRedirect) {
        // FIXME: use storyRouting
        redirectApp({
          ctx,
          href,
          asPath,
        });
      }
      return {
        redirect: {
          // href,
          asPath,
        },
        success: false,
      };
    }

    // if item is not public, user needs to be licensed to view
    // NOTE: for SMX
    // The org admin has disabled StoryMaps for their users even though the item is technically shared with them.
    // This covers the case when AGO needs to block an org for abuse reasons.
    if (itemDetails.access !== 'public' && authManager) {
      try {
        // `getUserAuthorization` is also a try-catch that returns string errors
        // like 'user-unauthorized' or throws errors. if an error is thrown from
        // `getUserAuthorization` itself, the main `catch` here will catch it.
        // note the thrown error is `request-failed`, which falls through the if/elses
        // in our errback and just redirects to a generic error page.
        if (
          (await fetchViewerData<typeof getUserAuthorization>(
            getUserAuthorization,
            (signal) => [{ authManager, config, signal }],
            { function: 'getUserAuthorization', id, itemType }
          )) === 'user-unauthorized'
        ) {
          // caught and redirected below
          throw new Error('user-unauthorized'); // ????: or `throw new WebsiteError('unsupported-account');` ?
        }
      } catch (e) {
        if (shouldRedirect) {
          // NOTE: this actually redirects the page by being caught by the top-level catch in the function to invoke `prepareViewDataError` which does the redirecting
          throw e;
        }
        return {
          redirect: { asPath: `${config.BASE_URL}/error` },
          success: false,
        };
      }
    }

    // TODO: extract as separate function
    let host = '';
    if (typeof ctx !== 'undefined') {
      const { req, res } = ctx;
      // don't cache client-side nav to viewer or /preview (serverSideProps response)
      if (res && typeof res.setHeader === 'function') {
        if (itemDetails.access === 'public') {
          res.setHeader(
            'Cache-Control',
            `public, max-age=${params.skipCache ? 0 : config.CACHE_MAX_AGE}`
          );
        } else {
          res.setHeader(
            'Cache-Control',
            `private, max-age=${params.skipCache ? 0 : config.NON_PUBLIC_CACHE_MAX_AGE}`
          );
        }
      }
      host = req?.headers.host || '';
    }

    return {
      id,
      itemDetails: obfuscateItemDetails(itemDetails),
      publishedData,
      host,
      initialThemeItemInfo,
      ...(pageLocale ? { pageLocale } : {}), // so it can be correctly serialized
      success: true,
    };
  } catch (error) {
    return prepareViewDataError(error, { ...params, isTemplate });
  }
};

const prepareViewDataError = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any,
  params: WithTemplateMode<PrepareViewDataParams>
): PrepareDataError => {
  const { id, authManager, config, ctx, signInUrl, itemType, isTemplate, shouldRedirect } = params;

  if (error && error.code) {
    // no specific redirect-data can be constructed... simply redirect for now, regardless of `shouldRedirect`
    // TODO: consider constructing specific redirect-data shapes to return
    try {
      redirectOnLoadError({ ctx, authManager, signInUrl, error, config });
      return {
        redirect: { asPath: '' /** ? */ },
        error,
        success: false,
      }; // return dummy value to fulfill the return type.
    } catch (err) {
      throw new StoryBuilderError(err);
    }
  }
  // Story has not been published
  else if (
    typeof error.message === 'string' &&
    error.message.search(`items/${id}/data`) >= 0 &&
    error.type === 'invalid-json'
  ) {
    const redirectPage = itemType === StoryItemType.Collection ? 'edit' : 'preview';
    const routePrefix = getStoryTypeRouteModifier(itemType, isTemplate);
    if (shouldRedirect) {
      // FIXME: use storyRouting
      // redirect to the edit page
      redirectApp({
        ctx,
        href: `/${routePrefix}/${redirectPage}?id=${id}`,
        asPath: `${config.BASE_URL}/${routePrefix}/${id}/${redirectPage}`,
      });
    }
    // redirect to the preview page
    return {
      redirect: {
        // href: `/stories/preview?id=${id}`,
        // TODO: use convertRoute
        asPath: `${config.BASE_URL}/${routePrefix}/${id}/${redirectPage}`,
      },
      error,
      success: false,
    };
  } else if (typeof error.message === 'string' && error.message === 'user-unauthorized') {
    // FIXME: use storyRouting
    if (shouldRedirect) {
      redirectApp({
        ctx,
        href: `/error?errType=unsupported-account&itemType=${itemType}`,
        asPath: `${config.BASE_URL}/error?errType=unsupported-account&itemType=${itemType}`,
      });
    }
    return {
      redirect: {
        asPath: `${config.BASE_URL}/error?errType=unsupported-account&itemType=${itemType}`,
      },
      error,
      success: false,
    };
  } else if (
    typeof error.message === 'string' &&
    error.message === 'item-not-supported-on-route' &&
    id
  ) {
    // FIXME: use storyRouting
    // if the item is being viewed in the wrong viewer lets redirect to the correct viewer
    const route = params.convertRoute({
      routeDef: makeItemRouteDef({
        route: 'viewer',
        itemType: error.itemType as GeminiItemType,
        isTemplate,
        itemId: id,
      }),
      // based on the viewer route I don't think featureDecisions matter in this case
      featureDecisions: { canAccessExternalUrls: false } as FeatureDecisions,
      config,
      authManager,
    });

    const errorPath = 'error?errType=item-not-supported-on-route`';
    const fullErrorPath = `${config.BASE_URL}/${errorPath}`;

    // redirect to the correct viewer
    if (shouldRedirect) {
      redirectApp({
        ctx,
        href: getRedirectHref(route.href, errorPath),
        asPath: route.as || fullErrorPath,
      });
    }

    return {
      redirect: {
        asPath: route.as || fullErrorPath,
      },
      success: false,
    };
  } else {
    // FIXME: use storyRouting
    // not sure why it didn't work, give generic error
    if (shouldRedirect) {
      redirectApp({
        ctx,
        href: `/error?itemType=${itemType}`,
        asPath: `${config.BASE_URL}/error?itemType=${itemType}`,
      });
    }
    return {
      redirect: { asPath: `${config.BASE_URL}/error?itemType=${itemType}` },
      error,
      success: false,
    };
  }
};

interface PreparePreviewDataParams extends PrepareViewDataParams {
  /** Needed for translate the preview sample item */
  formatMessage?: (param: { id: string }) => string;
}

export interface PreparedPreviewData {
  success: true;
  id: string;
  itemDetails: IItem;
  draftData: StoryItemData;
  initialThemeItemInfo: ThemeItemInfo;
  pageLocale?: string;
}

export type PreparePreviewDataResponse = PreparedPreviewData | PrepareDataError;

export const preparePreviewData = async (
  params: PreparePreviewDataParams & { convertRoute: RouteConverter }
): Promise<PreparePreviewDataResponse> => {
  const { id, authManager, config, ctx, signInUrl, itemType, shouldRedirect } = params;

  if (!id) {
    throw new Error(`no ${itemType} id`);
  }

  // NOTE: sample story for theme preview
  if (id === THEME_PREVIEW_STORY_ID) {
    return prepareSamplePreviewData(params);
  }

  const detailOptions = {
    itemId: id,
    authManager: authManager!,
    portalHost: config.PORTAL_HOST,
  };

  let isTemplate = false; // we will read this off of itemDetails below after fetching it
  try {
    const itemDetails = await StoryItemBuilder.fetchItemDetails(detailOptions);
    isTemplate = isTemplateItem(itemDetails);
    const routeModifier = getStoryTypeRouteModifier(itemType, isTemplate);

    // IMPORTANT: validate the route to ensure the user is accessing this item correctly (e.g., route mismatch)
    validateItemRoute({
      itemDetails,
      expectedItemType: itemType,
      // If ctx is undefined, we need to use window.location.pathname for enterprise
      url: getContextUrl(ctx) || window?.location.pathname,
    });

    // NOTE: `origin` will be a collaboration participant ID if the item was received from a distributed collaboration (enterprise capability)
    if (itemDetails.origin) {
      // FIXME: use storyRouting
      if (shouldRedirect) {
        redirectApp({
          ctx,
          href: `/${routeModifier}/${id}`,
          asPath: `${config.BASE_URL}/${routeModifier}/${id}`,
        });
      }
      return {
        success: false,
        redirect: {
          asPath: `${config.BASE_URL}/${routeModifier}/${id}`,
        },
      };
    }
    // User must have update or admin permissions to access private resources
    if (itemDetails.itemControl === 'update' || itemDetails.itemControl === 'admin') {
      // If story created (Python API), or duplicated outside of our builder, redirect to builder to finish cleanup phase
      if (isCopiedItem(itemDetails) || isPublishedFromExternalApp(itemDetails)) {
        if (shouldRedirect) {
          redirectApp({
            ctx,
            href: `/${routeModifier}/edit?id=${id}`,
            asPath: `${config.BASE_URL}/${routeModifier}/${id}/edit`,
          });
        }
        return {
          success: false,
          redirect: {
            asPath: `${config.BASE_URL}/${routeModifier}/${id}/edit`,
          },
        };
      }
      if (typeof ctx !== 'undefined') {
        const { res } = ctx;
        if (res && typeof res.setHeader === 'function') {
          res.setHeader('Cache-Control', 'max-age=0, private, must-revalidate');
        }
      }
      const { itemData } = await StoryItemBuilder.fetchItemDraftData({
        itemDetails,
        type: itemType,
        authManager: authManager!,
        portalHost: config.PORTAL_HOST,
        config,
      });

      const draftData = itemData as StoryItemData;
      const initialThemeItemInfo = await fetchThemeItemInfo({
        storyItemData: draftData,
        authManager,
        portalHost: config.PORTAL_HOST,
      });

      // check to see if a locale has been set by author in the story item data
      const pageLocale = getLocaleFromStoryItemData(draftData);

      return { success: true, id, itemDetails, draftData, initialThemeItemInfo, pageLocale };
    }

    throw new StoryBuilderError({ type: 'story-privileges-preview', itemType });
  } catch (error) {
    if (
      typeof error.message === 'string' &&
      error.message === 'item-not-supported-on-route' &&
      id
    ) {
      // FIXME: use storyRouting
      // if the item is being viewed in the wrong viewer lets redirect to the correct viewer
      const route = params.convertRoute({
        routeDef: makeItemRouteDef({
          route: 'preview',
          itemType: error.itemType as GeminiItemType,
          itemId: id,
          isTemplate,
        }),
        // based on the viewer route I don't think featureDecisions matter in this case
        featureDecisions: { canAccessExternalUrls: false } as FeatureDecisions,
        config,
        authManager,
      });

      const errorPath = 'error?errType=item-not-supported-on-route`';
      const fullErrorPath = `${config.BASE_URL}/${errorPath}`;

      // redirect to the correct viewer
      if (shouldRedirect) {
        redirectApp({
          ctx,
          href: getRedirectHref(route.href, errorPath),
          asPath: route.as || fullErrorPath,
        });
      }

      return {
        redirect: {
          asPath: route.as || fullErrorPath,
        },
        success: false,
      };
    }
    if (error instanceof StoryBuilderError) {
      throw new StoryBuilderError(error);
    }
    // no specific redirect-data can be constructed... simply redirect for now, regardless of `shouldRedirect`
    redirectOnLoadError({
      ctx,
      authManager,
      signInUrl,
      error,
      config,
    });

    return { redirect: { asPath: '' /** ? */ }, error, success: false }; // return dummy value to fulfill the return type.
  }
};

const prepareSamplePreviewData = ({
  config,
  formatMessage,
}: Pick<PreparePreviewDataParams, 'config' | 'formatMessage'>): PreparedPreviewData => {
  return {
    success: true,
    ...getThemePreviewSampleStory({
      formatMessage,
      baseUrl: config.BASE_URL,
      siteUrl: getNormalizedSiteUrl({
        siteUrl: config.SITE_URL,
        isComponentMounted: true,
        isScriptEmbedded: config.IS_SCRIPT_EMBEDDED,
      }),
      productName: config.PRODUCT_NAME,
      baseThemeId: getDefaultStoryThemeId(config.INCLUDED_STORY_THEMES),
    }),
    initialThemeItemInfo: {},
  };
};

const getRedirectHref = (routeHref: string | UrlObject, errorPath: string) => {
  return typeof routeHref === 'object' && routeHref.pathname
    ? routeHref.pathname
    : typeof routeHref === 'string'
      ? routeHref
      : errorPath;
};
