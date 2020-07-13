
## File Structures

The protocol defines the following three file structures, which house DID operation data and are designed to support key functionality to enable light node configurations, minimize permanently retained data, and ensure performant resolution of DIDs.

<img src="../diagrams/file-topology.svg" style="display: block; margin: 0 auto; padding: 2em 0; width: 100%; max-width: 620px;" />

### Anchor File

Anchor Files contain [Create](#create), [Recover](#recover), and [Deactivate](#deactivate) operation values, as well as a CAS URI for the related Sidetree Map file (detailed below). As the name suggests, Anchor Files are anchored to the target ledger system via embedding a CAS URI in the ledger's transactional history.


::: example Anchor File
```json
{
  "map_file_uri": "QmYTSmpYWEH3pg4ZosnpbeNc9ao2MeXZdg2NUtskBaREjK",
  "operations": {
    "create": [
      {
        "suffix_data": "eyJkZWx0YV9oYXNoIjoiRWlEdlBwR3NyZ3pOSG1vUkNaSE1pUTZ5TTJ5TFVqUTZla2lRSkMtM2lycFR0ZyIsInJlY292ZXJ5X2NvbW1pdG1lbnQiOiJFaUI5RFBzY3NuS2dsNVJqX2JLU0pONTVQWTJ3TWV2S1JiSDFlb1ZEeGd2TGNRIn0"
      }
    ],
    "recover": [],
    "deactivate": []
  }
}
```
:::

::: example Anchor File Decoded
```json
{
  "map_file_uri": "QmYTSmpYWEH3pg4ZosnpbeNc9ao2MeXZdg2NUtskBaREjK",
  "operations": {
    "create": [
      {
        // JSON.parse(base64url.decode(suffix_data))
        "suffix_data": {
          "delta_hash": "EiDvPpGsrgzNHmoRCZHMiQ6yM2yLUjQ6ekiQJC-3irpTtg",
          "recovery_commitment": "EiB9DPscsnKgl5Rj_bKSJN55PY2wMevKRbH1eoVDxgvLcQ"
        }
      }
    ],
    "recover": [],
    "deactivate": []
  }
}
```
:::

A valid [Anchor File](#anchor-file) is a JSON document that ****MUST NOT**** exceed the [`MAX_ANCHOR_FILE_SIZE`](#max-anchor-file-size), and composed as follows:

1. The [Anchor File](#anchor-file) ****MUST**** contain a [`map_file_uri`](#map-file-property){id="map-file-property"} property if the batch of transactions being anchored contains any Create, Recovery, or Update operations, and its value ****MUST**** be a _CAS URI_ for the related Map File. If the batch of transactions being anchored is only comprised of Deactivate operations, the [`map_file_uri`](#map-file-property) property ****MUST NOT**** be present.
2. The [Anchor File](#anchor-file) ****MAY**** contain a [`writer_lock_id`](#writer-lock-property){id="writer-lock-property"} if the implementation chooses to implement a value locking scheme for economically based network protection, and its value ****MUST**** be defined by the implementation to reflect whatever values the are required to facilitate the necessary ledger and operation-level evaluations.
3. If the set of operations to be anchored contain any [Create](#create), [Recover](#recover), or [Deactivate](#deactivate) operations, the [Anchor File](#anchor-file) ****MUST**** contain an `operations` property, and its value ****MUST**** be an object composed as follows:
    - If there are any [Create](#create) operations to be included in the Anchor File:
      1. The `operations` object ****MUST**** include a `create` property, and its value ****MUST**** be an array.
      2. For each [Create](#create) operation to be included in the `create` array, herein referred to as [_Anchor File Create Entries_](#anchor-file-create-entry){id="anchor-file-create-entry"}, use the following process to compose and include a JSON object for each entry:
          - Each object must contain a `suffix_data` property, and its value ****MUST**** be a [_Create Operation Suffix Data Object_](#create-suffix-data-object).
      3. The [Anchor File](#anchor-file) ****MUST NOT**** include multiple [Create](#create) operations that produce the same [DID Suffix](#did-suffix).
    - If there are any [Recovery](#recover) operations to be included in the Anchor File:
      1. The `operations` object ****MUST**** include a `recover` property, and its value ****MUST**** be an array.
      2. For each [Recovery](#recover) operation to be included in the `recover` array, herein referred to as [_Anchor File Recovery Entries_](#anchor-file-recovery-entry){id="anchor-file-recovery-entry"}, use the following process to compose and include entries:
          - The object ****MUST**** contain a `did_suffix` property, and its value ****MUST**** be the [DID Suffix](#did-suffix) of the DID the operation pertains to. An [Anchor File](#anchor-file) ****MUST NOT**** contain more than one operation of any type with the same [DID Suffix](#did-suffix).
          - The object ****MUST**** contain a `signed_data` property, and its value ****MUST**** be a [_Recovery Operation Signed Data Object_](#recovery-signed-data-object).
    - If there are any [Deactivate](#deactivate) operations to be included in the Anchor File:
      1. The `operations` object ****MUST**** include a `deactivate` property, and its value ****MUST**** be an array.
      2. For each [Deactivate](#deactivate) operation to be included in the `deactivate` array, use the following process to compose and include entries:
          - The object ****MUST**** contain a `did_suffix` property, and its value ****MUST**** be the [DID Suffix](#did-suffix) of the DID the operation pertains to. An [Anchor File](#anchor-file) ****MUST NOT**** contain more than one operation of any type with the same [DID Suffix](#did-suffix).
          - The object ****MUST**** contain a `signed_data` property, and its value ****MUST**** be a [_Deactivate Operation Signed Data Object_](#deactivate-signed-data-object).

### Map File

Map Files contain [Update](#update) operation proving data, as well as CAS URI links to [Chunk Files](#chunk-files).

::: example Map File
```json
{
  "chunks": [
    { "chunk_file_uri": "QmZdSFX7LpHExTX6JMLXStjC18xdtZTdoMi9hYCv8R78Pv" }
  ]
}
```
:::

A valid [Map File](#map-file) is a JSON document that ****MUST NOT**** exceed the [`MAX_MAP_FILE_SIZE`](#max-map-file-size), and composed as follows:

1. The [Map File](#map-file) ****MUST**** contain a `chunks` property, and its value ****MUST**** be an array of _Chunk Entries_ for the related delta data for a given chunk of operations in the batch. Future versions of the protocol will specify a process for separating the operations in a batch into multiple _Chunk Entries_, but for this version of the protocol there ****MUST**** be only one _Chunk Entry_ present in the array. _Chunk Entry_ objects are composed as follows:
    1. The _Chunk Entry_ object ****MUST**** contain a `chunk_file_uri` property, and its value ****MUST**** be a URI representing the corresponding CAS file entry, generated via the [`CAS_URI_ALGORITHM`](#cas-uri-algorithm).
2. If there are any [Update](#update) operations to be included in the Map File, the [Map File](#map-file) ****MUST**** include an `operations` property, and its value ****MUST**** be an object composed as follows:
    1. The `operations` object ****MUST**** include an `update` property, and its value ****MUST**** be an array.
    2. For each [Update](#update) operation to be included in the `update` array, herein referred to as [Map File Update Entries](#map-file-update-entry){id="map-file-update-entry"}, use the following process to compose and include entries:
          - The object ****MUST**** contain an `did_suffix` property, and its value ****MUST**** be the [DID Suffix](#did-suffix) of the DID the operation pertains to.
          - The object ****MUST**** contain a `signed_data` property, and its value ****MUST**** be an [_Update Operation Signed Data Object_](#update-signed-data-object).

### Chunk Files

Chunk Files are JSON Documents, compressed via the [COMPRESSION_ALGORITHM](#compression-algorithm) contain Sidetree Operation source data, which are composed of delta-based CRDT entries that modify the state of a Sidetree identifier's DID Document.

For this version of the protocol, there will only exist a single Chunk File that contains all the state modifying data for all operations in the included set. Future versions of the protocol will separate the total set of included operations into multiple chunks, each with their own Chunk File.

::: example Chunk File
```json
{
  "deltas": [
    "eyJ1cGRhdGVfY29tbWl0bWVudCI6IkVpQ2t6LW50TVVmbV90WjRKeTYzYmVwa1ZfWl9CR0xveFhZaG9hbGNKZ0JSUkEiLCJwYXRjaGVzIjpbeyJhY3Rpb24iOiJyZXBsYWNlIiwiZG9jdW1lbnQiOnsicHVibGljS2V5cyI6W3siaWQiOiJrZXkyIiwidHlwZSI6IkVjZHNhU2VjcDI1NmsxVmVyaWZpY2F0aW9uS2V5MjAxOSIsImp3ayI6eyJrdHkiOiJFQyIsImNydiI6InNlY3AyNTZrMSIsIngiOiI3cFE4UGRsUm5OZmlaWU9HdmpLdzlrdFJxN1FoQWZtLWVSck1vVERrd2VjIiwieSI6ImpabEI1QmZKZGt3dGhXM3VIZ1UwVDhZaDJEbDFwdkFNQkZzTUxDeXNIT00ifSwicHVycG9zZSI6WyJhdXRoIiwiZ2VuZXJhbCJdfV0sInNlcnZpY2VFbmRwb2ludHMiOlt7ImlkIjoic2VydmljZUVuZHBvaW50SWQxMjMiLCJ0eXBlIjoic29tZVR5cGUiLCJlbmRwb2ludCI6Imh0dHBzOi8vd3d3LnVybC5jb20ifV19fV19"
  ]
}
```
:::

::: example Chunk File Decoded
```json
{
  "deltas": [
    // JSON.parse(base64url.decode(deltas[0]))
    {
      // COMMITMENT_HASH
      "update_commitment": "EiCkz-ntMUfm_tZ4Jy63bepkV_Z_BGLoxXYhoalcJgBRRA",
      // PATCH_ARRAY
      "patches": [
        {
          "action": "replace",
          "document": {
            "publicKeys": [
              {
                "id": "key2",
                "type": "EcdsaSecp256k1VerificationKey2019",
                "jwk": {
                  "kty": "EC",
                  "crv": "secp256k1",
                  "x": "7pQ8PdlRnNfiZYOGvjKw9ktRq7QhAfm-eRrMoTDkwec",
                  "y": "jZlB5BfJdkwthW3uHgU0T8Yh2Dl1pvAMBFsMLCysHOM"
                },
                "purpose": ["auth", "general"]
              }
            ],
            "serviceEndpoints": [
              {
                "id": "serviceEndpointId123",
                "type": "someType",
                "endpoint": "https://www.url.com"
              }
            ]
          }
        }
      ]
    }
    // ...
  ]
}
```
:::

In this version of the protocol, Chunk Files are constructed as follows:

1. The Chunk File ****MUST**** include a `deltas` property, and its value ****MUST**** be an array containing [_Chunk File Delta Entry_](#chunk-file-delta-entry){id="chunk-file-delta-entry"} objects.
2. Each [_Chunk File Delta Entry_](#chunk-file-delta-entry) ****MUST**** be a `Base64URL` encoded object, assembled as follows:
    1. The object ****MUST**** contain a `patches` property, and its value ****MUST**** be an array of [DID State Patches](#did-state-patches).
    2. The payload ****MUST**** contain an `update_commitment` property, and its value ****MUST**** be the next _Update Commitment_ generated during the operation process associated with the type of operation being performed.

3. Each [_Chunk File Delta Entry_](#chunk-file-delta-entry) ****MUST**** be appended to the `deltas` array as follows, in this order:
    1. If any Create operations were present in the associated Anchor File, append all [_Create Operation Delta Objects_](#create-delta-object) in the same index order as their matching [_Anchor File Create Entry_](#anchor-file-create-entry).
    2. If any Recovery operations were present in the associated Anchor File, append all [_Recovery Operation Delta Objects_](#recovery-delta-object) in the same index order as their matching [_Anchor File Recovery Entry_](#anchor-file-recovery-entry).
    3. If any Update operations were present in the associated Map File, append all [_Update Operation Delta Objects_](#update-delta-object) in the same index order as their matching [_Map File Update Entry_](#map-file-update-entry).
