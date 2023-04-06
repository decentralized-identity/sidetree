


## DID Operations

Sidetree-based DIDs support a variety of DID operations, all of which require the DID owner to generate specific data values and cryptographic material. The sections below describe how to perform each type of operation, and how those operations are represented in the CAS-replicated files that are anchored to the underlying anchoring system.

While virtually all DID owners will engage User Agent applications on their local devices to perform these operations, most will not generate the anchoring transactions on the underlying anchoring system. Instead, most users will likely send the anchoring-related operation values they generate to external nodes for anchoring. This is relatively safe, because operations require signatures that an external node cannot forge. The only attack available to a rogue node operator is to not anchor the operations a DID owner sends them. However, the DID owner can detect this (via a scan of subsequent blocks) and send their operation to a different node or do it themselves, if they so desire.

It is strongly advised that DID owners and User Agents (e.g. wallet apps) retain their DID operations and operation-anchoring files. Doing so is helpful in cases where users, or their User Agent, need to quickly access the operations and operation-anchoring files, or a user wishes to individually persist their operation and operation-anchoring files on the CAS network for even greater independent availability assurance.

::: note
  This specification does not define an API for sending public DID operation values to third-party Sidetree nodes for external anchoring, as that is an elective activity has no bearing on the technical workings of the protocol, its capabilities, or its security guarantees.
:::

::: warning
  Operations other than Create contain a compact JWS. Dereferencing of key material used to verify the JWS is a DID Method specific concern. Some methods may rely of the DID Document data model, others may rely on an internal data model. Some methods may rely on `kid` of the form `did:example:123#fingerprint`, others may not include a `kid` in the JWS, or its value may be arbitrary. Support for specific `alg` fields is also DID Method specific. Implementers are cautioned to choose support for specific `alg` values carefully.
:::

### Create

Use the following process to generate a Sidetree-based DID:

