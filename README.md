# Sidetree Node.js implementation
The Node.js implementation of a blockchain-agnostic Sidetree Node using TypeScript.

[![Build Status](https://travis-ci.org/decentralized-identity/sidetree.svg?branch=master)](https://travis-ci.org/decentralized-identity/sidetree)

See the [protocol document](docs/protocol.md) for the full Sidetree protocol specification.

See the [implementation document](docs/implementation.md) for the detailed description of this implementation.


## Contribution Guidelines:

1. Must pass `npm run test`.
1. Must pass `npm run lint`.
1. Must and only prefix an interface requiring implementation with `I`. e.g. `ITransactionProcessor`.
1. Suffix of an interface that is without methods and act purely as data holders) with `Model`. e.g. `TransactionModel`.
1. Export a class/interface/enum as the default export if the name matches the file name.
1. Sort imports.

## Docker
The Sidetree components are also available via docker containers. Please see the [docker document](docs/docker.md) to find out details on building and running.
