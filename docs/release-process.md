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
1. Create a new release branch from master called `release`:

   `git checkout -b release`

1. Install the dependencies `npm install`
1. Build the package `npm run build`
1. Test the package `npm test`
1. Sanity check: check the repo is completely clean without pending changes by running `npm status`, else the next command to commit a new version will fail.
1. Run `npm run version:release`, with an appropriate option such as [ `major` | `minor` | `patch` ].
1. Observe and note down the correctly incremented version number X.Y.Z change to the `package.json` and changes to `CHANGELOG.md`
1. Push the release branch and open a pull request for the release.
1. Once approvals have been sought, merge the pull request preserving the **last** commit message "`chore(ref-imp): official release`". This is how release action to publish an NPM package is triggered.
1. Observe the triggering of the `/.github/workflows/release.yml` github workflow
1. Remove the tag created in the release branch: `git tag -d vX.Y.Z`
1. Remove the local release branch:
   1. `git checkout master`
   1. `git branch -D release`
1. Push a new version tag to remote master e.g. (v1.0.4):
   1. git pull
   1. git tag vX.Y.Z
   1. git push origin vX.Y.Z

The resulting release will publish the new package to [npm](https://www.npmjs.com/).

### Unstable Releases

An unstable release is triggered on every commit to master, where the `/.github/workflows/push-master.yaml` is run.

The releases have the following version syntax `<current package version + patch version>-unstable.<current git commit reference>`

**Note** The `/.github/workflows/push-master.yaml` will skip if the commit message includes `[skip ci]`

**Note** To skip the automatic release of a new unstable version append `[skip ci]` to the end of the commit message
that is merged into master.

## Specification

TODO document