
## File Structures

The protocol defines the following three file structures, which house DID operation data and are designed to support key functionality to enable light node configurations, minimize permanently retained data, and ensure performant resolution of DIDs.

<img src="diagrams/file-topology.svg" style="display: block; margin: 0 auto; padding: 2em 0; width: 100%; max-width: 620px;" />

### Core Index File

Core Index Files contain [Create](#create), [Recover](#recover), and [Deactivate](#deactivate) operation values, as well as a CAS URI for the related [Provisional Index File](#provisional-index-file) (detailed below). As the name suggests, Core Index Files are anchored to the target anchoring system via embedding a CAS URI in the anchoring system's transactional history.

::: example
```json
{
  "coreProofFileUri": CAS_URI,
  "provisionalIndexFileUri": CAS_URI,
  "writerLockId": OPTIONAL_LOCKING_VALUE,
  "operations": {
    "create": [
      {
        "suffixData": {
          "type": TYPE_STRING,
          "deltaHash": DELTA_HASH,
          "recoveryCommitment": COMMITMENT_HASH
        }
      },
      {...}
    ],
    "recover": [
      {
        "didSuffix": SUFFIX_STRING,
        "revealValue": MULTIHASH_OF_JWK
      },
      {...}
    ],
    "deactivate": [
      {
        "didSuffix": SUFFIX_STRING,
        "revealValue": MULTIHASH_OF_JWK
      },
      {...}
    ]
  }
}
```
:::

A valid [Core Index File](#core-index-file) is a JSON document that ****MUST NOT**** exceed the [`MAX_CORE_INDEX_FILE_SIZE`](#max-core-index-file-size). Any unknown properties in this file not defined by this specification or specifically permitted by the implementer, ****MUST**** result in an invalidation of the entire file.

The [Core Index File](#core-index-file) JSON document is composed as follows:

1. The [Core Index File](#core-index-file) ****MUST**** contain a [`provisionalIndexFileUri`](#provisional-index-file-uri){id="provisional-index-file-uri"} property if the batch of transactions being anchored contains any Create, Recovery, or Update operations, and its value ****MUST**** be a _CAS URI_ for the related Provisional Index File. If the batch of transactions being anchored is only comprised of Deactivate operations, the [`provisionalIndexFileUri`](#provisional-index-file-property) property ****MUST NOT**** be present.
2. The [Core Index File](#core-index-file) ****MUST**** contain a [`coreProofFileUri`](#core-proof-file-uri){id="core-proof-file-uri"} property if the batch of transactions being anchored contains any Recovery or Deactivate operations, and its value ****MUST**** be a _CAS URI_ for the related [Core Proof File](#core-proof-file).
4. The [Core Index File](#core-index-file) ****MAY**** contain a [`writerLockId`](#writer-lock-property){id="writer-lock-property"} if the implementation chooses to implement an mechanism that requires embedded anchoring information, and if present, its value ****MUST**** comply with the specifications of the implementation.
5. If the set of operations to be anchored contain any [Create](#create), [Recover](#recover), or [Deactivate](#deactivate) operations, the [Core Index File](#core-index-file) ****MUST**** contain an `operations` property, and its value ****MUST**** be an object, composed as follows:
    - If there are any [Create](#create) operations to be included in the Core Index File:
      1. The `operations` object ****MUST**** include a `create` property, and its value ****MUST**** be an array.
      2. For each [Create](#create) operation to be included in the `create` array, herein referred to as [_Core Index File Create Entries_](#core-index-file-create-entry){id="core-index-file-create-entry"}, use the following process to compose and include a JSON object for each entry:
          - Each object must contain a `suffixData` property, and its value ****MUST**** be a [_Create Operation Suffix Data Object_](#create-suffix-data-object).
      3. The [Core Index File](#core-index-file) ****MUST NOT**** include multiple [Create](#create) operations that produce the same [DID Suffix](#did-suffix).
    - If there are any [Recovery](#recover) operations to be included in the Core Index File:
      1. The `operations` object ****MUST**** include a `recover` property, and its value ****MUST**** be an array.
      2. For each [Recovery](#recover) operation to be included in the `recover` array, herein referred to as [_Core Index File Recovery Entries_](#core-index-file-recovery-entry){id="core-index-file-recovery-entry"}, use the following process to compose and include entries:
          - The object ****MUST**** contain a `didSuffix` property, and its value ****MUST**** be the [DID Suffix](#did-suffix) of the DID the operation pertains to. An [Core Index File](#core-index-file) ****MUST NOT**** contain more than one operation of any type with the same [DID Suffix](#did-suffix).
          - The object ****MUST**** contain a `revealValue` property, and its value ****MUST**** be the [`REVEAL_VALUE`](#reveal-value) of the last update commitment.
    - If there are any [Deactivate](#deactivate) operations to be included in the Core Index File:
      1. The `operations` object ****MUST**** include a `deactivate` property, and its value ****MUST**** be an array.
      2. For each [Deactivate](#deactivate) operation to be included in the `deactivate` array, use the following process to compose and include entries:
          - The object ****MUST**** contain a `didSuffix` property, and its value ****MUST**** be the [DID Suffix](#did-suffix) of the DID the operation pertains to. An [Core Index File](#core-index-file) ****MUST NOT**** contain more than one operation of any type with the same [DID Suffix](#did-suffix).
          - The object ****MUST**** contain a `revealValue` property, and its value ****MUST**** be the [`REVEAL_VALUE`](#reveal-value) of the last update commitment.

### Provisional Index File

Provisional Index Files contain [Update](#update) operation proving data, as well as CAS URI links to [Chunk Files](#chunk-files).

::: example
```json
{
  "provisionalProofFileUri": CAS_URI,
  "chunks": [
    { "chunkFileUri": CAS_URI },
    {...}
  ],
  "operations": {
    "update": [
      {
        "didSuffix": SUFFIX_STRING,
        "revealValue": MULTIHASH_OF_JWK
      },
      {...}
    ]
  }
}
```
:::

A valid [Provisional Index File](#provisional-index-file) is a JSON document that ****MUST NOT**** exceed the [`MAX_PROVISIONAL_INDEX_FILE_SIZE`](#max-provisional-index-file-size). Any unknown properties in this file not defined by this specification or specifically permitted by the implementer, ****MUST**** result in an invalidation of the entire file.

The [Provisional Index File](#provisional-index-file) JSON document is composed as follows:

1. The [Provisional Index File](#provisional-index-file) ****MUST**** contain a [`provisionalProofFileUri`](#provisional-proof-file-uri){id="provisional-proof-file-uri"} property if the batch of transactions being anchored contains any Update operations, and its value ****MUST**** be a _CAS URI_ for the related [Provisional Proof File](#provisional-proof-file).
2. The [Provisional Index File](#provisional-index-file) ****MUST**** contain a `chunks` property, and its value ****MUST**** be an array of _Chunk Entries_ for the related delta data for a given chunk of operations in the batch. Future versions of the protocol will specify a process for separating the operations in a batch into multiple _Chunk Entries_, but for this version of the protocol there ****MUST**** be only one _Chunk Entry_ present in the array. _Chunk Entry_ objects are composed as follows:
    1. The _Chunk Entry_ object ****MUST**** contain a [`chunkFileUri`](#chunk-file-uri) property, and its value ****MUST**** be a URI representing the corresponding CAS file entry, generated via the [`CAS_URI_ALGORITHM`](#cas-uri-algorithm).
3. If there are any operation entries to be included in the [Provisional Index File](#provisional-index-file) (currently only Update operations), the [Provisional Index File](#provisional-index-file) ****MUST**** include an `operations` property, and its value ****MUST**** be an object composed as follows:
    - If there are any [Update](#update) entries to be included:
      1. The `operations` object ****MUST**** include an `update` property, and its value ****MUST**** be an array.
      2. For each [Update](#update) operation to be included in the `update` array, herein referred to as [Provisional Index File Update Entries](#provisional-index-file-update-entry){id="provisional-index-file-update-entry"}, use the following process to compose and include entries:
          - The object ****MUST**** contain an `didSuffix` property, and its value ****MUST**** be the [DID Suffix](#did-suffix) of the DID the operation pertains to, with a maximum length as specified by the [`MAX_OPERATION_HASH_LENGTH`](#max-operation-hash-length).
          - The object ****MUST**** contain a `revealValue` property, and its value ****MUST**** be the [`REVEAL_VALUE`](#reveal-value) of the last update commitment, with a maximum length as specified by the [`MAX_OPERATION_HASH_LENGTH`](#max-operation-hash-length).

### Core Proof File

Core Proof Files are [compressed](#compression-algorithm) JSON Documents containing the cryptographic proofs (signatures, hashes, etc.) that form the signature-chained backbone for the state lineages of all DIDs in the system. The cryptographic proofs present in Core Proof Files also link a given operation to its verbose state data, which resides in an related [Chunk File](#chunk-files).

::: example Core Proof File
```json
{
  "operations": {
    "recover": [
      {
        "signedData": {
          "protected": {...},
          "payload": {
            "recoveryCommitment": COMMITMENT_HASH,
            "recoveryKey": JWK_OBJECT,
            "deltaHash": DELTA_HASH
          },
          "signature": SIGNATURE_STRING
        }
      },
      {...}
    ],
    "deactivate": [
      {
        "signedData": {
          "protected": {...},
          "payload": {
            "didSuffix": SUFFIX_STRING,
            "recoveryKey": JWK_OBJECT
          },
          "signature": SIGNATURE_STRING
        }
      },
      {...}
    ]
  }
}
```
:::

Any unknown properties in this file not defined by this specification or specifically permitted by the implementer, ****MUST**** result in an invalidation of the entire file.

In this version of the protocol, [Core Proof Files](#core-proof-file) are constructed as follows:

1. The Core Proof File ****MUST**** include an `operations` property, and its value ****MUST**** be an object containing cryptographic proof entries for any Recovery and Deactivate operations to be included in a batch. Include the Proof Entries as follows: 
    - If there are any [Recovery](#recover) entries to be included:
      1. The `operations` object ****MUST**** include a `recover` property, and its value ****MUST**** be an array.
      2. For each [Recovery](#recover) entry to be included in the `recover` array, herein referred to as the [_Core Proof File Recovery Entry_](#core-proof-file-recovery-entry), include the operation's [_Recovery Operation Signed Data Object_](#recovery-signed-data-object) in the same index position of the operation's matching [_Core Index File Create Entry_](#core-index-file-create-entry).
    - If there are any [Deactivate](#deactivate) entries to be included:
      1. The `operations` object ****MUST**** include a `deactivate` property, and its value ****MUST**** be an array.
      2. For each [Deactivate](#deactivate) entry to be included in the `deactivate` array, herein referred to as the [_Core Proof File Deactivate Entry_](#core-proof-file-deactivate-entry), include the operation's [_Deactivate Operation Signed Data Object_](#deactivate-signed-data-object) in the same index position of the operation's matching [_Core Index File Deactivate Entry_](#core-index-file-deactivate-entry).

### Provisional Proof File

Provisional Proof Files are [compressed](#compression-algorithm) JSON Documents containing the cryptographic proofs (signatures, hashes, etc.) for all the (eventually) prunable DID operations in the system. The cryptographic proofs present in Provisional Proof Files also link a given operation to its verbose state data, which resides in an related [Chunk File](#chunk-files).

::: example Provisional Proof File
```json
{
  "operations": {
    "update": [
      {
        "signedData": {
          "protected": {...},
          "payload": {
            "updateKey": JWK_OBJECT,
            "deltaHash": DELTA_HASH
          },
          "signature": SIGNATURE_STRING
        }
      },
      {...}
    ]
  }
}
```
:::

Any unknown properties in this file not defined by this specification or specifically permitted by the implementer, ****MUST**** result in an invalidation of the entire file.

In this version of the protocol, [Provisional Proof Files](#provisional-proof-file) are constructed as follows:

1. The Provisional Proof File ****MUST**** include an `operations` property, and its value ****MUST**** be an object containing cryptographic proof entries for any Recovery and Deactivate operations to be included in a batch. Include the Proof Entries as follows: 
    - If there are any [Update](#update) entries to be included:
      1. The `operations` object ****MUST**** include a `update` property, and its value ****MUST**** be an array.
      2. For each [Update](#update) entry to be included in the `update` array, herein referred to as the [_Provisional Proof File Update Entry_](#provisional-proof-file-update-entry), include the operation's [_Update Operation Signed Data Object_](#update-signed-data-object) in the same index position of the operation's matching [_Provisional Index File Update Entry_](#provisional-index-file-update-entry).

### Chunk Files

Chunk Files are JSON Documents, compressed via the [COMPRESSION_ALGORITHM](#compression-algorithm), that contain Sidetree Operation source data, which are composed of delta-based CRDT entries that modify the state of a Sidetree identifier's DID state.

For this version of the protocol, there will only exist a single Chunk File that contains all the state modifying data for all operations in the included set. Future versions of the protocol will separate the total set of included operations into multiple chunks, each with their own Chunk File.

::: example Create operation Chunk File entry
```json
{
  "deltas": [
       
    {
      "patches": PATCH_ARRAY,
      "updateCommitment": COMMITMENT_HASH
    },
    ...
  ]
}
```
:::

Any unknown properties in this file not defined by this specification or specifically permitted by the implementer, ****MUST**** result in an invalidation of the entire file.

In this version of the protocol, [Chunk Files](#chunk-files) are constructed as follows:

1. The Chunk File ****MUST**** include a `deltas` property, and its value ****MUST**** be an array containing [_Chunk File Delta Entry_](#chunk-file-delta-entry){id="chunk-file-delta-entry"} objects.
2. Each [_Chunk File Delta Entry_](#chunk-file-delta-entry) ****MUST**** be a JSON object serialized via the [`JSON_CANONICALIZATION_SCHEME`](#json-canonicalization-scheme), assembled as follows:
    1. The object ****MUST**** contain a `patches` property, and its value ****MUST**** be an array of [DID State Patches](#did-state-patches).
    2. The payload ****MUST**** contain an `updateCommitment` property, and its value ****MUST**** be the next _Update Commitment_ generated during the operation process associated with the type of operation being performed.

3. Each [_Chunk File Delta Entry_](#chunk-file-delta-entry) ****MUST**** be appended to the `deltas` array as follows, in this order:
    1. If any Create operations were present in the associated Core Index File, append all [_Create Operation Delta Objects_](#create-delta-object) in the same index order as their matching [_Core Index File Create Entry_](#core-index-file-create-entry).
    2. If any Recovery operations were present in the associated Core Index File, append all [_Recovery Operation Delta Objects_](#recovery-delta-object) in the same index order as their matching [_Core Index File Recovery Entry_](#core-index-file-recovery-entry).
    3. If any Update operations were present in the associated Provisional Index File, append all [_Update Operation Delta Objects_](#update-delta-object) in the same index order as their matching [_Provisional Index File Update Entry_](#provisional-index-file-update-entry).
