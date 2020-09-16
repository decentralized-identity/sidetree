## DID URI Composition

DID Methods based on the Sidetree protocol all share the same identifier format. The unique identifier segment of a Sidetree-based DID, known as the [DID Suffix](#did-suffix), is derived by using the [Hashing Process](#hashing-process) to generate a hash value from the canonicalized [_Create Operation Suffix Data Object_](#create-suffix-data-object). The [DID Suffix](#did-suffix) is cryptographically bound to the initial PKI state of the DID, which means Sidetree DIDs are _self-certifying_. As a result, a person or entity who creates a Sidetree-based DID knows their unique identifier at the moment of generation, and it is cryptographic secured for instant use (for more on the instant use capabilities of Sidetree DIDs, see [Unpublished DID Resolution](#unpublished-did-resolution)).

To generate the [_Short-Form DID URI_](#short-form-did){id="short-form-did"} of a Sidetree DID, use the [Hashing Process](#hashing-process) to generate a hash of the canonicalized [_Create Operation Suffix Data Object_](#create-suffix-data-object). The following is an example of a resulting colon (`:`) separated DID URI composed of the URI scheme (`did:`), Method identifier (`sidetree:`), and unique identifier string (`EiBJz4...`):

```css
did:sidetree:EiBJz4qd3Lvof3boqBQgzhMDYXWQ_wZs67jGiAhFCiQFjw
```

### Long-Form DID URIs

In many DID Methods, there is a period of time (which may be indefinite) between the generation of a DID and the DID operation being anchored, propagagted, and processed in the underlying distributed ledger/storage network. In order to account for this, Sidetree introduces an equivalent variant of Sidetree-based DIDs that is _self-certifying_ and _self-resolving_, known as the [_Long-Form DID URI_](#long-form-did){id="long-form-did"}. The [_Long-Form DID URI_](#long-form-did) variant of Sidetree-based DIDs enables DIDs to be immediately resolvable after generation by including the DID's initial state data within the [_Long-Form DID URI_](#long-form-did) itself. A [_Long-Form DID URI_](#long-form-did){id="long-form-did"} is the [_Short-Form DID URI_](#short-form-did) with an additional colon-separated (`:`) segment appended to the end, the value of which is composed of the [_Create Operation Suffix Data Object_](#create-suffix-data-object) and the [_Create Operation Delta Object_](#create-delta-object) separated by a period (`.`), as follows:

```html
did:METHOD:<did-suffix>:<create-suffix-data-object>.<create-delta-object>
```

The [_Long-Form DID URI_](#long-form-did) variant of Sidetree-based DIDs supports the following features and usage patterns:

- Resolving the DID Documents of unpublished DIDs.
- Authenticating with unpublished DIDs.
- Signing and verifying credentials signed against unpublished DIDs.
- After publication and propagation are complete, authenticating with either the [_Short-Form DID URI_](#short-form-did) or [_Long-Form DID URI_](#long-form-did).
- After publication and propagation are complete, signing and verifying credentials signed against either the [_Short-Form DID URI_](#short-form-did) or [_Long-Form DID URI_](#long-form-did).