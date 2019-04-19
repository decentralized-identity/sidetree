# Sidetree Node.js implementation
The Node.js implementation of a blockchain-agnostic Sidetree Node using TypeScript.

[![Build Status](https://travis-ci.org/decentralized-identity/sidetree-core.svg?branch=master)](https://travis-ci.org/decentralized-identity/sidetree-core)

See the [protocol document](docs/protocol.md) for the full Sidetree protocol specification.

See the [implementation document](docs/implementation.md) for the detailed description of this implementation.


## Contribution Guidelines:

1. Must pass `npm run test`.
1. Must pass `npm run lint`.
1. Must and only prefix the name of a "data structure interface" (interface that is without methods and act purely as data holders) with an `I`.
1. Must and only export a class as a default export if the class name matches the file name.
1. Must sort imports.
