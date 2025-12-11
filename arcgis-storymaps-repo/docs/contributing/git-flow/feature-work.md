# Feature Work

<!-- omit in toc -->
## Table of Contents

- [Feature branch git flow](#feature-branch-git-flow)
  - [Option 1: Creating a feature branch locally](#option-1-creating-a-feature-branch-locally)
  - [Option 2: Creating a feature branch via the GitHub UI](#option-2-creating-a-feature-branch-via-the-github-ui)
  - [Option 3: PE already created the branch](#option-3-pe-already-created-the-branch)
- [How do I update my local branch with the latest develop or feature branch?](#how-do-i-update-my-local-branch-with-the-latest-develop-or-feature-branch)
- [How frequently should I put up PRs to a feature branch? What should I do while I wait for my PR to be reviewed?](#how-frequently-should-i-put-up-prs-to-a-feature-branch-what-should-i-do-while-i-wait-for-my-pr-to-be-reviewed)


Usually, pull requests can go directly to `develop` for bug fixes or enhancements. But when working on a larger task/feature that will take multiple PRs to complete, we follow the "feature branch" git flow to ensure that PEs can regularly test the feature for regressions during development. Feature branches are special branches that follow the naming convention of `feature/*` (see [Branch Naming Conventions](./git-user-guidelines.md#branch-naming-conventions)); they are protected, meaning they cannot be deleted by non-admins or pushed to directly. If you are unsure if your specific issue warrants a feature branch, check with the PE assigned to your task.

## Feature branch git flow

There are two ways you can create a feature branch: locally or via the GitHub UI. The latter is usually quicker since you don't need to wait for post-checkout Git hooks to run on your machine. Alternatively, PEs will sometimes create feature branches for you ahead of time.

### Option 1: Creating a feature branch locally

1. Check out develop locally: `git checkout develop`.
2. Pull the latest changes from remote: `git pull`.
3. Branch off develop to create a feature branch: `git checkout -b feature/X`.
4. Push the newly created feature branch up to remote: `git push -u origin HEAD`.
5. Branch off of the feature branch for your current iteration of work: `git checkout -b YOUR_ESRI_USERNAME/OVERVIEW_OF_WORK`.
6. Once you complete the work on this branch, put in a PR to merge `YOUR_ESRI_USERNAME/OVERVIEW_OF_WORK -> feature/X`.

### Option 2: Creating a feature branch via the GitHub UI

1. Navigate to our repo on Devtopia.
2. Click the branch dropdown. Type out the full name of the branch you want to create (e.g., `feature/X`).
3. Assuming the name is not already taken, you should see a prompt to create a new branch with that name.

![Creating a new branch via the GitHub UI dropdown picker.](https://devtopia.esri.com/storage/user/4196/files/61339290-5447-4459-befe-00f0116710f6)

4. Fetch and check out the branch locally: `git fetch -a && git checkout feature/X`.
5. Branch off of the feature branch for your current iteration of work: `git checkout -b YOUR_ESRI_USERNAME/OVERVIEW_OF_WORK`.
6. Once you complete the work on this branch, put in a PR to merge `YOUR_ESRI_USERNAME/OVERVIEW_OF_WORK -> feature/X`.

### Option 3: PE already created the branch

1. Fetch all remote branches: `git fetch -a`.
2. Check out the feature branch locally: `git checkout feature/X`.
3. Branch off of the feature branch for your current iteration of work: `git checkout -b YOUR_ESRI_USERNAME/OVERVIEW_OF_WORK`.
4. Once you complete the work on this branch, put in a PR to merge `YOUR_ESRI_USERNAME/OVERVIEW_OF_WORK -> feature/X`.

## How do I update my local branch with the latest develop or feature branch?

As you work on a feature, your base feature branch will eventually diverge from `develop` as other PRs get merged in. That's expected, but sometimes you'll need those latest changes locally, like if someone puts in a hotfix for broken tooling or some changes that your feature depends on. Either way, you'll want your feature branch to catch up to the latest `develop`.

To do this, go to the draft PR for `feature/YOUR_FEATURE_NAME -> develop` on Devtopia (which a PE will usually create for you after your first PR) and add the following label: `Update FB with latest develop`. PEs will see this on their end, merge develop into your feature branch, and remove the label.

<img width="309" alt="Update FB with latest develop label on GitHub in a popover under the Labels group" src="https://devtopia.esri.com/storage/user/4196/files/dfb71f2d-f0e8-4337-95ce-92ede63e0e07">

> Note: Unfortunately, because feature branches are protected, you cannot merge develop into the feature branch yourself unless you do this locally and put up a pull request. But this is slower than adding the label, so it's not recommended.

At this point, the local branch that you created off of the old `feature/YOUR_FEATURE_NAME` will also need to catch up to the latest changes that just got merged into your feature branch. You can do this in one of two ways, assuming you are already on the correct branch:

1. Merging: `git fetch -a && git merge origin/feature/YOUR_FEATURE_NAME `
2. Rebasing: `git fetch -a && git rebase origin/feature/YOUR_FEATURE_NAME `.

See docs on [merging vs. rebasing](./git-user-guidelines.md#merging-vs-rebasing) for more details.

## How frequently should I put up PRs to a feature branch? What should I do while I wait for my PR to be reviewed?

A ticket to introduce a new workflow in the app might consist of several distinct parts:

- The basic UI components required for the new designs.
- Behind-the-scenes data model changes that are needed to support the feature.
- Plumbing the data to the UI to complete the end-to-end workflow.

You are strongly encouraged to split your feature into incremental PRs rather than putting up one big PR for the whole feature. Not only does this make it easier for you to track and manage large scopes of work, but it also makes it easier for other developers to review your code in bite-sized increments.

Now, let's say you put up a PR for `user123/part-1`, but there are still many more PRs to go. While you wait for your current PR to be reviewed, you can branch off of `user123/part-1` and create a new branch, maybe `user123/part-2`, to track the next scope of work. Commit your new changes to that new branch while you wait. At some point, the reviewers may request changes on your open PR, so you'll need to switch back to your `user123/part-1` branch to address those changes and push them up. Eventually, the PR will be approved and merged into `feature/X`. You once again have two options for pulling the latest changes into your branch:

1. Merging: `git fetch -a && git merge origin/feature/YOUR_FEATURE_NAME`
2. Rebasing: `git fetch -a && git rebase origin/feature/YOUR_FEATURE_NAME` 

---

[StoryMaps Documentation (Home)](../../../README.md) | [Git Flow (Home)](./README.md)
