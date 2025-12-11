# PR Builds and Continuous Integration

<!-- omit in toc -->
## Table of Contents

- [Why did my build fail? How do I view build details?](#why-did-my-build-fail-how-do-i-view-build-details)
- [How do I stop a build?](#how-do-i-stop-a-build)
- [How do I rerun a build?](#how-do-i-rerun-a-build)
- [How do I view the deploy preview for a build?](#how-do-i-view-the-deploy-preview-for-a-build)

At the time of this writing, our team uses Jenkins for continuous integration (CI) to build changes from pull requests and deploy previews on certain reserved branches (see docs below on deploy previews). Note that your build must pass successfully before your pull request can be merged.

## Why did my build fail? How do I view build details?

On your pull request, look for an icon next to the latest commit hash. This icon will either be:

- An orange circle to indicate an in-progress build,
- A green checkmark to indicate a successful build, or
- A red `X` to indicate a failed build.

To view the details of your PR build on our CI platform, click this icon to open a popover. Then, click the nested `Details` link to open the PR build details on Jenkins:

<img width="820" alt="Inspecting a particular commit on a pull request. The commit hash has a green checkmark to the left, indicating a successful build. A popover is open next to the checkmark stating that all checks passed, with a Details link for more information." src="https://devtopia.esri.com/storage/user/4196/files/657156b6-6887-42ad-9763-436e016f84d8">

You can view the console output for any build by navigating to the `Console Output` pane in the left-hand navigation:

<img width="1536" alt="Viewing the Jenkins console output page for a particular PR that failed to build." src="https://devtopia.esri.com/storage/user/4196/files/19378336-8ede-4146-964b-21a5727b9f31">

On this page, you can usually search for `error` to narrow down the source of your build failure.

**NOTE:** You can run tests locally before pushing your changes to avoid failing checks in your PR.

To run tests for all packages run the command `yarn test` from the root. Expect this to take 10 to 20 minutes. Alternatively you can change your directory to the root of whichever package your PR changes are focused in and run yarn test for that specific package.

## How do I stop a build?

Using the same steps as above, navigate to the Jenkins build for your pull request. Then, if you need to cancel this build for whatever reason, you can click the red `X` icon next to the progress meter:

<img width="1142" alt="Build details show the title and a progress meter with a red X button to the right." src="https://devtopia.esri.com/storage/user/4196/files/2e972db9-e986-49ba-9e97-352122170a25">

Because our CI environment does not support concurrent builds at the time of this writing, builds are queued up in the pipeline in the order in which they arrive. Sometimes, pushing frequently can slow down the CI pipeline by queueing up several intermediate builds. In those situations, if there are higher priority builds in the queue, either you or a product engineer can terminate certain builds to allow others to run.

## How do I rerun a build?

Sometimes, builds will fail for cryptic reasons, so it's not always the case that the build failed because of changes you made in your PR. For example, resource limits and environment variable changes could potentially cause a build to fail. To manually rerun a build, you can leave a comment on the PR itself with a message of `rerun tests`. PEs will usually do this for you, but you and other devs can leave these comments, too:

<img width="921" alt="User sara9925 submitted a comment 23 days ago saying 'rerun tests' to trigger a build." src="https://devtopia.esri.com/storage/user/4196/files/09caf37c-2f73-49e6-b946-0894b37cbaed">

## How do I view the deploy preview for a build?

Some CI environments (e.g., on Netlify or Vercel) give you deploy previews for builds, allowing you to view the live changes from a build rather than having to pull the PR down locally and build it on your machine.

Our CI environment does not yet support global deploy previews for all pull requests. Instead, product engineers (PE) on the team can use Jenkins to create special deploy preview branches via a feature known as [Build-a-branch (BaB)](https://mercator1.atlassian.net/wiki/spaces/PE/pages/854229331/Branches). These branches point to subdomains (e.g., `branch1.storymaps.com`, `branch2.storymaps.com`) and host the code changes from a specific build.

---

[StoryMaps Documentation (Home)](../../../README.md) | [Git Flow (Home)](./README.md)
