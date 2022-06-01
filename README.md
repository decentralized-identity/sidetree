# Sidetree

This repository contains both the blockchain-agnostic Sidetree specification and a Node.js based reference implementation.

## Specification

See the [latest spec](https://identity.foundation/sidetree/spec/) for the full Sidetree specification.

See the [API spec](https://identity.foundation/sidetree/api/) for the full API specification to interact with a Sidetree node.

### Specification Editing/Contributions:

1. Clone the repo.
2. Create a topic branch for your spec contributions.
3. run `npm install`
4. run `npm run spec:edit`
5. If you see errors like `UnhandledPromiseRejectionWarning: Error: ENOENT: no such file or directory, open './www/spec/index.html'`... create the missing directories and files and try again (they will be overwritten).
6. Type `npx serve .` in the root directory and open `http://localhost:5000/www/spec`.
7. Modify files in the `spec/markdown/` directory to make changes, refresh to see changes.
8. Do not commit build assets.
9. Try and make blocks of text small so that changes can be suggested easily on specific lines.
10. When you are happy with your changes, commit to your topic branch and open a Pull Request on GitHub and reviewers will be alerted to review for a potential merge.
11. Make sure to tag people continuously to ensure your PR is reviewed in a timely manner.
12. PRs that sit open without comments / reviews, will be closed at the editors discretion.

## Reference Implementation

![CI](https://github.com/decentralized-identity/sidetree/workflows/CI/badge.svg)
![npm-version](https://badgen.net/npm/v/@decentralized-identity/sidetree)
![npm-unstable-version](https://badgen.net/npm/v/@decentralized-identity/sidetree/unstable)


Code Coverage

![Statements](https://img.shields.io/badge/statements-100%25-brightgreen.svg?style=flat) ![Branches](https://img.shields.io/badge/branches-100%25-brightgreen.svg?style=flat) ![Functions](https://img.shields.io/badge/functions-100%25-brightgreen.svg?style=flat) ![Lines](https://img.shields.io/badge/lines-100%25-brightgreen.svg?style=flat)

See the [test vectors](tests/fixtures) for input fixtures that are expected by all sidetree implementations.

See the [reference implementation document](docs/core.md) for description of the reference implementation.

See the [styleguide](docs/styleguide.md) for details regarding this specification and implementation conformance to industry conventions for JSON and HTTP.


### Release Process

Refer to [here](/docs/release-process.md) for details on the release process of the artifacts in this repository.

