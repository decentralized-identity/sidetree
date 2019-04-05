**Sidetree Protocol Specification**
===================================

This specification document describes the Sidetree protocol, which can be applied to any decentralized ledger system (e.g. Bitcoin) to create a 'Layer 2' PKI network. Identifiers and PKI metadata in the protocol are expressed via the emerging [_Decentralized Identifiers_](https://w3c-ccg.github.io/did-spec/) standard, and implementations of the protocol can be codified as their own distinct DID Methods. Briefly, a _DID Method_ is a deterministic mechanism for creating unique identifiers and managing metadata (_DID Documents_) associated with these identifiers, without the need for a centralized authority, denoted by unique prefixes that distinguish one DID Method's identifiers from another (`did:foo`, `did:bar`, etc.).

# Overview

Using blockchains for anchoring and tracking unique, non-transferable, digital entities is a useful primitive, but the current strategies for doing so suffer from severely limited transactional performance constraints. Sidetree is a layer-2 protocol for anchoring and tracking _[DID Documents](https://w3c-ccg.github.io/did-spec/)_ across a blockchain. The central design idea involves batching multiple _DID Document_ operations into a single blockchain transaction. This allows Sidetree to inherit the immutability and verifiability guarantees of blockchain without being limited by its transaction rate.

![Sidetree System Overview](./diagrams/overview-diagram.png)

Architecturally, a Sidetree network is a network consists of multiple logical servers (_Sidetree nodes_) executing Sidetree protocol rules, overlaying a blockchain network as illustrated by the above figure. Each _Sidetree node_ provides service endpoints to perform _operations_ (e.g. Create, Resolve, Update, and Delete) against _DID Documents_. The blockchain consensus mechanism helps serialize Sidetree operations published by different nodes and provide a consistent view of the state of all _DID Documents_ to all Sidetree nodes, without requiring its own consensus layer. The Sidetree protocol batches multiple operations in a single file (_batch file_) and stores the _batch files_ in a _distributed content-addressable storage (DCAS or CAS)_. A reference to the operation batch is then anchored on the blockchain. The actual data of all batched operations are stored as one . Anyone can run a CAS node without running a Sidetree node to provide redundancy of Sidetree _batch files_.


# Terminology

| Term                  | Description                                                                    |
|-----------------------|--------------------------------------------------------------------------------|
| Anchor file           | The file containing metadata of a batch of Sidetree operations, of which the hash is written to the blockchain as a Sidetree transaction. |
| Batch file            | The file containing all the operation data batched together.                   |
| CAS                   | Same as DCAS.                                                                  |
| DCAS                  | Distributed content-addressable storage.                                       |
| DID Document          | A document containing metadata of a DID, see [DID specification](https://w3c-ccg.github.io/did-spec/). |
| Operation             | A change to a DID Document.                                                    |
| Operation hash        | The hash of the encoded payload of an _operation request_.                     |
| Operation request     | A JWS formatted request sent to a Sidetree node to perform an _operation_.     |
| Original DID Document | A DID Document that is used in create operation to generate the DID.           |
| Recovery key          | A key that is used to perform recovery or delete operation.                    |
| Sidetree node         | A logical server executing Sidetree protocol rules.                            |
| Transaction           | A blockchain transaction representing a batch of Sidetree operations.          |


# Format and Encoding
* JSON is used as the data encapsulation format.
* Base64URL encoding is used whenever encoding is needed for binary data or cryptographic consistency.
* [_Multihash_](https://multiformats.io/multihash/) is used to represent hashes.


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


# Sidetree Operations

A [_DID Document_](https://w3c-ccg.github.io/did-spec/#ex-2-minimal-self-managed-did-document
) is a document containing information about a DID, such as the public keys of the DID owner and service endpoints used. Sidetree protocol enables the creation of, lookup for, and updates to DID Documents through _Sidetree operations_. All operations are authenticated with a signature using a key specified in the corresponding DID Document.

An update to a DID Document is specified as a [_JSON patch_](https://tools.ietf.org/html/rfc6902) so that only differences from the previous version of the DID Document is specified in each operation.

> NOTE: Create and recover operations require a complete DID Document as input as opposed to a _JSON patch_.

## Sidetree Operation Hashes

An _operation hash_ is the hash of the _encoded payload_ of a Sidetree operation request. The exact request schema for all operations are defined in [Sidetree REST API](#sidetree-rest-api) section. With the exception of the create operation, each operation must reference the previous operation using the _operation hash_, forming a chain of change history.

# Sidetree DID and Original DID Document
A Sidetree DID is intentionally the hash of the encoded DID Document given as the create operation payload (_original DID Document_), prefixed by the Sidetree method name. Given how _operation hash_ is computed, A DID is also the operation hash of the initial create operation.

Since the requester is in control of the _original DID Document_, the requester can deterministically calculate the DID before the create operation is anchored on the blockchain.

A valid _original DID Document_ must be a valid generic DID Document that adheres to the following additional Sidetree protocol specific rules:
1. The document must NOT have the `id` property.
1. The document must contain at least 1 entry in the `publicKey` array property.
1. The `id` property of a `publickey` element must be specified and be a fragment (e.g. `#key1`).
1. Can have `service` property.
1. `serviceEndpoint` property of each element inside the `service` array must:
   1. Contain a `@context` property with value `schema.identity.foundation/hub`.
   1. Contain a `@type` property with value `UserServiceEndpoint`.
   1. Contain at least one element in an `instance` property typed as an array of strings.

See [DID Create API](#original-did-document-example) section for an example of an original DID Document.


# Sidetree Operation Batching
The Sidetree protocol increases operation throughput by batching multiple operations together then anchoring a reference to this batch on the blockchain.
For every batch of Sidetree operations created, there are two files that are created and stored in the CAS layer: 
1. Batch file - The file containing the actual change data of all the operations batched together.
2. Anchor file - The hash of the _anchor file_ is written to the blockchain as a Sidetree transaction, hence the name _'anchor'_. This file contains the metadata of the batch of Sidetree operations, this includes the reference to the corresponding _batch file_.

## Batch File Schema
The _batch file_ is a ZIP compressed JSON document of the following schema:
```json
{
  "operations": [
    "Encoded operation",
    "Encoded operation",
    ...
  ]
}
```

## Anchor File Schema
The _anchor file_ is a JSON document of the following schema:
```json
{
  "batchFileHash": "Encoded hash of the batch file.",
  "merkleRoot": "Encoded root hash of the Merkle tree constructed from the operations included in the batch file."
}
```
> NOTE: See [Sidetree Operation Receipts](#Sidetree-Operation-Receipts) section on purpose and construction of the `merkleRoot`.

## Operation chaining of a DID
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
A Sidetree transaction represents a batch of operations to be processed by Sidetree nodes. Each transaction is assigned a monotonically increasing number (but need not be increasing by one), the _transaction number_ deterministically defines the order of transactions, and thus the order of operations. A _transaction number_ is assigned to all Sidetree transactions irrespective of their validity, however a transaction __must__ be  __valid__ before individual operations within it can be processed. An invalid transaction is simply discarded by Sidetree nodes. The following rules must be followed for determining the validity of a transaction:

1. The corresponding _anchor file_ must strictly follow the schema defined by the protocol. An anchor file with missing or additional properties is invalid.
1. The corresponding _batch file_ must strictly follow the schema defined by the protocol. A batch file with missing or additional properties is invalid.
1. The operation batch size must not exceed the maximum size specified by the protocol.
1. The transaction must meet the proof-of-work requirements defined by the protocol.
1. Every operation batched in the same transaction must adhere to the following requirements to be considered a _well-formed operation_, one _not-well-formed_ operation in the batch file renders the entire transaction invalid:

   1. Follow the operation schema defined by the protocol, it must not have missing or additional properties.

   1. Must not exceed the operation size specified by the protocol.

   1. Must use the hashing algorithm specified by the protocol.

> NOTE: A transaction is __not__ considered to be _invalid_ if the corresponding _anchor file_ or _batch file_ cannot be found. Such transactions are _unresolvable transactions_, and must be reprocessed when the its _anchor file_ and _batch file_ become available.

# DID Deletion and Recovery
Sidetree protocol requires dedicated cryptographic keys called _recovery keys_ for deleting or recovering a DID. At least one recovery key is required to be specified in every _Create_ and _Recover_ operation. The recovery keys can only be changed by another recovery operation. Once a DID is deleted, it cannot be recovered.


# Sidetree REST API
A _Sidetree node_ exposes a set of REST API that enables the creation of new DIDs and their initial state, subsequent DID Document updates, and DID Document resolutions. This section defines the `v1.0` version of the Sidetree REST API.


## Response HTTP status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 401              | Unauthenticated or unauthorized request. |
| 400              | Bad client request.                      |
| 500              | Server error.                            |


## Proof-of-work
Every Sidetree operation request must have a proof-of-work for it to be considered valid. As a result, every operation request (e.g. DID create, update, delete, and recover) has an optional `proofOfWork` property with the following schema:

```json
"proofOfWork": {
  "algorithm": "Proof-of-work algorithm used.",
  "lastBlockHash": "The hash of the latest known blockchain block.",
  "operationHash": "The hash of the operation this proof-of-work is for.",
  "proof": "The proof depending on the algorithm used."
}
```

When `proofOfWork` is not given in an operation request, the Sidetree node must perform proof-of-work on behalf of the requester or reject the request.


## JSON Web Signature (JWS)
Every operation request sent to a Sidetree node __must__ be signed using the __flattened JWS JSON serialization__ scheme.
Compact serialization scheme is not supported because _proof of work_ data is intentionally not required to be signed to allow proof of work computation to be outsourced.

When constructing the JWS input for signing (_JWS Signing Input_), the following scheme is specified by the JWS specification:

`ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))`

Since there is no protected header in a Sidetree operation, the JWS Signing Input will always begin with the '`.`' character.

Note that signature validation is _only_ being performed when the Sidetree node is processing operations anchored on the blockchain. No signature validation will be done when the operation requests are being received and handled. This is because there is no way of guaranteeing/enforcing the validity of the signing key used in an update since the signing key could have been invalidated in an earlier update that has not been anchored or seen by the Sidetree node yet.


## DID and DID Document Creation
Use this API to create a Sidetree DID and its initial state.

An encoded _original DID Document_ must be supplied as the request payload, see [Original DID Document](#Sidetree-DID-and-Original-DID-Document) section for the requirements of a valid original DID Document.

### Request path
```http
POST /<api-version>/ HTTP/1.1
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "header": {
    "operation": "create",
    "kid": "ID of the key used to sign the original DID Document.",
    "alg": "ES256K",
    "proofOfWork": "Optional. If not given, the Sidetree node must perform proof-of-work on the requester's behalf
    or reject the request."
  },
  "payload": "Encoded original DID Document.",
  "signature": "Encoded signature."
}
```

### Original DID Document example
```json
{
  "@context": "https://w3id.org/did/v1",
  "publicKey": [{
    "id": "#key1",
    "type": "Secp256k1VerificationKey2018",
    "publicKeyHex": "02f49802fb3e09c6dd43f19aa41293d1e0dad044b68cf81cf7079499edfd0aa9f1"
  }],
  "service": [{
    "id": "IdentityHub",
    "type": "IdentityHub",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instance": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```

### Request example
```http
POST /v1.0/ HTTP/1.1

{
  "header": {
    "operation": "create",
    "kid": "#key1",
    "alg": "ES256K",
    "proofOfWork": { }
  },
  "payload": "eyJAY29udGV4dCI6Imh0dHBzOi8vdzNpZC5vcmcvZGlkL3YxIiwicHVibGljS2V5IjpbeyJpZCI6IiNrZXkxIiwidHlwZSI6IlNlY3AyNTZrMVZlcmlmaWNhdGlvbktleTIwMTgiLCJwdWJsaWNLZXlIZXgiOiIwMmY0OTgwMmZiM2UwOWM2ZGQ0M2YxOWFhNDEyOTNkMWUwZGFkMDQ0YjY4Y2Y4MWNmNzA3OTQ5OWVkZmQwYWE5ZjEifSx7ImlkIjoiI2tleTIiLCJ0eXBlIjoiUnNhVmVyaWZpY2F0aW9uS2V5MjAxOCIsInB1YmxpY0tleVBlbSI6Ii0tLS0tQkVHSU4gUFVCTElDIEtFWS4yLkVORCBQVUJMSUMgS0VZLS0tLS0ifV0sInNlcnZpY2UiOlt7InR5cGUiOiJJZGVudGl0eUh1YiIsInB1YmxpY0tleSI6IiNrZXkxIiwic2VydmljZUVuZHBvaW50Ijp7IkBjb250ZXh0Ijoic2NoZW1hLmlkZW50aXR5LmZvdW5kYXRpb24vaHViIiwiQHR5cGUiOiJVc2VyU2VydmljZUVuZHBvaW50IiwiaW5zdGFuY2VzIjpbImRpZDpiYXI6NDU2IiwiZGlkOnphejo3ODkiXX19XX0",
  "signature": "mAJp4ZHwY5UMA05OEKvoZreRo0XrYe77s3RLyGKArG85IoBULs4cLDBtdpOToCtSZhPvCC2xOUXMGyGXDmmEHg"
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
  "id": "did:sidetree:EiBJz4qd3Lvof3boqBQgzhMDYXWQ_wZs67jGiAhFCiQFjw",
  "publicKey": [{
    "id": "#key1",
    "type": "Secp256k1VerificationKey2018",
    "publicKeyHex": "029a4774d543094deaf342663ae672728e12f03b3b6d9816b0b79995fade0fab23"
  }],
  "service": [{
    "id": "IdentityHub",
    "type": "IdentityHub",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instance": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```


## DID Document resolution
This API fetches the latest DID Document of a DID.
Two types of string can be passed in the URI:
1. DID

   e.g.
   ```did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A```

   The latest DID Document will be returned if found.

1. Method name prefixed, encoded _original DID Document_

   e.g.
   ```did:sidetree:ewogICAgICAiQGNvbnRleHQiOiAiaHR0cHM6Ly93M2lkLm9yZy9kaWQvdjEiLAogICAgICAicHVibGljS2V5IjogWwogICAgICAgIHsKICAgICAgICAgICAgImlkIjogIiNrZXkxIiwKICAgICAgICAgICAgInR5cGUiOiAiU2VjcDI1NmsxVmVyaWZpY2F0aW9uS2V5MjAxOCIsCiAgICAgICAgICAgICJwdWJsaWNLZXlIZXgiOiAiMDM0ZWUwZjY3MGZjOTZiYjc1ZThiODljMDY4YTE2NjUwMDdhNDFjOTg1MTNkNmE5MTFiNjEzN2UyZDE2ZjFkMzAwIgogICAgICAgIH0KICAgICAgXQogICAgfQ```

   The encoded DID Document is hashed using the current supported hashing algorithm to obtain the corresponding DID, after which the resolution is done against the computed DID. If a DID Document cannot be found, the supplied DID Document is used directly to generate and return a resolved DID Document, in which case the supplied DID Document is subject to the same validation as an _original DID Document_ in a create operation.

### Request path
```http
GET /<api-version>/<did-or-method-name-prefixed-encoded-original-did-document> HTTP/1.1
```

### Request headers
None.

### Request body schema
None.

### Request example - DID
```http
GET /v1.0/did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A HTTP/1.1
```

### Request example - Method name prefixed, encoded original DID Document
```http
GET /v1.0/did:sidetree:ewogICAgICAiQGNvbnRleHQiOiAiaHR0cHM6Ly93M2lkLm9yZy9kaWQvdjEiLAogICAgICAicHVibGljS2V5IjogWwogICAgICAgIHsKICAgICAgICAgICAgImlkIjogIiNrZXkxIiwKICAgICAgICAgICAgInR5cGUiOiAiU2VjcDI1NmsxVmVyaWZpY2F0aW9uS2V5MjAxOCIsCiAgICAgICAgICAgICJwdWJsaWNLZXlIZXgiOiAiMDM0ZWUwZjY3MGZjOTZiYjc1ZThiODljMDY4YTE2NjUwMDdhNDFjOTg1MTNkNmE5MTFiNjEzN2UyZDE2ZjFkMzAwIgogICAgICAgIH0KICAgICAgXQogICAgfQ HTTP/1.1
```

### Response body schema
The response body is the latest DID Document.

### Response body example
```json
{
  "@context": "https://w3id.org/did/v1",
  "id": "did:sidetree:EiBJz4qd3Lvof3boqBQgzhMDYXWQ_wZs67jGiAhFCiQFjw",
  "publicKey": [{
    "id": "#key1",
    "type": "Secp256k1VerificationKey2018",
    "publicKeyHex": "029a4774d543094deaf342663ae672728e12f03b3b6d9816b0b79995fade0fab23"
  }],
  "service": [{
    "id": "IdentityHub",
    "type": "IdentityHub",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instance": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```


## Updating a DID Document
The API to update a DID Document.

### Request path
```http
POST /<api-version>/ HTTP/1.1
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "header": {
    "operation": "update",
    "kid": "ID of the key used to sign the update payload.",
    "alg": "ES256K",
    "proofOfWork": "Optional. If not given, the Sidetree node must perform proof-of-work on the requester's behalf
    or reject the request."
  },
  "payload": "Encoded update payload JSON object define by the schema below.",
  "signature": "Encoded signature."
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
  "patch": [{
    "op": "remove",
    "path": "/publicKey/0"
  }]
}
```

### Request example
```http
POST /v1.0/ HTTP/1.1

{
  "header": {
    "operation": "update",
    "kid": "#key1",
    "alg": "ES256K",
    "proofOfWork": { }
  },
  "payload": "eyJkaWQiOiJkaWQ6c2lkZXRyZWU6RWlERkRGVVNnb3hsWm94U2x1LTE3eXpfRm1NQ0l4NGhwU2FyZUNFN0lSWnYwQSIsIm9wZXJhdGlvbk51bWJlciI6MSwicHJldmlvdXNPcGVyYXRpb25IYXNoIjoiRWlERkRGVVNnb3hsWm94U2x1LTE3eXpfRm1NQ0l4NGhwU2FyZUNFN0lSWnYwQSIsInBhdGNoIjpbeyJvcCI6InJlcGxhY2UiLCJwYXRoIjoiL3B1YmxpY0tleS8xIiwidmFsdWUiOnsiaWQiOiIja2V5MiIsInR5cGUiOiJTZWNwMjU2azFWZXJpZmljYXRpb25LZXkyMDE4IiwicHVibGljS2V5SGV4IjoiMDI5YTQ3NzRkNTQzMDk0ZGVhZjM0MjY2M2FlNjcyNzI4ZTEyZjAzYjNiNmQ5ODE2YjBiNzk5OTVmYWRlMGZhYjIzIn19XX0",
  "signature": "nymBtWB1_nwtSdrHsb2uiIa91yTJWN-lqANEcspjp-9kd079jlGWoYIxgvVKJkW-WJkYA5Kryws9G5XIfup5RA"
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
  "header": {
    "operation": "delete",
    "kid": "ID of the key used to sign the delete payload.",
    "alg": "ES256K",
    "proofOfWork": "Optional. If not given, the Sidetree node must perform proof-of-work on the requester's behalf
    or reject the request."
  },
  "payload": "Encoded update payload JSON object define by the schema below.",
  "signature": "Encoded signature."
}
```

### Delete payload schema
```json
{
  "did": "The DID to be deleted",
}
```

### Delete payload example
```json
{
  "did": "did:sidetree:QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf",
}
```

### Request example
```http
POST /v1.0/ HTTP/1.1
{
  "header": {
    "operation": "delete",
    "kid": "#key1",
    "alg": "ES256K",
    "proofOfWork": { }
  },
  "payload": "3hAPKZnaKcJkR85UvXhiAH7majrfpZGFFVJj8tgAtK9aSrxnrbygDTN2URoQEghPbWtFgZDMNU6RQjiMD1dpbEaoZwKBSVB3oCq1LR2",
  "signature": "nymBtWB1_nwtSdrHsb2uiIa91yTJWN-lqANEcspjp-9kd079jlGWoYIxgvVKJkW-WJkYA5Kryws9G5XIfup5RA"
}
```

### Response body schema
None.

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


# Sidetree Operation Receipts
Sidetree _anchor file_ also includes the root hash of a Merkle tree constructed using the hashes of batched operations. Specifically, Sidetree uses an unbalanced Merkle tree construction to handle the (most common) case where the number of operations in a batch is not mathematically a power of 2: a series of uniquely sized balanced Merkle trees is formed where operations with lower index in the list of operations form larger trees; then the smallest balanced subtree is merged with the next-sized balanced subtree recursively to form the final Merkle tree.

The inclusion of the Merkle root hash provides the opportunity for an operation to be assigned a concise receipt such that it can be cryptographically proven to be part of the batch. Sidetree uses the following JSON schema to represent a receipt:

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
* Receipt for [0] will be [B, H, I], and receipt for [5] will be [E, J].

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


# FAQs
* Why introduce the concept of an _anchor file_? Why not just anchor the _batch file hash_ directly on blockchain?
  It would be ideal to be able to fetch metadata about the batched operations efficiently,
  without needing to download the entire batch file.
  This design also opens up possibilities of other applications of the Sidetree protocol.

* Why assign a _transaction number_ to invalid transactions?

  In the case of an _unresolvable transaction_, it is unknown if the transaction will be valid or not if it becomes resolvable, thus it is assigned a transaction number such that if the transaction turns out to be valid, the transaction number of valid transactions that occur at a later time remain immutable. This also enables all Sidetree nodes to refer to the same transaction using the same transaction number.

