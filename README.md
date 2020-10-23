# Sidetree Protocol

This repository contains both the specification and a Node.js based reference implementation of the blockchain-agnostic Sidetree protocol

**[View on GitHub](https://github.com/decentralized-identity/sidetree)**

See the [latest spec](https://identity.foundation/sidetree/spec/) for the full Sidetree protocol specification.

See The [test vectors](tests/fixtures) for input fixtures that are expected by all sidetree implementations.

See the [implementation document](docs/implementation.md) for the detailed description of this implementation.

See the [styleguide](docs/styleguide.md) for details regarding this specification and implementation conformance to industry conventions for JSON and HTTP.

## Reference Implementation 

![CI](https://github.com/decentralized-identity/sidetree/workflows/CI/badge.svg)
![npm-version](https://badgen.net/npm/v/@decentralized-identity/sidetree)
![npm-unstable-version](https://badgen.net/npm/v/@decentralized-identity/sidetree/unstable)

### Code Contributions:

1. Must pass `npm run test`.
1. Must pass `npm run lint`.
1. Prefix an interface that require implementation with `I`. e.g. `ITransactionProcessor`.
1. Suffix a data-holder interface (without definition of methods) with `Model`. e.g. `TransactionModel`.
1. Use default export if class/interface name matches the file name.
1. Sort imports.

### Release Process

Refer to [here](/docs/release-process.md) for details on the release process of the artifacts in this repository.

### Docker

> NOTE: 2019-08-13: docker-compose out-of-date, needs to be udpated.

The Sidetree components are available via docker containers . Please see the [docker document](docs/docker.md) to find out details on building and running.

## Specification 

### Editing/Contributions:

1. Clone the repo.
2. Create a topic branch for your spec contributions.
3. run `npm install`
4. run `npm run spec:edit`
5. If you see errors like `UnhandledPromiseRejectionWarning: Error: ENOENT: no such file or directory, open './www/spec/index.html'`... create the missing directories and files and try again (they will be overritten).
6. Type `npx serve .` in the root directory and open `http://localhost:5000/www/spec`.
7. Modify files in the `spec/markdown/` directory to make changes, refresh to see changes.
8. Do not commit build assets.
9. Try and make blocks of text small so that changes can be suggested easily on specific lines.
10. When you are happy with your changes, commit to your topic branch and open a Pull Request on GitHub and reviewers will be alerted to review for a potential merge.
11. Make sure to tag people continiously to ensure your PR is reviewed in a timely manner.
12. PRs that sit open without comments / reviews, will be closed at the editors discretion.

