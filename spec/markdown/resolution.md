

## Resolution


<!--
2. The `recovery_reveal_value` MUST be the value that corresponds to the currently valid _Recovery Commitment_ - if it DOES NOT, cease processing the operation and move to the next operation in the array.
    3. The included signature MUST a signature over the operation values that validates against the currently valid _Recovery Public Key_ - if it DOES NOT, cease processing the operation and move to the next operation in the array.
    4. With the reveal value and signature validated, persist the operation data within the implementation to hold this and future operational data, and retain the [_Initial Recovery Commitment_](#initial-recovery-commitment) and [_Initial Recovery Key](#initial-recovery-key) values from [_Anchor File Create Entries_](#anchor-file-create-entry) for use in validating a future Recovery operation.
-->

### Unpublished DID Resolution

DID URI strings may include additional values that are used in resolution and other activities. The standard way to pass these values are through _DID URL Parameters_, as defined by the [W3C Decentralized Identifiers](https://w3c.github.io/did-core/) specification.

Many DID Methods require a period of time (which may be indefinite) between the generation of a DID and the DID being anchored/propagated in the underlying ledger system, and other layers for which propagation delays may apply. Sidetree introduces the `-METHOD-initial-state` _DID URL Parameter_ to enable resolution of unpropagated and unpublished DIDs. To use a Sidetree-based DID immediately after generation, the controller MUST include the `-METHOD-initial-state` _DID URL Parameter_ in the DID URI string, with the value being a string composed of the [_Create Operation Suffix Data Object_](#create-suffix-data-object) and the [_Create Operation Delta Object_](#create-delta-object), separated by a period (`.`):

```html
did:METHOD:<did-suffix>?-METHOD-initial-state=<create-delta-object>.<create-suffix-data-object>
```

The addition of this _DID URL Parameter_ mechanism of conveying the initial, _self-certifying_ state of a DID, known as the [_Long-Form DID URI_](#long-form-did){id="long-form-did"} supports the following features and usage patterns:

- Resolving the DID Documents of unpublished DIDs.
- Authenticating with unpublished DIDs.
- Signing and verifying credentials signed against unpublished DIDs.
- After publication and propagation are complete, authenticating with either the [_Short-Form DID URI_](#short-form-did) or [_Long-Form DID URI_](#long-form-did).
- After publication and propagation are complete, signing and verifying credentials signed against either the [_Short-Form DID URI_](#short-form-did) or [_Long-Form DID URI_](#long-form-did).

### Resolver Metadata

#### `published` property

At such time an ID is published/anchored, a user can provide either the parametered or unparametered version of the Sidetree DID URI to an external party, and it will be resolvable. There is no required change for any party that had been holding the parametered version of the URI - it will continue to resolve just as it had prior to being anchored. In addition, the community will introduce a generic, standard property: `published` in the [DID resolution spec](https://w3c-ccg.github.io/did-resolution/#output-resolvermetadata), that is added to the DID resolution response. The `published` property indicates whether a DID has been published/anchored in the underlying trust system a DID Method writes to. When an entity resolves any DID from any DID Method and finds that the DID has been published, the entity may drop the `initial-state` DID parameter from their held references to the DID in question, if they so desire. However, dropping the `initial-state` DID parameter after publication is purely an elective act - the ID will resolve correctly regardless.