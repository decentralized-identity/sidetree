

## DID State Patches

Sidetree defines a general format for patching DID State, called _Patch Actions_, for describing mutations of a DID's metadata state. Sidetree further defines a standard set of _Patch Actions_ (below) implementers MAY use to facilitate patching within their implementations. Support of the standard set of _Patch Actions_ defined herein IS NOT required, but implementers ****MUST**** use the _Patch Action_ format for defining patch mechanisms within their implementation. The general _Patch Action_ format is defined as follows:

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
    - `add-service-endpoints`
    - `remove-service-endpoints`
    - `ietf-json-patch`

### Standard Patch Actions

The following set of standard _Patch Actions_ are specified to help align on a common set of _Patch Actions_ that provide a predictable usage patter across Sidetree-based DID Method implementations.

#### `add-public-keys`

::: example
```json
{
  "action": "add-public-keys",
  "public_keys": [
    {
      "id": "key1",
      "purpose": ["auth"],
      "type": "EcdsaSecp256k1VerificationKey2019",
      "jwk": {...}
    }
  ]
}
```
:::

The `add-public-keys` _Patch Action_ describes the addition of cryptographic keys associated with a given DID. For any part of an `add-public-keys` _Patch Action_ to be applied to the DID's state, all specified conditions ****MUST**** be met for all properties and values, else the patch ****MUST**** be discarded in its entirety. To construct an `add-public-keys` patch, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `add-public-keys`.
2. The object ****MUST**** include a `public_keys` property, and its value ****MUST**** be an array.
3. Each key being added ****MUST**** be represented by an entry in the `public_keys` array, and each entry must be an object composed as follows:
    1. The object ****MUST**** include an `id` property, and its value ****MUST**** be a string with no more than fifty (50) ASCII encoded characters. If the value is not of the correct type or exceeds the specified length, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.
    2. The object ****MUST**** include a type property, and its value ****SHOULD**** be the identifier type string of a registered [Cryptographic Suite](https://w3c-ccg.github.io/ld-cryptosuite-registry/) that supports JWK representations - for example:
        - `EcdsaSecp256k1VerificationKey2019`
        - `JsonWebKey2020`
    3. The object ****MUST**** include a `jwk` property, and its value ****MUST**** be a public key expressed as a [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) compliant JWK representation for a [`KEY_ALGORITHM`](#key-algorithm) supported by the implementation. If the value is not a compliant JWK representation, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.
    4. The object ****MUST**** include a `purpose` property, and its value ****MUST**** be an array that includes one or more of the strings listed below. If the value is not of the correct type or contains any string not listed below, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.
        - **`general`**: the key ****MUST**** be included in the `public_keys` section of the resolved _DID Document_.
        - **`auth`**: the key ****MUST**** be included in the `authentication` section of the resolved _DID Document_, as follows:
            - If the `general` purpose value IS NOT present in the `purpose` array, the key descriptor object ****MUST**** be included directly in the `authentication` section of the resolved _DID Document_. 
            - If the `general` purpose value IS present in the `purpose` array, the key descriptor object ****MUST**** be directly included in the `public_keys` section of the resolved _DID Document_, and ****MUST**** be included by [relative DID URL reference](https://w3c.github.io/did-core/#relative-did-urls) in the `authentication` section.
        - **`agreement`**: the key ****MUST**** be included in the `keyAgreement` section of the resolved _DID Document_, as follows:
            - If the `general` purpose value IS NOT present in the `purpose` array, the key descriptor object ****MUST**** be included directly in the `keyAgreement` section of the resolved _DID Document_. 
            - If the `general` purpose value IS present in the `purpose` array, the key descriptor object ****MUST**** be directly included in the `public_keys` section of the resolved _DID Document_, and ****MUST**** be included by [relative DID URL reference](https://w3c.github.io/did-core/#relative-did-urls) in the `keyAgreement` section.
        - **`assertion`**: the key ****MUST**** be included in the `assertionMethod` section of the resolved _DID Document_, as follows:
            - If the `general` purpose value IS NOT present in the `purpose` array, the key descriptor object ****MUST**** be included directly in the `assertionMethod` section of the resolved _DID Document_. 
            - If the `general` purpose value IS present in the `purpose` array, the key descriptor object ****MUST**** be directly included in the `public_keys` section of the resolved _DID Document_, and ****MUST**** be included by [relative DID URL reference](https://w3c.github.io/did-core/#relative-did-urls) in the `assertionMethod` section.
        - **`delegation`**: the key ****MUST**** be included in the `capabilityDelegation` section of the resolved _DID Document_, as follows:
            - If the `general` purpose value IS NOT present in the `purpose` array, the key descriptor object ****MUST**** be included directly in the `capabilityDelegation` section of the resolved _DID Document_. 
            - If the `general` purpose value IS present in the `purpose` array, the key descriptor object ****MUST**** be directly included in the `public_keys` section of the resolved _DID Document_, and ****MUST**** be included by [relative DID URL reference](https://w3c.github.io/did-core/#relative-did-urls) in the `capabilityDelegation` section.
        - **`invocation`**: the key ****MUST**** be included in the `capabilityInvocation` section of the resolved _DID Document_, as follows:
            - If the `general` purpose value IS NOT present in the `purpose` array, the key descriptor object ****MUST**** be included directly in the `capabilityInvocation` section of the resolved _DID Document_. 
            - If the `general` purpose value IS present in the `purpose` array, the key descriptor object ****MUST**** be directly included in the `public_keys` section of the resolved _DID Document_, and ****MUST**** be included by [relative DID URL reference](https://w3c.github.io/did-core/#relative-did-urls) in the `capabilityInvocation` section.
    

#### `remove-public-keys`

::: example
```json
{
  "action": "remove-public-keys",
  "public_keys": ["key1", "key2"]
}
```
:::

The `remove-public-keys` _Patch Action_ describes the removal of cryptographic keys associated with a given DID. For any part of an `remove-public-keys` _Patch Action_ to be applied to the DID's state, all specified conditions ****MUST**** be met for all properties and values, else the patch ****MUST**** be discarded in its entirety. To construct a `remove-public-keys` _Patch Action_, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `remove-public-keys`.
2. The object ****MUST**** include a `public_keys` property, and its value ****MUST**** be an array of key IDs that correspond with keys presently associated with the DID that are to be removed. If the value is not of the correct type or includes a string value that is not associated with a key in the document, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.

#### `add-service-endpoints`

::: example
```json
{
  "action": "add-service-endpoints",
  "service_endpoints": [
    {
      "id": "sds1",
      "type": "SecureDataStore",
      "endpoint": "http://hub.my-personal-server.com"
    },
    {
      "id": "sds2",
      "type": "SecureDataStore",
      "endpoint": "http://some-cloud.com/hub"
    }
  ]
}
```
:::

The `add-service-endpoints` _Patch Action_ describes the addition of [Service Endpoints](https://w3c.github.io/did-core/#service-endpoints) to a DID's state. For any part of an `add-service-endpoints` _Patch Action_ to be applied to the DID's state, all specified conditions ****MUST**** be met for all properties and values, else the patch ****MUST**** be discarded in its entirety. To construct an `add-service-endpoints` patch, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `add-service-endpoints`.
2. The object ****MUST**** include a `service_endpoints` property, and its value ****MUST**** be an array. If the value is not of the correct type, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.
3. Each service being added ****MUST**** be represented by an entry in the `service_endpoints` array, and each entry must be an object composed as follows:
    1. The object ****MUST**** include an `id` property, and its value ****MUST**** be a string with a length of no more than fifty (50) ASCII encoded characters. If the value is not of the correct type or exceeds the specified length, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.
    2. The object ****MUST**** include a `type` property, and its value ****MUST**** be a string with a length of no more than thirty (30) ASCII encoded characters. If the value is not a string or exceeds the specified length, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.
    3. The object ****MUST**** include a `endpoint` property, and its value ****MUST**** be a valid URI string (including a scheme segment: i.e. http://, git://) with a length of no more than one hundred (100) ASCII encoded characters. If the value is not a valid URI or exceeds the specified length, the entire _Patch Action_ ****MUST**** be discarded, without any of it being used to modify the DID's state.


#### `remove-service-endpoints`

::: example
```json
{
  "action": "remove-service-endpoints",
  "ids": ["sds1", "sds2"]
}
```
:::

The `remove-service-endpoints` _Patch Action_ describes the removal of cryptographic keys associated with a given DID. For any part of an `remove-service-endpoints` _Patch Action_ to be applied to the DID's state, all specified conditions ****MUST**** be met for all properties and values, else the patch ****MUST**** be discarded in its entirety. To construct a `remove-service-endpoints` _Patch Action_, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `remove-service-endpoints`.
2. The object ****MUST**** include a `ids` property, and its value ****MUST**** be an array of Service Endpoint IDs that correspond with Service Endpoints presently associated with the DID that are to be removed.

#### `replace`

::: example
```json
{
  "action": "replace",
  "document": {
    "public_keys": [
      {
        "id": "key2",
        "purpose": ["auth"],
        "type": "EcdsaSecp256k1VerificationKey2019",
        "jwk": {...}
      }
    ],
    "service_endpoints": [
      {
        "id": "sds3",
        "type": "SecureDataStore",
        "endpoint": "http://hub.my-personal-server.com"
      }
    ]
  }
}
```
:::

The `replace` _Patch Action_ acts as a total state reset that replaces a DID's current PKI metadata state with the state provided. The `replace` _Patch Action_ enables the declaration of public keys and service endpoints using the same schema formats as the `add-public-keys` and `add-service-endpoints` _Patch Actions_. To construct a `replace` patch, compose an object as follows:

1. The object ****MUST**** include an `action` property, and its value ****MUST**** be `replace`.
2. The object ****MUST**** include a `document` property, and its value ****MUST**** be an object, which may contain the following properties:
    - The object ****MAY**** include a `public_keys` property, and if present, its value ****MUST**** be an array of public key entries that follow the same schema and requirements as the public key entries from the [`add-public-keys`](#add-public-keys) _Patch Action_
    - The object ****MAY**** include a `service_endpoints` property, and if present, its value ****MUST**** be an array of service endpoint entries that follow the same schema and requirements as the service endpoint entries from the [`add-service-endpoints`](#add-service-endpoints) _Patch Action_.

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
          },
      ],
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
