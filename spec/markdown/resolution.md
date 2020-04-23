

## Resolution

### Operation Compilation

1. Upon invocation of resolution, retrieve all observed operations for the [DID Unique Suffix](#did-unique-suffix) of the DID URI being resolved.
2. If record of the DID being published has been observed, proceed to Step 3. If there is no observed record of the DID being published, skip all remaining [Operation Compilation](#operation-compilation) steps and process the DID as follows:
    1. If the DID URI ****does not**** include a `-METHOD-initial-state` _DID URL Parameter_ with a Method-specific prefix that matches the name of the implementation, abort resolution and return _Unresolvable_.
    2. If the DID URI ****does**** include a `-METHOD-initial-state` _DID URL Parameter_ with a Method-specific prefix that matches the name of the implementation, process the DID as follows:
        1. Split the `-METHOD-initial-state` _DID URL Parameter_ string value by the period (`.`) character, and ensure the resulting array contains ****exactly**** two (2) members. If the resulting array contains fewer than two members, abort resolution and return _Unresolvable_.
        2. Using the implementation's [`DATA_ENCODING_SCHEME`](#data-encoding-scheme), decode the both members of the array and retain the resulting values. If the values fail to properly decode in accordance with the implementation's [`DATA_ENCODING_SCHEME`](#data-encoding-scheme), abort resolution and return _Unresolvable_.
        3. Let the decoded value at the 0 index be the DID's [_Create Operation Suffix Data Object_](#create-suffix-data-object), and validate it as such. If the value is found to be a valid [_Create Operation Suffix Data Object_](#create-suffix-data-object), proceed, if the value fails validation, abort resolution and return _Unresolvable_.
        4. Let the decoded value at the 0 index be the DID's [_Create Operation Delta Object_](#create-delta-object) (which is present in a [_Chunk File Delta Entry_](#chunk-file-delta-entry) for published, anchored DIDs), and validate it as such. If the value is found to be a valid [_Create Operation Delta Object_](#create-delta-object) , proceed, if the value fails validation, abort resolution and return _Unresolvable_.
        5. If all steps above are successful, internally flag the state of the DID as _Unpublished_ and continue to Step 4 of the Operation Compilation process ([create operation processing](#create-operation-processing)) as if the values decoded and validated in the steps above represent the only operation associated with the DID.
3. Ensure all operations for the DID are sorted in ascending [`Ledger Time`](#ledger-time) order.
4. [Create operation processing](#create-operation-processing){id="create-operation-processing"}: begin iterating the operations from earliest in [`Ledger Time`](#ledger-time) forward, until a Create operation is found. If no Create operation is found, cease resolution of the DID and declare the DID unresolvable. If a Create operation is found, process the Create operation as follows:
    1. Retrieve the [_Chunk File Delta Entry_](#chunk-file-delta-entry) from the pre-processed [Chunk File](#chunk-file) associated with the operation and proceed to the processing instruction, or, if the [Chunk File](#chunk-file) has not yet been retrieved and processed (i.e. node is a [_Light Node_](#light-node) implementation, file was previously unavailable, etc.), perform the following steps:
        1. Using the [`CAS_PROTOCOL`](#cas-protocol), fetch the [Chunk File](#chunk-files) using the associated _Chunk File URI_. If the file is unable to be retrieved:
            1. Internally flag the state of the DID as _Non-Updateable_.
            2. Skip all further Create operation processing steps and proceed to [post-Create operation processing](#post-create-operation-processing).
        2. Validate the [Chunk File](#chunk-file) using the [Chunk File Processing](#chunk-file-processing) procedure. If the [Chunk File](#chunk-file) is valid, proceed, if the file is invalid:
            1. Internally flag the state of the DID as _Non-Updateable_.
            2. Skip all further Create operation processing steps and proceed to [post-Create operation processing](#post-create-operation-processing).
    2. Validate the [_Chunk File Delta Entry_](#chunk-file-delta-entry). If the [_Chunk File Delta Entry_](#chunk-file-delta-entry) is valid, proceed, if the Entry is invalid, let the state of the DID reflect an _Empty DID State_.
    3. Generate a hash of the [_Chunk File Delta Entry_](#chunk-file-delta-entry) via the [Hashing Process](#hashing-process) and ensure the hash equals the value of the [_Create Operation Suffix Data Object_](#create-suffix-data-object) `delta_hash` property. If the values are exactly equal, proceed, if they are not:
        1. Internally flag the state of the DID as _Non-Updateable_.
        2. Skip all further Create operation processing steps and proceed to [post-Create operation processing](#post-create-operation-processing).
    4. Retain a reference to the `update_commitment` value of the [_Chunk File Delta Entry_](#chunk-file-delta-entry) for use in processing the next Update operation.
    5. Begin iterating the `patches` array in the [_Chunk File Delta Entry_](#chunk-file-delta-entry), and for each [DID State Patch](#did-state-patch) entry, perform the following steps:
        1. Validate the entry in accordance any requirements imposed by the [Patch Action](#standard-patch-actions) type indicated by the `action` value of the entry. If the entry is valid, proceed, if the entry fails validation, skip the entry and proceed to the next entry.
        2. Apply the patch as directed by the [Patch Action](#standard-patch-actions) type specified by the `action` property. If any part of the patch fails or produces an error, reverse all modifications to the DID's state and proceed to the next entry.
5. [Post-Create operation processing](#post-create-operation-processing) Once a Create operation has been successfully processed, proceed iterating forward in the DID's observed operation set using the following processing rules depending on the operation type for each operation entry:

    - If the entry is another Create operation, skip the entry and proceed to the next operation.

    - If the entry is an Update operation, process as follows:
      
      1. If the DID is flagged as _Non-Updateable_, skip the entry and proceed to the next operation.
      2. Generate a hash of the entry's `update_reveal_value` using the [Hashing Process](#hashing-process) and compare the output to the currently retained _Update Commitment_. If the values are exactly equal, proceed, if they are not, skip the entry and proceed to the next operation.
      3. Using the `kid` from the operation's [_Update Operation Signed Data Object_](#update-signed-data-object), locate the key currently associated with the DID that matches the `kid` value, and ensure it is designated as a key allowed to perform operations (e.g. has an[`add-public-keys`](#add-public-keys) Patch Action `usage` designation of `ops`). If no currently associated key matches the `kid` value, or the key is not designated as a key allowed to perform operations, skip the entry and proceed to the next operation.
      4. Using the specified key, validate the [_Update Operation Signed Data Object_](#update-signed-data-object) signature. If the signature is valid, proceed, if the signature is invalid, skip the entry and proceed to the next operation.
      5. Retrieve the [_Chunk File Delta Entry_](#chunk-file-delta-entry) from the pre-processed [Chunk File](#chunk-file) associated with the operation and proceed to the processing instruction, or, if the [Chunk File](#chunk-file) has not yet been retrieved and processed (i.e. node is a [_Light Node_](#light-node) implementation, file was previously unavailable, etc.), perform the following steps:
          1. Using the [`CAS_PROTOCOL`](#cas-protocol), fetch the [Chunk File](#chunk-files) using the associated _Chunk File URI_. If the file is unable to be retrieved:
              1. Internally flag the state of the DID as _Non-Updateable_.
              2. Skip all further processing of the operation and proceed to the next entry.
          2. Validate the [Chunk File](#chunk-file) using the [Chunk File Processing](#chunk-file-processing) procedure. If the [Chunk File](#chunk-file) is valid, proceed, if the file is invalid:
              1. Internally flag the state of the DID as _Non-Updateable_.
              2. Skip all further processing of the operation and proceed to the next entry.
      6. Validate the [_Chunk File Delta Entry_](#chunk-file-delta-entry). If the [_Chunk File Delta Entry_](#chunk-file-delta-entry) is valid, proceed, if the Entry is invalid, let the state of the DID reflect an _Empty DID State_.
      7. Generate a hash of the [_Chunk File Delta Entry_](#chunk-file-delta-entry) via the [Hashing Process](#hashing-process) and ensure the hash equals the value of the [_Update Operation Signed Data Object_](#update-signed-data-object) `delta_hash` property. If the values are exactly equal, proceed, if they are not:
          1. Internally flag the state of the DID as _Non-Updateable_.
          2. Skip all further processing of the operation and proceed to the next entry.
      8. Retain a reference to the `update_commitment` value of the [_Chunk File Delta Entry_](#chunk-file-delta-entry) for use in processing the next Update operation.
      9. Begin iterating the `patches` array in the [_Chunk File Delta Entry_](#chunk-file-delta-entry), and for each [DID State Patch](#did-state-patch) entry, perform the following steps:
          1. Validate the entry in accordance any requirements imposed by the [Patch Action](#standard-patch-actions) type indicated by the `action` value of the entry. If the entry is valid, proceed, if the entry fails validation, skip the entry and proceed to the next entry.
          2. Apply the patch as directed by the [Patch Action](#standard-patch-actions) type specified by the `action` property. If any part of the patch fails or produces an error, reverse all modifications to the DID's state and proceed to the next entry.


    - If the entry is a Recovery operation, process as follows:

      1. Generate a hash of the entry's `recovery_reveal_value` using the [Hashing Process](#hashing-process) and compare the output to the currently retained _Recovery Commitment_. If the values are exactly equal, proceed, if they are not, skip the entry and proceed to the next operation.
      2. Using the current recovery key, validate the [_Recovery Operation Signed Data Object_](#recovery-signed-data-object) signature. If the signature is valid, proceed, if the signature is invalid, skip the entry and proceed to the next operation.
      3. If the DID is flagged as _Non-Updateable_, remove the flag.
      4. Retain a reference to the `recovery_commitment` value of the [_Recovery Operation Signed Data Object_](#recovery-signed-data-object) for use in processing the next Recovery operation.
      5. If the [_Recovery Operation Signed Data Object_](#recovery-signed-data-object) includes a `recovery_key` property with a value that is an [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) compliant JWK representation of a public key, discard the current recovery key and retain the new key for use in processing the next Recovery operation.
      5. Retrieve the [_Chunk File Delta Entry_](#chunk-file-delta-entry) from the pre-processed [Chunk File](#chunk-file) associated with the operation and proceed to the processing instruction, or, if the [Chunk File](#chunk-file) has not yet been retrieved and processed (i.e. node is a [_Light Node_](#light-node) implementation, file was previously unavailable, etc.), perform the following steps:
          1. Using the [`CAS_PROTOCOL`](#cas-protocol), fetch the [Chunk File](#chunk-files) using the associated _Chunk File URI_. If the file is unable to be retrieved:
              1. Internally flag the state of the DID as _Non-Updateable_.
              2. Skip all further processing of the operation and proceed to the next entry.
          2. Validate the [Chunk File](#chunk-file) using the [Chunk File Processing](#chunk-file-processing) procedure. If the [Chunk File](#chunk-file) is valid, proceed, if the file is invalid:
              1. Internally flag the state of the DID as _Non-Updateable_.
              2. Skip all further processing of the operation and proceed to the next entry.
      6. Validate the [_Chunk File Delta Entry_](#chunk-file-delta-entry). If the [_Chunk File Delta Entry_](#chunk-file-delta-entry) is valid, proceed, if the Entry is invalid, let the state of the DID reflect an _Empty DID State_.
      7. Generate a hash of the [_Chunk File Delta Entry_](#chunk-file-delta-entry) via the [Hashing Process](#hashing-process) and ensure the hash equals the value of the [_Recovery Operation Signed Data Object_](#recovery-signed-data-object) `delta_hash` property. If the values are exactly equal, proceed, if they are not:
          1. Internally flag the state of the DID as _Non-Updateable_.
          2. Skip all further processing of the operation and proceed to the next entry.
      8. Retain a reference to the `update_commitment` value of the [_Chunk File Delta Entry_](#chunk-file-delta-entry) for use in processing the next Update operation.
      9. Begin iterating the `patches` array in the [_Chunk File Delta Entry_](#chunk-file-delta-entry), and for each [DID State Patch](#did-state-patch) entry, perform the following steps:
          1. Validate the entry in accordance any requirements imposed by the [Patch Action](#standard-patch-actions) type indicated by the `action` value of the entry. If the entry is valid, proceed, if the entry fails validation, skip the entry and proceed to the next entry.
          2. Apply the patch as directed by the [Patch Action](#standard-patch-actions) type specified by the `action` property. If any part of the patch fails or produces an error, reverse all modifications to the DID's state and proceed to the next entry.

    - If the entry is a Deactivation operation, process as follows:

      1. Generate a hash of the entry's `recovery_reveal_value` using the [Hashing Process](#hashing-process) and compare the output to the currently retained _Recovery Commitment_. If the values are exactly equal, proceed, if they are not, skip the entry and proceed to the next operation.
      2. Using the current recovery key, validate the [_Deactivate Operation Signed Data Object_](#deactivate-signed-data-object) signature. If the signature is valid, proceed, if the signature is invalid, skip the entry and proceed to the next operation.
      3. If the DID is flagged as _Non-Updateable_, remove the flag.
      4. The [_Deactivate Operation Signed Data Object_](#deactivate-signed-data-object) ****must**** include a `did_suffix` property with a value that exactly equal to the [DID Suffix](#did-suffix) of the DID being operated on.
      5. The [_Deactivate Operation Signed Data Object_](#deactivate-signed-data-object) ****must**** include a `recovery_reveal_value` property, and the hash of the value (generated using the [Hashing Process](#hashing-process)) ****must**** be exactly equal to the currently retained _Recovery Commitment_. If the values are exactly equal, proceed, if they are not, skip the entry and proceed to the next operation.
      6. Mark the DID as _Deactivated_, process no further entries.
6. After the DID's operations have been evaluated in the compilation steps above, the implementation ****MUST**** use the DID's compiled state to generate a valid DID Document in accordance with the [W3C Decentralized Identifiers](https://w3c.github.io/did-core/) specification.
7. Once a valid DID Document state has been generated, proceed to the [DID Resolver Output](#did-resolver-output) process, if you intend to output the resolved DID Document in accordance with the [Decentralized Identifier Resolution](#https://w3c-ccg.github.io/did-resolution/) specification.

### DID Resolver Output

The following describes how to construct [Decentralized Identifier Resolution](#https://w3c-ccg.github.io/did-resolution/)-compliant _Resolution Result_ based on a DID resolved via the [Operation Compilation](#operation-compilation) process described in the section above.

If the compiled DID ****was not**** determined to be _Unresolvable_, as defined in the [Operation Compilation](#operation-compilation) process above, proceed as follows:

1. Generate a JSON object for the _Resolution Result_, structured in accordance with the [Decentralized Identifier Resolution](https://w3c-ccg.github.io/did-resolution/#example-14-example-did-resolution-result) specification.
2. Set the `didDocument` property of the _Resolution Result_ object to the resolved DID Document generated via the [Operation Compilation](#operation-compilation) process.
3. The _Resolution Result_ object ****MUST**** include a `methodMetadata` property, and its value ****MUST**** be an object.
4. The _Resolution Result_ `methodMetadata` object ****MUST**** include a `published` property with a boolean value. If the compiled DID state is flagged as _Unpublished_ and/or _Unresolvable_ (per the [Operation Compilation](#operation-compilation) process), the `published` property ****MUST**** be set to `false`, otherwise, set the value to `true`.
5. If the compiled DID state is flagged as _Non-Updatable_ (per the [Operation Compilation](#operation-compilation) process), the _Resolution Result_ `methodMetadata` object ****MUST**** include a `non-updatable` property with a boolean value, and its value ****MUST**** be set to `true`.

#### Unresolvable DIDs

...