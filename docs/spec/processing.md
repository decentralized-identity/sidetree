## Transaction & Operation Processing

### Transaction Anchoring

Once an Anchor File, Map File, and associated Chunk Files have been assembled for a given set of operations, a reference to the [Anchor File](#anchor-file) must be embedded within the target ledger to enter the set of operations into the Sidetree implementation's global state. The following process:

1. Generate a transaction for the underlying ledger
2. Generate and include the following value, herein referred to as the [_Anchor String_](#anchor-string){id="anchor-string"}, within the transaction:
    1. Generate a numerical string (`'732'`) that represents the total number of operations present in the [Anchor File](#anchor-file) and [Map File](#map-file), herein referred to as the _Operation Count_.
    2. Using the [`CAS_URI_ALGORITHM`](#cas-uri-algorithm), generate a CID for the Anchor File, herein referred to as the _Anchor File CAS URI_.
    3. Join the _Operation Count_ and _Anchor File CAS URI_ with a `.` as follows:
        ```js
        "10000" + "." + "QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf"
        ```
    4. Embed the _Anchor String_ in the transaction such that it can be located and parsed by any party that traverses the history of the target ledger.
2. If the implementation implements a [per-op fee](#proof-of-fee), ensure the transaction includes the fee amount required for the number of operations being anchored.
3. Encode the transaction with any other data or values required for inclusion by the target ledger, and broadcast it.

### CAS File Propagation

To ensure other nodes of the implementation can retrieve the [operation files](#file-structures) required to ingest the included operations and update the states of the DIDs it contains, the implementer must ensure that the files associated with a given set of operations being anchored are available to peers seeking to request and replicate them across the CAS storage layer. Use the following procedure for propagating transaction-anchored CAS files:

1. If the underlying ledger is subject to an anchoring inclusion delay (e.g. the interval between blocks in a blockchain), implementers ****SHOULD**** wait until they receive a confirmation of inclusion (whatever that means for the target ledger) before exposing/propagating the [operation files](#file-structures) across the CAS network. (more about the reason for this in the note below)
2. After confirmation is received, implementers ****SHOULD**** use the most effective means of proactive propagation the [`CAS_PROTOCOL`](#cas-protocol) supports.
3. A Sidetree-based implementation node that anchors operations should not assume other nodes on the CAS network will indefinitely retain and propagate the [files](#file-structures) for a given set of operations they anchor. A node ****SHOULD**** retain and propagate any files related to the operations it anchors.

:::note CAS propagation delay
Most ledgers feature some delay between the broadcast of a transaction and the recorded inclusion of the transaction in the ledger's history. Because operation data included in the CAS files contains revealed commitment values for operations, propagating those files before confirmation of transaction inclusion exposes revealed commitment values to external entities who may download them prior to inclusion in the ledger. This means an attacker who learns of the revealed commitment value can craft invalid transactions that could be included before the legitimate operation the user is attempting to anchor. While this has no affect on proof-of-control security for a DID, an observing node would have to check the signatures of fraudulent transactions before the legitimate transaction is found, which could result in slower resolution processing for the target DID.
:::

### Transaction Processing

Regardless of the ledger system an implementer chooses, the implementer ****MUST**** be able to sequence Sidetree-specific transactions within it in a deterministic order, such that any observer can derive the same order if the same logic is applied. The implementer MUST, either at the native transaction level or by some means of logical evaluation, assign Sidetree-specific transactions a [_Transaction Number_](#transaction-number). [_Transaction Numbers_](#transaction-number) ****MUST**** be assigned to all Sidetree-specific transactions present in the underlying ledger after [`GENESIS_TIME`](#genesis-time), regardless of whether or not they are valid.

1. An implementer ****MUST**** develop implementation-specific logic that enables deterministic ordering and iteration of all protocol-related transactions in the underlying ledger, such that all operators of the implementation process them in the same order.
2. Starting at [`GENESIS_TIME`](#genesis-time), begin iterating transactions using the implementation-specific logic.
3. For each transaction found during iteration that is determined to be a protocol-related transaction, process the transaction as follows:
    1. Assign the transaction a _Transaction Number_.
    2. If the implementation supports enforcement value locking, and the transaction is encoded in accordance with the implementation's value locking format, skip the remaining steps and process the transaction as described in the [Proof of Fee](#proof-of-fee) section on [Value Locking](#value-locking).
    3. The [_Anchor String_](#anchor-string) ****MUST**** be formatted correctly - if it IS NOT, discard the transaction and continue iteration.
    4. If the implementation DOES NOT support enforcement of a [per-operation fee](#proof-of-fee), skip this step. If enforcement of a [per-operation fee](#proof-of-fee) is supported, ensure the transaction fee meets the [per-operation fee](#proof-of-fee) requirements for inclusion - if it DOES NOT, discard the transaction and continue iteration. 
    5. If the implementation DOES NOT support enforcement of [Value Locking](#value-locking), skip this step. If enforcement of [Value Locking](#value-locking) is supported, ensure the transaction's fee meets the [Value Locking](#value-locking) requirements for inclusion - if it does not, discard the transaction and continue iteration.
    6. Parse the [_Anchor String_](#anchor-string) to derive the _Operation Count_ and _Anchor File CAS URI_.
    7. Use the [`CAS_PROTOCOL`](#cas-protocol) to fetch the [Anchor File](#anchor-file) using the _Anchor File CAS URI_. If the file cannot be located, retain a reference that signifies the need to retry fetch of the file. If the file successfully retrieved, proceed to the next section on how to [process an Anchor File](#anchor-file-processing)

### Anchor File Processing

This sequence of rules and processing steps ****must**** be followed to correctly process an [Anchor File](#anchor-file):

1. The [Anchor File](#anchor-file) ****MUST NOT**** exceed the [`MAX_ANCHOR_FILE_SIZE`](#max-anchor-file-size) - if it does, cease processing, discard the file data, and retain a reference that the file is to be ignored.
2. The [Anchor File](#anchor-file) ****MUST**** validate against the protocol-defined [Anchor File](#anchor-file) schema and construction rules - if it DOES NOT, cease processing, discard the file data, and retain a reference that the file is to be ignored.
    - While this rule is articulated in the [Anchor File](#anchor-file) section of the specification, it should be emphasized to ensure accurate processing: an [Anchor File](#anchor-file) ****MUST NOT**** include multiple operations in the `operations` section of the [Anchor File](#anchor-file) for the same [DID Suffix](#did-suffix) - if any duplicates are found, cease processing, discard the file data, and retain a reference that the file is to be ignored.
3. If processing of rules 1 and 2 above resulted in successful validation of the Anchor File, initiate retrieval of the [Map File](#map-file) via the [`CAS_PROTOCOL`](#cas-protocol) using the [`map_file_uri`](#map-file-property) property's  _CAS URI_ value, if the [`map_file_uri`](#map-file-property) property is present. This is only a ****SUGGESTED**** point at which to begin retrieval of the Map File, not a blocking procedural step, so you may continue with processing before retrieval of the [Map File](#map-file) is complete.
4. Decompress the [Anchor File](#anchor-file) in accordance with the implementation's [`COMPRESSION_ALGORITHM`](#compression-algorithm).
5. Iterate the [_Anchor File Create Entries_](#anchor-file-create-entry), and for each entry, process as follows:
    1. Derive the [DID Suffix](#did-suffix) from the values present in the entry.
    2. Ensure the [DID Suffix](#did-suffix) of the operation entry has not been included in another valid operation that was previously processed in the scope of this Anchor File. If another previous, valid operation was already processed in the scope of this [Anchor File](#anchor-file) for the same DID, do not process the operation and move to the next operation in the array.
    3. Create an entry for the operation within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).
6. Iterate the [_Anchor File Recovery Entries_](#anchor-file-recovery-entry), and for each entry, process as follows:
    1. Ensure the [DID Suffix](#did-suffix) of the operation entry has not been included in another valid operation that was previously processed in the scope of this Anchor File. If another previous, valid operation was already processed in the scope of this [Anchor File](#anchor-file) for the same DID, do not process the operation and move to the next operation in the array.
    2. Create an entry for the operation within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).
7. Iterate the [Anchor File](#anchor-file) [_Deactivate Entries_](#anchor-file-deactivate-entry), and for each entry, process as follows:
    1. Ensure the [DID Suffix](#did-suffix) of the operation entry has not been included in another valid operation that was previously processed in the scope of this Anchor File. If another previous, valid operation was already processed in the scope of this [Anchor File](#anchor-file) for the same DID, do not process the operation and move to the next operation in the array.
    2. Create an entry for the operation within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).

    <!-- 2. Concatenate the [DID Suffix](#did-suffix) and the _Recovery Reveal Value_ together and validate the signature present in the entry against the concatenated string value. If the signature is valid, update retained references to the DID to deactivate it. If the signature is invalid, do not process the operation and move to the next operation in the array. -->
    
::: todo
Confirm how we handle ops where there was not a previous op found.
:::

### Map File Processing

This sequence of rules and processing steps ****must**** be followed to correctly process a Map File:

1. The [Map File](#map-file) ****MUST NOT**** exceed the [`MAX_MAP_FILE_SIZE`](#max-map-file-size) - if it does, cease processing, discard the file data, and retain a reference that the file is to be ignored.
2. The [Map File](#map-file) ****MUST**** validate against the protocol-defined [Map File](#map-file) schema and construction rules - if it DOES NOT, cease processing, discard the file data, and retain a reference that the file is to be ignored.
3. If processing of rules 1 and 2 above resulted in successful validation of the Map File, begin retrieval of the Chunk Files by iterating the `chunks` array and using the [`CAS_PROTOCOL`](#cas-protocol) to fetch each entry's `chunk_file_uri` (a _CAS URI_ based on the [`CAS_URI_ALGORITHM`](#cas-uri-algorithm)). This is only a ****SUGGESTED**** point at which to begin retrieval of the [Chunk Files](#chunk-files), not a blocking procedural step, so you may continue with processing before retrieval of the [Chunk Files](#chunk-files) is complete.
4. Decompress the [Map File](#map-file) in accordance with the implementation's [`COMPRESSION_ALGORITHM`](#compression-algorithm).
5. Iterate the [_Map File Update Entries_](#map-file-update-entry), and for each entry, process as follows:
    1. Ensure the [DID Suffix](#did-suffix) of the operation entry has not been included in another valid operation that was previously processed in the scope of the [Map File](#map-file) or its parent [Anchor File](#anchor-file). If another previous, valid operation was already processed in the scope of this [Anchor File](#anchor-file) for the same DID, do not process the operation and move to the next operation in the array.
    2. Create an entry for the operation within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).
6. If the node is in a [_Light Node_](#light-node) configuration, retain a reference to the [Chunk Files](#chunk-files) relative to the DIDs in the anchored batch for just-in-time fetch of the [Chunk Files](#chunk-files) during DID resolution.

### Core Proof File Processing

This sequence of rules and processing steps ****must**** be followed to correctly process an [Core Proof File](#core-proof-file):

1. The [Core Proof File](#core-proof-file) ****MUST NOT**** exceed the [`MAX_PROOF_FILE_SIZE`](#max-proof-file-size) - if it does, cease processing, discard the file data, and retain a reference that the file is to be ignored.
2. The [Core Proof File](#core-proof-file) ****MUST**** validate against the protocol-defined [Core Proof File](#core-proof-file) schema and construction rules - if it DOES NOT, cease processing, discard the file data, and retain a reference that the file is to be ignored.
3. Decompress the [Core Proof File](#core-proof-file) in accordance with the implementation's [`COMPRESSION_ALGORITHM`](#compression-algorithm).
4. Iterate any [_Core Proof File Recovery Entries_](#core-proof-file-recovery-entry) and [_Core Proof File Deactivate Entries_](#core-proof-file-recovery-entry) that may be present, and for each entry, process as follows:
    1. Ensure an operation for the related DID has not been included in another valid operation that was previously processed in the scope of the [Core Proof File](#core-proof-file) or its parent [Anchor File](#anchor-file). If another previous, valid operation was already processed in the scope of the [Core Proof File](#core-proof-file) or [Anchor File](#anchor-file) for the same DID, do not process the operation and move to the next operation in the array.
    2. Create an entry, or associate with an existing entry, the proof payload within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).

### Provisional Proof File Processing

This sequence of rules and processing steps ****must**** be followed to correctly process an [Provisional Proof File](#provisional-proof-file):

1. The [_Provisional Proof File_](#provisional-proof-file) ****MUST NOT**** exceed the [`MAX_PROOF_FILE_SIZE`](#max-proof-file-size) - if it does, cease processing, discard the file data, and retain a reference that the file is to be ignored.
2. The [_Provisional Proof File_](#provisional-proof-file) ****MUST**** validate against the protocol-defined [_Provisional Proof File_](#provisional-proof-file) schema and construction rules - if it DOES NOT, cease processing, discard the file data, and retain a reference that the file is to be ignored.
3. Decompress the [Provisional Proof File](#provisional-proof-file) in accordance with the implementation's [`COMPRESSION_ALGORITHM`](#compression-algorithm).
4. Iterate any [_Provisional Proof File Update Entries_](#provisional-proof-file-update-entry) that may be present, and for each entry, process as follows:
    1. Ensure an operation for the related DID has not been included in another valid operation that was previously processed in the scope of the [_Provisional Proof File_](#provisional-proof-file) or its parent [Anchor File](#anchor-file). If another previous, valid operation was already processed in the scope of the [_Provisional Proof File_](#provisional-proof-file) or [Anchor File](#anchor-file) for the same DID, do not process the operation and move to the next operation in the array.
    2. Create an entry, or associate with an existing entry, the proof payload within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).

### Chunk File Processing

This sequence of rules and processing steps ****must**** be followed to correctly process a Chunk File chunk:

1. The [Chunk File](#chunk-file) chunk ****MUST NOT**** exceed the [`MAX_CHUNK_FILE_SIZE`](#max-chunk-file-size) - if it does, cease processing, discard the file data, and retain a reference that the file is to be ignored.
2. The [Chunk File](#chunk-file) ****MUST**** validate against the protocol-defined [Chunk File](#chunk-file) schema and construction rules - if it DOES NOT, cease processing, discard the file data, and retain a reference that the file is to be ignored.
3. Decompress the [Chunk File](#chunk-file) in accordance with the implementation's [`COMPRESSION_ALGORITHM`](#compression-algorithm).
4. In order to process [_Chunk File Delta Entries_](#chunk-file-delta-entry) in relation to the DIDs they are bound to, they must be mapped back to the Create, Recovery, and Update operation entries present in the [Anchor File](#anchor-file) and [Map File](#map-file). To create this mapping, concatenate the [_Anchor File Create Entries_](#anchor-file-create-entry), [_Anchor File Recovery Entries_](#anchor-file-recovery-entry), [_Map File Update Entries_](#map-file-recovery-entry) into a single array, in that order, herein referred to as the [Operation Delta Mapping Array](#operation-delta-mapping-array){id="operation-delta-mapping-array"}. Pseudo-code example:
    ```js
    let mappingArray = [].concat(CREATE_ENTRIES, RECOVERY_ENTRIES, UPDATE_ENTRIES);
    ```
5. With the [Operation Delta Mapping Array](#operation-delta-mapping-array) assembled, iterate the [_Chunk File Delta Entries_](#chunk-file-delta-entry) from 0 index forward, processing each [_Chunk File Delta Entry_](#chunk-file-delta-entry) as follows:
    1. Identify the operation entry from the [Operation Delta Mapping Array](#operation-delta-mapping-array) at the same index as the current iteration and determine its [DID Suffix](#did-suffix) (for [_Anchor File Create Entries_](#anchor-file-create-entry), you will need to compute the [DID Suffix](#did-suffix)). This is the DID the current iteration element maps to.
    2. Store the current [_Chunk File Delta Entry_](#chunk-file-delta-entry) relative to its operation entry in the persistent storage area designated for the related [DID Suffix](#did-suffix).

::: note
The assembly and processing of Chunk Files will change in a future update to the protocol, to accommodate the introduction of multiple chunk files. The current protocol version is designed around one Chunk File, but the scaffolding is present to move to multiple Chunk Files as development progresses.
:::