1. Generate a key pair using the defined [`KEY_ALGORITHM`](#key-algorithm), let this be known as the [Update Key Pair](#update-key-pair).
2. Generate a [public key commitment](#public-key-commitment) using the defined [public key commitment scheme](#public-key-commitment-scheme) and public key of the generated [Update Key Pair](#update-key-pair), let this resulting commitment be known as the [update commitment](#update-commitment).
3. Generate a canonicalized representation of the following object using the implementation's [`JSON_CANONICALIZATION_SCHEME`](#json-canonicalization-scheme), herein referred to as the [_Create Operation Delta Object_](#create-delta-object){ id="create-delta-object" }:
    ```json
    {
      "patches": [ PATCH_1, PATCH_2, ... ],
      "updateCommitment": COMMITMENT_HASH
    }
    ```
    - The object ****MUST**** contain a `patches` property, and its value ****MUST**** be a JSON array of [DID State Patches](#did-state-patches).
    - The object ****MUST**** contain an `updateCommitment` property, and its value ****MUST**** be the [update commitment](#update-commitment) as generated in step 2.
4. Generate a key pair using the defined [`KEY_ALGORITHM`](#key-algorithm), let this be known as the [recovery key pair](#recovery-key-pair), where the public key of this pair is used for generating the [recovery commitment](#recovery-commitment), and the private key for use in the next [recovery](#recovery) operation.
5. Generate a [public key commitment](#public-key-commitment) using the defined [public key commitment scheme](#public-key-commitment-scheme) and public key of the generated [recovery key pair](#recovery-key-pair), let this resulting commitment be known as the [recovery commitment](#recovery-commitment).
6. Generate a canonicalized representation of the following object using the implementation's [`JSON_CANONICALIZATION_SCHEME`](#json-canonicalization-scheme), herein referred to as the [_Create Operation Suffix Data Object_](#create-suffix-data-object){ id="create-suffix-data-object" }:
    ```json
    {
      "type": TYPE_STRING,
      "deltaHash": DELTA_HASH,
      "recoveryCommitment": COMMITMENT_HASH,
      "anchorOrigin": ANCHOR_ORIGIN
    }
    ```
    - The object ****MAY**** contain a `type` property, and if present, its value ****MUST**** be a type string, of a length and composition defined by the implementation, that signifies the type of entity a DID represents.
    - The object ****MUST**** contain a `deltaHash` property, and its value ****MUST**** be a hash of the canonicalized [_Create Operation Delta Object_](#create-delta-object) (detailed above), generated via the [`HASH_PROTOCOL`](#hash-protocol).
    - The object ****MUST**** contain a `recoveryCommitment` property, and its value ****MUST**** be the [recovery commitment](#recovery-commitment) as generated in step 5.
    - The object ****MAY**** contain an `anchorOrigin` property if an implemention defines this property.  This property signifies the implementer-defined system(s) that know the most recent anchor for this DID. The property's type and composition is defined by the implementation. Implementers ****MAY**** define this property since implementers with a single common anchoring system do not need to support this property.

::: note
Implementations ****MAY**** choose to define additional properties for inclusion in the [_Create Operation Suffix Data Object_](#create-suffix-data-object), but the presence of any properties beyond the standard properties or implementation-defined properties ****ARE NOT**** permitted.
:::

::: warning
The string values used in the type field must be carefully considered, and this specification strongly cautions implementers to avoid allowing any values that represent humans, groups of humans, or any human-identifying classifications.
:::

### Update

The following process must be used to update the state a Sidetree-based DID:

1. Retrieve the _Update Reveal Value_ that matches the previously anchored _Update Commitment_.
2. Generate a canonicalized representation of the following object using the implementation's [`JSON_CANONICALIZATION_SCHEME`](#json-canonicalization-scheme), herein referred to as the [_Update Operation Delta Object_](#update-delta-object){ id="update-delta-object" }, composed as follows:
    ```json
    {
      "patches": [ PATCH_1, PATCH_2, ... ],
      "updateCommitment": COMMITMENT_HASH
    }
    ```
    - The object ****MUST**** contain a `patches` property, and its value ****MUST**** be an array of [DID State Patches](#did-state-patches).
    - The object ****MUST**** contain a `updateCommitment` property, and its value ****MUST**** be a new _Update Commitment_, the value of which will be revealed for the next Update operation.
3. Generate an [IETF RFC 7515](https://tools.ietf.org/html/rfc7515) compliant compact JWS representation of the following object, herein referred to as the [_Update Operation Signed Data Object_](#update-signed-data-object){ id="update-signed-data-object" }, with a signature that validates against a currently active update key, and contains the following payload values:
    ```json
    {
      "protected": {...},
      "payload": {
        "updateKey": JWK_OBJECT,
        "deltaHash": DELTA_HASH
      },
      "signature": SIGNATURE_STRING
    }
    ```
    - The JWS `payload` object ****MUST**** include a `updateKey` property, and its value ****MUST**** be the [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) compliant JWK representation matching the previous _Update Commitment_.
    - The JWS `payload` object ****MUST**** contain a `deltaHash` property, and its value ****MUST**** be a hash of the canonicalized [_Update Operation Delta Object_](#update-delta-object), generated via the [`HASH_PROTOCOL`](#hash-protocol), with a maximum length as specified by the [`MAX_OPERATION_HASH_LENGTH`](#max-operation-hash-length).

### Recover

Use the following process to recover a Sidetree-based DID:

1. Retrieve the _Recovery Key_ that matches the previously anchored _Recovery Commitment_. This value will be used in constructing an [_Core Index File Recovery Entry_](#core-index-file-recovery-entry) for the DID being recovered.
2. Generate a new [recovery key pair](#recovery-key-pair), which ****MUST NOT**** be the same key used in any previous operations, via the [`KEY_ALGORITHM`](#key-algorithm), retaining the _Next Recovery Public Key_ for use in generating the next _Recovery Commitment_, and the private key for use in the next [Recovery](#recover) operation.
3. Create a _Recovery Commitment_ using the [Hashing Process](#hashing-process) to generate a hash value from the canonicalized [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) JWK representation (using the implementation's [`JSON_CANONICALIZATION_SCHEME`](#json-canonicalization-scheme)) of the _Next Recovery Public Key_, and retain the hash value for inclusion in an [Core Index File](#core-index-file).
4. Generate a new [Update Key Pair](#update-key-pair), which ****SHOULD NOT**** be the same key used in any previous operations, via the [`KEY_ALGORITHM`](#key-algorithm), retaining the _Next Update Public Key_ for use in generating the next _Update Commitment_, and the private key for use in the next [Update](#update) operation.
5. Create an _Update Commitment_ using the [Hashing Process](#hashing-process) to generate a hash value from the canonicalized [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) JWK representation (using the implementation's [`JSON_CANONICALIZATION_SCHEME`](#json-canonicalization-scheme)) of the _Next Update Public Key_, and retain the hash value for inclusion in the [_Recovery Operation Delta Object_](#recover-delta-object) (as described below).
6. Generate and retain a [`COMMITMENT_VALUE`](#commitment-value), in adherence with the [Commitment Schemes](#commitment-schemes) directives, for use in the next Update operation, herein referred to as the _Update Reveal Value_.
7. Generate an _Update Commitment_ using the [Hashing Process](#hashing-process), in adherence with the [Commitment Schemes](#commitment-schemes) directives, to generate a hash of the _Update Reveal Value_, and retain the resulting hash value for inclusion in an [Core Index File](#core-index-file).
8. Generate a canonicalized representation of the following object using the implementation's [`JSON_CANONICALIZATION_SCHEME`](#json-canonicalization-scheme), herein referred to as the [_Recovery Operation Delta Object_](#recover-delta-object){ id="recover-delta-object" }, composed as follows:
    ```json
    {
      "patches": [ PATCH_1, PATCH_2, ... ],
      "updateCommitment": COMMITMENT_HASH
    }
    ```
    - The object ****MUST**** contain a `patches` property, and its value ****MUST**** be an array of [DID State Patches](#did-state-patches).
    - The object ****MUST**** contain a `updateCommitment` property, and its value ****MUST**** be the _Update Commitment_, as described above.
9. Generate an [IETF RFC 7515](https://tools.ietf.org/html/rfc7515) compliant compact JWS representation of the following object, herein referred to as the [_Recovery Operation Signed Data Object_](#recovery-signed-data-object){ id="recovery-signed-data-object" }, with a signature that validates against a currently active recovery key, and contains the following `payload` values:
    ```json
    {
      "protected": {...},
      "payload": {
        "recoveryCommitment": COMMITMENT_HASH,
        "recoveryKey": JWK_OBJECT,
        "deltaHash": DELTA_HASH,
        "anchorOrigin": ANCHOR_ORIGIN
      },
      "signature": SIGNATURE_STRING
    }
    ```
    - The JWS `payload` object ****MUST**** contain a `recoveryCommitment` property, and its value ****MUST**** be the next [_Recovery Commitment_](#recovery-commitment), as described above, with a maximum length as specified by the [`MAX_OPERATION_HASH_LENGTH`](#max-operation-hash-length).
    - The JWS `payload` object ****MUST**** include a `recoveryKey` property, and its value ****MUST**** be the [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) JWK representation matching the previous _Recovery Commitment_.
    - The JWS `payload` object ****MUST**** contain a `deltaHash` property, and its value ****MUST**** be a hash of the canonicalized [_Recovery Operation Delta Object_](#recover-delta-object), generated via the [`HASH_PROTOCOL`](#hash-protocol), with a maximum length as specified by the [`MAX_OPERATION_HASH_LENGTH`](#max-operation-hash-length).
    - The JWS `payload` object ****MAY**** contain an `anchorOrigin` property if an implemention defines this property.  This property signifies the implementer-defined system(s) that know the most recent anchor for this DID. The property's type and composition is defined by the implementation. Implementers ****MAY**** define this property since implementers with a single common anchoring system do not need to support this property.

### Deactivate

The following process must be used to deactivate a Sidetree-based DID:

1. Retrieve the _Recovery Reveal Value_ that matches the previously anchored _Recovery Commitment_.
2. Generate a [IETF RFC 7515](https://tools.ietf.org/html/rfc7515) compliant compact JWS object, herein referred to as the [_Deactivate Operation Signed Data Object_](#deactivate-signed-data-object){ id="deactivate-signed-data-object" }, with a signature that validates against the currently active recovery key, and contains the following `payload` values:
    ```json
    {
      "protected": {...},
      "payload": {
        "didSuffix": SUFFIX_STRING,
        "recoveryKey": JWK_OBJECT
      },
      "signature": SIGNATURE_STRING
    }
    ```
    - The JWS `payload` object ****MUST**** contain a `didSuffix` property, and its value ****MUST**** be the [DID Suffix](#did-suffix) of the DID the operation pertains to, with a maximum length as specified by the [`MAX_OPERATION_HASH_LENGTH`](#max-operation-hash-length).
    - The JWS `payload` object ****MUST**** include a `recoveryKey` property, and its value ****MUST**** be the [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) JWK representation matching the previous _Recovery Commitment_.
    
