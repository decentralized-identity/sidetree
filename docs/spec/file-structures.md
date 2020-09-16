
## File Structures

The protocol defines the following three file structures, which house DID operation data and are designed to support key functionality to enable light node configurations, minimize permanently retained data, and ensure performant resolution of DIDs.

<img src="../diagrams/file-topology.svg" style="display: block; margin: 0 auto; padding: 2em 0; width: 100%; max-width: 620px;" />

### Anchor File

Anchor Files contain [Create](#create), [Recover](#recover), and [Deactivate](#deactivate) operation values, as well as a CAS URI for the related Sidetree Map file (detailed below). As the name suggests, Anchor Files are anchored to the target ledger system via embedding a CAS URI in the ledger's transactional history.

::: example
```json
{
  "core_proof_file_uri": CAS_URI,
  "provisional_proof_file_uri": CAS_URI,
  "map_file_uri": CAS_URI,
  "writer_lock_id": OPTIONAL_LOCKING_VALUE,
  "operations": {
    "create": [
      {
        "suffix_data": {
          "delta_hash": DELTA_HASH,
          "recovery_commitment": COMMITMENT_HASH
        }
      },
      {...}
    ],
    "recover": [
      {
        "did_suffix": SUFFIX_STRING,
        "reveal_value": MULTIHASH_OF_JWK
      },
      {...}
    ],
    "deactivate": [
      {
        "did_suffix": SUFFIX_STRING,
        "reveal_value": MULTIHASH_OF_JWK
      },
      {...}
    ]
  }
}
```
:::

A valid [Anchor File](#anchor-file) is a JSON document that ****MUST NOT**** exceed the [`MAX_ANCHOR_FILE_SIZE`](#max-anchor-file-size), and composed as follows:

1. The [Anchor File](#anchor-file) ****MUST**** contain a [`map_file_uri`](#map-file-uri){id="map-file-uri"} property if the batch of transactions being anchored contains any Create, Recovery, or Update operations, and its value ****MUST**** be a _CAS URI_ for the related Map File. If the batch of transactions being anchored is only comprised of Deactivate operations, the [`map_file_uri`](#map-file-property) property ****MUST NOT**** be present.
2. The [Anchor File](#anchor-file) ****MUST**** contain a [`core_proof_file_uri`](#core-proof-file-uri){id="core-proof-file-uri"} property if the batch of transactions being anchored contains any Recovery or Deactivate operations, and its value ****MUST**** be a _CAS URI_ for the related [Core Proof File](#core-proof-file).
3. The [Anchor File](#anchor-file) ****MUST**** contain a [`provisional_proof_file_uri`](#provisional-proof-file-uri){id="provisional-proof-file-uri"} property if the batch of transactions being anchored contains any Update operations, and its value ****MUST**** be a _CAS URI_ for the related [Provisional Proof File](#provisional-proof-file).
4. The [Anchor File](#anchor-file) ****MAY**** contain a [`writer_lock_id`](#writer-lock-property){id="writer-lock-property"} if the implementation chooses to implement a value locking scheme for economically based network protection, and its value ****MUST**** be defined by the implementation to reflect whatever values the are required to facilitate the necessary ledger and operation-level evaluations.
5. If the set of operations to be anchored contain any [Create](#create), [Recover](#recover), or [Deactivate](#deactivate) operations, the [Anchor File](#anchor-file) ****MUST**** contain an `operations` property, and its value ****MUST**** be an object composed as follows:
    - If there are any [Create](#create) operations to be included in the Anchor File:
      1. The `operations` object ****MUST**** include a `create` property, and its value ****MUST**** be an array.
      2. For each [Create](#create) operation to be included in the `create` array, herein referred to as [_Anchor File Create Entries_](#anchor-file-create-entry){id="anchor-file-create-entry"}, use the following process to compose and include a JSON object for each entry:
          - Each object must contain a `suffix_data` property, and its value ****MUST**** be a [_Create Operation Suffix Data Object_](#create-suffix-data-object).
      3. The [Anchor File](#anchor-file) ****MUST NOT**** include multiple [Create](#create) operations that produce the same [DID Suffix](#did-suffix).
    - If there are any [Recovery](#recover) operations to be included in the Anchor File:
      1. The `operations` object ****MUST**** include a `recover` property, and its value ****MUST**** be an array.
      2. For each [Recovery](#recover) operation to be included in the `recover` array, herein referred to as [_Anchor File Recovery Entries_](#anchor-file-recovery-entry){id="anchor-file-recovery-entry"}, use the following process to compose and include entries:
          - The object ****MUST**** contain a `did_suffix` property, and its value ****MUST**** be the [DID Suffix](#did-suffix) of the DID the operation pertains to. An [Anchor File](#anchor-file) ****MUST NOT**** contain more than one operation of any type with the same [DID Suffix](#did-suffix).
          - The object ****MUST**** contain a `reveal_value` property, and its value ****MUST**** be the [hashed](#multihash) reveal value of the last update commitment.
    - If there are any [Deactivate](#deactivate) operations to be included in the Anchor File:
      1. The `operations` object ****MUST**** include a `deactivate` property, and its value ****MUST**** be an array.
      2. For each [Deactivate](#deactivate) operation to be included in the `deactivate` array, use the following process to compose and include entries:
          - The object ****MUST**** contain a `did_suffix` property, and its value ****MUST**** be the [DID Suffix](#did-suffix) of the DID the operation pertains to. An [Anchor File](#anchor-file) ****MUST NOT**** contain more than one operation of any type with the same [DID Suffix](#did-suffix).
          - The object ****MUST**** contain a `reveal_value` property, and its value ****MUST**** be the [hashed](#multihash) reveal value of the last update commitment.



- The object ****MUST**** contain a `signed_data` property, and its value ****MUST**** be a [_Deactivate Operation Signed Data Object_](#deactivate-signed-data-object).

### Map File

Map Files contain [Update](#update) operation proving data, as well as CAS URI links to [Chunk Files](#chunk-files).

::: example
```json
{
  "chunks": [
    { "chunk_file_uri": CHUNK_HASH },
    {...}
  ],
  "operations": {
    "update": [
      {
        "did_suffix": DID_SUFFIX,
        "reveal_value": MULTIHASH_OF_JWK
      },
      {...}
    ]
  }
}
```
:::

A valid [Map File](#map-file) is a JSON document that ****MUST NOT**** exceed the [`MAX_MAP_FILE_SIZE`](#max-map-file-size), and composed as follows:

1. The [Map File](#map-file) ****MUST**** contain a `chunks` property, and its value ****MUST**** be an array of _Chunk Entries_ for the related delta data for a given chunk of operations in the batch. Future versions of the protocol will specify a process for separating the operations in a batch into multiple _Chunk Entries_, but for this version of the protocol there ****MUST**** be only one _Chunk Entry_ present in the array. _Chunk Entry_ objects are composed as follows:
    1. The _Chunk Entry_ object ****MUST**** contain a [`chunk_file_uri`](#chunk-file-uri) property, and its value ****MUST**** be a URI representing the corresponding CAS file entry, generated via the [`CAS_URI_ALGORITHM`](#cas-uri-algorithm).
2. If there are any operation entries to be included in the [Map File](#map-file) (currently only Update operations), the [Map File](#map-file) ****MUST**** include an `operations` property, and its value ****MUST**** be an object composed as follows:
    - If there are any [Update](#update) entries to be included:
      1. The `operations` object ****MUST**** include an `update` property, and its value ****MUST**** be an array.
      2. For each [Update](#update) operation to be included in the `update` array, herein referred to as [Map File Update Entries](#map-file-update-entry){id="map-file-update-entry"}, use the following process to compose and include entries:
          - The object ****MUST**** contain an `did_suffix` property, and its value ****MUST**** be the [DID Suffix](#did-suffix) of the DID the operation pertains to.
          - The object ****MUST**** contain a `reveal_value` property, and its value ****MUST**** be the [hashed](#multihash) reveal value of the last update commitment.

### Core Proof File

Core Proof Files are [compressed](#compression-algorithm) JSON Documents containing the cryptographic proofs (signatures, hashes, etc.) that form the signature-chained backbone for the state lineages of all DIDs in the system. The cryptocraphic proofs present in Core Proof Files also link a given operation to its verbose state data, which resides in an related [Chunk File](#chunk-files).

::: example Core Proof File
```json
{
  "operations": {
    "recover": [
      {
        "signed_data": {
          "protected": {...},
          "payload": {
            "recovery_commitment": COMMITMENT_HASH,
            "recovery_key": JWK_OBJECT,
            "delta_hash": DELTA_HASH
          },
          "signature": SIGNATURE_STRING
        }
      },
      {...}
    ],
    "deactivate": [
      {
        "signed_data": {
          "protected": {...},
          "payload": {
            "did_suffix": SUFFIX_STRING,
            "recovery_key": JWK_OBJECT
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

In this version of the protocol, Core Proof Files are constructed as follows:

1. The Core Proof File ****MUST**** include an `operations` property, and its value ****MUST**** be an object containing cryptographic proof entries for any Recovery and Deactivate operations to be included in a batch. Include the Proof Entries as follows: 
    - If there are any [Recovery](#recover) entries to be included:
      1. The `operations` object ****MUST**** include a `recover` property, and its value ****MUST**** be an array.
      2. For each [Recovery](#recover) entry to be included in the `recover` array, herein referred to as the [_Core Proof File Recovery Entry_](#core-proof-file-recovery-entry), include the operation's [_Recovery Operation Signed Data Object_](#recovery-signed-data-object) in the same index position of the operation's matching [_Anchor File Create Entry_](#anchor-file-create-entry).
    - If there are any [Deactivate](#deactivate) entries to be included:
      1. The `operations` object ****MUST**** include a `deactivate` property, and its value ****MUST**** be an array.
      2. For each [Deactivate](#deactivate) entry to be included in the `deactivate` array, herein referred to as the [_Core Proof File Deactivate Entry_](#core-proof-file-deactivate-entry), include the operation's [_Deactivate Operation Signed Data Object_](#deactivate-signed-data-object) in the same index position of the operation's matching [_Anchor File Deactivate Entry_](#anchor-file-deactivate-entry).

### Provisional Proof File

Provisional Proof Files are [compressed](#compression-algorithm) JSON Documents containing the cryptographic proofs (signatures, hashes, etc.) for all the (eventually) prunable DID operations in the system. The cryptocraphic proofs present in Provisional Proof Files also link a given operation to its verbose state data, which resides in an related [Chunk File](#chunk-files).

::: example Provisional Proof File
```json
{
  "operations": {
    "update": [
      {
        "signed_data": {
          "protected": {...},
          "payload": {
            "update_key": JWK_OBJECT,
            "delta_hash": DELTA_HASH
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

In this version of the protocol, Provisional Proof Files are constructed as follows:

1. The Provisional Proof File ****MUST**** include an `operations` property, and its value ****MUST**** be an object containing cryptographic proof entries for any Recovery and Deactivate operations to be included in a batch. Include the Proof Entries as follows: 
    - If there are any [Update](#update) entries to be included:
      1. The `operations` object ****MUST**** include a `update` property, and its value ****MUST**** be an array.
      2. For each [Update](#update) entry to be included in the `update` array, herein referred to as the [_Provisional Proof File Update Entry_](#provisional-proof-file-update-entry), include the operation's [_Update Operation Signed Data Object_](#update-signed-data-object) in the same index position of the operation's matching [_Map File Update Entry_](#map-file-update-entry).

### Chunk Files

Chunk Files are JSON Documents, compressed via the [COMPRESSION_ALGORITHM](#compression-algorithm), that contain Sidetree Operation source data, which are composed of delta-based CRDT entries that modify the state of a Sidetree identifier's DID Document.

For this version of the protocol, there will only exist a single Chunk File that contains all the state modifying data for all operations in the included set. Future versions of the protocol will separate the total set of included operations into multiple chunks, each with their own Chunk File.

::: example Create operation Chunk File entry
```json
{
  "deltas": [
       
    {
      "patches": PATCH_ARRAY,
      "update_commitment": COMMITMENT_HASH
    },
    ...
  ]
}
```
:::

In this version of the protocol, Chunk Files are constructed as follows:

1. The Chunk File ****MUST**** include a `deltas` property, and its value ****MUST**** be an array containing [_Chunk File Delta Entry_](#chunk-file-delta-entry){id="chunk-file-delta-entry"} objects.
2. Each [_Chunk File Delta Entry_](#chunk-file-delta-entry) ****MUST**** be a JSON object serialized via the [`JSON_CANONICALIZATION_SCHEME`](#json-canonicalization-scheme), assembled as follows:
    1. The object ****MUST**** contain a `patches` property, and its value ****MUST**** be an array of [DID State Patches](#did-state-patches).
    2. The payload ****MUST**** contain an `update_commitment` property, and its value ****MUST**** be the next _Update Commitment_ generated during the operation process associated with the type of operation being performed.

3. Each [_Chunk File Delta Entry_](#chunk-file-delta-entry) ****MUST**** be appended to the `deltas` array as follows, in this order:
    1. If any Create operations were present in the associated Anchor File, append all [_Create Operation Delta Objects_](#create-delta-object) in the same index order as their matching [_Anchor File Create Entry_](#anchor-file-create-entry).
    2. If any Recovery operations were present in the associated Anchor File, append all [_Recovery Operation Delta Objects_](#recovery-delta-object) in the same index order as their matching [_Anchor File Recovery Entry_](#anchor-file-recovery-entry).
    3. If any Update operations were present in the associated Map File, append all [_Update Operation Delta Objects_](#update-delta-object) in the same index order as their matching [_Map File Update Entry_](#map-file-update-entry).
