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

Regardless of which verification relationship a verificationMethod is associated with, the process of verifying a JWS linked to a DID is the same.

The JWS header is parsed and a `kid` is extracted.

1. Iterate the verificationMethods, until a verificationMethod with `id` equal to `kid` is found.
2. Convert the discovered verificationMethod to JWK if necessary.
3. Perform [JWS Verification](https://tools.ietf.org/html/rfc7515#section-5.2) using the JWK.

#### Operation Verification

Sidetree operations are considered valid when the JWS can be verified, and where the verificationMethod used is associated with the correct verification relationship.

`operation`, `recovery` are verification relationships for verifying sidetree operations which sidetree DID Methods MUST support, and which MAY be exposed externally via the DID Document or Resolver Method Meta Data.

An [Update Operation](https://identity.foundation/sidetree/spec/#update) MUST be signed by an [Operation Key Pair](#operation-key-pair) that is authorized for an update operation. The public key of this key pair or a commitment to the public key MAY be exposed in the DID Document or Resolver Meta Data, and MAY be associated with an `operation` verification relationship. 

A [Recover Operation](https://identity.foundation/sidetree/spec/#recover) MUST by signed by [Recovery Key Pair](#recovery-key-pair) that is authorized for a recovery operation. The public key of this key pair or a commitment to the public key MAY be exposed in the DID Document or Resolver Meta Data, and MAY be associated with a `recovery` verification relationship. 

A [Deactivate Operation](https://identity.foundation/sidetree/spec/#deactivate) MUST by signed by [Recovery Key Pair](#recovery-key-pair) that is authorized for a recovery operation. The public key of this key pair or a commitment to the public key MAY be exposed in the DID Document or Resolver Meta Data, and MAY be associated with a `recovery` verification relationship. 

If a verificationMethod with `id` matching the JWS `kid` is not present in the expected collection, the sidetree operation is considered not valid.

::: warning
  Operations may be verified, and yet still rejected in the resolution process.
:::

DID Core also defines verification relationships which sidetree DID Methods MAY support.

`assertionMethod` for use with Verifiable Credentials.
`authentication` for use with Verifiable Presentations, and general authentication flows.
`capabilityInvocation` and `capabilityDelegation` for use with Object Capabilities used by Secure Data Stores / Encrypted Data vaults. 

_Operation Key_ and _Recovery Key_ public key representations MAY be present in any verification relationship.

::: warning
  verificationMethod objects can be embedded, or referenced by `id`.
:::

::: warning
  verificationMethod `id` can be a pure fragment, such as `#key-0` or a well formed URI, such as `did:example:123#key-1`. The later is much more common, and the former may lead to interoperability issues.
:::

::: warning
  It is not recommended to reuse verificationMethods for multiple verification relationships.
:::
