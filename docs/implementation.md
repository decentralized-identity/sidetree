Sidetree Node.js Implementation Document
===================================================
This document focuses on the Node.js implementation of the Sidetree protocol.

# Overview

![Architecture diagram](./diagrams/architecture.png)

# Terminology

# Operation Processor

The Operation Processor holds most of the state of a Sidetree node. It is a singleton class with the following methods for DID Document state update and retrieval.

## Process

This is the core method to update the state of a DID Document:

```javascript
public process (transactionNumber: number, operationIndex: number, operation: WriteOperation)
```
The `operation` is a JSON object representing a create, update, or a delete operation. Recall from the protocol description that the hash of this object is the *operation hash*, which represents the version of the document produced as the result of this operation.

The `transactionNumber` and `operationIndex` parameters together provides a deterministic ordering of all operations. The `transactionNumber` is a monotonically increasing number (need NOT be by 1) that identifies a Sidtree transaction. The `operationIndex` is the index of this operation amongst all the operations batched within the same Sidetree transaction.

> Note: `transactionNumber` and `operationIndex` are explicitly called out as parameters for the `process` method for clarity. They may be embedded within the `operation` parameter in actual implementation.

Under normal processing, the _observer_ would process operations in chronological order. However the implementation accepts `process` calls with out-of-ordered operations. This is used to handle delays and out-of-orderedness introduced by the CAS layer.

It is useful to view the operations as producing a collection of version *chains* one per DID. Each create operation introduces a new chain and each update operation adds an edge to an existing chain. There could be holes in the chain if some historical update is missing - as noted above, this could be caused due to CAS delays.

When two update operations reference the same (prior) version of a DID Document, the cache removes from consideration the later of the two operations and all operations directly and indirectly referencing the removed operation. This ensures that the document versions of a particular DID form a chain without any forks. For illustration, assume we have recorded four operations for a particular DID producing the following chain:
```
v0 -> v1 -> v2 -> v3
```
If we find an earlier update operation `v0 -> v4`, the new chain for the DID would be:
```
v0 -> v4
```

In the above description, *earlier* and *later* refer to the logical time of the operation derived from the position of the operation in the blockchain.


## Rollback

This method is used to handle rollbacks (forks) in the blockchain.

```javascript
public rollback (transactionNumber: number)
```

The effect of this method is to delete the effects of any operation included in a transaction with a transaction number greater than or equal to the _transactionNumber_ provided.

## Lookup

This method looks up the DID Document given an _operation hash_.

```javascript
public lookup (operationHash: Buffer): DidDocument
```

If there is a missing update in the chain leading up to the provided `operationHash`, the method returns `null`.

## Version chain navigation methods

These methods navigate the version chain.

```javascript
public first (operationHash: Buffer): Buffer
public last (operationHash: Buffer): Buffer
public next (operationHash: Buffer): Buffer
public previous (operationHash: Buffer): Buffer
```

## Resolve

The resolve method returns the latest document for a given DID. It is implemented as `lookup(last(did))`.


# Merkle Rooter
The Merkle Rooter batches write operations (Create, Update, Delete and Recover) operations and anchors them on a blockchain. 

> TODO: more content to be added.

# Observer

The observer watches the public blockchain to identify Sidetree operations, verifying their authenticity, and building a local cache to help a Sidetree node perform resolve operations quickly.

> TODO: more content to be added.


# Blockchain REST API
The blockchain REST API interface aims to abstract the underlying blockchain away from the main protocol logic. This allows the underlying blockchain to be replaced without affecting the core protocol logic. The interface also allows the protocol logic to be implemented in an entirely different language while interfacing with the same blockchain.

All hashes used in the API are Base58 encoded multihash.

>TODO: Decide on signature format.
>TODO: Decide on compression.


## Response HTTP status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 400              | Bad client request.                      |
| 401              | Unauthenticated or unauthorized request. |
| 404              | Resource not found.                      |
| 500              | Server error.                            |



