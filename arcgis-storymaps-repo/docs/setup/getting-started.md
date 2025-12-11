# Getting Started

> Abbr.:
>
> - AGSM: ArcGIS StoryMaps
> - SMX: StoryMaps Express

<!-- omit in toc -->

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Developer Environment](#developer-environment)
- [Project Setup](#project-setup)
  - [Sign in with local machine](#sign-in-with-local-machine)
  - [Local Dev SSL Instructions](#local-dev-ssl-instructions)
- [Development](#development)
  - [Run the App in Development Mode](#run-the-app-in-development-mode)
  - [Run the App in Production Mode](#run-the-app-in-production-mode)
  - [Develop UI Components](#develop-ui-components)
- [Running Tests](#running-tests)
- [Git hooks: husky](#git-hooks-husky)
  - [Creating new git hooks](#creating-new-git-hooks)
- [Monorepo tools: yarn and Turborepo](#monorepo-tools-yarn-and-turborepo)
  - [Installing dependencies with yarn](#installing-dependencies-with-yarn)
  - [Start app in dev mode, or running scripts from any folder within project](#start-app-in-dev-mode-or-running-scripts-from-any-folder-within-project)
- [Turborepo: Task runner with caching](#turborepo-task-runner-with-caching)
  - [Turborepo `run` for executing yarn scripts](#turborepo-run-for-executing-yarn-scripts)
  - [Turborepo and git hooks](#turborepo-and-git-hooks)
  - [Adding new tasks/scripts in `package.json`](#adding-new-tasksscripts-in-packagejson)
  - [Running scripts in the (topologically) correct order](#running-scripts-in-the-topologically-correct-order)
- [Use `topo` key for parallel tasks](#use-topo-key-for-parallel-tasks)
  - [Commands for running yarn scripts](#commands-for-running-yarn-scripts)
- [Task Graph](#task-graph)
- [Packaging/Dependency Management: Yarn, `package.json` info](#packagingdependency-management-yarn-packagejson-info)
  - [Use `yarn exec <script>` to call shell scripts/binaries in `package.json`](#use-yarn-exec-script-to-call-shell-scriptsbinaries-in-packagejson)
  - [Include binaries/executables used in scripts as a dependency](#include-binariesexecutables-used-in-scripts-as-a-dependency)
- [Managing Node runtime versions with `nvm`](#managing-node-runtime-versions-with-nvm)
  - [Maintaining the project's Node version in `.nvmrc`](#maintaining-the-projects-node-version-in-nvmrc)
  - [Installing and activating the Node version specified in `.nvmrc`](#installing-and-activating-the-node-version-specified-in-nvmrc)
  - [Install yarn with `bash ./scripts/setup-node.bash`](#install-yarn-with-bash-scriptssetup-nodebash)
  - [Use Corepack to install yarn](#use-corepack-to-install-yarn)
- [Troubleshooting: `reset-repo`](#troubleshooting-reset-repo)
  - [`_temp` folders are ignored by git and by `reset-repo`](#_temp-folders-are-ignored-by-git-and-by-reset-repo)

## Developer Environment

Before you begin, make sure you have set up your computer and developer environment to be compatible with this repository:

**See: [Developer Setup](developer-setup.md)**

## Project Setup

1. Clone the repository to your local machine.
2. Run `yarn` in the root directory to install dependencies from all packages.
3. Run `yarn prepare` in the root directory to setup `husky` git hooks.
4. Run all tasks behind Turborepo via `yarn turbo`. This ensures that prereq tasks will be run in the correct order. **`yarn dependencies:build` is no longer needed for local development.**

Steps `2` and `3` should be run automatically anytime you have a merge case (that is, if you are on a branch and pull changes to `develop` and merge to your branch). Otherwise, you should run them anytime you pull changes from `develop`. Merge conflicts will prevent these scripts from running automatically. See info on `husky` to debug these automatic scripts.

At this point, if you want to verify if it is setup correctly so far, you can [Run the App in Development Mode](#run-the-app-in-development-mode). However, you won't be able to sign in. To support signing in from your local machine, please keep on reading: [Sign in with local machine](#sign-in-with-local-machine).

### Sign in with local machine

Signing in with the app requires that the domain be `*.arcgis.com` for AGSM and `*.storymaps.com` for SMX. When developing locally, you won't have this domain by default.

<!-- TODO: Move the following note to a Q&A doc/section, b/c this doesn't have to be called out so early and prominently in the main flow of project setup. -->

> [!NOTE]
>
> **To what extent I can customize my local dev host?**
>
> Short answer: Don't.
>
> Certain features are powered by our own backend APIs[^1]. For each product, there's only one local dev host (including port number) on the allowed list for CORS, namely:
>
> - AGSM: `https://local.storymapsdev.arcgis.com:3443`
> - SMX: `https://local.dev.storymaps.com:4443`
>
> This means, to access these features, the exact hostname and port number must be used (both already set by the repo's `.env.*` files):
>
> - AGSM:
>   - `LOCAL_DEV_HOSTNAME = "local.storymapsdev.arcgis.com"`
>   - `HTTPS_PORT = 3443`
> - SMX:
>   - `LOCAL_DEV_HOSTNAME = "local.dev.storymaps.com"`
>   - `HTTPS_PORT = 4443`
>
> Customizing your own `LOCAL_DEV_HOSTNAME` (e.g. `my-app.arcgis.com`) or `HTTPS_PORT` is NOT recommended, but it won't prevent you from running the app (as long as you use accepted domains for signin). In some cases you would have to customize one or both of them, e.g.
>
> - to run enterprise
> - to run two instances of the same app on your machine

[^1]: As of Jan 13, 2025, in AGSM, **media conversion** (`*.mov` -> `*.mp4`) is the only feature in use powered by our backend API `BACKEND_API_SERVER_URL`. More API-powered features are expected to be added in the future.

#### Desktop

By modifying the `hosts.txt` file on your machine, you can map your IP address to an `.arcgis.com` or `.storymaps.com` domain to allow sign-in to work locally.

##### macOS

1. Open `/etc/hosts` with your text editor with admin permissions, e.g. `sudo nano /etc/hosts`
2. Add a new line at the bottom of the file with `127.0.0.1   local.storymapsdev.arcgis.com`
3. Add another line for SMX `127.0.0.1    local.dev.storymaps.com`
4. Save with admin permissions

Or,

1. Copy the `hosts` file to your desktop (or anywhere else as long as it is outside of `/etc` folder)
1. Edit (same as step 2 above)
1. Save and copy the edited `hosts` file back to `/etc` folder with admin permissions to replace the previous one

##### Windows

1. Open `C:\Windows\System32\drivers\etc\hosts` with your text editor
2. Add a new line at the bottom of the file with `127.0.0.1    local.storymapsdev.arcgis.com`
3. Add another line for SMX `127.0.0.1    local.dev.storymaps.com`
4. Save

### Local Dev SSL Instructions

1. Add a `.env.local` file to your `storymaps-app` and `storymaps-express` package. No need to change/override the `LOCAL_DEV_HOSTNAME` or `HTTPS_PORT`, as they are already set to the correct values.
2. `cd packages/storymaps-app`, then `yarn dev`. The server will prompt for permissions... repeat for packages/storymaps-express
3. If you are unable to get a trusted SSL cert to work (some windows users), you can fallback to use a shared SSL cert until a fix is available. Add the following line to your `.env.local` file:
   - `USE_SHARED_SSL_CERT = true`
4. If you are still unable to get a trusted SSL cert to work, check to be sure your OS Keychain contains a trusted certificate with the `local.storymapsdev.arcgis.com`/`local.dev.storymaps.com` listed in your host file. If not, follow these steps to add it:

- Follow instructions in [Run the App in Development Mode](#run-the-app-in-development-mode) to run your local server in Chrome
- Click to the left of the URL in Chrome where the certificate box is (it may say "Not Secure") and click on the certificate itself
- Drag the certificate image onto your desktop and open your OS Keychain
- Drag the certificate image into your OS Keychain and double click on it
- Go to the "Trust" section under "When using this certificate" and select "Always Trust" and fill in your credentials

## Development

Before beginning development, make sure you understand how the [monorepo is structured](./monorepo-structure.md). After running the server successfully, see [Debugging](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/200add3bc71f391ee897d105f7de173d88303c2d/docs/setup/debugging.md) for info on debugging scenarios and tools, which may require extra config.

### Run the App in Development Mode

Running the app in development mode will watch enable HMR (hot module reload) in all packages consumed by the client except for `storymaps-xgraphics`.

To run the app in development mode, open a terminal from **the root of the monorepo**, and run one of the following commands

- AGSM: `yarn dev:agsm` then open a browser at `https://local.storymapsdev.arcgis.com:3443`
- SMX: `yarn dev:smx` then open a browser at `https://local.dev.storymaps.com:4443`

Alternatively, you may run the app from **their own packages**:

1. change directories into either the `storymaps-app` (for AGSM) or `storymaps-express` (for SMX) package
2. and then run `yarn turbo dev`

** Run tasks with Turborepo via `yarn turbo` **-

Note:

- If you run into "This site can't be reached" (`ERR_TIMED_OUT`) error page, check the terminal—if it says (e.g. for SMX)
  ```
  wait  - compiling / (client and server)...
  ```
  it means the code is still being compiled; Once it's done, you should be able to see the app pages.

### Run the App in Production Mode

To run the app in production mode:

1. change directories into either the `storymaps-app` (for AGSM) or `storymaps-express` (for SMX) package
2. and then run `yarn turbo dev:production`

In order to run the application in production mode, you must pass a valid hostname to the node server using the `LOCAL_DEV_HOSTNAME` environmental variable. This is handled automatically in development mode by reading the `.env.development` file (see [.env file loading](../config/packages/shared-config/env/README.md)).

To avoid conflicts with our CI/CD production releases, no hostname is committed for production builds as part of our git repository. Follow the steps below to set a hostname that will be used for every production build on your local machine:

1. Create a file `.env.local` in your `storymaps-app` and/or `storymaps-express` package (based on which app you wish to run in production mode).
2. Copy and paste the contents of `.env.development` file from the corresponding directory.
3. Update any variable value if you wish to (mostly you will not need to do this step).
4. Run `yarn dev:production` and the app should successfully start in production mode

#### Mac Bug

If you run `yarn dev:production` and the app successfully compiles but does not start, try opening Activity Monitor and search for all node processes. Double click each one and force quit.

Then re-run `yarn dev:production`

### Develop UI Components

StoryMap components are developed in isolation using [Storybook](https://storybook.js.org/). To run Storybook, open a terminal in one of the client packages (storymaps-app, storymaps-builder, or storymaps-components) and run `yarn storybook`.

## Running Tests

The root `package.json` file includes a `test` script to run the `test` scripts in all packages contained in this monorepo with a single command.

This is primarily intended to be used in our CI/CD pipeline. Because some packages run their `script` in a different mode locally, not all scripts will exit correctly. You can force all tests to run correctly by setting an environmental variable called `CI` to true before running `yarn test`.

You can run each package test file independently by running `yarn test` from that package's directory. You can also watch tests as you develop using `yarn test:watch` from that package's directory.

## Git hooks: [husky](https://typicode.github.io/husky/#/?id=features)

Git hooks run routine tasks defined in `.husky/` to assist with code quality. These will trigger on various git actions that occur in the repo.

When a git command like `git push` fails, an error message will print. These are usually lint or type-checking errors that need to be fixed. If using VS Code git integration, use ["View Git output"](https://code.visualstudio.com/docs/sourcecontrol/overview#_git-output-window) to read the error log.

### Creating new git hooks

Since `husky@>=9`, hooks can be created by adding a file in `.husky/*` with a name corresponding to an available git hook ([git hooks documentation page](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)). Copy the shebang used in the other husky files.

## Monorepo tools: yarn and Turborepo

yarn provides all functionality related to dependency management, including packaging for distribution, workspace management, and package hoisting.

### Installing dependencies with yarn

yarn can be used to install dependencies and hoist dependencies to the root workspace. This was previously done with `lerna bootstrap`, but modern `yarn install` installs dependencies for all packages in the monorepo and hoists them to the same `node_modules` folder at the root workspace.

### Start app in dev mode, or running scripts from any folder within project

- Single app:
  `yarn turbo run dev --filter=storymaps-express`
- Multiple apps concurrently— include package name separated by `,`
  `turbo run dev --filter={storymaps-express,storymaps-xgraphics}`
- Run tests in multiple repos:
  `turbo run test --filter={storymaps-express,storymaps-builder}`

## Turborepo: Task runner with caching

Turborepo is the task runner for the monorepo. It runs tasks with concurrency, caching, and in dependency order (topologically, via a task graph). Turborepo will be installed on `yarn install` at the root level; avoid [global installation](https://turbo.build/repo/docs/installing#install-globally) as this prevents team members from synchronizing versions.

- 🔗 [Turborepo Quickstart – Turborepo](https://turbo.build/repo/docs)
- 🔗 [Caching – Turborepo](https://turbo.build/repo/docs/core-concepts/caching)
- 🔗 [Monorepo Explained](https://monorepo.tools/)

### Turborepo `run` for executing yarn scripts

Run Turborepo from the repo root with `yarn turbo`. Run yarn scripts with `yarn turbo run ...` for maximum speed

- 🔗 [`turbo run` – Turborepo](https://turbo.build/repo/docs/reference/command-line-reference/run)

### Turborepo and git hooks

Husky hooks are run via Turborepo to reduce runtime for these routine tasks and checks. Turborepo will auto-configure concurrency/parallelism and scheduling via the `turbo.json` pipeline configuration.

### Adding new tasks/scripts in `package.json`

If you add a new script to the`package.json`, you need to create a corresponding Turborepo pipeline that matches the name of the script.
**Create a corresponding entry in `turbo.json` when creating new tasks (analogous to `scripts` in `package.json`).** See existing `turbo.json` and refer to the [Pipeline configuration Turbo docs](https://turbo.build/repo/docs/core-concepts/caching/what-to-cache) for setting up available caching options.

Use the [`--summarize`](https://turbo.build/repo/docs/reference/command-line-reference/run#--summarize) CLI arg to debug task inputs, packages, glob patterns, etc.

- 🔗 [Configuration – Turborepo](https://turbo.build/repo/docs/reference/configuration#pipeline)
- 🔗 [Running Tasks – Turborepo](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks)

### Running scripts in the (topologically) correct order

Tasks like `compile-strings` and `optimize-images` need to run before `dev`. Turborepo builds a dependency graph and runs tasks topologically according to this graph based on the `dependsOn` setting.

Call scripts sequentially/serially (ex: `yarn run lint && yarn run test && yarn run build`) using Turborepo (`yarn exec turbo lint test build`). This will enable topological execution and schedules tasks concurrently when appropriate, using their pipeline configuration ([`dependsOn`](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks#defining-a-pipeline)).

## Use `topo` key for parallel tasks

There is a special pipeline `topo` with a recursive definition. Add this to a task's `dependsOn` to enable them to

1. Run in parallel across multiple workspaces
2. Miss the cache/re-run when its dependencies change

Useful for type checking and linting.

🔗 [Task Dependencies – Turborepo](https://turbo.build/repo/docs/core-concepts/monorepos/task-dependencies#dependencies-outside-of-a-task)

### Commands for running yarn scripts

| Type                                                       | Command                                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Yarn script/binary (eslint, webpack, turbo, prettier, tsc) | [`yarn run`](https://yarnpkg.com/cli/run)-This can substitute `yarn exec`, but not the other way around. |
| Node.js binary/executable or shell script                  | [`yarn exec`](https://yarnpkg.com/cli/exec)                                                              |

## [Task Graph](https://turbo.build/repo/docs/core-concepts/monorepos/task-graph)

See 🔗 [The Task Graph – Turborepo](https://turbo.build/repo/docs/core-concepts/monorepos/task-graph) for guide on creating a graphic representation of the tasks executed in a run.

## Packaging/Dependency Management: [Yarn](https://yarnpkg.com/), `package.json` info

Yarn Modern (>2) is supported. Refer to the [yarn berry repo on GitHub](https://github.com/yarnpkg/berry) for docs on yarn. Avoid usage of `npm` commands as they will not update `yarn.lock` properly. See [yarn cli docs](https://yarnpkg.com/cli) for a full list of commands.

The following subheadings provide emphasized guidance for yarn `>2` usage. See 🔗 [Migration | Yarn - Package Manager](https://yarnpkg.com/getting-started/migration#use-yarn-dlx-instead-of-yarn-global) for a full list of migration details and changes.

### Use [`yarn exec <script>`](https://yarnpkg.com/cli/exec) to call shell scripts/binaries in `package.json`

This ensures that contributors share the same versions of common CLI utilities. ex: `yarn exec prettier` will use the version installed by `package.json`. Use [`yarn dlx`](https://yarnpkg.com/cli/dlx) for one-off scripts akin to `npx`.

### Include binaries/executables used in scripts as a dependency

For example, if the `eslint` command is called within a `package.json`'s `scripts` field, be sure to include it as a dependency via `yarn add -D eslint`. `yarn global` is deprecated and should be avoided to ensure consistency with all contributors' executable dependencies.

## Managing Node runtime versions with `nvm`

Use a tool like [`nvm`](https://github.com/nvm-sh/nvm) or [`fnm`](https://github.com/Schniz/fnm) to install and manage your Node versions.
The app runs on latest Node LTS; see [Node release schedule](https://github.com/nodejs/release#release-schedule) for active LTS version. [`fnm` is a faster, equally compatible, and more ergonomic alternative](https://github.com/Schniz/fnm) that automatically switches Node versions when an `.nvmrc` is present and automatically installs on `fnm use`.

### Maintaining the project's Node version in [`.nvmrc`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/.nvmrc)

Keep `.nvmrc` in sync with the Node versions specified in the containers [`/dockerfiles`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/dockerfiles). Use the full version number (ex: `18.16.1`) instead of an alias.

### Installing and activating the Node version specified in [`.nvmrc`](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/.nvmrc)

1. Run `nvm use .` to select the appropriate version in the `.nvmrc` file.
2. (If first time) Run `nvm install` in the repo root to install the correct node version. Only needed if your `nvm` does not have the correct version on your system.

### Install yarn with `bash ./scripts/setup-node.bash`

### Use [Corepack](https://nodejs.org/api/corepack.html) to install yarn

Run `corepack enable` to setup yarn. Corepack is the preferred way to install yarn.

Migrate from `yarnPath` to Corepack:

- `fnm use .` or `nvm install && nvm use`
- `corepack enable` to set up corepack on your system
- `yarn install`, expect yarn to use corepack binary (`which yarn` should not point to `.yarn/releases`)

Refer to Yarn + Corepack documentation for troubleshooting.

- 🔗 [Installation | Yarn](https://yarnpkg.com/getting-started/install)
- 🔗 [Settings (`.yarnrc.yml`) | Yarn](https://yarnpkg.com/configuration/yarnrc)
- 🔗 [Corepack | Node.js v18.18.2 Documentation](https://nodejs.org/docs/latest-v18.x/api/corepack.html)
- 🔗 [Release: Yarn 4.0 🪄⚗️ | Yarn](https://yarnpkg.com/blog/release/4.0#installing-yarn)

## Troubleshooting: `reset-repo`

`yarn reset-repo` script will delete all untracked git files, including the yarn cache. This may clear up any dependency/stale cache issues.

### `_temp` folders are ignored by git and by `reset-repo`

Move sample data or other temp files (to be loaded in via ESM `import` or CJS `require`) to a `_temp` folder to preserve them across `reset-repo`s and keep them untracked by git.

🔗 [Git - Recording Changes to the Repository](https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository)

---

[StoryMaps Documentation (Home)](../../README.md) | [Common Workflows](./common-workflows.md)
