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

::: warning
  It is recommended that `kid` be a DID URL. If it is not, method implementers might need to rely on additional context to uniquely identify the associated verificationMethod. 
:::

### Verifying

Regardless of which proof purpose a verificationMethod is associated with, the process of verifying a JWS linked to a DID is the same.

The JWS header is parsed and a `kid` is extracted.

1. Iterate the verificationMethods, until a verificationMethod with `id` equal to `kid` is found.
2. Convert the discovered verificationMethod to JWK if necessary.
3. Perform [JWS Verification](https://tools.ietf.org/html/rfc7515#section-5.2) using the JWK.
4. The operation is considered valid if key material was present in the correct collection and the signature is valid.


#### Operation Verification

Sidetree operations are considerd valid when the JWS can be verified, and where the key used is associated with the correct proof purpose.

`operations`, `recovery` are proof purposes for verifying sidetree operations which sidetree DID Methods MUST support. A sidetree operation MUST be signed by a key associated with exactly one of these proof purposes.

An [Update Operation](https://identity.foundation/sidetree/spec/#update) MUST be signed by a key associated with the `operations` proof purpose. 

A [Recover Operation](https://identity.foundation/sidetree/spec/#recover) MUST by signed by a key associated with the `recovery` proof purpose. 

A [Deactivate Operation](https://identity.foundation/sidetree/spec/#deactivate) MUST by signed by a key associated with the `recovery` proof purpose. 

If a verificationMethod with `id` matching the JWS `kid` is not present in the expected collection, the sidetree operation is considered not valid.

::: warning
  Operations may be verified, and yet still rejected in the resolution process.
:::

DID Core also defines proof purposes which sidetree DID Methods MAY support.

`assertionMethod` for use with Verifiable Credentials.
`authentication` for use with Verifiable Presentations, and general authentication flows.
`capabilityInvocation` and `capabilityDelegation` for use with Object Capabilities used by Secure Data Stores / Encrypted Data vaults. 

::: warning
  verificationMethod objects can be embedded, or referenced by `id`.
:::

::: warning
  It is not recommended to reuse verificationMethod's for multiple proof purposes.
:::