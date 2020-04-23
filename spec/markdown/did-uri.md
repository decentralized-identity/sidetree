## DID URI Composition

DID Methods based on the Sidetree protocol all share the same identifier format. The unique identifier string is a hash of the [_Create Operation Suffix Data Object_](#create-suffix-data-object), known as the [_Short-Form DID URI_](#short-form-did){id="short-form-did"}, which contains values such as the initial recovery public key and patches representing the initial state of the DID Document. The unique identifier string being cryptographically bound to these values enables Sidetree DIDs to be _self-certifying_, meaning the person or entity who creates a Sidetree-based DID knows their unique identifier the time it is generated, and it is cryptographic secure for instant use (for more on the instant use capabilities of Sidetree DIDs, see [Unpublished DID Resolution](#unpublished-did-resolution)).

To generate the unique identifier string of a Sidetree DID, use the [Hashing Process](#hashing-process) to generate a hash of the [_Create Operation Suffix Data Object_](#create-suffix-data-object). The following is an example of a resulting colon (`:`) separated DID URI composed of the URI scheme (`did:`), Method identifier (`sidetree:`), and unique identifier string (`EiBJz4...`):

```css
did:sidetree:EiBJz4qd3Lvof3boqBQgzhMDYXWQ_wZs67jGiAhFCiQFjw
```

### Long-Form DID URIs

DID URI strings may include additional values that are used in resolution and other activities. The standard way to pass these values are through _DID URL Parameters_, as defined by the [W3C Decentralized Identifiers](https://w3c.github.io/did-core/) specification.

Many DID Methods require a period of time (which may be indefinite) between the generation of a DID and the DID being anchored/propagated in the underlying ledger system, and other layers for which propagation delays may apply. Sidetree introduces the `-METHOD-initial-state` _DID URL Parameter_ to enable resolution of unpropagated and unpublished DIDs. To use a Sidetree-based DID immediately after generation, the controller ****MUST**** include the `-METHOD-initial-state` _DID URL Parameter_ in the DID URI string, with the value being a string composed of the [_Create Operation Suffix Data Object_](#create-suffix-data-object) and the [_Create Operation Delta Object_](#create-delta-object), separated by a period (`.`), as follows:

```html
did:METHOD:<did-suffix>?-METHOD-initial-state=<create-suffix-data-object>.<create-delta-object>
```

This _DID URL Parameter_ mechanism of conveying the initial _self-certifying_ state of a DID, known as the [_Long-Form DID URI_](#long-form-did){id="long-form-did"} supports the following features and usage patterns:

- Resolving the DID Documents of unpublished DIDs.
- Authenticating with unpublished DIDs.
- Signing and verifying credentials signed against unpublished DIDs.
- After publication and propagation are complete, authenticating with either the [_Short-Form DID URI_](#short-form-did) or [_Long-Form DID URI_](#long-form-did).
- After publication and propagation are complete, signing and verifying credentials signed against either the [_Short-Form DID URI_](#short-form-did) or [_Long-Form DID URI_](#long-form-did).