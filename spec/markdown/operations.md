


## DID Operations

Sidetree-based DIDs support a variety of DID operations, all of which require the DID owner to generate specific data values and cryptographic material. The sections below describe how to perform each type of operation, and how those operations are represented in the CAS-replicated files that are anchored to the underlying ledger system.

While virtually all DID owners will engage User Agent applications on their local devices to perform these operations, most will not generate the anchoring transactions on the underlying ledger. Instead, most users will likely send the anchoring-related operation values they generate to external nodes for anchoring. This is relatively safe, because operations require signatures that an external node cannot forge. The only attack available to a rogue node operator is to not anchor the operations a DID owner sends them. However, the DID owner can detect this (via a scan of subsequent blocks) and send their operation to a different node or do it themselves, if they so desire.

::: note
  This specification does not define an API for sending public DID operation values to third-party Sidetree nodes for external anchoring, as that is an elective activity has no bearing on the technical workings of the protocol, its capabilities, or its security guarantees.
:::

### Create

Use the following process to generate a Sidetree-based DID:

1. Generate a key pair via the [`KEY_ALGORITHM`](#key-algorithm). The public key MUST be retained for use as the [_Initial Recovery Public Key_](#initial-recovery-key){id="initial-recovery-key"} portion of the [DID Suffix](#did-suffix), while the the private key MUST be securely stored for use in subsequent [Recovery](#recovery) operations.
2. Generate and retain a [`COMMITMENT_VALUE`](#commitment-value) for use in the next Recovery operation, herein referred to as [_Initial Recovery Commitment_](#initial-recovery-commitment){id="initial-recovery-commitment"}.
3. Generate a _Recovery Commitment_ hash using the [Hashing Process](#hashing-process) to generate a hash of the [`COMMITMENT_VALUE`](#commitment-value), and retain the resulting hash value for inclusion in an [Anchor File](#anchor-file) (if publication of the DID is desired).
4. Generate and retain a [`COMMITMENT_VALUE`](#commitment-value) for use in the next Update operation, herein referred to as _Update Reveal Value_.
5. Generate an _Update Commitment_ hash by using the [Hashing Process](#hashing-process) to generate a hash of the _Update Reveal Value_, and retain the resulting hash value for inclusion in an [Anchor File](#anchor-file) (if publication of the DID is desired).
6. Generate an encoded representation of the following object using the implementation's [`DATA_ENCODING_SCHEME`](#data-encoding-scheme), herein referred to as the [_Create Operation Delta Object_](#create-delta-object){ id="create-delta-object" }:
    ```json
    {
      "patches": [ PATCH_1, PATCH_2, ... ],
      "update_commitment": HASH_OF_UPDATE_COMMITMENT_VALUE
    }
    ```
    - The object MUST contain a `patches` property, and its value MUST be an array of [DID State Patches](#did-state-patches).
    - The object MUST contain a `update_commitment` property, and its value MUST be the _Update Commitment_, as described above.
7. Generate an encoded representation of the following object using the implementation's [`DATA_ENCODING_SCHEME`](#data-encoding-scheme), herein referred to as the [_Create Operation Suffix Data Object_](#create-suffix-data-object){ id="create-suffix-data-object" }:
    ```json
    {
      "delta_hash": DELTA_HASH,
      "recovery_key": JWK_OBJECT,
      "recovery_commitment": COMMITMENT_HASH
    }
    ```
    - The object MUST contain a `delta_hash` property, and its value MUST be a hash of the [_Create Operation Delta Object_](#create-delta-object) (detailed above), generated via the [Hashing Process](#hashing-process).
    - The object MUST contain the `recovery_key` property, and its value MUST be an [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) compliant JWK representation of the [_Initial Recovery Public Key_](#initial-recovery-key) (detailed above).
    - The object MUST contain an `recovery_commitment` property, and its value MUST be an [_Initial Recovery Commitment_](#initial-recovery-commitment) (detailed above).

::: note
Implementers MAY choose to canonicalize their [_Create Operation Suffix Data Objects_](#create-suffix-data-object) prior applying the [`DATA_ENCODING_SCHEME`](#data-encoding-scheme). This does not affect the outcome or other components in the system that deal with this object.
:::

### Update

The following process must be used to update the state a Sidetree-based DID:

1. Retrieve the _Update Reveal Value_ that matches the previously anchored _Update Commitment_.
2. Generate an encoded representation of the following object using the implementation's [`DATA_ENCODING_SCHEME`](#data-encoding-scheme), herein referred to as the [_Update Operation Delta Object_](#update-delta-object){ id="update-delta-object" }, composed as follows:
    ```json
    {
      "patches": [ PATCH_1, PATCH_2, ... ],
      "update_commitment": HASH_OF_UPDATE_COMMITMENT_VALUE
    }
    ```
    - The object MUST contain a `patches` property, and its value MUST be an array of [DID State Patches](#did-state-patches).
    - The object MUST contain a `update_commitment` property, and its value MUST be a new _Update Commitment_, the value of which will be revealed for the next Update operation.
3. Generate an encoded representation of the following object using the implementation's [`DATA_ENCODING_SCHEME`](#data-encoding-scheme), herein referred to as the [_Update Operation Signed Data Object_](#update-signed-data-object){ id="update-signed-data-object" }. The object MUST be a [IETF RFC 7515](https://tools.ietf.org/html/rfc7515) compliant JWS object with a signature that validates against a currently active operation key, and contains the following payload values:
    ```json
    {
      "protected": {...},
      "payload": {
          "delta_hash": DELTA_HASH
      },
      "signature": SIGNATURE_STRING
    }
    ```
    - The JWS `payload` object MUST contain a `delta_hash` property, and its value MUST be a hash of the [_Update Operation Delta Object_](#update-delta-object), generated via the [Hashing Process](#hashing-process).

### Recover

Use the following process to generate a Sidetree-based DID:

1. Retrieve the _Recovery Reveal Value_ that matches the previously anchored _Recovery Commitment_. This value will be used in constructing an [_Anchor File Recovery Entry_](#anchor-file-recovery-entry) for the DID being recovered.
2. Generate and retain a [`COMMITMENT_VALUE`](#commitment-value) for use in the next Recovery operation, herein referred to as the _Recovery Reveal Value_.
3. Generate a [_Recovery Commitment_](#recovery-commitment){id="recovery-commitment"} hash using the [Hashing Process](#hashing-process) to generate a hash of the [`COMMITMENT_VALUE`](#commitment-value), and retain the resulting hash value for inclusion in an [Anchor File](#anchor-file).
4. Generate and retain a [`COMMITMENT_VALUE`](#commitment-value) for use in the next Update operation, herein referred to as the _Update Reveal Value_.
5. Generate an _Update Commitment_ hash using the [Hashing Process](#hashing-process) to generate a hash of the _Update Reveal Value_, and retain the resulting hash value for inclusion in an [Anchor File](#anchor-file).
6. Optionally, the recovering entity MAY generate a new key pair, via the [`KEY_ALGORITHM`](#key-algorithm), for inclusion in the [Anchor File](#anchor-file) (to support key rolling, etc.). The private key MUST be securely stored for use in subsequent [Recovery](#recover) operations.
7. Generate a `Base64URL` encoded representation of the following object, herein referred to as the [_Recovery Operation Delta Object_](#recover-delta-object){ id="recover-delta-object" }, composed as follows:
    ```json
    {
      "patches": [ PATCH_1, PATCH_2, ... ],
      "update_commitment": HASH_OF_UPDATE_COMMITMENT_VALUE
    }
    ```
    - The object MUST contain a `patches` property, and its value MUST be an array of [DID State Patches](#did-state-patches).
    - The object MUST contain a `update_commitment` property, and its value MUST be the _Update Commitment_, as described above.
8. Generate an encoded representation of the following object using the implementation's [`DATA_ENCODING_SCHEME`](#data-encoding-scheme), herein referred to as the [_Recovery Operation Signed Data Object_](#recovery-signed-data-object){ id="recovery-signed-data-object" }. The object MUST be a [IETF RFC 7515](https://tools.ietf.org/html/rfc7515) compliant JWS object with a signature that validates against the currently active recovery key, and contains the following `payload` values:
    ```json
    {
      "protected": {...},
      "payload": {
          "recovery_commitment": COMMITMENT_HASH,
          "delta_hash": DELTA_HASH,
          "recovery_key": JWK_OBJECT
      },
      "signature": SIGNATURE_STRING
    }
    ```
    - The JWS `payload` object MUST contain a `delta_hash` property, and its value MUST be a hash of the [_Recovery Operation Delta Object_](#recover-delta-object), generated via the [Hashing Process](#hashing-process).
    - The JWS `payload` object MUST contain a `recovery_commitment` property, and its value MUST be the next [_Recovery Commitment_](#recovery-commitment), as described above.
    - The JWS `payload` object MAY include a `recovery_key` property, and if included, its value MUST be an [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) compliant JWK representation of a public key, as described above.

### Deactivate

The following process must be used to deactivate a Sidetree-based DID:

1. Retrieve the _Recovery Reveal Value_ that matches the previously anchored _Recovery Commitment_.
2. Generate an encoded representation of the following object using the implementation's [`DATA_ENCODING_SCHEME`](#data-encoding-scheme), herein referred to as the [_Deactivate Operation Signed Data Object_](#deactivate-signed-data-object){ id="deactivate-signed-data-object" }. The object MUST be a [IETF RFC 7515](https://tools.ietf.org/html/rfc7515) compliant JWS object with a signature that validates against the currently active recovery key, and contains the following payload values:
    ```json
    { // Base64URL encoded, compact JWS
      "protected": {...},
      "payload": {
        "did_suffix": SUFFIX_STRING,
        "recovery_reveal_value": REVEAL_VALUE
      },
      "signature": SIGNATURE_STRING
    }
    ```
    - The JWS `payload` object MUST contain a `did_suffix` property, and its value MUST be the [DID Suffix](#did-suffix) of the DID the operation pertains to.
    - The JWS `payload` object MUST contain a `recovery_reveal_value` property, and its value MUST be the last recovery [`COMMITMENT_VALUE`](#commitment-value).