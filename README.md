
#### [View GitHub](https://github.com/decentralized-identity/sidetree)

The Node.js implementation of a blockchain-agnostic Sidetree Node using TypeScript.

[![Build Status](https://travis-ci.org/decentralized-identity/sidetree.svg?branch=master)](https://travis-ci.org/decentralized-identity/sidetree)

See the [latest spec](./docs/spec/) for full sidetree protocol specification.

See the [protocol document](docs/protocol.md) for the full Sidetree protocol specification.

See the [implementation document](docs/implementation.md) for the detailed description of this implementation.


## Contribution Guidelines:

1. Must pass `npm run test`.
1. Must pass `npm run lint`.
1. Prefix an interface that require implementation with `I`. e.g. `ITransactionProcessor`.
1. Suffix a data-holder interface (without definition of methods) with `Model`. e.g. `TransactionModel`.
1. Use default export if class/interface name matches the file name.
1. Sort imports.

## Docker
> NOTE: 2019-08-13: docker-compose out-of-date, needs to be udpated.

The Sidetree components are available via docker containers . Please see the [docker document](docs/docker.md) to find out details on building and running.
