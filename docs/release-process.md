# Release Process

The following document covers the release process for the artifacts in this repository.

## Reference Implementation

The following details the release process of the Sidetree reference implementation `@decentralized-identity/sidetree`, which is a typescript based [npm](https://www.npmjs.com/) package.

In general the release process can be summarized by the following flow
- Each merged pull request into master results in the automated release of a new unstable package on npm, unless the `[skip ci]` tag is included in the commit message.
- A release commit merged into master triggers a stable release of the reference implementation.

### Stable Releases

Checklist before creating a stable release:

1. Review code in `latest` folder since the previously released version in both `./lib/core/versions`, `./lib/bitcoin/versions`. If there are new changes, duplicate the `latest` folder with the new release version as the folder name.
1. Verify if there are DB changes that requires a DB upgrade since the last stable release, if so, make sure `upgradeDatabaseIfNeeded()` code in both `core` and `bitcoin` service is updated accordingly.

To create a stable release follow the following steps:

1. Checkout the head of master `git checkout master && git pull`
1. Create a new release branch from master called `release`
1. Install the dependencies `npm install`
1. Build the package `npm build`
1. Test the package `npm test`
1. Run `npm run version:release`, with an appropriate option such as [ `major` | `minor` | `patch` ].
1. Observe the correctly incremented change to the `package.json` and changes to `CHANGELOG.md`
1. Push the release branch including the newly created tags `git push origin release --tags`
1. Open a pull request for the release, once approvals have been sought, merge the pull request using **rebase**,
    preserving the commit message as `release commit [skip ci]`
1. Observe the triggering of the `/.github/workflows/push-release.yml` github workflow

**Note** It is important that **rebase** is used as the strategy for merging a release pull request as this preserves the created release tag.


The resulting release will publish the new package to [npm](https://www.npmjs.com/).

### Unstable Releases

An unstable release is triggered on every commit to master, where the `/.github/workflows/push-master.yaml` is run.

The releases have the following version syntax `<current package version + patch version>-unstable.<current git commit reference>`

**Note** The `/.github/workflows/push-master.yaml` will skip if the commit message includes `[skip ci]`

**Note** To skip the automatic release of a new unstable version append `[skip ci]` to the end of the commit message
that is merged into master.

## Specification

TODO document