## Get latest blockchain time
Gets the latest logical blockchain time. This API serves two purposes:
1. Allows the Rooter to determine protocol version to be used.
2. Provides the hash associated with the blockchain time to be used for generating proof-of-work.

A _blockchain time hash_ **must not** be predictable/pre-computable, a canonical implementation would be to use the _block number_ as the time and the _block hash_ as the _time hash_. It is intentional that the concepts related to _blockchain blocks_ are  hidden from the layers above.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/time
```

### Request headers
None.

### Request body schema
None.

### Request example
```
Get /v1.0/time
```

### Response body schema
```json
{
  "time": "The logical blockchain time.",
  "hash": "The hash associated with the blockchain time."
}
```

### Response body example
```json
{
  "time": 545236,
  "hash": "0000000000000000002443210198839565f8d40a6b897beac8669cf7ba629051"
}
```



## Get blockchain time by hash
Gets the time identified by the time hash.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/time/<time-hash>
```

### Request headers
None.

### Request body schema
None.

### Request example
```
Get /v1.0/time/0000000000000000001bfd6c48a6c3e81902cac688e12c2d87ca3aca50e03fb5
```

### Response body schema
```json
{
  "time": "The logical blockchain time.",
  "hash": "The hash associated with the blockchain time, must be the same as the value given in query path."
}
```

### Response body example
```json
{
  "time": 545236,
  "hash": "0000000000000000002443210198839565f8d40a6b897beac8669cf7ba629051"
}
```



## Fetch Sidetree transactions
Fetches Sidetree transactions in chronological order.

> Note: The call may not to return all Sidetree transactions in one batch, in which case the caller can use the transaction number of the last transaction in the returned batch to fetch subsequent transactions.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/transactions?since=<transaction-number>&transaction-time-hash=<transaction-time-hash>
```

### Request headers
None.


### Request query parameters
- `since`

  Optional. A transaction number. When not given, all Sidetree transactions since inception will be returned.
  When given, only Sidetree transactions after the specified transaction will be returned.

- `transaction-time-hash`

  Optional, but MUST BE given if `since` parameter is specified.

  This is the hash associated with the time the transaction specified by the `since` parameter is anchored on blockchain.
  Multiple transactions can have the same _transaction time_ and thus the same _transaction time hash_.

  The _transaction time hash_ helps the blockchain layer detect block reorganizations (temporary forks) and inform the requester using `HTTP 404` on such events.

### Request example
```
GET /v1.0/transactions?since=170&transaction-time-hash=00000000000000000000100158f474719e5a319933856f7f464fcc65a3cb2253
```

### Response body schema
```json
{
  "moreTransactions": "True if there are more transactions beyond the returned batch. False otherwise.",
  "transactions": [
    {
      "transactionNumber": "A monotonically increasing number (need NOT be by 1) that identifies a Sidtree transaction.",
      "transactionTime": "The logical blockchain time this transaction is anchored. Used for protocol version selection.",
      "transactionTimeHash": "The hash associated with the transaction time.",
      "anchorFileHash": "Hash of the anchor file of this transaction."
    },
    ...
  ]
}
```

### Response body example
```json
{
  "moreTransactions": false,
  "transactions": [
    {
      "transactionNumber": 89,
      "transactionTime": 545236,
      "transactionTimeHash": "0000000000000000002352597f8ec45c56ad19994808e982f5868c5ff6cfef2e",
      "anchorFileHash": "QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf"
    },
    {
      "transactionNumber": 100,
      "transactionTime": 545236,
      "transactionTimeHash": "00000000000000000000100158f474719e5a319933856f7f464fcc65a3cb2253",
      "anchorFileHash": "QmbJGU4wNti6vNMGMosXaHbeMHGu9PkAUZtVBb2s2Vyq5d"
    }
  ]
}
```


## Trace Sidetree transaction chain
Returns Sidetree transactions that are "_2 to the power of N_" prior to the specified transaction until the first transaction is reached, where _N_ is integer incremented from 0. This API is primarily used by the Sidetree core library to determine a transaction that can be used as a marker in time to reprocess transactions in the event of a block reorganization (temporary fork).

The returned list of transactions is in reverse chronological order.


|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/transactions/trace/<transaction-number>
```

