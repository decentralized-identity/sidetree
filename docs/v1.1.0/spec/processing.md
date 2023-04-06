## Transaction & Operation Processing

### Transaction Anchoring

Once an Core Index File, Provisional Index File, and associated Chunk Files have been assembled for a given set of operations, a reference to the [Core Index File](#core-index-file) must be embedded within the target anchoring system to enter the set of operations into the Sidetree implementation's global state. The following process:

1. Generate a transaction for the underlying anchoring system
2. Generate and include the following value, herein referred to as the [_Anchor String_](#anchor-string){id="anchor-string"}, within the transaction:
    1. Generate a numerical string (`'732'`) that represents the total number of operations present in the [Core Index File](#core-index-file) and [Provisional Index File](#provisional-index-file), herein referred to as the _Operation Count_.
    2. Using the [`CAS_URI_ALGORITHM`](#cas-uri-algorithm), generate a CID for the Core Index File, herein referred to as the _Core Index File CAS URI_.
    3. Join the _Operation Count_ and _Core Index File CAS URI_ with a `.` as follows:
        ```js
        "10000" + "." + "QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf"
        ```
    4. Embed the _Anchor String_ in the transaction such that it can be located and parsed by any party that traverses the history of the target anchoring system.
2. If the implementation implements a [per-op fee](#proof-of-fee), ensure the transaction includes the fee amount required for the number of operations being anchored.
3. Encode the transaction with any other data or values required for inclusion by the target anchoring system, and broadcast it.

### CAS File Propagation

To ensure other nodes of the implementation can retrieve the [operation files](#file-structures) required to ingest the included operations and update the states of the DIDs it contains, the implementer must ensure that the files associated with a given set of operations being anchored are available to peers seeking to request and replicate them across the CAS storage layer. Use the following procedure for propagating transaction-anchored CAS files:

1. If the underlying anchoring system is subject to an anchoring inclusion delay (e.g. the interval between blocks in a blockchain), implementers ****SHOULD**** wait until they receive a confirmation of inclusion (whatever that means for the target anchoring system) before exposing/propagating the [operation files](#file-structures) across the CAS network. (more about the reason for this in the note below)
2. After confirmation is received, implementers ****SHOULD**** use the most effective means of proactive propagation that the [`CAS_PROTOCOL`](#cas-protocol) supports.
3. A Sidetree-based implementation node that anchors operations should not assume other nodes on the CAS network will indefinitely retain and propagate the [files](#file-structures) for a given set of operations they anchor. A node ****SHOULD**** retain and propagate any files related to the operations it anchors.

:::note CAS propagation delay
Most anchoring systems feature some delay between the broadcast of a transaction and the recorded inclusion of the transaction in the anchoring system's history. Because operation data included in the CAS files contains revealed commitment values for operations, propagating those files before confirmation of transaction inclusion exposes revealed commitment values to external entities who may download them prior to inclusion in the anchoring system. This means an attacker who learns of the revealed commitment value can craft invalid transactions that could be included before the legitimate operation the user is attempting to anchor. While this has no affect on proof-of-control security for a DID, an observing node would have to check the signatures of fraudulent transactions before the legitimate transaction is found, which could result in slower resolution processing for the target DID.
:::

### Transaction Processing

Regardless of the anchoring system an implementer chooses, the implementer ****MUST**** be able to sequence Sidetree-specific transactions within it in a deterministic order, such that any observer can derive the same order if the same logic is applied. The implementer MUST, either at the native transaction level or by some means of logical evaluation, assign Sidetree-specific transactions a [_Transaction Number_](#transaction-number). [_Transaction Numbers_](#transaction-number) ****MUST**** be assigned to all Sidetree-specific transactions present in the underlying anchoring system after [`GENESIS_TIME`](#genesis-time), regardless of whether or not they are valid.

1. An implementer ****MUST**** develop implementation-specific logic that enables deterministic ordering and iteration of all protocol-related transactions in the underlying anchoring system, such that all operators of the implementation process them in the same order.
2. Starting at [`GENESIS_TIME`](#genesis-time), begin iterating transactions using the implementation-specific logic.
3. For each transaction found during iteration that is determined to be a protocol-related transaction, process the transaction as follows:
    1. Assign the transaction a _Transaction Number_.
    2. If the implementation supports enforcement value locking, and the transaction is encoded in accordance with the implementation's value locking format, skip the remaining steps and process the transaction as described in the [Proof of Fee](#proof-of-fee) section on [Value Locking](#value-locking).
    3. The [_Anchor String_](#anchor-string) ****MUST**** be formatted correctly - if it is not, discard the transaction and continue iteration.
    4. If the implementation DOES NOT support enforcement of a [per-operation fee](#proof-of-fee), skip this step. If enforcement of a [per-operation fee](#proof-of-fee) is supported, ensure the transaction fee meets the [per-operation fee](#proof-of-fee) requirements for inclusion - if it DOES NOT, discard the transaction and continue iteration. 
    5. If the implementation DOES NOT support enforcement of [Value Locking](#value-locking), skip this step. If enforcement of [Value Locking](#value-locking) is supported, ensure the transaction's fee meets the [Value Locking](#value-locking) requirements for inclusion - if it does not, discard the transaction and continue iteration.
    6. Parse the [_Anchor String_](#anchor-string) to derive the _Operation Count_ and _Core Index File CAS URI_.
    7. Use the [`CAS_PROTOCOL`](#cas-protocol) to fetch the [Core Index File](#core-index-file) using the _Core Index File CAS URI_. If the file cannot be located, retain a reference that signifies the need to retry fetch of the file. If the file successfully retrieved, proceed to the next section on how to [process an Core Index File](#core-index-file-processing)

### Core Index File Processing

This sequence of rules and processing steps ****must**** be followed to correctly process an [Core Index File](#core-index-file):

1. The [Core Index File](#core-index-file) ****MUST NOT**** exceed the [`MAX_CORE_INDEX_FILE_SIZE`](#max-core-index-file-size) - if it does, cease processing, discard the file data, and retain a reference that the file is to be ignored.
2. Decompress the [Core Index File](#core-index-file) in accordance with the implementation's [`COMPRESSION_ALGORITHM`](#compression-algorithm), within the memory allocation limit specified for decompression in accordance with the implementation-defined [`MAX_MEMORY_DECOMPRESSION_FACTOR`](#max-memory-decompression-factor).
3. The [Core Index File](#core-index-file) ****MUST**** validate against the protocol-defined [Core Index File](#core-index-file) schema and construction rules - if it DOES NOT, cease processing, discard the file data, and retain a reference that the whole batch of anchored operations and all its files are to be ignored.
    - While this rule is articulated in the [Core Index File](#core-index-file) section of the specification, it should be emphasized to ensure accurate processing: an [Core Index File](#core-index-file) ****MUST NOT**** include multiple operations in the `operations` section of the [Core Index File](#core-index-file) for the same [DID Suffix](#did-suffix) - if any duplicates are found, cease processing, discard the file data, and retain a reference that the whole batch of anchored operations and all its files are to be ignored.
4. If processing of rules 1 and 2 above resulted in successful validation of the Core Index File, initiate retrieval of the [Provisional Index File](#provisional-index-file) via the [`CAS_PROTOCOL`](#cas-protocol) using the [`provisionalIndexFileUri`](#provisional-index-file-property) property's  _CAS URI_ value, if the [`provisionalIndexFileUri`](#provisional-index-file-property) property is present. This is only a ****SUGGESTED**** point at which to begin retrieval of the Provisional Index File, not a blocking procedural step, so you may continue with processing before retrieval of the [Provisional Index File](#provisional-index-file) is complete.
5. Iterate the [_Core Index File Create Entries_](#core-index-file-create-entry), and for each entry, process as follows:
    1. Derive the [DID Suffix](#did-suffix) from the values present in the entry.
    2. Ensure the [DID Suffix](#did-suffix) of the operation entry has not been included in another valid operation that was previously processed in the scope of this Core Index File.
    3. Create an entry for the operation within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).
6. Iterate the [_Core Index File Recovery Entries_](#core-index-file-recovery-entry), and for each entry, process as follows:
    1. Ensure the [DID Suffix](#did-suffix) of the operation entry has not been included in another valid operation that was previously processed in the scope of this Core Index File.
    2. Create an entry for the operation within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).
7. Iterate the [Core Index File](#core-index-file) [_Deactivate Entries_](#core-index-file-deactivate-entry), and for each entry, process as follows:
    1. Ensure the [DID Suffix](#did-suffix) of the operation entry has not been included in another valid operation that was previously processed in the scope of this Core Index File.
    2. Create an entry for the operation within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).
    
### Provisional Index File Processing

This sequence of rules and processing steps ****must**** be followed to correctly process a Provisional Index File:

1. The [Provisional Index File](#provisional-index-file) ****MUST NOT**** exceed the [`MAX_PROVISIONAL_INDEX_FILE_SIZE`](#max-provisional-index-file-size) - if it does, cease processing, discard the file data, and retain a reference that the file is to be ignored.
2. Decompress the [Provisional Index File](#provisional-index-file) in accordance with the implementation's [`COMPRESSION_ALGORITHM`](#compression-algorithm), within the memory allocation limit specified for decompression in accordance with the implementation-defined [`MAX_MEMORY_DECOMPRESSION_FACTOR`](#max-memory-decompression-factor).
3. The [Provisional Index File](#provisional-index-file) ****MUST**** validate against the protocol-defined [Provisional Index File](#provisional-index-file) schema and construction rules - if it DOES NOT, cease processing, discard the file data, and retain a reference that all Provisional-type files and their operations are to be ignored.
4. If processing of rules 1 and 2 above resulted in successful validation of the Provisional Index File, begin retrieval of the Chunk Files by iterating the `chunks` array and using the [`CAS_PROTOCOL`](#cas-protocol) to fetch each entry's `chunkFileUri` (a _CAS URI_ based on the [`CAS_URI_ALGORITHM`](#cas-uri-algorithm)). This is only a ****SUGGESTED**** point at which to begin retrieval of the [Chunk Files](#chunk-files), not a blocking procedural step, so you may continue with processing before retrieval of the [Chunk Files](#chunk-files) is complete.
5. Iterate the [_Provisional Index File Update Entries_](#provisional-index-file-update-entry), and for each entry, process as follows:
    1. Ensure the [DID Suffix](#did-suffix) of the operation entry has not been included in another valid operation that was previously processed in the scope of the [Provisional Index File](#provisional-index-file) or its parent [Core Index File](#core-index-file).
    2. Create an entry for the operation within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).
6. If the node is in a [_Light Node_](#light-node) configuration, retain a reference to the [Chunk Files](#chunk-files) relative to the DIDs in the anchored batch for just-in-time fetch of the [Chunk Files](#chunk-files) during DID resolution.

### Core Proof File Processing

This sequence of rules and processing steps ****must**** be followed to correctly process an [Core Proof File](#core-proof-file):

1. The [Core Proof File](#core-proof-file) ****MUST NOT**** exceed the [`MAX_PROOF_FILE_SIZE`](#max-proof-file-size) - if it does, cease processing, discard the file data, and retain a reference that the whole batch of anchored operations and all its files are to be ignored.
2. Decompress the [Core Proof File](#core-proof-file) in accordance with the implementation's [`COMPRESSION_ALGORITHM`](#compression-algorithm), within the memory allocation limit specified for decompression in accordance with the implementation-defined [`MAX_MEMORY_DECOMPRESSION_FACTOR`](#max-memory-decompression-factor).
3. The [Core Proof File](#core-proof-file) ****MUST**** validate against the protocol-defined [Core Proof File](#core-proof-file) schema and construction rules - if it DOES NOT, cease processing, discard the file data, and retain a reference that the whole batch of anchored operations and all its files are to be ignored.
4. Iterate any [_Core Proof File Recovery Entries_](#core-proof-file-recovery-entry) and [_Core Proof File Deactivate Entries_](#core-proof-file-recovery-entry) that may be present, and for each entry, process as follows:
    1. Ensure an operation for the related DID has not been included in another valid operation that was previously processed in the scope of the [Core Proof File](#core-proof-file) or its parent [Core Index File](#core-index-file).
    2. Create an entry, or associate with an existing entry, the proof payload within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).

### Provisional Proof File Processing

This sequence of rules and processing steps ****must**** be followed to correctly process an [Provisional Proof File](#provisional-proof-file):

1. The [_Provisional Proof File_](#provisional-proof-file) ****MUST NOT**** exceed the [`MAX_PROOF_FILE_SIZE`](#max-proof-file-size) - if it does, cease processing, discard the file data, and retain a reference that all Provisional-type files and their operations are to be ignored.
2. Decompress the [Provisional Proof File](#provisional-proof-file) in accordance with the implementation's [`COMPRESSION_ALGORITHM`](#compression-algorithm), within the memory allocation limit specified for decompression in accordance with the implementation-defined [`MAX_MEMORY_DECOMPRESSION_FACTOR`](#max-memory-decompression-factor).
3. The [_Provisional Proof File_](#provisional-proof-file) ****MUST**** validate against the protocol-defined [_Provisional Proof File_](#provisional-proof-file) schema and construction rules - if it DOES NOT, cease processing, discard the file data, and retain a reference that all Provisional-type files and their operations are to be ignored.
4. Iterate any [_Provisional Proof File Update Entries_](#provisional-proof-file-update-entry) that may be present, and for each entry, process as follows:
    1. Ensure an operation for the related DID has not been included in another valid operation that was previously processed in the scope of the [_Provisional Proof File_](#provisional-proof-file) or its parent [Core Index File](#core-index-file). If another previous, valid operation was already processed in the scope of the [_Provisional Proof File_](#provisional-proof-file) or [Core Index File](#core-index-file) for the same DID, do not process the operation and move to the next operation in the array.
    2. Create an entry, or associate with an existing entry, the proof payload within the _Operation Storage_ area relative to the [DID Suffix](#did-suffix).

### Chunk File Processing

This sequence of rules and processing steps ****must**** be followed to correctly process a Chunk File chunk:

1. The [Chunk File](#chunk-file) chunk ****MUST NOT**** exceed the [`MAX_CHUNK_FILE_SIZE`](#max-chunk-file-size) - if it does, cease processing, discard the file data, and retain a reference that the file is to be ignored.
2. Decompress the [Chunk File](#chunk-file) in accordance with the implementation's [`COMPRESSION_ALGORITHM`](#compression-algorithm), within the memory allocation limit specified for decompression in accordance with the implementation-defined [`MAX_MEMORY_DECOMPRESSION_FACTOR`](#max-memory-decompression-factor).
3. The [Chunk File](#chunk-file) ****MUST**** validate against the protocol-defined [Chunk File](#chunk-file) schema and construction rules - if it DOES NOT, cease processing, discard the file data, and retain a reference that the file is to be ignored.
4. The [canonicalized](#json-canonicalization-scheme) buffer of each [Chunk File](#chunk-file) delta entry ****must not**** exceed the [`MAX_DELTA_SIZE`](#max-delta-size). If any deltas entries exceed the maximum size cease processing, discard the file data, and retain a reference that the file is to be ignored.
5. In order to process [_Chunk File Delta Entries_](#chunk-file-delta-entry) in relation to the DIDs they are bound to, they must be mapped back to the Create, Recovery, and Update operation entries present in the [Core Index File](#core-index-file) and [Provisional Index File](#provisional-index-file). To create this mapping, concatenate the [_Core Index File Create Entries_](#core-index-file-create-entry), [_Core Index File Recovery Entries_](#core-index-file-recovery-entry), [_Provisional Index File Update Entries_](#provisional-index-file-recovery-entry) into a single array, in that order, herein referred to as the [Operation Delta Mapping Array](#operation-delta-mapping-array){id="operation-delta-mapping-array"}. Pseudo-code example:
    ```js
    let mappingArray = [].concat(CREATE_ENTRIES, RECOVERY_ENTRIES, UPDATE_ENTRIES);
    ```
6. With the [Operation Delta Mapping Array](#operation-delta-mapping-array) assembled, iterate the [_Chunk File Delta Entries_](#chunk-file-delta-entry) from 0 index forward, processing each [_Chunk File Delta Entry_](#chunk-file-delta-entry) as follows:
    1. Identify the operation entry from the [Operation Delta Mapping Array](#operation-delta-mapping-array) at the same index as the current iteration and determine its [DID Suffix](#did-suffix) (for [_Core Index File Create Entries_](#core-index-file-create-entry), you will need to compute the [DID Suffix](#did-suffix)). This is the DID the current iteration element maps to.
    2. Store the current [_Chunk File Delta Entry_](#chunk-file-delta-entry) relative to its operation entry in the persistent storage area designated for the related [DID Suffix](#did-suffix).

::: note
The assembly and processing of Chunk Files will change in a future update to the protocol to accommodate the introduction of multiple chunk files. The current protocol version is designed around one Chunk File, but the scaffolding is present to move to multiple Chunk Files as development progresses.
:::
