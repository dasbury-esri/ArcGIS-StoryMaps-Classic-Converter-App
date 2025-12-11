# Github and Branches

<!-- omit in toc -->
## Table of Contents

- [What is Devtopia?](#what-is-devtopia)
- [What main branches do we use?](#what-main-branches-do-we-use)
- [What is code freeze?](#what-is-code-freeze)
- [How does code freeze affect PRs for ongoing work?](#how-does-code-freeze-affect-prs-for-ongoing-work)
- [When should a PR point to `develop` vs. `QA`?](#when-should-a-pr-point-to-develop-vs-qa)
- [When does `QA` get merged back into `develop`?](#when-does-qa-get-merged-back-into-develop)
- [Who should I tag for PR review?](#who-should-i-tag-for-pr-review)
- [I opened a PR but realized it's not needed. What should I do?](#i-opened-a-pr-but-realized-its-not-needed-what-should-i-do)

## What is Devtopia?

https://devtopia.esri.com/devtopia

Devtopia is Esri's [GitHub Enterprise](https://github.com/enterprise) server.

## What main branches do we use?

See this Confluence doc for the most up-to-date information: [Deploy environments](https://mercator1.atlassian.net/wiki/spaces/CED/pages/427360303/Deployment+environments).

|Branch|Description|Links|
|--------------------------------------------------|---|---|
| Release tags | All final release code is tagged from the `QA` branch immediately before release. | https://devtopia.esri.com/WebGIS/arcgis-storymaps/releases
|`develop`|Hosts all current work on the dev tier for both products. You'll branch off of this most of the time.|https://storymapsdev.arcgis.com, https://dev.storymaps.com|
|`QA`|Has our release candidate code for the upcoming release.  A PE will usually let you know if you need to branch off of `QA` (rather than working off `develop` or a feature branch as is our standard practice).|https://storymapsqa.arcgis.com, https://qa.storymaps.com|
|`feature/[feature-name]` | Used for development of a feature that will require multiple PRs.| Can be built on BaBs |

## What is code freeze?

Code freeze is the period where we are getting our `develop` branch ready for an upcoming release. During this time, we only want to merge PRs to `develop` for features, enhancements, and fixes that are planned for that release.

Generally, our two-week release cycle alternates between a week where we are in code freeze and a week where we are stabilizing the upcoming release. Active development for future releases occurs at any time (usually on feature branches).

## How does code freeze affect PRs for ongoing work?

If you are working on a feature that has a feature branch, code freeze doesn't have any effect on which branch your PR should point to—they should continue to point to and be merged to the feature branch. If the feature you are working on is wrapping up, the team may be looking to get all PRs merged to the feature branch and the feature branch tested and merged to `develop` before code freeze ends so the feature can be included in the targeted release.

## When should a PR point to `develop` vs. `QA`?

The vast majority of PRs get merged to `develop` or a feature branch.

If you are working on a fix for a bug (or other change) that needs to be addressed _after our release candidate code was pushed from `develop` to `QA`_, then the PR should point to `QA`. 

In most cases, you can tell what the base branch should be by looking at which release the bug issue is tagged with, but it's always a good idea to check with a PE before creating a branch to start work on a fix if you're not sure.

## When does `QA` get merged back into `develop`?

During stabilization of the upcoming release, `QA` typically gets merged back to `develop` at the end of any day during which a PR was merged directly to `QA`. This is done so that the fixes/changes being made to stabilize our upcoming release are also available in our main code branch.

## Who should I tag for PR review?

Most PRs will have two types of reviewers: one or more co-owners and a senior dev. After the co-owners have reviewed and approved your PR, you should request review from one of the more experienced developers on the team. At the time of this writing, the developers you should tag for the final review are:

- Stephen Sylvia 
- Yankuan Zhang
- Jonathan Paez

If you don't already have developers in mind for reviewing your PR, GitHub will usually suggest developers who recently viewed or edited the files that you changed.

<img width="626" alt="A list of suggested reviewers in the GitHub pull request UI" src="https://devtopia.esri.com/storage/user/5833/files/55375e3e-0b4f-4ebb-991c-b723c3a3e246">

If you still are not sure who to tag on a PR, reach out to a PE.

## I opened a PR but realized it's not needed. What should I do?

If your PR and new branch are no longer needed, you can close the PR and delete the branch from Devtopia. 

---

[StoryMaps Documentation (Home)](../../../README.md) | [Git Flow (Home)](./README.md)
