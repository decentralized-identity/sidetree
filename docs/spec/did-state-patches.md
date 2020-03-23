## JSON Patch

```json
{
    "action": "json-patches",
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

Sidetree DID Methods MAY choose to implement support for `json-patches` actions as did state patches. `patches` must contain [rfc6902](https://tools.ietf.org/html/rfc6902) compliant json patches.

Sidetree Method Implementers MUST ensure that all possible combinations of supported DID State Patches, and intermediary states, that are reachable do not introduce security vulnerabilities, or terminal states from which no further operations are valid.

Method Implementers are always responsible for ensuring that protocol rules are enforced. However, it is up to method implementers to decide what the desired behavior is with respect to linear application of state transitions.

::: warning
Use of `json-patches` may result in unrecoverable states, similar to "Deactivated".
:::

::: warning
Use of `json-patches` may harm implementators ability to perform validation on operations at ingestion time, which could impact performance negatively.
:::