### Request headers
None.

### Request example
```
GET /v1.0/transactions/trace/20
```

### Response body schema
```json
{
  "transactions": [
    {
      "transactionNumber": "The transaction 'two to the power of N' prior to the transaction specified. N is the array index.",
      "transactionTime": "The logical blockchain time this transaction is anchored. Used for protocol version selection.",
      "transactionTimeHash": "The hash associated with the transaction time.",
      "anchorFileHash": "Hash of the anchor file of this transaction."
    },
    ...
  ]
}
```

### Success Response body example
```json
{
  "moreTransactions": false,
  "transactions": [
    {
      "transactionNumber": 19,
      "transactionTime": 545236,
      "transactionTimeHash": "0000000000000000002352597f8ec45c56ad19994808e982f5868c5ff6cfef2e",
      "anchorFileHash": "Qm28BKV9iiM1ZNzMsi3HbDRHDPK5U2DEhKpCYhKk83UPEg"
    },
    {
      "transactionNumber": 18,
      "transactionTime": 545236,
      "transactionTimeHash": "0000000000000000000054f9719ef6ca646e2503a9c5caac1c6ea95ffb4af587",
      "anchorFileHash": "Qmb2wxUwvEpspKXU4QNxwYQLGS2gfsAuAE9LPcn5LprS1nb"
    },
    {
      "transactionNumber": 16,
      "transactionTime": 545200,
      "transactionTimeHash": "0000000000000000000f32c84291a3305ad9e5e162d8cc363420831ecd0e2800",
      "anchorFileHash": "QmbBPdjWSdJoQGHbZDvPqHxWqqeKUdzBwMTMjJGeWyUkEzK"
    },
    {
      "transactionNumber": 12,
      "transactionTime": 545003,
      "transactionTimeHash": "0000000000000000001e002080595267fe034d370897b7b506d119ad29da1541",
      "anchorFileHash": "Qmss3gKdm9uU9YLx3MPRHQTcUq1CR1Xv9Zpdu7EBG9Pk9Y"
    },
    {
      "transactionNumber": 4,
      "transactionTime": 544939,
      "transactionTimeHash": "00000000000000000000100158f474719e5a319933856f7f464fcc65a3cb2253",
      "anchorFileHash": "QmdcDrVPWy3ZXoZcuvFq7fDVqatks22MMqPAxDqXsZzGhy"
    }
  ]
}
```


## Write a Sidetree transaction
Writes a Sidetree transaction to the underlying blockchain.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
POST /<api-version>/transactions
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "anchorFileHash": "A Sidetree file hash."
}
```

### Request example
```
POST /v1.0/transactions
```
```json
{
  "anchorFileHash": "QmbJGU4wNti6vNMGMosXaHbeMHGu9PkAUZtVBb2s2Vyq5d"
}
```

### Response body schema
None.




# CAS REST API Interface
The CAS (content addressable storage) REST API interface aims to abstract the underlying Sidetree storage away from the main protocol logic. This allows the CAS to be updated or even replaced if needed without affecting the core protocol logic. Conversely, the interface also allows the protocol logic to be implemented in an entirely different language while interfacing with the same CAS.

All hashes used in the API are Base58 encoded multihash.

## Response HTTP status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 400              | Bad client request.                      |
| 401              | Unauthenticated or unauthorized request. |
| 404              | Resource not found.                      |
| 500              | Server error.                            |


## Read content
Read the content of a given address and return it in the response body as octet-stream.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/<hash>
```

### Request example
```
GET /v1.0/QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf
```
### Response headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/octet-stream``` |


## Write content
Write content to CAS.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
POST /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/octet-stream``` |

### Response headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Response body schema
```json
{
  "hash": "Hash of data written to CAS"
}
```

### Response body example
```json
{
  "hash": "QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf"
}
```
