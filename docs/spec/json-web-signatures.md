## JSON Web Signatures

Sidetree relies on JSON Web Signatures for authentication and integrity protection of [DID Operations](https://identity.foundation/sidetree/spec/#did-operations), accept for Create, with contains key material and is self certifying.

### Signing

In addition to [RFC7515](https://tools.ietf.org/html/rfc7515), the following additional requirements MUST be observed by Sidetree Method implementeers.

1. `kid` MUST be present in the protected header.
2. `alg` MUST be present in the protected header, its value MUST NOT be none.
3. No additional members may be present in the protected header.

Here is an example of a decoded JWS header:

```json
{
  "kid": "did:example:123#_Qq0UL2Fq651Q0Fjd6TvnYE-faHiOpRlPVQcY_-tA4A",
  "alg": "EdDSA"
}
```

### Verifying

If `kid` is a DID URL, the verification key MAY be resolved as follows:

1. Resolve the `kid` value using a resolver.
2. iterate the `operations` and `recovery` verificationMethods, until a verificationMethod with `id` equal to `kid` is found.
3. A [Recover Operation](https://identity.foundation/sidetree/spec/#recover) is only valid when signed by a key listed in `recovery`. Other operations are only valid when signed with keys listed in `operations`. If the key is not present in the expected collection, verification fails, and the operation is considered invalid. If the key is present in the expected collection proceed.
3. Convert the discovered verificationMethod to JWK if necessary.
4. Perform [JWS Verification](https://tools.ietf.org/html/rfc7515#section-5.2) using the JWK.
5. The operation is considered valid if key material was present in the correct collection and the signature is valid.


If `kid` is not a DID URL, the verification key MAY be resolved as follows:

1. Iterate an internal representation of keys registered for use with the DID until a jwk with `kid` equal to `kid` is found.
2. Ensure that the `usage` property of the internal key represenation is `recovery` if the operation is a recovery operation or `ops` if the operation is not Recovery or Update.
3. Perform [JWS Verification](https://tools.ietf.org/html/rfc7515#section-5.2) using the JWK.
4. The operation is considered valid if key material was present with the correct usage and the signature is valid.

::: warning
  Operations may be valid, and yet still rejected in the resolution process.
:::