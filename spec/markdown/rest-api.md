## REST API

The following sections define the Sidetree resolution and operations endpoints. Please refer to the companion [Sidetree REST API](https://identity.foundation/sidetree/docs/swagger/) specification for additional information, as well as REST API definitions for blockchain and CAS components.

### Sidetree Resolution

Sidetree resolution requests to the REST API consist of a DID and MAY include DID parameters.
As detailed in [Resolution](#resolution), the resolution request MAY include the initial state DID parameter.

The server responds with the Resolution Response Object composed of the DID Document and Method Metadata.

::: example
```json
{
    "did_document": DID_DOCUMENT_OBJECT,
    "metadata": {
        "published": boolean
    }
}
```
:::

A resolution is requested as follows:

1. The client MUST send a GET to the Sidetree resolution endpoint `/sidetree/{did-with-or-without-initial-state}` under the desired REST server path.
2. If the DID does not exist and initial state was not provided:
   - The server MUST respond with HTTP Status Code 404.
3. If the DID does not exist and valid initial state was provided:
   - The server MUST respond with HTTP Status Code 200.
   - The server MUST return the initial DID document that is constructed from the initial state.
   - The server MUST include the resolution response object `metadata` composed of a `published` property with value `false`.
4. If the DID does exist:
   - The server MUST respond with HTTP Status Code 200.
   - The server MUST return the latest DID document.
   - The server MUST include the resolution response object `metadata` composed of a `published` property with value `true`.
5. Otherwise, for failure, the server MUST respond with an appropriate HTTP Status Code (400, 401, 404, 500).

### Sidetree Operations
