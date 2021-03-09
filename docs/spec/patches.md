

## DID State Patches

Sidetree defines a delta-based [Conflict-Free Replicated Data Type](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) system, wherein the metadata in a Sidetree-based implementation is controlled by the cryptographic PKI material of individual entities in the system, represented by DIDs. While the most common form of state associated with the DIDs in a Sidetree-based implementation is a [DID Document](https://w3c.github.io/did-core/), Sidetree can be used to maintain any type of DID-associated state.

Sidetree specifies a general format for patching the state associated with a DID, called _Patch Actions_, which define how to deterministic mutate a DID's associated state. Sidetree further specifies a standard set of _Patch Actions_ (below) implementers MAY use to facilitate DID state patching within their implementations. Support of the standard set of _Patch Actions_ defined herein IS NOT required, but implementers ****MUST**** use the _Patch Action_ format for defining patch mechanisms within their implementation. The general _Patch Action_ format is defined as follows:

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

1. _Patch Actions_ ****MUST**** be represented as JSON objects.
2. _Patch Action_ objects ****MUST**** include an `action` property, and its value ****SHOULD**** be one of the standard _Patch Action_ types listed in below, or, if the implementer chooses to create a custom _Patch Action_, a kebab-case string (dash-delimited lowercase words) with a leading dash, to indicate a custom _Patch Action_, for example: `-custom-action`.
    - `add-public-keys`
    - `remove-public-keys`
    - `add-services`
    - `remove-services`
    - `ietf-json-patch`

### Standard Patch Actions

The following set of standard _Patch Actions_ are specified to help align on a common set of _Patch Actions_ that provide a predictable usage pattern across Sidetree-based DID Method implementations.

#### `add-public-keys`

The `add-public-keys` _Patch Action_ describes the addition of cryptographic keys associated with a given DID. For any part of an `add-public-keys` _Patch Action_ to be applied to the DID's state, all specified conditions ****MUST**** be met for all properties and values, else the patch ****MUST**** be discarded in its entirety. In the case a public key entry already exists for the given `id` specified within an `add-public-keys` _Patch Action_, the implementation ****MUST**** overwrite the existing entry entirely with the incoming patch. To construct an `add-public-keys` patch, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `add-public-keys`.
2. The object ****MUST**** include a `publicKeys` property, and its value ****MUST**** be an array.
3. Each key being added ****MUST**** be represented by an entry in the `publicKeys` array, and each entry must be an object composed as follows:
    1. The object ****MUST**** include an `id` property, and its value ****MUST**** be a string with no more than fifty (50) Base64URL encoded characters. If the value is not of the correct type or exceeds the specified maximum length, the entire _Patch Action_ ****MUST**** be discarded, without any of the patch being used to modify the DID's state.
    2. The object ****MUST**** include a `type` property, and its value ****MUST**** be a string and ****SHOULD**** be of a registered [Cryptographic Suite](https://w3c-ccg.github.io/ld-cryptosuite-registry/).
    3. The object ****MAY**** include a `controller` property, and its value ****MUST**** be a DID URI string. Implementations ****MAY**** specify a maximum length for the value, and if specified, the value ****MUST NOT**** exceed it. If the `controller` property is absent, the implementation ****must**** set the corresponding property in the resolved DID Document with a value that equates to the DID Document controller's id. If the value is not of the correct type or exceeds the specified maximum length, the entire _Patch Action_ ****MUST**** be discarded, without any of the patch being used to modify the DID's state.
    4. The object ****MUST**** include either a `publicKeyJwk` or a `publicKeyMultibase` property with values as defined by [DID Core](https://w3c.github.io/did-core) and [DID Specification Registries](https://w3c.github.io/did-spec-registries). Implementers ****MAY**** choose to only define `publicKeyJwk`. These key representations are described in the JWK and Multibase subsections. Implementations ****MAY**** specify a maximum length for these values, and if specified, the values ****MUST NOT**** exceed it. If more or less than one of these properties is present, the value of the included property is not of the correct type, or the value exceeds the implementer's specified maximum length, the entire _Patch Action_ ****MUST**** be discarded, without any of the patch being used to modify the DID's state.
    5. The object ****MAY**** include a `purposes` property, and if included, its value ****MUST**** be an array of one or more strings. The value for each string ****SHOULD**** represent a verification relationship defined by [DID Core](https://w3c.github.io/did-core) or the [DID Specification Registries](https://w3c.github.io/did-spec-registries). If the value is not of the correct type or contains any string not listed below (or defined by the implementer), the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.
    - **`authentication`**: a reference to the key's `id` ****MUST**** be included in the `authentication` array of the resolved _DID Document_.
    - **`keyAgreement`**: a reference to the key's `id` ****MUST**** be included in the `keyAgreement` array of the resolved _DID Document_.
    - **`assertionMethod`**: a reference to the key's `id` ****MUST**** be included in the `assertionMethod` array of the resolved _DID Document_.
    - **`capabilityDelegation`**: a reference to the key's `id` ****MUST**** be included in the `capabilityDelegation` array of the resolved _DID Document_.
    - **`capabilityInvocation`**: a reference to the key's `id` ****MUST**** be included in the `capabilityInvocation` array of the resolved _DID Document_.

::: note
An implementer may support transformations from `publicKeyJwk` or `publicKeyMultibase` to other representations required by a particular Cryptographic Suite.
For example, an implementer may support projecting `publicKeyBase58` into the resolution result for the `Ed25519VerificationKey2018` suite.
:::

##### JWK

::: example
```json
{
  "action": "add-public-keys",
  "publicKeys": [
    {
      "id": "key1",
      "purposes": ["authentication"],
      "type": "EcdsaSecp256k1VerificationKey2019",
      "publicKeyJwk": {...}
    }
  ]
}
```
:::

When the object contains a `publicKeyJwk`, the public key patch is using a JWK representation. The value of `publicKeyJwk` ****MUST**** be a public key expressed as a [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) compliant JWK representation for a [`KEY_ALGORITHM`](#key-algorithm) supported by the implementation. The key represented by the JWK object ****MUST**** be projected into the `verificationMethod` array of the DID Document upon resolution. If the value is not a compliant JWK representation, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.

##### Multibase

::: example
```json
{
  "action": "add-public-keys",
  "publicKeys": [
    {
      "id": "key1",
      "purposes": ["authentication"],
      "type": "Ed25519VerificationKey2020",
      "publicKeyMultibase": "zgo4sNiXwJTbeJDWZLXVn9uTnRwgFHFxcgDePvEC9TiTYgRpG7q1p5s7yRAic"
    }
  ]
}
```
:::

An implementer ****MAY**** define support for `publicKeyMultibase` in addition to supporting `publicKeyJwk`.

When the object contains a `publicKeyMultibase`, the public key patch is using a multibase representation. The key represented by the multibase encoding ****MUST**** be projected into the `verificationMethod` array of the DID Document upon resolution.

#### `remove-public-keys`

::: example
```json
{
  "action": "remove-public-keys",
  "ids": ["key1", "key2"]
}
```
:::

The `remove-public-keys` _Patch Action_ describes the removal of cryptographic keys associated with a given DID. For any part of an `remove-public-keys` _Patch Action_ to be applied to the DID's state, all specified conditions ****MUST**** be met for all properties and values, else the patch ****MUST**** be discarded in its entirety.  In the case there exists no public key entry for an `id` specified within a `remove-public-keys` _Patch Action_, the implementation ****SHALL**** perform no action and treat application of the delete operation as a success. To construct a `remove-public-keys` _Patch Action_, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `remove-public-keys`.
2. The object ****MUST**** include a `ids` property, and its value ****MUST**** be an array of key IDs that correspond with keys presently associated with the DID that are to be removed. If the value is not of the correct type or includes a string value that is not associated with a key in the document, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.

#### `add-services`

::: example
```json
{
  "action": "add-services",
  "services": [
    {
      "id": "sds",
      "type": "SecureDataStore",
      "serviceEndpoint": "http://hub.my-personal-server.com"
    },
    {
      "id": "did-config",
      "type": "LinkedDomains",
      "serviceEndpoint": {
        "origins": ["https://foo.com", "https://bar.com"]
      }
    }
  ]
}
```
:::

The `add-services` _Patch Action_ describes the addition of [Service Endpoints](https://w3c.github.io/did-core/#service-endpoints) to a DID's state. For any part of an `add-services` _Patch Action_ to be applied to the DID's state, all specified conditions ****MUST**** be met for all properties and values, else the patch ****MUST**** be discarded in its entirety. In the case a service entry already exists for the given `id` specified within an `add-services` _Patch Action_, the implementation ****MUST**** overwrite the existing entry entirely with the incoming patch. To construct an `add-services` patch, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `add-services`.
2. The object ****MUST**** include a `services` property, and its value ****MUST**** be an array. If the value is not of the correct type, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.
3. Each service being added ****MUST**** be represented by an entry in the `services` array, and each entry must be an object composed as follows:
    1. The object ****MUST**** include an `id` property, and its value ****MUST**** be a string with a length of no more than fifty (50) Base64URL encoded characters. If the value is not of the correct type or exceeds the specified length, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.
    2. The object ****MUST**** include a `type` property, and its value ****MUST**** be a string with a length of no more than thirty (30) Base64URL encoded characters. If the value is not a string or exceeds the specified length, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.
    3. The object ****MUST**** include a `serviceEndpoint` property, and its value ****MUST**** be either a valid URI string (including a scheme segment: i.e. http://, git://) or a JSON object with properties that describe the Service Endpoint further. If the values do not adhere to these constraints, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.


#### `remove-services`

::: example
```json
{
  "action": "remove-services",
  "ids": ["sds1", "sds2"]
}
```
:::

The `remove-services` _Patch Action_ describes the removal of cryptographic keys associated with a given DID. For any part of an `remove-services` _Patch Action_ to be applied to the DID's state, all specified conditions ****MUST**** be met for all properties and values, else the patch ****MUST**** be discarded in its entirety. In the case there exists no service entry for an `id` specified within a `remove-public-keys` _Patch Action_, the implementation ****SHALL**** perform no action and treat application of the delete operation as a success. To construct a `remove-services` _Patch Action_, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `remove-services`.
2. The object ****MUST**** include a `ids` property, and its value ****MUST**** be an array of Service Endpoint IDs that correspond with Service Endpoints presently associated with the DID that are to be removed.

#### `replace`

::: example
```json
{
  "action": "replace",
  "document": {
    "publicKeys": [
      {
        "id": "key2",
        "purposes": ["authentication"],
        "type": "EcdsaSecp256k1VerificationKey2019",
        "publicKeyJwk": {...}
      }
    ],
    "services": [
      {
        "id": "sds3",
        "type": "SecureDataStore",
        "serviceEndpoint": "http://hub.my-personal-server.com"
      }
    ]
  }
}
```
:::

The `replace` _Patch Action_ acts as a total state reset that replaces a DID's current PKI metadata state with the state provided. The `replace` _Patch Action_ enables the declaration of public keys and service endpoints using the same schema formats as the `add-public-keys` and `add-services` _Patch Actions_. To construct a `replace` patch, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `replace`.
2. The object ****MUST**** include a `document` property, and its value ****MUST**** be an object, which may contain the following properties:
    - The object ****MAY**** include a `publicKeys` property, and if present, its value ****MUST**** be an array of public key entries that follow the same schema and requirements as the public key entries from the [`add-public-keys`](#add-public-keys) _Patch Action_
    - The object ****MAY**** include a `services` property, and if present, its value ****MUST**** be an array of service endpoint entries that follow the same schema and requirements as the service endpoint entries from the [`add-services`](#add-services) _Patch Action_.

#### `ietf-json-patch`

The `ietf-json-patch` Patch Action describes a mechanism for modifying a DID's state using [IETF JSON Patch](https://tools.ietf.org/html/rfc6902). To construct a `ietf-json-patch` _Patch Action_, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `ietf-json-patch`.
2. The object ****MUST**** include a `patches` property, and its value ****MUST**** be an array of [IETF JSON Patch](https://tools.ietf.org/html/rfc6902) operation objects.

If `ietf-json-patch` is used to add or remove from a proof purpose collection, such as `operations`, `recovery` or `assertionMethod`, per the DID Core spec, each collection element MUST have a unique `id` property, or be a unique string identifier.

See [Operation Verification](https://identity.foundation/sidetree/spec/#operation-verification) for more details on how operations are verified.

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
          }
      ]
    }
  ]
}
```
:::

::: warning
Without careful validation, use of `ietf-json-patch` may result in unrecoverable states, similar to "Deactivated".
:::

::: warning
Use of `ietf-json-patch` may harm an implmentation's ability to perform validation on operations at ingestion time, which could impact performance negatively.
:::
