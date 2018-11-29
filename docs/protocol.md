**Sidetree Protocol Specification**
===================================

This specification document describes the Sidetree protocol, which can be applied to any decentralized ledger system (e.g. Bitcoin) to create a 'Layer 2' PKI network. Identifiers and PKI metadata in the protocol are expressed via the emerging [_Decentralized Identifiers_](https://w3c-ccg.github.io/did-spec/) standard, and implementations of the protocol can be codified as their own distinct DID Methods. Briefly, a _DID Method_ is a deterministic mechanism for creating unique identifiers and managing metadata (_DID Documents_) associated with these identifiers, without the need for a centralized authority, denoted by unqique prefixes that distinguish one DID Method's identifiers from another (`did:foo`, `did:bar`, etc.).

# Overview

Using blockchains for anchoring and tracking unique, non-transferable, digital entities is a useful primitive, but the current strategies for doing so suffer from severely limited transactional performance constraints. Sidetree is a layer-2 protocol for anchoring and tracking _[DID Documents](https://w3c-ccg.github.io/did-spec/)_ across a blockchain. The central design idea involves batching multiple _DID Document_ operations into a single blockchain transaction. This allows Sidetree to inherit the immutability and verifiability guarantees of blockchain without being limited by its transaction rate.

![Sidetree System Overview](./diagrams/overview-diagram.png)

Architecturally, a Sidetree network is a network consists of multiple logical servers (_Sidetree nodes_) executing Sidetree protocol rules, overlaying a blockchain network as illustrated by the above figure. Each _Sidetree node_ provides service endpoints to perform _operations_ (e.g. Create, Resolve, Update, and Delete) against _DID Documents_. The blockchain consensus mechanism helps serialize Sidetree operations published by different nodes and provide a consistent view of the state of all _DID Documents_ to all Sidetree nodes, without requiring its own consensus layer. The Sidetree protocol batches multiple operations using an unbalanced Merkle tree and embeds the hash of a file (_anchor file_) containing the Merkle root hash in the blockchain. The actual data of all batched operations are stored as one single file (_batch file_) in a _distributed content-addressable storage (DCAS or CAS)_. Anyone can run a CAS node without running a Sidetree node to provide redundancy of Sidetree _batch files_.


# Terminology

| Term           | Description                                                                    |
|----------------|--------------------------------------------------------------------------------|
| Anchor file    | The file containing metadata of a batch of Sidetree operations, of which the hash is written to the blockchain as a Sidetree transaction. |
| Batch file     | The file containing all the operation data batched together.                   |
| CAS            | Same as DCAS.                                                                  |
| DCAS           | Distributed content-addressable storage.                                       |
| DID Document   | A document containing metadata of a DID, as described by the [DID specification](https://w3c-ccg.github.io/did-spec/). |
| Operation      | A change to a DID Document.                                                    |
| Operation hash | The hash of the JSON-formated request of a Sidetree operation.                 |
| Sidetree node  | A logical server executing Sidetree protocol rules.                            |
| Transaction    | A blockchain transaction representing a batch of Sidetree operations.          |


# Format and Encoding
* JSON is used as the data encapsulation format.
* Base58 encoding is use whenever encoding is needed for binary data or cryptographic consistency.
* [_Multihash_](https://multiformats.io/multihash/https://multiformats.io/multihash/d) is used to represent hashes.


# Sidetree Protocol Versioning & Parameters
Sidetree protocol and parameters are expected to evolve overtime. Each version of the protocol will define the logical _blockchain time_ in which the new rules and parameter values will take effect. All subsequent transactions will adhere to the same rules and parameter values until a newer protocol version is defined.

The following lists the parameters of each version of the Sidetree protocol.

## v1.0
| Parameter                | Value            |
|--------------------------|------------------|
| Starting blockchain time | 500000 (bitcoin) |
| Hash algorithm           | SHA256           |
| Maximum batch size       | 10000            |
| Maximum operation size   | 2 KB             |


# Sidetree Operations and DIDs

## Sidetree Operations

A [_DID Document_](https://w3c-ccg.github.io/did-spec/#ex-2-minimal-self-managed-did-document
) is a document containing information about a DID, such as the public key of the DID owner and service endpoints used. Sidetree protocol enables the creation of, lookup for, and updates to DID Documents through _Sidetree operations_. All write operations are authenticated with a signature using a key specified in the corresponding DID Document.

An update to a DID Document is specified as a [_JSON patch_](https://tools.ietf.org/html/rfc6902) so that only differences from the previous version of the DID Document is stored in each write operation.

> NOTE: Create and recover operations require a complete DID Document as input as opposed to a _JSON patch_.

## Sidetree Operation Hashes

An _operation hash_ is the hash of the JSON-formatted request of a state-modifying Sidetree operation. The exact request schema for all operations are defined in [Sidetree REST API](#sidetree-rest-api) section. An _operation hash_ serves as a globally unique identifier of the operation, each write operation must reference the previous operation using the _operation hash_, forming a chain of change history.

## Sidetree Operation DIDs

A Sidetree DID is the hash of the DID Document given in the initial create operation as the create payload, prefixed by the Sidetree DID method name.

Since the requester is in control of the initial DID Document, the requester can deterministically know the DID assigned before the create operation is anchored on the blockchain. This allows newly created DIDs to be immediately consumed by services who optionally and temporarily accepts DIDs not yet anchored on the blockchain.

# Sidetree Operation Batching
Sidetree anchors the root hash of a Merkle tree that cryptographically represents a batch of Sidetree operations on the blockchain. Specifically, Sidetree uses an unbalanced Merkle tree construction to handle the (most common) case where the number of operations in a batch is not mathematically a power of 2; in which case a series of uniquely sized balanced Merkle trees is formed where operations with lower index in the list of operations form larger trees, then the smallest balanced subtree is merged with the next-sized balanced subtree recursively to form the final Merkle tree.

## Sidetree Operation Receipts
Since Sidetree batches many operations using a Merkle tree, each operation can be given a concise receipt such that it can be cryptographically proven to be part of the batch. Sidetree uses the following JSON schema to represent a receipt:

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

## Sidetree Operation Batching Examples
The following illustrates the construction of the Merkle tree with an array of 6 operations:
* The smallest balance subtree I of 2 leaves [4, 5] is merged with the adjacent balanced tree J of 4 leaves [0, 1, 2, 3] to form the final Merkle tree.
* Receipt for [0] will be [B, H], and receipt for [5] will be [E, J].

```
                          ROOT=H(K+J)
                          /          \
                        /              \
                J=H(H+I)                 \
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

## Sidetree CAS-layer Files
For every batch of Sidetree operations created, there are two files that are created and stored in the CAS layer: 
1. Batch file - The file containing the actual change data of all the operations batched together.
2. Anchor file - The hash of the _anchor file_ is written to the blockchain as a Sidetree transaction, hence the name _'anchor'_. This file contains the metadata of the batch of Sidetree operations, this includes the reference to the corresponding _batch file_.

### Batch File Schema
The _batch file_ is a ZIP compressed JSON document of the following schema:
```json
{
  "operations": [
    "Base58 encoded operation",
    "Base58 encoded operation",
    ...
  ]
}
```

### Anchor File Schema
The _anchor file_ is a JSON document of the following schema:
```json
{
  "batchFileHash": "Base58 encoded hash of the batch file.",
  "merkleRoot": "Base58 encoded root hash of the Merkle tree contructed using the batch file."
}
```

Operation chaining of a DID:
![DID Operation Chaining](./diagrams/operationChaining.png)


# DDoS Mitigation
Given the protocol was designed to enable operations to be performed at large volumes with cheap unit costs, DDoS is a real threat to the system.

Without any mitigation strategy, each Sidetree batch can be arbitrarily large, allowing malicious, but protocol adherent nodes to create and broadcast 
massive operation batches that are not intended for any other purpose than to force other observing nodes to process their operations in accordance with the protocol.

Sidetree protocol defines the following two mechanisms to prevent DDoS:
1. Maximum batch size
   
   By defining a maximum number of operations per batch, the strategy circumvents participants to anchor arbitrarily large trees on the system. At its core, this mitigation strategy forces the attacker to deal with the organic economic pressure exerted by the underlying chain's transactional unit cost.

1. Operation-level proof-of-work

   Each Sidetree operation is required to show a protocol-specified proof-of-work for it to be recognized as a valid operation. Sidetree nodes would simply discard any operations that do not meet the proof-of-work requirements. Proof-of-work degrades the ability of bad actors to effectively spam the system. 

# Sidetree Transaction Processing
A Sidetree transaction represents a batch of operations to be processed by Sidetree nodes. Each transaction is assigned a logical incrementing number starting from 1, this _transaction number_ deterministically defines the order of transactions, and thus the order of operations. The _transaction number_ is assigned to all Sidetree transactions irrespective of their validity, however a transaction __must__ be  __valid__ before individual operations within it can be processed. An invalid transaction is simply discarded by Sidetree nodes. The following rules must be followed for determining the validity of a transaction:

1. The corresponding _anchor file_ must strictly follow the schema defined by the protocol. An anchor file with missing or additional properties is invalid.
1. The corresponding _batch file_ must strictly follow the schema defined by the protocol. A batch file with missing or additional properties is invalid.
1. The operation batch size must not exceed the maximum size specified by the protocol.
1. The transaction must meet the proof-of-work requirements defined by the protocol.
1. Every operation batched in the same transaction must adhere to the following requirements to be considered a _well-formed operation_, one _not-well-formed_ operation in the batch file renders the entire transaction invalid:

   1. Follow the operation schema defined by the protocol, it must not have missing or additional properties.

   1. Must not exceed the operation size specified by the protocol.

   1. Must use the hashing algorithm specified by the protocol.

> NOTE: A transaction is __not__ considered to be _invalid_ if the corresponding _anchor file_ or _batch file_ cannot be found. Such transactions are _unresolvable transactions_, and must be reprocessed when the its _anchor file_ and _batch file_ become available.


# Sidetree REST API
A _Sidetree node_ expose a set of REST API that enables the creation of a new DID and its initial DID Document, subsequent DID Document updates, and DID Document lookups. This section defines the `v1.0` version of the Sidetree DID REST API.

## Response HTTP status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 401              | Unauthenticated or unauthorized request. |
| 400              | Bad client request.                      |
| 500              | Server error.                            |

## Proof-of-work
Every Sidetree write request must have a proof-of-work for it to be considered valid. As a result, every write request (e.g. DID create, update, delete, and recover) has an optional `proofOfWork` property with the following schema:

```json
"proofOfWork": {
  "algorithm": "Proof-of-work algorithm used.",
  "lastBlockHash": "The hash of the latest known blockchain block.",
  "operationHash": "The hash of the opeartion this proof-of-work is for.",
  "proof": "The proof depending on the algorithm used."
}
```

When `proofOfWork` is not given in a write request, the the Sidetree node must perform proof-of-work on behalf of the requester or reject the request.


## DID and DID Document Creation
The API to create a Sidetree DID and its initial DID Document.

### Request path
```
POST /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "signingKeyId": "ID of the key used to sign the initial didDocument.",
  "createPayload": "Base58 encoded initial DID Document of the DID.",
  "signature": "Base58 encoded signature of the payload signed by the private-key corresponding to the
    public-key specified by the signingKeyId.",
  "proofOfWork": "Optional. If not given, the Sidetree node must perform proof-of-work on the requester's behalf
    or reject the request."
}
```

In Sidetree implementation, certain properties or portion of which in teh initial DID Document will be ignored:
* `id` - Ignored.
* `publicKey\*\id` - DID portion is ignored.

### Initial DID Document example
```json
{
  "@context": "https://w3id.org/did/v1",
  "id": "did:sidetree:ignored",
  "publicKey": [{
    "id": "did:sidetree:didPortionIgnored#key-1",
    "type": "RsaVerificationKey2018",
    "owner": "did:sidetree:ignoredUnlessResolvable",
    "publicKeyPem": "-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n"
  }],
  "service": [{
    "type": "IdentityHub",
    "publicKey": "did:sidetree:ignored#key-1",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instances": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```

### Request example
```
POST /v1.0/
```
```json
{
  "didDocument": "...",
  "signature": "...",
  "proofOfWork": { ... }
}

```

### Response headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Response body schema
The response body is the constructed DID Document of the DID created.

### Response body example
```json
{
  "@context": "https://w3id.org/did/v1",
  "id": "did:sidetree:realDid",
  "publicKey": [{
    "id": "did:sidetree:realDid#key-1",
    "type": "RsaVerificationKey2018",
    "owner": "did:sidetree:realDid",
    "publicKeyPem": "-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n"
  }],
  "service": [{
    "type": "IdentityHub",
    "publicKey": "did:sidetree:realDid#key-1",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instances": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```


## DID Document resolution
The API to fetch the latest DID Document of the given DID.

### Request path
```
GET /<api-version>/<did>
```

### Request headers
None.

### Request body schema
None.

### Request example
```
GET /v1.0/did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A
```

### Response body schema
The response body is the latest DID Document.

### Response body example
```json
{
  "@context": "https://w3id.org/did/v1",
  "id": "did:sidetree:123456789abcdefghi",
  "publicKey": [{
    "id": "did:sidetree:123456789abcdefghi#key-1",
    "type": "RsaVerificationKey2018",
    "owner": "did:sidetree:123456789abcdefghi",
    "publicKeyPem": "-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n"
  }],
  "service": [{
    "type": "IdentityHub",
    "publicKey": "did:sidetree:123456789abcdefghi#key-1",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instances": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```


## Updating a DID Document
The API to update a DID Document.

### Request path
```
POST /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "signingKeyId": "ID of the key used to sign the update payload",
  "updatePayload": "Base58 encoded update payload JSON object define by the schema below.",
  "signature": "Base58 encoded signature of the payload signed by the private-key corresponding to the
    public-key specified by the signingKeyId.",
  "proofOfWork": "Optional. If not given, the Sidetree node must perform proof-of-work on the requester's behalf
    or reject the request."
}
```

### Update payload schema
```json
{
  "did": "The DID to be updated",
  "operationNumber": "The number incremented from the last change version number. 1 if first change.",
  "previousOperationHash": "The hash of the previous operation made to the DID Document.",
  "patch": "An RFC 6902 JSON patch to the current DID Document",
}
```

### Update payload schema example
```json
{
  "did": "did:sidetree:QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf",
  "operationNumber": 12,
  "previousOperationHash": "QmbJGU4wNti6vNMGMosXaHbeMHGu9PkAUZtVBb2s2Vyq5d",
  "patch": {
    "op": "remove",
    "path": "/publicKey/0"
  }
}
```

### Request example
```
POST /v1.0/
```
```json
{
  "signingKeyId": "did:sidetree:QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf#key-1",
  "updatePayload": "...",
  "signature": "...",
  "proofOfWork": { ... }
}
```

### Response body schema
The response body is the DID Document of the DID after the update.


## DID Deletion
The API to delete a given DID.

### Request path
```
POST /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "signingKeyId": "ID of the key used to sign the update payload",
  "deletePayload": "Base58 encoded delete payload JSON object define by the schema below.",
  "signature": "Base58 encoded signature of the payload signed by the private-key corresponding to the
    public-key specified by the signingKeyId.",
  "proofOfWork": "Optional. If not given, the Sidetree node must perform proof-of-work on the requester's behalf
    or reject the request."
}
```

### Delete payload schema
```json
{
  "did": "The DID to be deleted",
  "operationNumber": "The number incremented from the last change version number. 1 if first change.",
  "previousOperationHash": "The hash of the previous operation made to the DID Document."
}
```

### Delete payload example
```json
{
  "did": "did:sidetree:QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf",
  "operationNumber": 13,
  "previousOperationHash": "QmbJGU4wNti6vNMGMosXaHbeMHGu9PkAUZtVBb2s2Vyq5d",
}
```

### Request example
```
POST /v1.0/
```
```json
{
  "signingKeyId": "did:sidetree:QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf#key-1",
  "updatePayload": "...",
  "signature": "...",
  "proofOfWork": { ... }
}
```

## DID Recovery

> TODO: Content to be revisited and updated.

The signature of the Recover operation is the following:

*Recover (RecoveryPatch, Signature)
where,
-  RecoveryPatch: JSON patch specifying a new recovery public key. The patch can optionally identify old primary public key(s) and include new primary public key(s).
-  Signature: Signature with the recovery secret key (corresponding to the recovery public key stored in the latest version associated with the DID).

If the operation is successful, it applies the provided JSON patch to the version of the DID Document identified.

> NOTE: The recovery patch must contain a fresh recovery public key. It is crucial to not release the recovery secret key, or to sign any predetermined message to prove its knowledge, a i.e., to have a non-replayable recovery mechanism. Otherwise, the system is exposed to man-in-the-middle vulnerability, where a malicious party can replace the new recovery public key in the recovery patch with her his own public key.
> - The recovery key of a DID can only be rotated through a recover op. If the primary secret key is lost or compromised, the owner can change it to a new pair through Recover op. If the owner loses the recovery key, but still has access to her primary key, she can invoke the Delete op to delete her DID. However, if the owner’s recovery key gets compromised, then she loses complete control of her DID.


# Q&A
* Why have different payload name for each type of write operations?

  Each write operation type have different payload schema.

* Why use _block number_ as the marker for protocol versioning change instead of the Sidetree _transaction number_?

  Because _block number_ increments irrespective of whether there are Sidetree activity or not, it makes protocol version upgrade planning and scheduling easier for Sidetree node that do not want to risk creating invalid transaction with obsolete version.

* Why assign a _transaction number_ for invalid transactions?

  In the case of an _unresolvable transaction_, it is unknown if the transaction will be valid or not if it becomes resolvable, thus it is assigned a transaction number such that if the transaction turns out to be valid, the transaction number of existing valid transactions remain immutable. This also enables all Sidetree nodes to refer to the same transaction using the same transaction number.
