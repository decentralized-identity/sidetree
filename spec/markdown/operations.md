


## DID Operations

Sidetree-based DIDs support a variety of DID operations, all of which require the DID owner to generate specific data values and cryptographic material. The sections below describe how to perform each type of operation, and how those operations are represented in the CAS-replicated files that are anchored to the underlying ledger system.

While virtually all DID owners will engage User Agent applications on their local devices to perform these operations, most will not generate the anchoring transactions on the underlying ledger. Instead, most users will likely send the anchoring-related operation values they generate to external nodes for anchoring. This is relatively safe, because operations require signatures that an external node cannot forge. The only attack available to a rogue node operator is to not anchor the operations a DID owner sends them. However, the DID owner can detect this (via a scan of subsequent blocks) and send their operation to a different node or do it themselves, if they so desire.

::: note
  This specification does not define an API for sending public DID operation values to third-party Sidetree nodes for external anchoring, as that is an elective activity has no bearing on the technical workings of the protocol, its capabilities, or its security guarantees.
:::

### Create

Use the following process to generate a Sidetree-based DID:

1. Generate a key pair via the [`KEY_ALGORITHM`](#key-algorithm). The public key MUST be retained for use as the _Initial Recovery Public Key_ portion of the [DID Suffix](#did-suffix), while the the private key MUST be securely stored for use in subsequent [Recovery](#recovery) operations.
2. Generate and retain a [`COMMITMENT_VALUE`](#commitment-value) for use in the next Recovery operation, herein referred to as _Initial Recovery Commitment_.
3. Generate a _Recovery Commitment_ using the [`HASH_ALGORITHM`](#hash-algorithm) and retain the hash for inclusion in an [Anchor File](#anchor-file), if publication of the DID is desired.
4. Generate and retain a [`COMMITMENT_VALUE`](#commitment-value) for use in the next Update operation, herein referred to as _Update Commitment_.
5. Generate an _Update Commitment Hash_ using the [`HASH_ALGORITHM`](#hash-algorithm) and retain the hash for inclusion in an [Anchor File](#anchor-file), if publication of the DID is desired.
6. Generate a `Base64URL` encoded representation of the following object, herein referred to as the [_Create Operation Data Object_](#create-data-object){ id="create-data-object" }:
    ```json
    {
      "patches": [ PATCH_1, PATCH_2, ... ],
      "update_commitment": HASH_OF_UPDATE_COMMITMENT_VALUE
    }
    ```
    - The object MUST contain a `patches` property, and its value MUST be an array of [DID State Patches](#did-state-patches).
    - The object MUST contain a `update_commitment` property, and its value MUST be the hash of a new _Update Commitment_ to be revealed for the next Update operation.

### Update

The following process must be used to update the state a Sidetree-based DID:

1. Retrieve the _Update Reveal Value_ that matches the previously anchored _Update Commitment_.
2. Generate an object, herein referred to as the [_Update Operation Data Object_](#update-data-object){ id="update-data-object" }, composed as follows:
    ```json
    {
      "patches": [ PATCH_1, PATCH_2, ... ],
      "update_commitment": HASH_OF_UPDATE_COMMITMENT_VALUE
    }
    ```
    - The object MUST contain a `patches` property, and its value MUST be an array of [DID State Patches](#did-state-patches).
    - The object MUST contain a `update_commitment` property, and its value MUST be the hash of a new _Update Commitment_ to be revealed for the next Update operation.
    
### Recover

Use the following process to generate a Sidetree-based DID:

1. Retrieve the _Recovery Reveal Value_ that matches the previously anchored _Recovery Commitment_.
2. Generate and retain a [`COMMITMENT_VALUE`](#commitment-value) for use in the next Recovery operation, herein referred to as _Next Recovery Commitment_.
3. Generate a _Recovery Commitment_ of the _Next Recovery Commitment_ using the [`HASH_ALGORITHM`](#hash-algorithm), and retain the hash for inclusion in an [Anchor File](#anchor-file).
4. Generate and retain a [`COMMITMENT_VALUE`](#commitment-value) for use in the next Update operation, herein referred to as _Next Update Commitment_.
4. Generate an _Update Commitment Hash_ of the _Next Update Commitment_ using the [`HASH_ALGORITHM`](#hash-algorithm), and retain the hash for inclusion in an [Anchor File](#anchor-file).
6. Optionally, the recovering entity MAY generate a new key pair, via the [`KEY_ALGORITHM`](#key-algorithm), for inclusion in the Anchor File (to support key rolling, etc.). The private key MUST be securely stored for use in subsequent [Recovery](#recover) operations.
7. Generate a `Base64URL` encoded representation of the following object, herein referred to as the [_Recovery Operation Data Object_](#recover-data-object){ id="recover-data-object" }, composed as follows:
    ```json
    {
      "patches": [ PATCH_1, PATCH_2, ... ],
      "update_commitment": HASH_OF_UPDATE_COMMITMENT_VALUE
    }
    ```
    - The object MUST contain a `patches` property, and its value MUST be an array of [DID State Patches](#did-state-patches).
    - The object MUST contain a `update_commitment` property, and its value MUST be the hash of a new _Update Commitment_ to be revealed for the next Update operation.
    
### Deactivate

The following process must be used to deactivate a Sidetree-based DID:

1. Retrieve the _Recovery Reveal Value_ that matches the previously anchored _Recovery Commitment_.
2. Concatenate the [DID Suffix](#did-suffix) hash with the _Recovery Reveal Value_ and sign over the resulting string using the [`SIGNATURE_ALGORITHM`](#sig-algorithm). Retain the signature for inclusion in an [Anchor File](#anchor-file)
