# Adding a property to the Config

> [!TIP]
> To understand how configs work in the apps, see [Overview | Site Config](/overview/site-config.md).

## Add property to the config interface

Start by adding the property to the correct [config interface](/packages/storymaps-utils/src/config/types/site-public.ts).

- Is the value needed in both products?
  - Yes ➡️ properties used in common packages (`storymaps-builder`, `storymaps-utils`, etc.) need to be included in the `CommonSitePublicConfig` interface.
  - No ➡️ add the property to the appropriate site config: `SMXSitePublicConfig` or `AGSMSitePublicConfig`.

## Add ConfigProp for the property

You need to add a `ConfigPropertyInfo` definition for the new property.

- Do apps have the same default values for the new config property?
  - Yes ➡️ specify the default value in the [`commonSitePublicConfigProps`](/packages/storymaps-utils/src/config/propInfo/index.ts) object.
  - No ➡️ If the apps need different default values:
    1. Add the key to the `Omit` statement in the [`CommonPublicConfig`](/packages/storymaps-utils/src/config/propInfo/index.ts) definition.
    2. Add an entry (value type: `ConfigPropertyInfo`) to
       - [`agsmSitePublicConfigProps`](/packages/storymaps-app/server/src/config-props.ts)
       - [`smxSitePublicConfigProps`](/packages/storymaps-express/server/src/config-props.ts)

### Private Properties

If your key is sensitive and should not be sent to the client, use the private versions of the object/interfaces listed above instead.

### Static build config

Remember to add an entry for your config in [`getStaticBuildConfigProperties`](/packages/storymaps-app/utils/config/index.ts)

## Add new feature flag for the config property (optional)

In the [feature decision file](/packages/storymaps-utils/src/featureDecisions/index.tsx),

1. Add new feature flag type definition entry in `FeatureDecisions` interface
2. Add default value for the new feature flag in `FeatureDecisionsContext` definition
3. Map from the newly added config property to the new feature flag `getFeatureDecisions` function

Now your new feature flag is available, e.g. as

```ts
const { canUse* } = useFeatureDecisions();
```

## Update `.env.*` files

You don't have to update any other `.env.*` files, unless

- to add examples: `.env.example` files
- to override the default values set in the `ConfigPropInfo` definition: `.env.local` files

> [!TIP]
>
> **When to override the defaults?**
>
> We override the defaults whenever the value of a property should change based on the environment or tier the app is deployed too. Devs may want to similar the production environment, and would need to override `PORTAL_HOST`, `SUBSCRIPTION_API_BASE_URL`, and `BACKEND_API_SERVER_URL` in SMX. (We plan to figure out a way to simulate the tiers easily).
>
> We also override the defaults whenever the values are sensitive and should not be committed to the codebase e.g. ReCaptcha keys, Payment API keys etc.

### Environment Files

#### `.env.build`

Used in the `next.config.js` files to setup

- `GEMINI_ITEM_TYPE`
- `THEME_ITEM_TYPE`
- `GEMINI_2_THEME_RELATIONSHIP`

`process.env` calls for these properties are replaced with the static string value in the env. These values are also used when exporting to a static site.

#### `.env.development`

Local development config values that are shared between developers.

#### `.env.enterprise`

Used only in AGSM static build process. Sets 80 config options to enable the site to be used statically in the Enterprise environment

#### `.env.example`

Example env file that showcases the usage of the env variables.

#### `.env.local`

Git-ignored. Used to override values for local development and to store sensitive values

### Precedence

The first value written to the environment wins, subsequent calls to update the env will not override an existing value.

1. Container environment set up by DevOps
2. `.env.${nodeEnv}.local` (optional pattern that's not really used)
3. `.env.enterprise`
4. `.env.local`
5. `.env.${nodeEnv}` e.g. `.env.development`
6. `.env`

---

[StoryMaps Documentation (Home)](../../README.md)
