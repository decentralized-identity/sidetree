## Transaction & Operation Processing

### Transaction Anchoring

Once an Anchor File, Map File, and associated Batch Files have been assembled for a given set of operations, a reference to the Anchor File must be embedded within the target ledger to enter the set of operations into the Sidetree implementation's global state. The following process:

1. Generate a transaction for the underlying ledger
2. Generate and include the following value, herein referred to as the [_Anchor String_](#anchor-string){id="anchor-string"}, within the transaction:
    1. Convert the total number of operations in the Batch File to a 4 byte little endian string, then `base64` encode the result, herein referred to as the _Operation Count_.
    2. Using the [`CID_ALGORITHM`](#cid-algorithm), generate a CID for the Anchor File, herein referred to as the _Anchor File CID_.
    3. Join the _Operation Count_ and _Anchor File CID_ with a `.` as follows:
        ```js
        "ECcAAA" + "." + "QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf"
        ```
    4. Embed the _Anchor String_ in the transaction such that it can be located and parsed by any party that traverses the history of the target ledger.
2. If the implementation implements a [per-op fee](#proof-of-fee), ensure the transaction includes the fee amount required for the number of operations being anchored.
3. Encode the transaction with any other data or values required for inclusion by the target ledger, and broadcast it.

### CAS File Propagation

To ensure other nodes of the implementation can retrieve the [operation files](#file-structures) required to ingest the included operations and update the states of the DIDs it contains, the implementer must ensure that the files associated with a given set of operations being anchored are available to peers seeking to request and replicate them across the CAS storage layer. Use the following procedure for propagating transaction-anchored CAS files:

1. If the underlying ledger is subject to a period of inclusion delay (e.g. block time), implementers SHOULD wait until they receive minimal confirmation of inclusion before exposing/propagating the [operation files](#file-structures) across the CAS network.
2. After confirmation is received, implementers SHOULD use the most effective means of proactive propagation the [`CAS_PROTOCOL`](#cas-protocol) supports.
3. A Sidetree-based implementation node that anchors operations should not assume other nodes on the CAS network will indefinitely retain and propagate the [files](#file-structures) for a given set of operations they anchor. A node SHOULD retain and propagate any files related to the operations it anchors.

### Transaction Processing

Regardless of the ledger system an implementer chooses, the implementer MUST be able to sequence Sidetree-specific transactions within it in a deterministic order, such that any observer can derive the same order if the same logic is applied. The implementer MUST, either at the native transaction level or by some means of logical evaluation, assign Sidetree-specific transactions a monotonically increasing number, herein referred to as the _Transaction Number_, which are themselves immutably, deterministically ordered. _Transaction Numbers_ MUST be assigned to all Sidetree-specific transactions present in the underlying ledger after [`GENESIS_TIME`](#genesis-time), regardless of whether or not they are valid.

1. An implementer MUST develop implementation-specific logic that enables deterministic ordering and iteration of all protocol-related transactions in the underlying ledger, such that all operators of the implementation process them in the same order.
2. Starting at [`GENESIS_TIME`](#genesis-time), begin iterating transactions using the implementation-specific logic.
3. For each transaction found during iteration that is determined to be a protocol-related transaction, process the transaction as follows:
    1. Assign the transaction a _Transaction Number_.
    2. If the implementation supports enforcement value locking, and the transaction is encoded in accordance with the implementation's value locking format, skip the remaining steps and process the transaction as described in the [Proof of Fee](#proof-of-fee) section on [Value Locking](#value-locking).
    3. The [_Anchor String_](#anchor-string) MUST be formatted correctly - if it IS NOT, discard the transaction and continue iteration.
    4. If the implementation DOES NOT support enforcement of a [per-operation fee](#proof-of-fee), skip this step. If enforcement of a [per-operation fee](#proof-of-fee) is supported, ensure the transaction fee meets the [per-operation fee](#proof-of-fee) requirements for inclusion - if it DOES NOT, discard the transaction and continue iteration. 
    5. If the implementation DOES NOT support enforcement of [Value Locking](#value-locking), skip this step. If enforcement of [Value Locking](#value-locking) is supported, ensure the transaction's fee meets the [Value Locking](#value-locking) requirements for inclusion - if it does not, discard the transaction and continue iteration.
    6. Parse the [_Anchor String_](#anchor-string) to derive the _Operation Count_ and _Anchor File CID_.
    7. Use the [`CAS_PROTOCOL`](#cas-protocol) to fetch the [Anchor File](#anchor-file) using the _Anchor File CID_. If the file cannot be located, retain a reference that signifies the need to retry fetch of the file. If the file successfully retrieved, proceed to the next section on how to [process an Anchor File](#anchor-file-processing)

### Anchor File Processing

The follow sequence of rules and processing steps must be followed to correctly process an Anchor File:

1. The anchor file MUST NOT exceed the [`MAX_ANCHOR_FILE_SIZE`](#max-anchor-file-size) - if it does, cease processing and discard the file data.
2. The anchor file MUST validate against the protocol-defined [Anchor File](#anchor-file) schema and construction rules - if it DOES NOT, cease processing and discard the file data.
    - While this rule is articulated in the [Anchor File](#anchor-file) section of the specification, it should be emphasized to ensure accurate processing: an [Anchor File](#anchor-file) MUST NOT include multiple operations in the `operations` section of the Anchor File for the same [DID Unique Suffixes](#did-unique-suffix) - if any duplicates are found, cease processing and discard the file data.
3. Iterate the [_Anchor File Create Entries_](#anchor-file-create-entry), and for each entry, process as follows:
    1. Derive the [DID Unique Suffixes](#did-unique-suffix) from the values present in the entry, and ensure there IS NOT an existing DID matching the same [DID Unique Suffixes](#did-unique-suffix) in the state-history of the implementation. If another valid [Create](#create) operation has already anchored a DID of the same [DID Unique Suffixes](#did-unique-suffix) in a transaction preceding the transaction that anchors the entries being iterated, do not process the operation and move to the next operation in the array.
    2. Persist an entry for the new DID within the implementation to hold this and future operational data, and retain the [_Initial Recovery Commitment_](#initial-recovery-commitment) and [_Initial Recovery Key](#initial-recovery-key) values from [_Anchor File Create Entries_](#anchor-file-create-entry) for use in validating a future Recovery operation.
4. Iterate the [_Anchor File Recovery Entries_](#anchor-file-recovery-entry), and for each entry, process as follows:
    1. Ensure the [DID Unique Suffixes](#did-unique-suffix) of the operation entry has not been included in another valid operation that was previously processed in the scope of this Anchor File. If another previous, valid operation was present for the same DID, do not process the operation and move to the next operation in the array.
    2. Persist an entry for the operation within implementation in reference to its [DID Unique Suffixes](#did-unique-suffix) in the ledger-relative chronological order.
5. Iterate the [_Anchor File Deactivate Entries_](#anchor-file-deactivate-entry), and for each entry, process as follows:
    1. Ensure the [DID Unique Suffixes](#did-unique-suffix) of the operation entry has not been included in another valid operation that was previously processed in the scope of this Anchor File. If another previous, valid operation was present for the same DID, do not process the operation and move to the next operation in the array.
    2. Concatenate the [DID Unique Suffixes](#did-unique-suffix) and the _Recovery Reveal Value_ together and validate the signature present in the entry against the concatenated string value. If the signature is valid, update retained references to the DID to deactivate it. If the signature is invalid, do not process the operation and move to the next operation in the array.
    

::: todo
Make sure we do allow multiple ops being processed if some are invalid.
:::

::: todo
Confirm how we handle ops where there was not a previous op found.
:::

1. _Anchor file_ validation rules:
   1. The anchor file must strictly follow the schema defined by the protocol. An anchor file with missing or additional properties is invalid.
   1. The anchor file fetched from CAS must not exceed the maximum allowed anchor file size.
   1. Must use the hashing algorithm specified by the protocol.
   1. All DID unique suffixes specified in the anchor file must be unique.
1. _Batch file_ validation rules:
   1. The batch file must strictly follow the schema defined by the protocol. A batch file with missing or additional properties is invalid.
   1. The batch file must not exceed the maximum allowed batch file size.
   1. Must use the hashing algorithm specified by the protocol.
   1. DID unique suffixes found in the batch file must match DID unique suffixes found in anchor file exactly and in same order.
1. The transaction must meet the proof-of-fee requirements defined by the protocol.
1. Every operation in the batch file must adhere to the following requirements to be considered a _well-formed operation_, one _not-well-formed_ operation in the batch file renders the entire transaction invalid:

   1. Follow the operation schema defined by the protocol, it must not have missing or additional properties.

   1. Must not exceed the operation size specified by the protocol.

   1. Must use the hashing algorithm specified by the protocol.