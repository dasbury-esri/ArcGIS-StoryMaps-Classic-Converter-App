# Merge Conflict Resolution (Feature Branches)

Your draft PR for a [feature branch](./feature-work.md) might have a notice like this at the bottom, and a PE may have also tagged the PR with the `conflicts` label:

<img width="845" alt="Notice that reads: This branch has conflicts that must be resolved. Only those with write access to this repository can merge pull requests." src="https://devtopia.esri.com/storage/user/4196/files/445e78c2-c450-4cb0-96e5-983ef260c124">

You will need to resolve the conflicts on this feature branch locally because feature branches are protected and cannot be committed to directly. To do this:

1. Check out the feature branch locally and pull the latest changes: `git fetch -a && git checkout feature/YOUR_FEATURE_NAME && git pull`.
2. Create a new branch off of this feature branch, maybe `YOUR_ESRI_USERNAME/fix-merge-conflicts`.
3. Merge `develop` into this local branch: `git merge origin/develop`.
4. At this point, you will encounter merge conflicts locally that you will need to resolve. Follow git's instructions on how to do this, or ask another developer on the team for help if you get stuck.
5. When resolving conflicts, make sure to take screenshots of the conflicts and note how you resolved them. This will help your reviewers verify that you resolved the conflicts correctly. Here's an example of what that might look like: https://devtopia.esri.com/WebGIS/arcgis-storymaps/pull/14989. (You may find it helpful to put up a draft PR from this conflict-resolution branch to `develop` temporarily, paste your screenshots and comments in the PR as you resolve the conflicts locally, and then update the PR base branch to `feature/YOUR_FEATURE_NAME` when you're done pushing your changes.)
6. When you're finished resolving conflicts, push up this branch to the remote like you normally would: `git push -u origin HEAD`.
7. Create a PR from this branch into your feature branch. Clear out the issue template and replace it with the screenshots and resolutions that you noted. It may help to group conflicts by file type to make it easier to track changes.
8. Request review on the PR like you normally would.

---

## Use `git show --remerge-diff <GIT REF>` to replay conflict resolutions

Show merge conflict resolutions with `git show --remerge-diff <ref of a merge conflict>`

- [GitHub - Review Merge Conflict Resolution with `--remerge-diff`](https://github.blog/open-source/git/highlights-from-git-2-36/#review-merge-conflict-resolution-with-remerge-diff)

Example:
Run `git show --remerge-diff 106da78` to see the merge conflict resolution as a diff, where `106da78` is a commit where the commiter manually resolved a merge conflict: [Example PR](https://devtopia.esri.com/WebGIS/arcgis-storymaps/pull/22597)

---

[StoryMaps Documentation (Home)](../../../README.md) | [Git Flow (Home)](./README.md)
