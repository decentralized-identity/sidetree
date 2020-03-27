
## File Structures

The protocol defines the following three file structures, which house DID operation data and are designed to support key functionality to enable light node configurations, minimize permanently retained data, and ensure performant resolution of DIDs.

<img src="../diagrams/file-topology.svg" style="display: block; margin: 0 auto; padding: 2em 0; width: 100%; max-width: 620px;" />

### Anchor File

Anchor files contain [Create](#create), [Recover](#recover), and [Deactivate](#deactivate) operation values, as well as a CAS URI for the related Sidetree Map file (detailed below). As the name suggests, Anchor files are anchored to the target ledger system via embedding a CAS URI in the ledger's transactional history.

::: example
```json
{
  "map_file": CAS_CID,
  "operations": {
    "create": [
      {
        "initial_document_hash": DOCUMENT_HASH,
        "initial_recovery_key": RECOVERY_PUBLIC_KEY,
        "initial_recovery_commitment": COMMITMENT_HASH
      },
      {...}
    ],
    "recover": [
      {
        "id": DID_UNIQUE_SUFFIX,
        "recovery_reveal_value": REVEAL_VALUE,
        "new_recovery_commitment": COMMITMENT_HASH,
        "new_document_hash": DOCUMENT_HASH,
        "new_recovery_key": RECOVERY_PUBLIC_KEY,
        "sig": KEY_SIGNATURE
      },
      {...}
    ],
    "deactivate": [
      {
        "id": DID_UNIQUE_SUFFIX,
        "recovery_reveal_value": REVEAL_VALUE,
        "sig": KEY_SIGNATURE
      },
      {...}
    ]
  }
}
```
:::

A valid Anchor File is a JSON document that MUST NOT exceed the [`MAX_ANCHOR_FILE_SIZE`](#max-anchor-file-size), and composed as follows:

1. The Anchor File MUST contain a `map_file` property, and its value MUST be a _CAS URI_ for the related Map File.
2. If the set of operations to be anchored contain any [Create](#create), [Recover](#recovery), or [Deactivate](#deactivate) operations, the Anchor File MUST contain an `operations` property, and its value MUST be an object composed as follows:

  - If there are any [Create](#create) operations to be included in the Anchor File:
    1. The `operations` object MUST include a `create` property, and its value MUST be an array.
    2. For each [Create](#create) operation to be included in the `create` array, herein referred to as [_Anchor File Create Entries_](#anchor-file-create-entry){id="anchor-file-create-entry"}, use the following process to compose and include each entry:
        - The object MUST contain an [`initial_recovery_key`](#initial-recovery-key){id="initial-recovery-key"} property, and its value MUST be an _Initial Recovery Public Key_, as generated via the [Create](#create) operation process.
        - The object MUST contain an [`initial_recovery_commitment`](#initial-recovery-commitment){id="initial-recovery-commitment"} property, and its value MUST be an _Initial Recovery Commitment Hash_, as generated via the [Create](#create) operation process.
        - The object MUST contain an `initial_document_hash` property, and its value MUST be a hash (generated via the [`HASH_ALGORITHM`](#hash-algorithm)) of the [_Create Operation Data Object_](#create-data-object) (ensure this is a hash of the `base64` encoded version of the object).
    3. The Anchor File MUST NOT include multiple [Create](#create) operations that produce the same [DID Unique Suffix](#did-unique-suffix).
    

<!--
  - The object MUST contain an `initial_state` property, and its value MUST be a hash (generated via the [`HASH_ALGORITHM`](#hash-algorithm)) of the following `base64` encoded object:

      ```json
      {
        "next_update_commitment": HASH_OF_UPDATE_COMMITMENT_VALUE,
        "patches": [ PATCH_ONE, PATCH_TWO, ... ]
      }
      ```
      - The object MUST contain an `next_update_commitment` property, and its value MUST be the _Initial Update Commitment_, as generated via the [Create](#create) operation process.
      - The object MUST contain a `patches` property, and its value MUST be an array of [DID State Patches](#did-state-patches), generated during the [Create](#create) operation process.
-->


  - If there are any [Recovery](#recover) operations to be included in the Anchor File:
    1. The `operations` object MUST include a `recover` property, and its value MUST be an array.
    2. For each [Recovery](#recover) operation to be included in the `recover` array, herein referred to as [_Anchor File Recovery Entries_](#anchor-file-recovery-entry), use the following process to compose and include entries:
        - The object MUST contain an `id` property, and its value MUST be the [DID Unique Suffix](#did-unique-suffix) of the DID the operation pertains to. An Anchor File MUST NOT contain more than one operation of any type with the same [DID Unique Suffix](#did-unique-suffix).
        - The object MUST contain a `recovery_reveal_value` property, and its value MUST be the last recovery [COMMITMENT_VALUE](#commitment-value).
        - The object MUST contain a `new_recovery_commitment` property, and its value MUST be the next _Recovery Commitment Hash_ generated during the [Recovery](#recover) operation process.
        - The object MUST contain an `new_document_hash` property, and its value MUST be a hash (generated via the [`HASH_ALGORITHM`](#hash-algorithm)) of the [_Recovery Operation Data Object_](#recover-data-object) (ensure this is a hash of the `base64` encoded version of the object).
        - The object MUST contain a `sig` property, and its value MUST be a signature over the other values present in the object.
        - The object MAY include a `new_recovery_key` property, and if included, its value MUST be the public key generated during the [Recovery](#recover) operation process.


<!--
  - The object MUST contain an `new_state_hash` property, and its value MUST be a hash (generated via the [`HASH_ALGORITHM`](#hash-algorithm)) of the following `base64` encoded object:

      ```json
      {
        "patches": [ PATCH_ONE, PATCH_TWO, ... ]
      }
      ```
      - The object MUST contain a `patches` property, and its value MUST be an array of [DID State Patches](#did-state-patches), generated during the [Recovery](#recover) operation process.
  - The object MUST contain a `sig` property, and its value MUST be a signature over the other values present in the object.
  - The object MAY include a `new_recovery_key` property, and if included, its value MUST be the public key generated during the [Recovery](#recover) operation process.
-->

  - If there are any [Deactivate](#deactivate) operations to be included in the Anchor File:
    1. The `operations` object MUST include a `deactivate` property, and its value MUST be an array.
    2. For each [Deactivate](#deactivate) operation to be included in the `deactivate` array, use the following process to compose and include entries:
        - The object MUST contain an `id` property, and its value MUST be the [DID Unique Suffix](#did-unique-suffix) of the DID the operation pertains to. An Anchor File MUST NOT contain more than one operation of any type with the same [DID Unique Suffix](#did-unique-suffix).
        - The object MUST contain a `recovery_reveal_value` property, and its value MUST be the last recovery [COMMITMENT_VALUE](#commitment-value).
        - The object MUST contain a `sig` property, and its value MUST be a signature over the concatenated values of the `id` property and the `recovery_reveal_value` property.

### Map File

The Map file in the Sidetree protocol contains Update operation proving data, as well as the CAS-linked Batch file chunks.
::: example
```json
{
  "chunks": [
    { "chunk_hash": CHUNK_HASH }
  ],
  "operations": {
    "update": [
      {
        "id": DID_UNIQUE_SUFFIX,
        "update_reveal_value": REVEALED_COMMITMENT_VALUE,
        "update_patch_hash": PATCH_HASH,
        "sig": UPDATE_KEY_SIGNATURE
      },
      {...}
    ]
  }
}
```
:::

A valid Map File is a JSON document that MUST NOT exceed the [`MAX_MAP_FILE_SIZE`](#max-map-file-size), and composed as follows:

1. The Anchor File MUST contain a `chunks` property, and its value MUST be an array of _Batch Chunk Entries_ for the related Batch File data.
    - Future versions of the protocol will specify a process for separating the total operations in a batch into multiple _Batch Chunk Entries_, but for this version of the protocol there MUST be only one _Batch Chunk Entry_ object present in the array, which is composed as follows:
      1. The _Batch Chunk Entry_ object MUST contain a `chunk_hash` property, and its value MUST be a Content Identifier representing the single Batch File, generated via the [`CID_ALGORITHM`](#cid-algorithm).
2. If there are any [Update](#update) operations to be included in the Map File, the Map File MUST include an `operations` property, and its value MUST be an object composed as follows:
  1. The `operations` object MUST include an `update` property, and its value MUST be an array.
  2. For each [Update](#update) operation to be included in the `update` array, herein referred to as [Map File Update Entries](#map-file-update-entry), use the following process to compose and include entries:
        - The object MUST contain an `id` property, and its value MUST be the [DID Unique Suffix](#did-unique-suffix) of the DID the operation pertains to.
        - The object MUST contain a `update_reveal_value` property, and its value MUST be the last update [COMMITMENT_VALUE](#commitment-value).
        - The object MUST contain an `update_patch_hash` property, and its value MUST be a hash (generated via the [`HASH_ALGORITHM`](#hash-algorithm)) of the [_Update Operation Data Object_](#update-data-object) (ensure this is a hash of the `base64` encoded version of the object).
        - The object MUST contain a `sig` property, and its value MUST be a signature over the other values present in the object.
        - The object MAY include a `new_recovery_key` property, and if included, its value MUST be the public key generated during the [Recovery](#recover) operation process.

### Batch Files

Batch Files are JSON Documents, compressed via the [COMPRESSION_ALGORITHM](#compression-algorithm) contain Sidetree Operation source data, which are composed of delta-based CRDT entries that modify the state of a Sidetree identifier's DID Document.

For this version of the protocol, there will only exist a single Batch File that contains all the state modifying data for all operations in the included set. Future versions of the protocol will separate the total set of included operations into multiple chunks, each with their own Batch File.

::: example Create operation Batch File entry
```json
{
  "operations": [
    { SIDETREE_OPERATION },
    { SIDETREE_OPERATION },
    ...
  ]
}
```
:::

In this version of the protocol, Batch Files are constructed as follows:

1. The Batch File MUST include an `operation` property, and its value MUST be an array.
2. Each [operation](#did-operation) entry to be included in the Batch File MUST be a `base64` encoded value of the operation data matching the type of operation it represents, and shall be appended to the `operation` array as follows:
    1. If any Create operations were present in the associated Anchor File, append all [_Create Operation Data Objects_](#create-data-object) in the same index order as their matching [_Anchor File Create Entry_](#anchor-file-create-entry).
    2. If any Recovery operations were present in the associated Anchor File, append all [Recovery Operation Data Objects_](#recovery-data-object) in the same index order as their matching [_Anchor File Recovery Entry_](#anchor-file-recovery-entry).
    3. If any Update operations were present in the associated Map File, append all [Update Operation Data Objects_](#update-data-object) in the same index order as their matching [_Map File Update Entry_](#map-file-update-entry).
