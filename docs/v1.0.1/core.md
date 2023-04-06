# Sidetree Core Node.js Reference Implementation Document

This document focuses on the Node.js reference implementation of the Sidetree specification.

## Overview

![Architecture diagram](/www/diagrams/architecture.png)

## Node Types

There will exist several Sidetree node configurations, which offer a variety of modes that support different features and trade-offs. The choice to run one type or another largely depends on the type of user, machine, and intent the operator has in mind.

### Full Node

A full node offers the largest set of features and highest resolution performance of DIDs, but also requires more significant bandwidth, hardware, storage, and system resource consumption to operate. A full node will attempt to fetch and retain all data associated with the Sidetree operations present in the target system. As such, full nodes are able to quickly resolve DID lookup requests and may feature more aggressive caching of DID state than other node configurations.

### Light Node

A light node is a node that retains the ability to independently resolve DIDs without relying on a trusted party or trusted assertions by other nodes, while minimizing the amount of bandwidth and data required to do so. Light nodes fetch and maintain only the minimum Sidetree data required to create an independent DID-indexed lookup table that enables just-in-time resolution of DIDs.

> NOTE: Light node support is not yet implemented.

## Observer

The _Observer_ watches the target anchoring system to identify Sidetree operations, then parses the operations into data structures that can be used for efficient DID resolutions.
The _Observer_ defers heavy processing such as signature validations to the time of DID resolution.

## Versioning
As the Sidetree protocol evolves, existing nodes executing an earlier version of the protocol need to upgrade to execute the newer version of the protocol while remaining backward compatible to processing of prior transactions and operations.

### Protocol Versioning Configuration
The implementation exposes a JSON configuration file with the following schema for specifying protocol version progressions:
```json
[
  {
    "startingBlockchainTime": "An inclusive number that indicates the time this version takes effect.",
    "version": "The name of the folder that contains all the code specific to this protocol version."
  }
]
```

Protocol versioning configuration file example:
```json
[
  {
    "startingBlockchainTime": 1500000,
    "version": "0.4.0"
  },
  {
    "startingBlockchainTime": 2000000,
    "version": "0.5.0"
  }
]
```

![Versioning diagram](/www/diagrams/versioning.png)

### Orchestration Layer
There are a number of top-level components (classes) that orchestrate the execution of multiple versions of protocol simultaneously at runtime. These components are intended to be independent from version specific changes. Since code in this orchestration layer need to be compatible with all Sidetree versions, the orchestration layer should be kept as thin as possible.

- Version Manager - This component handles construction and fetching of implementations of Sidetree versions as needed.
- Batch Scheduler - This component schedules the writing of new operation batches.
- Observer - This component observes the incoming Sidetree transactions and processes them.
- Resolver - This component resolves a DID resolution request.

The orchestration layer cannot depend on any code that is Sidetree version specific, this means its dependencies must either be external or be part of the orchestration layer itself, such dependencies include:
- Blockchain Client
- CAS (Content Addressable Storage) Client
- MongoDB Transaction Store
- MongoDB Operation Store

### Protocol Version Specific Components
The orchestration layer requires implementation of following interfaces per protocol version:
- `IBatchWriter` - Performs operation batching, batch writing to CAS, and transaction writing to blockchain. Used by the _Batch Scheduler_.
- `ITransactionProcessor` - Used by the _Observer_ to perform processing of a transaction written in a particular protocol version.
- `IOperationProcessor` - Used by the _Resolver_ to apply an operation written in a particular protocol version.
- `IRequestHandler` - Handles REST API requests.


## Core Service REST API

### REST API HTTP Response status codes

| HTTP status code | Description                              |
|------------------|------------------------------------------|
| 200              | Everything went well.                    |
| 400              | Bad client request.                      |
| 401              | Unauthenticated or unauthorized request. |
| 404              | Resource not found.                      |
| 500              | Server error.                            |


