# Sidetree Protocol Specification

This specification document describes the Sidetree protocol, which can be applied to any decentralized ledger system (e.g. Bitcoin) to create a 'Layer 2' PKI network. Identifiers and PKI metadata in the protocol are expressed via the emerging [_Decentralized Identifiers_](https://w3c-ccg.github.io/did-spec/) standard, and implementations of the protocol can be codified as their own distinct DID Methods. Briefly, a _DID Method_ is a deterministic mechanism for creating unique identifiers and managing metadata (_DID Documents_) associated with these identifiers, without the need for a centralized authority, denoted by unique prefixes that distinguish one DID Method's identifiers from another (`did:foo`, `did:bar`, etc.).

## Overview

Using blockchains for anchoring and tracking unique, non-transferable, digital entities is a useful primitive, but the current strategies for doing so suffer from severely limited transactional performance constraints. Sidetree is a layer-2 protocol for anchoring and tracking _[DID Documents](https://w3c-ccg.github.io/did-spec/)_ across a blockchain. The central design idea involves batching multiple document operations into a single blockchain transaction. This allows Sidetree to inherit the immutability and verifiability guarantees of blockchain without being limited by its transaction rate.

![Sidetree System Overview](./diagrams/overview-diagram.png)

Architecturally, a Sidetree network is a network consisting of multiple logical servers (_Sidetree nodes_) executing Sidetree protocol rules, overlaying a blockchain network as illustrated by the above figure. Each _Sidetree node_ provides service endpoints to perform _operations_ (e.g. Create, Resolve, Update, Recover, and Deactivate) against _DID Documents_. The blockchain consensus mechanism helps serialize Sidetree operations published by different nodes and provide a consistent view of the state of all _DID Documents_ to all Sidetree nodes, without requiring its own consensus layer. The Sidetree protocol batches multiple operations in a single file (_batch file_) and stores the _batch files_ in a _distributed content-addressable storage (DCAS or CAS)_. A reference to the operation batch is then anchored on the blockchain. The actual data of all batched operations are stored as one . Anyone can run a CAS node without running a Sidetree node to provide redundancy of Sidetree _batch files_.


## Terminology

| Term                  | Description                                                                    |
|-----------------------|--------------------------------------------------------------------------------|
| Anchor file           | The file containing metadata of a batch of Sidetree operations, of which the hash is written to the blockchain as a Sidetree transaction. |
| Batch file            | The file containing the deltas from all the batch operations.                  |
| CAS                   | Same as DCAS.                                                                  |
| DCAS                  | Distributed content-addressable storage.                                       |
| DID Document          | A document containing metadata of a DID, see [DID specification](https://w3c-ccg.github.io/did-spec/). |
| DID unique suffix     | The unique portion of a DID. e.g. The unique suffix of 'did:sidetree:abc' would be 'abc'. |
| Operation             | A change to a document of a DID.                                               |
| Operation request     | A JWS formatted request sent to a Sidetree node to perform an _operation_.     |
| Recovery key          | A key that is used to perform recovery or deactivate operation.                |
| Sidetree node         | A logical server executing Sidetree protocol rules.                            |
| Suffix data           | Data required to deterministically generate a DID .                            |
| Transaction           | A blockchain transaction representing a batch of Sidetree operations.          |


## Format and Encoding
* JSON is used as the data encapsulation format.
* Base64URL encoding is used whenever encoding is needed for binary data or cryptographic consistency.
* [_Multihash_](https://multiformats.io/multihash/) is used to represent hashes.


## Sidetree Protocol Versioning & Parameters
Sidetree protocol and parameters are expected to evolve overtime. Each version of the protocol will define its protocol rules and parameters, and the logical _blockchain time_ in which the new rules and parameters will take effect. All subsequent transactions will adhere to the same rules and parameters until a newer protocol version is defined.

The following lists the parameters used by this version of the Sidetree protocol:

| Protocol Parameter          | Description                                                                    | Value      |
|-----------------------------|--------------------------------------------------------------------------------| ---------: |
| Hash algorithm              | The hash algorithm for computation such as for DID generation.                 |     SHA256 |
| Maximum anchor file size    | The maximum compressed anchor file size.                                       |       1 MB |
| Maximum batch file size     | The maximum compressed batch file size.                                        |      20 MB |
| Maximum encoded hash length | The maximum accepted string length of an encoded hash.                         |        100 |
| Maximum operation size      | The maximum uncompressed operation size.                                       |      2 000 |
| Maximum operation count     | The maximum number of operations per batch.                                    |     10 000 |


## Anchor String Schema
The anchor string is the data that is stored on the blockchain. The data is stored in the following format:

```
[encoded_number_of_operations].[hash_of_anchor_file]

WHERE

 encoded_number_of_operations: The total number of operations included in the batch file converted to 4 bytes (in little endian format) and then encoded as Base64 URL string

 hash_of_batch_file: The hash of the batch file
```

### Example
The following anchor string encodes 10000 operations and the hash of the batch file.

```
ECcAAA.QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf
```

## Operation chaining of a DID
![DID Operation Chaining](./diagrams/operationChaining.png)


## DDoS Attack & Mitigation

Given the protocol was designed to enable operations to be performed at large volumes with cheap unit costs, DDoS is a real threat to the system.

Without any mitigation strategy, malicious but protocol adherent nodes can create and broadcast operation batches that are not intended for any other purpose than to force other observing nodes to process their operations in accordance with the protocol.

Sidetree protocol defines the following mechanisms to enable scaling, while preventing DDoS attacks:

#### Rate limiting
   
   To prevent spam attack causing transaction and operation stores to grow at an unhealthy rate, 2 types of rate limiting is put in place. 

   1. writer rate limiting
   Each writer is allowed 1 transaction per transaction time. If a writer has more than 1 transaction, the one with the lowest transaction number is chosen to be considered.

   2. operation and transaction rate limiting
   After getting 1 transaction per writer, transaction and operation rate limiting is applied. A cap is put on the number of operations and transactions allowed to be observed in a transaction time. The selection logic when the caps are exceeded is the following:
   
   higher fee per transaction comes first, if transaction fee is the same, lower transaction number comes first, in that order, fill the cap and ignore the rest.
   
   By picking the transactions with higher transaction fee, it encourages batching, while allowing small transactions to have the opportunity to also be included if they are willing to pay a slightly higher transaction fee. Alternatives to this approach are highest fee per operation and first comes first serve, but they don't encourage batching and discourage writing near the end of a transaction time.

#### Maximum batch size
   
   By defining a maximum number of operations per batch, the strategy circumvents participants to anchor arbitrarily large trees on the system. At its core, this mitigation strategy forces the attacker to deal with the organic economic pressure exerted by the underlying chain's transactional unit cost. Each instantiation of a Sidetree-based DID Method may select a different maximum batch size; the size for the default configuration is TBD. 

#### Proof of Fee

   Each Sidetree transaction on the target chain is required to include a deterministic, protocol-specified fee, based on the number of DID operations they seek to include via the on-chain transaction. The deterministic protocol rules for the default configuration are still under discussion, but the following are roughly represent the direction under discussion:

   1. Simple inclusion of a transaction in a block will enable the transaction writer to include a baseline of N operations
   2. Any number of operations that exceed N will be subject to proof that a fee was paid that meets or exceeds a required amount, determined as follows:
      1. Let the block range R include the last block the node believes to be the latest confirmed and the 9 blocks that precede it.
      2. Compute an array of median fees M, wherein the result of each computation is the median of all transactions fees in each block, less any Sidetree-bearing transactions.
      3. Let the target fee F be the average of all the values contained in M.
      4. Let the per operation cost C be F divided by the baseline amount N.
   3. To test the batch for adherence to the Proof of Fee requirement, divide the number of operations in the batch by the fee paid in the host transaction, and ensure that the resulting per operation amount exceeds the required per operation cost C.

#### One Operation per DID per Batch
  Only one operation per DID per batch is allowed, this prevents the operation chain of any DID from growing at an intractable rate.

#### Commitment and Reveal for Operations
  Upon DID creation, the create operation payload must include:
  1. The hash of a _commitment_ value for the next recover operation.
  1. The hash of a _commitment_ value for the next update operation.
  https://en.wikipedia.org/wiki/Commitment_scheme

  The DID owner must reproduce and reveal the correct commitment value in the subsequent operation for the operation to be considered valid. In addition, each subsequent operation must also include the hash of the new commitment value(s) for the next operation. This scheme enables efficient dismissal of counterfeit operations without needing to evaluate signatures.

  See [Sidetree REST API](#sidetree-rest-api) section for the schema used to specify reveal values and commitment hashes in each operation.


## DID Deactivate and Recovery
Sidetree protocol requires the specification by the DID owner of dedicated cryptographic keys, called _recovery keys_, for deleting or recovering a DID. At least one recovery key is required to be specified in every _Create_ and _Recover_ operation. Recovery keys can only be changed by another recover operation. Once a DID is deactivated, it cannot be recovered.

The most basic recover operation, most often used to regain control after loss or theft of a controlling device/key, is one coded as a specific recovery activity and invokes a designated recovery key to sign the operation. The operation is processes by observing nodes as an override that supercedes all other key types present in the current document state.


## Sidetree Client Guidelines
A Sidetree client manages the private keys and performs document operations on behalf of the DID owner. The Sidetree client needs to comply to the following guidelines to keep the DIDs it manages secure.

1. The client MUST keep the operation payload once it is submitted to a Sidetree node until it is generally available and observed. If the submitted operation is not observed, the same operation payload MUST be resubmitted. Submitting a different operation payload would put the DID in risk of a _late publish_ attack which can lead to an unrecoverable DID if the original operation payload contains a recovery key rotation and the recovery key is lost.


## Sidetree REST API
A _Sidetree node_ exposes a set of REST API that enables the creation of new DIDs and their initial document state, subsequent document updates, and DID resolutions.


### Response HTTP status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 401              | Unauthenticated or unauthorized request. |
| 400              | Bad client request.                      |
| 500              | Server error.                            |


### JSON Web Signature (JWS)
Sidetree API uses __flattened JWS JSON serialization__ scheme when content need to be protected.

The JWS operation request header must be protected and be encoded in the following schema:

#### Protected header schema
```json
{
  "kid": "ID of the signing key.",
  "alg": "ES256K"
}
```

### DID Creation
Use this API to create a Sidetree DID and its initial state.

#### Request path
```http
POST / HTTP/1.1
```

#### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |


#### Create operation request body schema
```json
{
  "type": "create",
  "suffix_data": "Encoded JSON object containing data used to compute the unique DID suffix.",
  "delta": "Encoded JSON object containing data on document patches."
}
```

#### `suffix_data` property schema
```json
{
  "delta_hash": "Hash of the delta property.",
  "recovery_key": "A SECP256K1 public key expressed in compressed JWK format.",
  "recovery_commitment": "Commitment hash for the next recovery."
}
```

#### `delta` property schema
```json
{
  "patches": "An array of patches where each entry is a patch defined by the document patch schema.",
  "update_commitment": "Commitment hash to for the next update.",
}
```

See [document patch schema](#Document-patch-schema) section for all the supported patch actions.

#### Response headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

#### Response body schema
The response body is the constructed document of the DID created.


### DID resolution
This API fetches the latest document of a DID.
Two forms of string can be passed in the URI:
1. Standard DID format: `did:sidetree:<unique-portion>`.

   e.g.
   ```did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A```

   The latest document will be returned if found.

1. DID with `-<method-name>-initial-state` DID parameter: `did:sidetree:<unique-portion>?-<method-name>-initial-state=<encoded-create-operation-request>`

   Standard resolution is performed if the DID is found to registered on the blockchain. If the DID cannot be found, the data given in the `-<method-name>-initial-state` DID parameter is used directly to generate and resolve the DID.

#### Request path
```http
GET /<did-with-or-without-initial-state> HTTP/1.1
```

#### Request headers
None.

#### Request body schema
None.

#### Request example
```http
GET /did:sidetree:EiAC2jrPmjaLI4xMiHTGWaKK29HmU9USFWA22lYc6CV0Bg HTTP/1.1
```

### Updating the document of a DID.
The API to update the document of a DID.

#### Request path
```http
POST / HTTP/1.1
```

#### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

#### Request body schema
```json
{
  "type": "update",
  "didUniqueSuffix": "The unique suffix of the DID to be updated.",
  "updateRevealValue": "Reveal value for this update.",
  "signedData": {
    "protected": "JWS header.",
    "payload": "Hash of the delta.",
    "signature": "JWS signature."
  },
  "delta": "Encoded JSON object containing update delta."
}
```

#### Decoded `delta` schema
```json
{
  "patches": "An array of patches where each entry is a patch defined by the patch schema.",
  "update_commitment": "Commitment hash for the next update."
}
```

See [document patch schema](#Document-patch-schema) section for all the supported patch actions.

#### Response body
None.


### DID Recovery

#### Request path
```http
POST / HTTP/1.1
```

#### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

#### Request body schema
```json
{
  "type": "recover",
  "didUniqueSuffix": "The unique suffix of the DID to be recovered.",
  "recoveryRevealValue": "The reveal value for this recovery.",
  "signedData": {
    "protected": "JWS header.",
    "payload": "JWS encoded JSON object containing recovery data that are signed.",
    "signature": "JWS signature."
  },
  "delta": "Encoded JSON object containing recovery delta."
}
```

#### `signedData` decoded payload schema
```json
{
  "deltaHash": "Hash of the encoded delta.",
  "recoveryKey": "The new recovery key.",
  "nextRecoveryCommitmentHash": "Commitment hash for the next recovery."
}
```

#### Decoded `delta` schema
```json
{
  "patches": "An array of patches where each entry is a patch defined by the patch schema.",
  "update_commitment": "Commitment hash for the next update.",
}
```

See [document patch schema](#Document-patch-schema) section for all the supported patch actions.

#### Response body
None.


### DID Deactivation
The API to deactivate a given DID.

#### Request path
```
POST /
```

#### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

#### Deactivate request body schema
```json
{
  "type": "deactivate",
  "didUniqueSuffix": "The unique suffix of the DID to be deactivated.",
  "recoveryRevealValue": "The current reveal value to use for this request.",
  "signedData": {
    "protected": "JWS header.",
    "payload": "JWS encoded JSON object containing required data to be signed.",
    "signature": "JWS signature."
  }
}
```

#### `signedData` decoded payload schema
```json
{
  "didUniqueSuffix": "The unique suffix of the DID to be deactivated.",
  "recoveryRevealValue": "The current reveal value for recovery.",
}
```

#### Response body
None.



### Fetch the current service versions (optional).
Fetches the current version of the core and the dependent services. The service implementation defines the versioning scheme and its interpretation.

Returns the service _names_ and _versions_ of the core and the dependent blockchain and CAS services.

> NOTE: This API does **NOT** return the protocol version. This just represents the version of the current service(s) itself.

#### Request path
```
GET /version
```

#### Request headers
None.

#### Request example
```
GET /version
```

#### Response body schema
```json
[
  {
    "name": "A string representing the name of the service",
    "version": "A string representing the version of currently running service."
  },
  ...
]
```

#### Response example
```http
HTTP/1.1 200 OK

[
  {
  "name":"core",
  "version":"0.4.1"
  },
  {
    "name":"bitcoin",
    "version":"0.4.1"
  },
  {
    "name":"ipfs",
    "version":"0.4.1"
  }
]
```


## Document patch schema

### Replacing the existing document
```json
{
  "action": "replace",
  "document": "A full document defined by the document schema "
}
```

#### `document` schema
```json
{
  "publicKeys": [
    {
      "id": "A string no longer than 20 characters.",
      "type": "Secp256k1VerificationKey2019 | EcdsaSecp256k1VerificationKey2019 | JwsVerificationKey2020",
      "jwk": "Must be JWK format.",
      "usage": "must be an array containing one or more of the 3 usage types: ops, general, or auth"
    }
  ],
  "serviceEndpoints": [
    {
      "id": "A string no longer than 20 characters.",
      "type": "A string no longer than 30 characters.",
      "serviceEndpoint": "URIs beginning with a scheme segment (i.e. http://, git://), and be no longer than 80 characters."
    }
  ]
}
```

#### `document` property example
```json
{
  "publicKeys": [
    {
      "id": "key1",
      "type": "Secp256k1VerificationKey2019",
      "jwk": {
        "kty": "EC",
        "crv": "secp256k1",
        "x": "5s3-bKjD1Eu_3NJu8pk7qIdOPl1GBzU_V8aR3xiacoM",
        "y": "v0-Q5H3vcfAfQ4zsebJQvMrIg3pcsaJzRvuIYZ3_UOY"
      },
      "usage": ["ops"]
    }
  ],
  "serviceEndpoints": [
    {
      "id": "my-git",
      "type": "git",
      "serviceEndpoint": "URIs beginning with a scheme segment (i.e. http://, git://), and be no longer than 80 characters."
    }
  ]
}
```


### Adding public keys
```json
{
  "action": "add-public-keys",
  "publicKeys": [
    {
      "id": "A string no longer than 20 characters.",
      "type": "Secp256k1VerificationKey2019 | EcdsaSecp256k1VerificationKey2019 | JwsVerificationKey2020",
      "jwk": "Must be JWK format.",
      "usage": "Must be an array containing one or more of the valid usage types: ops, general, or auth"
    }
  ]
}
```

Example:
```json
{
  "action": "add-public-keys",
  "publicKeys": [
    {
      "id": "key1",
      "type": "Secp256k1VerificationKey2019",
      "jwk": {
        "kty": "EC",
        "crv": "secp256k1",
        "x": "5s3-bKjD1Eu_3NJu8pk7qIdOPl1GBzU_V8aR3xiacoM",
        "y": "v0-Q5H3vcfAfQ4zsebJQvMrIg3pcsaJzRvuIYZ3_UOY"
      },
      "usage": ["ops"]
    },
    {
      "id": "key2",
      "type": "EcdsaSecp256k1VerificationKey2019",
      "jwk": {
        "kty": "EC",
        "crv": "secp256k1",
        "x": "5s3-bKjD1Eu_3NJu8pk7qIdOPl1GBzU_V8aR3xiacoM",
        "y": "v0-Q5H3vcfAfQ4zsebJQvMrIg3pcsaJzRvuIYZ3_UOY"
      },
      "usage": ["general"]
    }
  ]
}
```

### Removing public keys
```json
{
  "action": "remove-public-keys",
  "publicKeys": ["Array of 'id' property of public keys to remove."]
}
```

Example:
```json
{
  "action": "remove-public-keys",
  "publicKeys": ["key1", "key2"]
}
```

### Adding service endpoints
```json
{
  "action": "add-service-endpoints",
  "serviceEndpoints": [
    {
      "id": "A string no longer than 7 characters.",
      "type": "A string no longer than 30 characters.",
      "serviceEndpoint": "URIs beginning with a scheme segment (i.e. http://, git://), and be no longer than 80 characters."
    }
  ]
}
```

Example:
```json
{
  "action": "add-service-endpoints",
  "serviceEndpoints": [
    {
      "id": "my-git",
      "type": "git",
      "serviceEndpoint": "URIs beginning with a scheme segment (i.e. http://, git://), and be no longer than 80 characters."
    }
  ]
}
```

### Removing service endpoints
```json
{
  "action": "remove-service-endpoints",
  "serviceEndpointIds": [
    "ID of service endpoint to remove."
  ]
}
```

Example:
```json
{
  "action": "remove-service-endpoints",
  "serviceEndpointIds": [
    "my-git"
  ]
}
```


## Merkle Root Hash Inclusion (Currently not used, may support in the future)
Sidetree _anchor file_ also includes the root hash of a Merkle tree constructed using the hashes of batched operations.

The main protocol does *not* rely on the root hash to operate and the usefulness of the Merkle root is still being discussed, but since this hash is small, stored off-chain, and cheap to compute and store, we do. There is an opportunity for an API or service to return a concise receipt (proof) for a given operation such that this operation can be cryptographically proven to be part of a batch without the need of the entire batch file. Note this receipt cannot be provided in the response of the operation request because Merkle tree construction happens asynchronously when the final batch is formed.

Specifically, Sidetree uses an unbalanced Merkle tree construction to handle the (most common) case where the number of operations in a batch is not mathematically a power of 2: a series of uniquely sized balanced Merkle trees is formed where operations with lower index in the list of operations form larger trees; then the smallest balanced subtree is merged with the next-sized balanced subtree recursively to form the final Merkle tree.

### Sidetree Operation Batching Examples
The following illustrates the construction of the Merkle tree with an array of 6 operations:
* The smallest balance subtree I of 2 leaves [4, 5] is merged with the adjacent balanced tree J of 4 leaves [0, 1, 2, 3] to form the final Merkle tree.
* Receipt for [0] will be [B, H, I], and receipt for [5] will be [E, J].

```
                          ROOT=H(J+I)
                          /          \
                        /              \
                J=H(G+H)                 \
              /        \                   \
            /            \                   \
      G=H(A+B)             H=H(C+D)          I=H(E+F)
      /      \             /     \           /      \
    /        \           /        \         /        \
  A=H([0])  B=H([1])  C=H([2])  D=H([3])  E=H([4])  F=H([5])
    |         |         |         |         |         |
    |         |         |         |         |         |
[   0    ,    1    ,    2    ,    3    ,    4    ,    5   ]

Where: [1] -> Denotes the binary buffer of the 1st element in the array of operation data.
        |  -> Denotes the logical relationship between an operation data and its hash.
       H() -> Denotes a hash function that returns a binary buffer representing the hash.
       A+B -> Denotes the concatenation of two binary buffers A and B.
```

The following illustrates the construction of the Merkle tree with an array of 7 operations:
* The smallest balanced subtree G of 1 leaf [6] is merged with the adjacent balanced subtree J of 2 leaves [4, 5] to form parent L, which in turn is merged with the adjacent balanced subtree K of 4 leaves [0, 1, 2, 3] to form the final Merkle tree.
* Receipt for [0] will be [B, I, L]; receipt for [4] will be [F, G, K]; receipt for [6] will be [J, K].
```
                             ROOT=H(K+L)
                          /               \
                        /                  \
                K=H(H+I)                    L=H(J+G)
              /        \                     /       \
            /            \                  /          \
      H=H(A+B)             I=H(C+D)        J=H(E+F)      \
      /      \             /     \         /      \        \
     /        \           /       \       /         \        \
  A=H([0])  B=H([1])  C=H([2])  D=H([3])  E=H([4])  F=H([5])  G=H([6])
    |         |         |         |         |         |         |
    |         |         |         |         |         |         |
[   0    ,    1    ,    2    ,    3    ,    4    ,    5    ,    6   ]
```

### Operation Receipts

While currently unused, Sidetree proposes the following JSON schema to represent a receipt:

```json
{
  "receipt": [
    {
      "hash": "A Merkle tree node hash.",
      "side": "Must be 'left' or 'right', denotes the position of this hash."
    },
    ...
  ]
}
```

Where the first entry in ```receipt``` is the sibling of the operation hash in the Merkle tree; followed by the uncle, then the great uncle and so on.

> NOTE: This scheme does __not__ include the root hash as the last entry of the receipt.

> NOTE: Receipt array will be empty thus is optional if no batching occurs (i.e. a tree of one operation).


## FAQs
* Why introduce the concept of an _anchor file_? Why not just anchor the _batch file hash_ directly on blockchain?

  It would be ideal to be able to fetch metadata about the batched operations efficiently,
  without needing to download the entire batch file.
  This design is needed for the implementation of "light nodes", it also opens up possibilities of other applications of the Sidetree protocol.

* Why assign a _transaction number_ to invalid transactions?

  In the case of an _unresolvable transaction_, it is unknown if the transaction will be valid or not if it becomes resolvable, thus it is assigned a transaction number such that if the transaction turns out to be valid, the transaction number of valid transactions that occur at a later time remain immutable. This also enables all Sidetree nodes to refer to the same transaction using the same transaction number.
