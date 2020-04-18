## DID Suffix Composition

DID Methods based on the Sidetree protocol all share the same identifier format. The unique identifier string is a hash of the [_Create Operation Suffix Data Object_](#create-suffix-data-object), known as the [_Short-Form DID URI_](#short-form-did){id="short-form-did"}, which contains values such as the initial recovery public key and patches representing the initial state of the DID Document. The unique identifier string being cryptographically bound to these values enables Sidetree DIDs to be _self-certifying_, meaning the person or entity who creates a Sidetree-based DID knows their unique identifier the time it is generated, and it is cryptographic secure for instant use (for more on the instant use capabilities of Sidetree DIDs, see [Unpublished DID Resolution](#unpublished-did-resolution)).

To generate the unique identifier string of a Sidetree DID, use the [Hashing Process](#hashing-process) to generate a hash of the [_Create Operation Suffix Data Object_](#create-suffix-data-object). The following is an example of a resulting colon (`:`) separated DID URI composed of the URI scheme (`did:`), Method identifier (`sidetree:`), and unique identifier string (`EiBJz4...`):

```css
did:sidetree:EiBJz4qd3Lvof3boqBQgzhMDYXWQ_wZs67jGiAhFCiQFjw
```