

## Patch Actions

Sidetree defines a general format, _Patch Actions_, for describing mutations of a DID's metadata state. Sidetree further defines a standard set of _Patch Actions_ (below) implementers MAY use to facilitate patching within their implementations. Support of the standard set of _Patch Actions_ defined herein IS NOT required, but implementers MUST use the _Patch Action_ format for defining patch mechanisms within their implementation. The general _Patch Action_ format is defined as follows:

```json
{
  "action": "add-public-keys",
  ...
}

{
  "action": "-custom-action",
  ...
}
```

1. _Patch Actions_ MUST be represented as JSON objects.
2. _Patch Action_ objects MUST include an `action` property, and its value MUST be one of the standard _Patch Action_ types listed in below, or, if the implementer chooses to create a custom _Patch Action_, a kebab-case string (dash-delimited lowercase words) with a leading dash, to indicate a custom _Patch Action_. Here is an example `action` value for a custom _Patch Action_: `-custom-action`.
3. If the implementer elects to create a custom _Patch Action_, its `action` value must not conflict with the standard set of _Patch Actions_ defined in this specification, which are:
    - `add-public-keys`
    - `remove-public-keys`
    - `add-service-endpoints`
    - `remove-service-endpoints`

### Standard Patch Actions

The following set of standard _Patch Actions_ are specified to help align on a common set of _Patch Actions_ that provide a predictable usage patter across Sidetree-based DID Method implementations.

#### `add-public-keys`

::: example
```json
{
  "action": "add-public-keys",
  "publicKeys": [
    {
      "id": "key1",
      "usage": ["ops"],
      "type": "Secp256k1VerificationKey2018",
      "publicKeyBase58": "H3C2AVvLMv6gmMNam3uVAjZpfkcJCwDwnZn6z3wXmqPV",
    }
  ]
}
```
:::

The `add-public-keys` _Patch Action_ describes the addition of cryptographic keys associated with a given DID. To construct an `add-public-keys` patch, compose an object as follows:

1. The object MUST include an `action` property, and its value MUST be `add-public-keys`.
2. The object MUST include a `publicKeys` property, and its value MUST be an array.
3. Each key being added MUST be represented by an entry in the `publicKeys` array, and each entry must be an object composed as follows:
    1. The object MUST include an `id` property, and its value MUST be a string with no more than seven (7) ASCII encoded characters.
    2. The object MUST include a `type` property, and its value MUST be one of the following supported key types:
        - `Secp256k1VerificationKey2018`
    3. The object MUST include public key material in accordance with `type` value specified. The following mapping of `type` values to public key material property and value pairings MUST be used:
        - If the `type` value is `Secp256k1VerificationKey2018`:
            1. The object MUST include a `publicKeyBase58` property, and its value MUST be a `base58` encoded version of the key type.
    4. The object MUST include a `usage` property, and its value MUST be an array that includes one or more of the following strings:
    - `ops`: the key is allowed to generate DID operations for the DID.
    - `general`: the key is to be included in the `publicKeys` section of the resolved _DID Document_.
    - `auth`: the key is to be included in the `authentication` section of the resolved _DID Document_ as follows:
        - If the `general` usage value IS NOT present in the `usage` array, the key descriptor object will be included directly in the `authentication` section of the resolved _DID Document_. 
        - If the `general` usage value IS present in the `usage` array, the key descriptor object will be directly included in the `publicKeys` section of the resolved _DID Document_, and included by reference in the `authentication` section. 
    

#### `remove-public-keys`

::: example
```json
{
  "action": "remove-public-keys",
  "publicKeys": ["key1", "key2"]
}
```
:::

The `remove-public-keys` _Patch Action_ describes the removal of cryptographic keys associated with a given DID. To construct a `remove-public-keys` _Patch Action_, compose an object as follows:

1. The object MUST include an `action` property, and its value MUST be `remove-public-keys`.
2. The object MUST include a `publicKeys` property, and its value MUST be an array of key IDs that correspond with keys presently associated with the DID that are to be removed.



#### `ietf-json-patch`

The `ietf-json-patch` Patch Action describes a mechanism for modifying a DID's state using [IETF JSON Patch](https://tools.ietf.org/html/rfc6902). To construct a `ietf-json-patch` _Patch Action_, compose an object as follows:

1. The object MUST include an `action` property, and its value MUST be `ietf-json-patch`.
2. The object MUST include a `patches` property, and its value MUST be an array of [IETF JSON Patch](https://tools.ietf.org/html/rfc6902) operation objects.

::: example 1
```json
{
  "action": "ietf-json-patch",
  "patches": [
    { "op": "add", ... },
    { "op": "remove", ... },
    { "op": "replace", ... },
    { "op": "move", ... },
    { "op": "copy", ... }
  ]
}
```
:::

::: example 2
```json
{
  "action": "ietf-json-patch",
  "patches": [
    {
      "op": "replace",
      "path": "/service",
      "value": [
          {
              "id": "did:example:123#edv",
              "type": "EncryptedDataVault",
              "serviceEndpoint": "https://edv.example.com/",
          },
      ],
      }
  ]
}
```
:::

::: warning
Use of `ietf-json-patch` may result in unrecoverable states, similar to "Deactivated".
:::

::: warning
Use of `ietf-json-patch` may harm implementators ability to perform validation on operations at ingestion time, which could impact performance negatively.
:::
