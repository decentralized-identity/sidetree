
#### [View GitHub](https://github.com/decentralized-identity/sidetree)

The Node.js implementation of a blockchain-agnostic Sidetree Node using TypeScript.

[![Build Status](https://travis-ci.org/decentralized-identity/sidetree.svg?branch=master)](https://travis-ci.org/decentralized-identity/sidetree) ![CI](https://github.com/decentralized-identity/sidetree/workflows/CI/badge.svg) 

See the [latest spec](https://identity.foundation/sidetree/spec/) for full Sidetree protocol specification.

See the [implementation document](docs/implementation.md) for the detailed description of this implementation.


## Code Contributions:

1. Must pass `npm run test`.
1. Must pass `npm run lint`.
1. Prefix an interface that require implementation with `I`. e.g. `ITransactionProcessor`.
1. Suffix a data-holder interface (without definition of methods) with `Model`. e.g. `TransactionModel`.
1. Use default export if class/interface name matches the file name.
1. Sort imports.

## Spec Editing/Contributions:

1. Clone the repo.
2. Create a topic branch for your spec contributions.
3. Add the following entry to your local repo's `.git/info/exclude` file: `spec/index.html`.
4. run `npm install`
5. run `npm run spec:edit`
6. Open the generated `index.html` rendering of the spec, located in the `spec/` directory, in your browser.
7. Modify files in the `spec/markdown/` directory to make changes, which will render realtime in the `index.html` file you have open in your browser.
8. When you are happy with your changes, commit to your topic branch and open a Pull Request on GitHub and reviewers will be alerted to review for a potential merge.

## Docker
> NOTE: 2019-08-13: docker-compose out-of-date, needs to be udpated.

The Sidetree components are available via docker containers . Please see the [docker document](docs/docker.md) to find out details on building and running.