The Core Service REST API implements the [Sidetree REST API](https://identity.foundation/sidetree/api/), in addition it also exposes the following version API.

### Fetch the current service versions.
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




## Blockchain REST API
The blockchain REST API interface is used by the Core service and aims to abstract the underlying blockchain away from the main protocol logic. This allows the underlying blockchain to be replaced without affecting the core protocol logic. The interface also allows the protocol logic to be implemented in an entirely different language while interfacing with the same blockchain.

### Get latest blockchain time
Gets the latest logical blockchain time. This API allows the Observer and Batch Writer to determine protocol version to be used.

A _blockchain time hash_ **must not** be predictable/pre-computable, a canonical implementation would be to use the _block number_ as the time and the _block hash_ as the _time hash_. It is intentional that the concepts related to _blockchain blocks_ are  hidden from the layers above.

#### Request path
```
GET /time
```

#### Request headers
None.

#### Request body schema
None.

#### Request example
```
GET /time
```

#### Response body schema
```json
{
  "time": "The logical blockchain time.",
  "hash": "The hash associated with the blockchain time."
}
```

#### Response body example
```json
{
  "time": 545236,
  "hash": "0000000000000000002443210198839565f8d40a6b897beac8669cf7ba629051"
}
```



### Get blockchain time by hash
Gets the time identified by the time hash.

#### Request path
```
GET /time/<time-hash>
```

#### Request headers
None.

#### Request body schema
None.

#### Request example
```
GET /time/0000000000000000002443210198839565f8d40a6b897beac8669cf7ba629051
```

#### Response body schema
```json
{
  "time": "The logical blockchain time.",
  "hash": "The hash associated with the blockchain time, must be the same as the value given in query path."
}
```

#### Response body example
```json
{
  "time": 545236,
  "hash": "0000000000000000002443210198839565f8d40a6b897beac8669cf7ba629051"
}
```



### Fetch Sidetree transactions
Fetches Sidetree transactions in chronological order.

> Note: The call may not to return all Sidetree transactions in one batch, in which case the caller can use the transaction number of the last transaction in the returned batch to fetch subsequent transactions.

#### Request path
```
GET /transactions?since=<transaction-number>&transaction-time-hash=<transaction-time-hash>
```

#### Request headers
None.


#### Request query parameters
- `since`

  Optional. A transaction number. When not given, all Sidetree transactions since inception will be returned.
  When given, only Sidetree transactions after the specified transaction will be returned.

- `transaction-time-hash`

  Optional, but MUST BE given if `since` parameter is specified.

  This is the hash associated with the time the transaction specified by the `since` parameter is anchored on blockchain.
  Multiple transactions can have the same _transaction time_ and thus the same _transaction time hash_.

  The _transaction time hash_ helps the blockchain layer detect block reorganizations (temporary forks); `HTTP 400 Bad Request` with `invalid_transaction_number_or_time_hash` as the `code` parameter value in a JSON body is returned on such events.

#### Request example
```
GET /transactions?since=89&transaction-time-hash=0000000000000000002443210198839565f8d40a6b897beac8669cf7ba629051
```

#### Response body schema
The transactions array must always end with a complete block of data, but can start in the middle of a block if `since` query parameter is provided.
```json
{
  "moreTransactions": "True if there are more transactions beyond the returned batch. False otherwise.",
  "transactions": [
    {
      "transactionNumber": "A monotonically increasing number (need NOT be by 1) that identifies a Sidetree transaction.",
      "transactionTime": "The logical blockchain time this transaction is anchored. Used for protocol version selection.",
      "transactionTimeHash": "The hash associated with the transaction time.",
      "anchorString": "The string written to the blockchain for this transaction.",
      "transactionFeePaid": "A number representing the fee paid for this transaction.",
      "normalizedTransactionFee": "A number representing the normalized transaction fee used for proof-of-fee calculation.",
      "writer": "A string representing the writer of the transaction. Used in the value time lock calculations."
    },
    ...
  ]
}
```

#### Response example
```http
HTTP/1.1 200 OK

{
  "moreTransactions": false,
  "transactions": [
    {
      "transactionNumber": 89,
      "transactionTime": 545236,
      "transactionTimeHash": "0000000000000000002443210198839565f8d40a6b897beac8669cf7ba629051",
      "anchorString": "QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf",
      "transactionFeePaid": 40000,
      "normalizedTransactionFee": 100,
      "writer": "0af7eccefa3aaa37421914923b4a2034ed5a0ad0"
    },
    {
      "transactionNumber": 100,
      "transactionTime": 545236,
      "transactionTimeHash": "0000000000000000002443210198839565f8d40a6b897beac8669cf7ba629051",
      "anchorString": "QmbJGU4wNti6vNMGMosXaHbeMHGu9PkAUZtVBb2s2Vyq5d",
      "transactionFeePaid": 600000,
      "normalizedTransactionFee": 400,
      "writer": "0af7eccefa3aaa37421782523b4a2034ed5a0ad0"
    }
  ]
}
```

#### Response example - Block reorganization detected

```http
HTTP/1.1 400 Bad Request

{
  "code": "invalid_transaction_number_or_time_hash"
}
```


### Get first valid Sidetree transaction
Given a list of Sidetree transactions, returns the first transaction in the list that is valid. Returns 404 NOT FOUND if none of the given transactions are valid. This API is primarily used by the Sidetree core library to determine a transaction that can be used as a marker in time to reprocess transactions in the event of a block reorganization (temporary fork).


#### Request path
```http
POST /transactions/firstValid HTTP/1.1
```

#### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

#### Request body schema
```json
{
  "transactions": [
    {
      "transactionNumber": "The transaction to be validated.",
      "transactionTime": "The logical blockchain time this transaction is anchored. Used for protocol version selection.",
      "transactionTimeHash": "The hash associated with the transaction time.",
      "anchorString": "The string written to the blockchain for this transaction.",
      "transactionFeePaid": "A number representing the fee paid for this transaction.",
      "normalizedTransactionFee": "A number representing the normalized transaction fee used for proof-of-fee calculation.",
      "writer": "A string representing the writer of the transaction. Used in the value time lock calculations."
    },
    ...
  ]
}
```

#### Request example
```http
POST /transactions/firstValid HTTP/1.1
Content-Type: application/json

{
  "transactions": [
    {
      "transactionNumber": 19,
      "transactionTime": 545236,
      "transactionTimeHash": "0000000000000000002352597f8ec45c56ad19994808e982f5868c5ff6cfef2e",
      "anchorString": "Qm28BKV9iiM1ZNzMsi3HbDRHDPK5U2DEhKpCYhKk83UPEg",
      "transactionFeePaid": 5000,
      "normalizedTransactionFee": 100,
      "writer": "0af7eccefa3aaa37421914923b4a2034ed5a0ad0"
    },
    {
      "transactionNumber": 18,
      "transactionTime": 545236,
      "transactionTimeHash": "0000000000000000000054f9719ef6ca646e2503a9c5caac1c6ea95ffb4af587",
      "anchorString": "Qmb2wxUwvEpspKXU4QNxwYQLGS2gfsAuAE9LPcn5LprS1nb",
      "transactionFeePaid": 30,
      "normalizedTransactionFee": 10,
      "writer": "0af7eccefa3aaa37421782523b4a2034ed5a0ad0"

    },
    {
      "transactionNumber": 16,
      "transactionTime": 545200,
      "transactionTimeHash": "0000000000000000000f32c84291a3305ad9e5e162d8cc363420831ecd0e2800",
      "anchorString": "QmbBPdjWSdJoQGHbZDvPqHxWqqeKUdzBwMTMjJGeWyUkEzK",
      "transactionFeePaid": 50000,
      "normalizedTransactionFee": 150,
      "writer": "0af7eccefa3aaa87421782523b4a2034ed5a0ad0"
    },
    {
      "transactionNumber": 12,
      "transactionTime": 545003,
      "transactionTimeHash": "0000000000000000001e002080595267fe034d370897b7b506d119ad29da1541",
      "anchorString": "Qmss3gKdm9uU9YLx3MPRHQTcUq1CR1Xv9Zpdu7EBG9Pk9Y",
      "transactionFeePaid": 1000000,
      "normalizedTransactionFee": 200,
      "writer": "0af7eccefa3aaa87421782523b4a2034e23jdad0"
    },
    {
      "transactionNumber": 4,
      "transactionTime": 544939,
      "transactionTimeHash": "00000000000000000000100158f474719e5a319933856f7f464fcc65a3cb2253",
      "anchorString": "QmdcDrVPWy3ZXoZcuvFq7fDVqatks22MMqPAxDqXsZzGhy"
      "transactionFeePaid": 100,
      "normalizedTransactionFee": 50,
      "writer": "0af7asdifa3aaa87421782523b4a2034ed5a0ad0"
    }
  ]
}
```

#### Response body schema
```json
{
  "transactionNumber": "The transaction number of the first valid transaction in the given list",
  "transactionTime": "The logical blockchain time this transaction is anchored. Used for protocol version selection.",
  "transactionTimeHash": "The hash associated with the transaction time.",
  "anchorString": "The string written to the blockchain for this transaction.",
  "transactionFeePaid": "A number representing the fee paid for this transaction.",
  "normalizedTransactionFee": "A number representing the normalized transaction fee used for proof-of-fee calculation.",
  "writer": "A string representing the writer of the transaction. Used in the value time lock calculations."
}
```

#### Response example
```http
HTTP/1.1 200 OK

{
  "transactionNumber": 16,
  "transactionTime": 545200,
  "transactionTimeHash": "0000000000000000000f32c84291a3305ad9e5e162d8cc363420831ecd0e2800",
  "anchorString": "QmbBPdjWSdJoQGHbZDvPqHxWqqeKUdzBwMTMjJGeWyUkEzK",
  "transactionFeePaid": 50000,
  "normalizedTransactionFee": 50,
  "writer": "0af7eccefa3aaa87421782523b4a2034e23jdad0"
}
```

#### Response example - All transactions are invalid
```http
HTTP/1.1 404 NOT FOUND
```


### Write a Sidetree transaction
Writes a Sidetree transaction to the underlying blockchain.

Returns `HTTP 400 Bad Request` with the following values as the `code` parameter in the JSON body:

| Code                            | Description                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| spending_cap_per_period_reached | if with the given fee (derived from minimumFee) this node will exceed the spending limit as configured in the parameters.           |
| not_enough_balance_for_write     | if the wallet configured in the parameters does not have enough balance to complete the write operation.    |

#### Request path
```
POST /transactions
```

#### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

#### Request body schema
```json
{
  "minimumFee": "A number representing the minimum transaction fee to be paid to write this transaction to the blockchain. The actual fee is dynamically calculated and can be higher than this amount (but not lower).",
  "anchorString": "The string to be written to the blockchain for this transaction."
}
```

#### Request example
```http
POST /transactions HTTP/1.1

{
  "minimumFee": 200000,
  "anchorString": "QmbJGU4wNti6vNMGMosXaHbeMHGu9PkAUZtVBb2s2Vyq5d"
}
```

#### Response body schema
None.


### Fetch normalized transaction fee for proof-of-fee calculation.
Fetches the normalized transaction fee used for proof-of-fee calculation, given the blockchain time.

Returns `HTTP 400 Bad Request` with `blockchain_time_out_of_range` as the `code` parameter value in the JSON body if the given blockchain time is:
1. earlier than the genesis Sidetree blockchain time; or
1. later than the blockchain time of the latest block that the service has processed.

Returns `HTTP 500 Internal Server Error` with `normalized_fee_cannot_be_computed` as the `code` parameter value in the JSON body if the server is unable to compute the normalized fee.
#### Request path
```
GET /fee
```

#### Request path
```
GET /fee/<blockchain-time>
```

#### Request headers
None.

#### Request example
```
GET /fee/654321
```

#### Response body schema
```json
{
  "normalizedTransactionFee": "A number representing the normalized transaction fee used for proof-of-fee calculation."
}
```

#### Response example
```http
HTTP/1.1 200 OK

{
  "normalizedTransactionFee": 200000
}
```

#### Response example - Blockchain time given is out of computable range.	
```http
HTTP/1.1 400 Bad Request
{
  "code": "blockchain_time_out_of_range"
}
```

#### Response example - Error while computing the normalized fee.
```http
HTTP/1.1 500 Internal Server Error

{
  "code": "normalized_fee_cannot_be_computed"
}
```

### Fetch the lock object for value-time-lock calculation.
Fetches the lock object used for value-time-lock calculation, given the lock identifier.

Returns `HTTP 404 Not Found` with `value_time_lock_not_found` as the `code` parameter value in the JSON body if there was no lock found for the given lock identifier.

#### Request path
```
GET /locks/<lock-identifier>
```

#### Request headers
None.

#### Request example
```
GET /locks/gHasdfasodf23230o0jlk23323
```

#### Response body schema
```json
{
  "amountLocked": "A number representing the amount that was locked.",
  "identifier": "The string representing the identifier of the lock. This is the same value which is passed in the request path.",
  "lockTransactionTime": "A number representing the transaction time at which the lock became active.",
  "owner": "A string representing the owner of the lock.",
  "unlockTransactionTime": "A number representing the transaction time at which the lock became inactive."
}
```

#### Response example
```http
HTTP/1.1 200 OK

{
  "amountLocked": 1235696
  "identifier": "gHasdfasodf23230o0jlk23323",
  "lockTransactionTime": 167520,
  "owner": "Hhdofkeio209aanoiyyoiknadfsedsed652",
  "unlockTransactionTime": 167530
}
```

#### Response example - Lock not found.	
```http
HTTP/1.1 404 Not Found
{
  "code": "value_time_lock_not_found"
}
```

### Fetch the writer lock object used for batch writing.
Fetches the currently active writer lock object written on the blockchain by the Blockchain service. This is used for batch writing.

Returns `HTTP 404 Not Found` with the following values as the `code` parameter in the JSON body:

| Code                              | Description                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------|
| value_time_lock_not_found         | if there is no active lock on the blockchain.                  |
| value_time_lock_in_pending_state  | if there is a lock but is not confirmed on the blockchain yet. |

#### Request path
```
GET /writerlock
```

#### Request headers
None.

#### Request example
```
GET /writerlock
```

#### Response body schema
```json
{
  "amountLocked": "A number representing the amount that was locked.",
  "identifier": "The string representing the identifier of the lock.",
  "lockTransactionTime": "A number representing the transaction time at which the lock became active.",
  "owner": "A string representing the owner of the lock.",
  "unlockTransactionTime": "A number representing the transaction time at which the lock became inactive."
}
```

#### Response example
```http
HTTP/1.1 200 OK

{
  "amountLocked": 1235696
  "identifier": "gHasdfasodf23230o0jlk23323",
  "lockTransactionTime": 167520,
  "owner": "Hhdofkeio209aanoiyyoiknadfsedsed652",
  "unlockTransactionTime": 167530
}
```

#### Response example - Lock not found.	
```http
HTTP/1.1 404 Not Found
{
  "code": "value_time_lock_not_found"
}
```

#### Response example - Lock not yet confirmed.	
```http
HTTP/1.1 404 Not Found
{
  "code": "value_time_lock_in_pending_state"
}
```

### Fetch the current service version
Fetches the current version of the service. The service implementation defines the versioning scheme and its interpretation.

Returns the service _name_ and _version_ of the blockchain service.

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
{
  "name": "A string representing the name of the service",
  "version": "A string representing the version of currently running service."
}
```

#### Response example
```http
HTTP/1.1 200 OK

{
  "name": "bitcoin",
  "version": "1.0.0"
}
```

## Core Service Events

### `sidetree_batch_writer_loop_failure`
Occurs every time the batch writer fails a processing loop.

Event data:
```json
{
  "code": "Error code of the failure. Dependent on blockchain service implementation."
}
```

Event data: none

### `sidetree_batch_writer_loop_success`
Occurs every time the batch writer completes a processing loop.

Event data:
```json
{
  "batchSize": "The size of the batch written."
}
```

### `sidetree_blockchain_time_changed`
Occurs every time the underlying blockchain time changes.

Event data:
```json
{
  "time": "The logical blockchain time as an integer."
}
```

### `sidetree_download_manager_download`
Occurs every time an asynchronous content download has occurred regardless of success.

Event data:
```json
{
  "code": "The download result code."
}
```

### `sidetree_observer_block_reorganization`
Occurs every time the observer detects a block reorganization.

Event data: none

### `sidetree_observer_loop_failure`
Occurs every time the observer fails a processing loop.

Event data: none

### `sidetree_observer_loop_success`
Occurs every time the observer completes a processing loop.

Event data: none
