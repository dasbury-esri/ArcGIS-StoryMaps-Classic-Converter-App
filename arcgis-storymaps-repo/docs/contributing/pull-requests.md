# Pull Request Guidelines and Best Practices

<!-- omit in toc -->
## Table of Contents

- [When to Create a Pull Request](#when-to-create-a-pull-request)
  - [Draft PRs](#draft-prs)
  - [Choosing a Base Branch for your PR](#choosing-a-base-branch-for-your-pr)
- [Creating a PR](#creating-a-pr)
  - [Requesting Reviews](#requesting-reviews)
  - [Making changes](#making-changes)
- [Reviewing PR's](#reviewing-prs)
  - [All Developers](#all-developers)
  - [Senior/Lead Developers](#seniorlead-developers)
  - [PEs](#pes)
- [How to Review](#how-to-review)
  - [PR Comments/Conversations](#pr-commentsconversations)
  - [Be Helpful and Assume the Best](#be-helpful-and-assume-the-best)
  - [Request Additional PRs and New Issues](#request-additional-prs-and-new-issues)
  - [Review Checklist](#review-checklist)

## When to Create a Pull Request

It is recommended to create more, smaller PRs rather than waiting for one large PR after your work is complete. This allows you to get early feedback while also speeding up the overall PR process. Many developers will take time to review a small PR between work. Large PR's will require the reviewer to set aside specific time to review it.

When creating PRs to the `develop` or `QA` branch, you should wait till your PR has no side effect that require additional PRs.

For features branches, please make small PRs, early and often. Note remaining work in the PR description so reviewers know what is intentionally missing. It is best to make PRs for each single logical change. If you are adding multiple items under the PR description, consider splitting it up into multiple PRs.

### Draft PRs

Draft PRs should generally be avoided except in the following conditions:

- Feature branches that are in progress (allow admins to easily update feature branch with the latest from `develop` branch).
- Longer PRs that are unavoidable due to side effects in changes but the developer needs early feedback.

### Choosing a Base Branch for your PR

_**Note about feature branches**: When starting a project that will use a feature branch, branch from `develop`. When the first PR is ready to submit, create the feature branch from the latest version of `develop` and point the PR to the feature branch. This prevents a feature branch from getting stale between the time you start work and when you are ready to submit your first PR. Once the first PR is merged to the feature branch, PEs will create a draft PR between the feature branch and `develop` and use it update the feature branch every few days with the latest from `develop`._

- `feature/*`
  - General development for new features
  - Large bug-fixes or enhancements
  - Larger code refactors that contain side effects (would cause a regression in main branch)

- `develop`
  - Small bug fixes and enhancements
  - Code refactors without side effects
    - If another developer may conflict with your code soon or benefit from the additions, consider making a PR to develop first with those changes and then pull those changes back into your feature branch.
- `QA`
  - Bug fixes to the release candidate after code-freeze
- `hotfix/x`
  - Bug fixes to the release *patch* candidate after production release
- `builds/windowslinux/{ENTERPRISE_VERSION}`
  - Bug fixes for Enterprise

## Creating a PR

- Add meaningful title and description
- Screenshot/GIFs of changes are helpful
- Make sure to use ZenHub's *Link to Issue* feature to link your PR to the issue you have been assigned.
  - If there are multiple issues related to a PR, connect to one and reference all connected issues in the PR description.
- [Make sure your base branch is correct](#choosing-a-base-branch-for-your-pr)
- Follow all other tasks specified on the PR template and mark each item after you have completed it.

### Requesting Reviews

When you are ready for another developer to review your code, use GitHub's `Reviewers` feature. Do not use the `Assignees` feature.

- Request 1 co-developer (any dev who has worked on the same code or similar feature). Please refer to your feature plan, [expertise list](https://esriis.sharepoint.com/sites/StoryMapsDev/Lists/StoryMaps%20Areas%20of%20Expertise/AllItems.aspx?env=WebViewList), or a PE if you need help identifying a co-developer.
  - NOTE: In most cases, you should only request a single co-developer to review your code (this helps keep the PR process moving forward). If you need to request multiple reviewers, please specify the areas each reviewer evaluate.
- Request senior/lead developers
  - *Alison Sizer*, *Steve Sylvia*, and *Yankuan Zhang* for frontend
  - *Jonathan Paez* for Backend

### Making changes

- If changes are requested, make all required changes and push code to the same branch.
  - **Note**: If you have to make several changes, it is recommended to push your commits in batches or wait till you are ready to request another review before pushing changes. Due to the nature of GitHub notifications, every individual assigned to a PR will receive a new notification and/or email each time changes are pushed to the PR. This is a curtesy to reduce the number of notifications team members receive and helps improve productivity.
- Do not manually close/resolve comments unless noted by original reviewer. Code changes will automatically resolve most comments.
- When changes have been pushed, please label PR as `Ready for Review` and Re-request review from the reviewer who left comments.

## Reviewing PR's

### All Developers

- Co-developers (dev whose worked on the same area or similar feature) should try to completes review within 24 hours (business days) of request
  - If you feel a second co-developer should also review (an area of the app you are unfamiliar with), please add that developer as a reviewer
- After changes have been made, please re-review PR within 24 hours.
- If you request any changes, please remove `Ready for Review` label.
- When changes have been approved, please label PR as `Ready for Review` and make sure senior/lead developer is requested to review the PR.

### Senior/Lead Developers

- Completes review within 24 hours (business days) **after** the co-developer has approved a PR (unless PR is labeled as `p-high`, `for hotfix` or `for code freeze`)
  - If PR is marked as `p-high` or `for hotfix`, please review in 2-4 hours when possible, work with co-developer or review before co-developer finishes.
  - If PR is marked as `for code freeze`, please review in 24 hours, work with co-developer or review before co-developer finishes. 
- If you request any changes, please remove `Ready for Review` label.
- After the code is approved, merge code to `develop` or `feature/*` branch.
  - PRs to `QA`, or any other PRs with a high chance of causing regressions, should not be merged until a PE finishes testing. In these cases, use the `Ready to Test` label instead of merging immediately.
  - `feature/*` branches should only be merged to `develop` after code has been tested by PE on BAB. This is indicated by `Ready for merge` label.

### PEs

- Use `p-high` label if a PR needs to be reviewed and merged the same day.
  - Also message any co-developer reviewers directly to make them aware of the situation. Message senior/lead developers if PR needs to be merged ASAP.
- Use `for code freeze` label leading up to and after code freeze for PRs that should be prioritized for the upcoming release.

> Note the labels above are not a substitute for direct communication between PEs and developers, but serve to help PR reviewers prioritize and keep track of tasks.

- Before merging a feature branch, do a full round of testing using the latest code from `develop`. This is mandatory if another feature branch or enhancement was recently merged to `develop`.

## How to Review

### PR Comments/Conversations

As a reminder, the `arcgis-storymaps` repo is a public repo within Devtopia. Therefore, treat all conversation on issues/PRs as if they are visible to anyone at Esri, not just the StoryMaps team.

As a general rule, please keep PR comments short and specific. Do not use comments for longer discussions. If a longer discussion is needed to resolve a PR comment, please resolve in-person or over Microsoft Teams.

If there is a disagreement between the reviewer and developer, use in-person communication or Teams to resolve the issue. If needed, ask a senior or lead developer to resolve the disagreement.

### Be Helpful and Assume the Best

- Instead of just requesting a change, always provide a brief comment for why you are requesting a change. This helps the other developer learn. It will also minimize back and forth conversation about the request.
- Always provide constructive feedback and assume the best of each other.
- Don't nitpick over small changes. Every developer has their own preferences which are still readable by the entire team (e.g. `forEach` vs `for` loops, etc.). If there is a specific standard you think the team should follow, add it to the ESLint config or Code Styles best practices document and request a review from a lead.

### Request Additional PRs and New Issues

- If a reviewer asks for additional work or large refactor that not specific to the original PR, consider creating a 2nd PR so that code can be reviewed in smaller chunks.
- If there is any temporary code or missing code, make sure to document in an issue and assign immediately.

### Review Checklist

- [ ] Is the code readable?
- [ ] Would another developer, unfamiliar with the code be able to read, understand, update later?
- [ ] Has unit tests been written for utilities and core functionality?
- [ ] Does it includes README's for new feature/utilities usage as well as inline code comments
- [ ] Do components follow [accessibility best practices](./techical-review-checklist.md#accessibility-checklist). 
- [ ] Are there any obvious security flaws or potential holes (XSS vulnerability, user input sanitized, tokens passes correctly, iframe sandbox, etc.)?
- [ ] Are Error and fallback states handled?
- [ ] Are there any code that can be reused as a shared utility?
- [ ] Are the major performance issues?
- [ ] Can any of the code be simplified?

---
[StoryMaps Documentation (Home)](../../README.md)
