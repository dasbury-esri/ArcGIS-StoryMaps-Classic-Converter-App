# Git User Guidelines

<!-- omit in toc -->
## Table of Contents

- [Commit Conventions](#commit-conventions)
- [Branch Naming Conventions](#branch-naming-conventions)
- [Merging vs. Rebasing](#merging-vs-rebasing)
- [I pushed a commit to a remote branch, but that commit now needs to be reverted. What should I do?](#i-pushed-a-commit-to-a-remote-branch-but-that-commit-now-needs-to-be-reverted-what-should-i-do)
- [Should I squash and rebase my PR before it gets merged?](#should-i-squash-and-rebase-my-pr-before-it-gets-merged)

## Commit Conventions

Our team doesn't enforce any strict conventions for commits, so it's mostly up to you to decide how you want to compose your messages—as long as you're consistent, it doesn't matter. Some common conventions include:

- Prefixing a commit with the type (e.g., `fix:/feat:/docs:`). See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0-beta.2/).
- Linking to a specific issue number on Devtopia (e.g., `Fix overflow issue with modals (#0000)`).
- Just writing a plain commit message (e.g., `Fix overflow issue with modals`).

While not required, descriptive commit messages that document a single unit of work can provide a clearer record of your changes. This is useful in case other developers need to investigate a regression in the future or reference your work.

## Branch Naming Conventions

|Type|Pattern|Example|
|----|-------|-------|
|Fix, enhancement, or feature work|`YOUR_ESRI_USERNAME/OVERVIEW_OF_WORK`|`ton12618/feature-gating-general-rules`|
|Feature branch|`feature/*`|`feature/publish-modal`|

## Merging vs. Rebasing

Merging and rebasing are two common ways of incorporating changes from one branch into another. Refer to the [Atlassian docs on merging vs. rebasing](https://www.atlassian.com/git/tutorials/merging-vs-rebasing) if you need a refresher.

<table>
  <thead>
    <tr>
      <th scope="col">Strategy</th>
      <th scope="col">Description</th>
      <th scope="col">Pros</th>
      <th scope="col">Cons</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Merging</td>
      <td>
        Merging takes the new commits from one branch and introduces them
        on another branch under a new merge commit.
      </td>
      <td>
        <ul>
          <li>
            Non-destructive: your branch history remains intact and a new commit
            is introduced on the tip of your branch.
          </li>
          <li>
            Preserves a more accurate record of your work since commit
            timestamps and hashes don't change.
          </li>
        </ul>
      </td>
      <td>
        <ul>
          <li>
            Git log noise: because merges introduce extra commits, they can
            sometimes make log diving a little overwhelming, although this
            can be remedied with <code>git log --no-merges</code>.
          </li>
        </ul>
      </td>
    </tr>
    <td>Rebasing</td>
    <td>
      Rebasing rewinds history on your branch to the point before it diverged
      from the other branch, pulls in the latest commits from that other branch, and then replays
      your commits on this new head.
    </td>
    <td>
      <ul>
        <li>Compactness: your feature is uninterrupted by merge commits.</li>
      </ul>
    </td>
    <td>
      <ul>
        <li>
          Destructive: your commit hashes and timestamps are recomputed, so you
          will need to force-push your changes to the remote.
        </li>
      </ul>
    </td>
    <tr></tr>
  </tbody>
</table>

Both strategies are accepted on our team, but which one you use depends on the situation. For example, PEs often come in and merge `develop` into your branch automatically for you before merging your PR, and they also do this with [feature branches](./feature-work.md) to catch up to the latest `develop`.

> Also, note that you don't _have_ to catch up to the base branch before your PR is merged in. You and reviewers may just find it helpful to have the latest changes on the branch when testing your PR.

There are two situations where you should not rebase:

1. Catching a feature branch up to the latest `develop`. Because feature branches are protected and cannot be force-pushed directly without putting up a PR, you will need to merge `develop` into them rather than rebasing.
2. You've already put up a PR for your branch or other developers have checked out your branch locally to collaborate with you. Since rebasing is destructive and rewrites your commit history, this can make your PR changes harder to track in between reviews. Moreover, if a reviewer had already checked out your branch locally for testing and you rebase afterwards, they'll need to hard-reset to your version of the branch instead of just pulling like they normally would.

**Rule of thumb**: If nobody else on the team has viewed/touched your branch yet, feel free to rebase instead of merging. Otherwise, stick to merging.

## I pushed a commit to a remote branch, but that commit now needs to be reverted. What should I do?

You have a few different options depending on when the commit was made:

- If it's the most recent commit, you can simply do a hard-reset to the commit before it: `git reset --hard HEAD~1`. Then force-push to the remote: `git push -f`.
- If it's not the most recent commit, you can either:
  - Revert the commit and push it normally: `git revert <hash> && git push`. (This creates a new commit.)
  - Do an interactive rebase and drop the commit: `git rebase -i <hash>~ && git push -f`. (This removes the commit from the log.)

Reverting keeps the original commit around in the tree but introduces a new commit that undoes the changes. Hard-resetting and dropping will both remove the problematic commit from the log; your local git history will diverge from your remote branch's history, so you'll need to force-push your changes to the remote. (This is fine since it's your personal branch, not a public branch.)

## Should I squash and rebase my PR before it gets merged?

Some teams ask developers to squash and rebase all local commits into a final commit before creating or merging a PR. We do not follow that workflow. Feel free to commit as frequently as you need for your work.

---

[StoryMaps Documentation (Home)](../../../README.md) | [Git Flow (Home)](./README.md)
