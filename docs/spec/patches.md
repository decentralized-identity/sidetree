

## DID State Patches

Sidetree defines a pluggable patching mechanism that can be extended to define new _Patch Actions_. There are only a few required _Patch Actions_ that every implementation MUST support, related to the handling and management of protocol-active keys (keys that are empowered to modify DID state). Support for any of the additional _Patch Actions_ defined in the spec is elective. Implementers MAY use the _Patch Action_ format to introduce new _Patch Actions_ that are as strict or permissive as they choose.

::: warning
Implementers of Sidetree-based DID networks that are truly open, permissionless, and decentralized should carefully consider the ramifications of adding unstructured, free-form _Patch Actions_ that are not strictly evaluated by nodes at the time of ingest, as this is very likely to result in abuse of the implementation in a myriad of ways that are not intended, and could compromise the game theoretical economic viability of the implementation.
:::

### Patching Protocol-Active Keys

#### Add public keys

::: example
```json
{
  "action": "add-public-keys",
  "publicKeys": [
    {
      "id": "123",
      "type": "Secp256k1VerificationKey2018",
      "publicKeyHex": "0268ccc80007f82d49c2f2ee25a9dae856559330611f0a62356e59ec8cdb566e69",
    }
  ]
}
```
:::

The `add-public-keys` _Patch Action_ is required - implementers MUST support this mechanism as the means by which they ingest and track additions of keys to the protocol-active key set. To construct an `add-public-keys` patch, construct an object of the following composition:

1. The object MUST include an `action` property, and its value MUST be `add-public-keys`.
2. The object MUST include a `publicKeys` property, and its value MUST be an array.
3. Each protocol-active public key being added MUST be represented by an entry in the `publicKeys` array, and each entry must be an object composed as follows:
    1. The object MUST include a `type` property, and its value MUST be `Secp256k1VerificationKey2018`. (future support for other key types will be addressed in future versions of the specification)
    2. The object MUST include an `id` property, and its value MUST be a string of no greater than 7 bytes of ASCII encoded characters.
    3. The object MUST include a `publicKeyHex` property, and its value MUST be the compressed format (66 chars) of the `Secp256k1VerificationKey2018` key type.
    

#### Remove public keys

::: example
```json
{
  "action": "remove-public-keys",
  "publicKeys": ["key1", "key2"]
}
```
:::

The `remove-public-keys` _Patch Action_ is required - implementers MUST support this mechanism as the means by which they ingest and track removal of keys from the protocol-active key set. To construct a `remove-public-keys` patch, construct an object of the following composition:

1. The object MUST include an `action` property, and its value MUST be `remove-public-keys`.
2. The object MUST include a `publicKeys` property, and its value MUST be an array.
3. Each protocol-active public key being removed MUST be represented by an entry in the `publicKeys` array, and each entry must be an ASCII encoded string (of no greater than 7 bytes) that corresponds with a current key in the protocol-active key set.