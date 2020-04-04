

## Resolution


<!--
2. The `recovery_reveal_value` MUST be the value that corresponds to the currently valid _Recovery Commitment_ - if it DOES NOT, cease processing the operation and move to the next operation in the array.
    3. The included signature MUST a signature over the operation values that validates against the currently valid _Recovery Public Key_ - if it DOES NOT, cease processing the operation and move to the next operation in the array.
    4. With the reveal value and signature validated, persist the operation data within the implementation to hold this and future operational data, and retain the [_Initial Recovery Commitment_](#initial-recovery-commitment) and [_Initial Recovery Key](#initial-recovery-key) values from [_Anchor File Create Entries_](#anchor-file-create-entry) for use in validating a future Recovery operation.
-->

### Unpublished DID Resolution

DIDs may include attached values that are used in resolution and other activities. The standard way to pass these values are through _DID Parameters_, as defined by the W3C Decentralized Identifiers specification.

Many DID Methods may allow or require a period of time (which may be indefinite) between the generation of an ID and the ID being anchored/propagated throughout the underlying ledger system and other layers to which propagation delays may apply. In order support resolution and use of identifiers during this period Sidetree defines a Method-specific DID parameter `-METHOD_NAME-initial-state` that any DID method can use to signify initial state variables during this period.

Sidetree uses the `-METHOD_NAME-initial-state` DID parameter to enable unpublished DID resolution. After generating a new Sidetree DID, in order to use this DID immediately, the user will attach the `-METHOD_NAME-initial-state` DID Parameter to the DID, with the value being the encoded string of the create operation request.

e.g. `did:METHOD_NAME:<unique-portion>?-METHOD_NAME-initial-state=<encoded-create-operation-request>`

This allows any entity to support all of the following usage patterns:

Resolving unpublished DIDs.
Authenticating with unpublished DIDs.
Signing and verifying credentials signed against unpublished DIDs.
Authenticating with either the DID or DID with `-METHOD_NAME-initial-state` parameter, after it is published.
Signing and verifying credentials signed against either the DID or DID with `-METHOD_NAME-initial-state` parameter, after it is published.

### Resolver Metadata

#### `published` property

At such time an ID is published/anchored, a user can provide either the parametered or unparametered version of the Sidetree DID URI to an external party, and it will be resolvable. There is no required change for any party that had been holding the parametered version of the URI - it will continue to resolve just as it had prior to being anchored. In addition, the community will introduce a generic, standard property: `published` in the [DID resolution spec](https://w3c-ccg.github.io/did-resolution/#output-resolvermetadata), that is added to the DID resolution response. The `published` property indicates whether a DID has been published/anchored in the underlying trust system a DID Method writes to. When an entity resolves any DID from any DID Method and finds that the DID has been published, the entity may drop the `initial-values` DID parameter from their held references to the DID in question, if they so desire. However, dropping the `initial-values` DID parameter after publication is purely an elective act - the ID will resolve correctly regardless.