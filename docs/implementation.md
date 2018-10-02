**Sidetree.JS Document**
===================================================

# Overview

## Terminology
* DID document
* Sidetree file

# Architecture
![Sidetree Entity Trail diagram](./diagrams/architecture.png)

# DID Cache


# Merkle Rooter


# Observer


# Sidetree REST API
This section defines the `v1.0` version of the Sidetree DID REST API.

> TODO: Discuss if to not use header and URL, and specify all arguments in the request body. Applies to CAS and blockchain REST API interface also.

## Response HTTP status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 401              | Unauthenticated or unauthorized request. |
| 400              | Bad client request.                      |
| 500              | Server error.                            |

## Proof-of-work
> TODO: Complete proof-of-work description and move to protocol specification document.

Every Sidetree write request must have a proof-of-work for it to be considered valid. As a result, every write request (e.g. DID create, update, delete, and recover) has an `proofOfWork` optional property with the following schema:

```json
"proofOfWork": {
  "algorithm": "Proof-of-work algorithm used.",
  "lastBlockHash": "The hash of the latest known blockchain block.",
  "proof": "The proof depending on the algorithm used."
}
```

When `proofOfWork` is not given in a write request, the the Sidetree node must perform proof-of-work on behalf of the requester or reject the request.

> TODO: need to review the idea of out sourcing the proof-of-work and its implications.

## Create a DID
Creates a Sidetree DID using the given DID Document.

### Request path
```
POST /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "didDocument": "Base64URL encoded initial DID Document of the DID.",
  "signature": "The Base64URL encoded signature of the payload signed by the private-key corresponding to the
    public-key specified by the signingKeyId.",
  "proofOfWork": "Optional. If not given, the Sidetree node must perform proof-of-work on the requester's behalf
    or reject the request."
}
```

In Sidetree implementation, certain properties or portion of which in teh initial DID Document will be ignored:
* `id` - Ignored.
* `publicKey\*\id` - DID portion is ignored.
* `publicKey\*\owner` - Ignored unless resolvable.

### Initial DID document example
```json
{
  "@context": "https://w3id.org/did/v1",
  "id": "did:sidetree:ignored",
  "publicKey": [{
    "id": "did:sidetree:didPortionIgnored#key-1",
    "type": "RsaVerificationKey2018",
    "owner": "did:sidetree:ignoredUnlessResolvable",
    "publicKeyPem": "-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n"
  }],
  "service": [{
    "type": "IdentityHub",
    "publicKey": "did:sidetree:ignored#key-1",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instances": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```

### Request example
```
POST /v1.0/
```
```json
{
  "didDocument": "...",
  "signature": "...",
  "proofOfWork": { ... }
}

```

### Response body schema
The response body is the DID Document of the DID created.

### Response body example
```json
{
  "@context": "https://w3id.org/did/v1",
  "id": "did:sidetree:realDid",
  "publicKey": [{
    "id": "did:sidetree:realDid#key-1",
    "type": "RsaVerificationKey2018",
    "owner": "did:sidetree:realDid",
    "publicKeyPem": "-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n"
  }],
  "service": [{
    "type": "IdentityHub",
    "publicKey": "did:sidetree:realDid#key-1",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instances": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```


## Resolve a DID
Fetches the latest DID Document of the given DID.

### Request path
```
GET /<api-version>/<did>
```

### Request headers
None.

### Request body schema
None.

### Request example
```
GET /v1.0/did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A
```

### Response body schema
The response body is the latest DID Document.

### Response body example
```json
{
  "@context": "https://w3id.org/did/v1",
  "id": "did:sidetree:123456789abcdefghi",
  "publicKey": [{
    "id": "did:sidetree:123456789abcdefghi#key-1",
    "type": "RsaVerificationKey2018",
    "owner": "did:sidetree:123456789abcdefghi",
    "publicKeyPem": "-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n"
  }],
  "service": [{
    "type": "IdentityHub",
    "publicKey": "did:sidetree:123456789abcdefghi#key-1",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instances": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```


## Update a DID
Updates the DID Document of a DID to the given DID Document.

### Request path
```
PUT /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "signingKeyId": "ID of the key used to sign the update payload",
  "updatePayload": "Base64URL codeded update payload JSON object define by the schema below.",
  "signature": "The Base64URL encoded signature of the payload signed by the private-key corresponding to the
    public-key specified by the signingKeyId.",
  "proofOfWork": "Optional. If not given, the Sidetree node must perform proof-of-work on the requester's behalf
    or reject the request."
}
```

### Update payload schema
```json
{
  "did": "The DID to be updated",
  "changeVersionNumber": "The number incremented from the last change version number. 1 if first change.",
  "perviousChangeHash": "The hash of the previous RFC 6902 JSON Patch.",
  "patch": "An RFC 6902 JSON patch to the current DID Document",
}
```

### Update payload schema example
```json
{
  "did": "did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A",
  "changeVersionNumber": 12,
  "perviousChangeHash": "N-JQZifsEIzwZDVVrFnLRXKREIVTFhSFMC1pt08WFzI",
  "patch": {
    "op": "remove",
    "path": "/publicKey/0"
  }
}
```

### Request example
```
PUT /v1.0/
```
```json
{
  "signingKeyId": "did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A#key-1",
  "updatePayload": "...",
  "signature": "...",
  "proofOfWork": { ... }
}
```

### Response body schema
The response body is the DID Document of the DID after the update.


## Delete a DID
Deletes the given DID.

### Request path
```
DELETE /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "signingKeyId": "ID of the key used to sign the update payload",
  "deletePayload": "Base64URL codeded delete payload JSON object define by the schema below.",
  "signature": "The Base64URL encoded signature of the payload signed by the private-key corresponding to the
    public-key specified by the signingKeyId.",
  "proofOfWork": "Optional. If not given, the Sidetree node must perform proof-of-work on the requester's behalf
    or reject the request."
}
```

### Delete payload schema
```json
{
  "did": "The DID to be deleted",
  "changeVersionNumber": "The number incremented from the last change version number. 1 if first change.",
  "perviousChangeHash": "The hash of the previous RFC 6902 JSON Patch."
}
```

### Delete payload example
```json
{
  "did": "did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A",
  "changeVersionNumber": 13,
  "perviousChangeHash": "N-JQZifsEIzwZDVVrFnLRXKREIVTFhSFMC1pt08WFzI",
}
```

### Request example
```
DELETE /v1.0/
```
```json
{
  "signingKeyId": "did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A#key-1",
  "updatePayload": "...",
  "signature": "...",
  "proofOfWork": { ... }
}
```


## Recover a DID
To be specified.



# Blockchain REST API
The blockchain REST API interface aims to abstract the underlying blockchain away from the main protocol logic. This allows the underlying blockchain to be replaced without affecting the core protocol logic. The interface also allows the protocol logic to be implemented in an entirely different language while interfacing with the same blockchain.

All hashes used in the API are Base64URL encoded SHA256 hash.
>Note: Consider using "multihash" format defined by the "multiformats" initiative.

>TODO: Decide on signature format.
>TODO: Decide on compression.


## Response HTTP status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 401              | Unauthenticated or unauthorized request. |
| 400              | Bad client request.                      |
| 500              | Server error.                            |


## Fetch Sidetree anchor file hashes
Fetches Sidetree anchor file hashes in chronological order.

>Note: The call may not to return all the known hashes in one batch, in which case the caller can use the last hash given in the returned batch of hashes to fetch subsequent hashes.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "afterHash": "Optional. A valid Sidetree anchor file hash. When not given, all Sidetree anchor file hashes since
                inception will be returned. When given, only anchor file hashes after the given hash will be
                returned."
}
```

### Request example
```
GET /v1.0/
```
```json
{
  "afterHash": "exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A"
}
```

### Response body schema
```json
{
  "hasMoreHashes": "True if there are more hashes beyond the returned batch of hashes. False otherwise.",
  "anchorFileHashes": [
    {
      "confirmationTime": "The timestamp in ISO 8601 format 'YYYY-MM-DDThh:mm:ssZ' indicating when this hash was
        anchored to the blockchain.",
      "hash": "N-JQZifsEIzwZDVVrFnLRXKREIVTFhSFMC1pt08WFzI"
    }
  ]
}
```

### Response body example
```json
{
  "hasMoreHashes": false,  
  "anchorFileHashes": [
    {
      "confirmationTime": "2018-09-13T19:20:30Z",
      "hash": "b-7y19k4vQeYAqJXqphGcTlNoq-aQSGm8JPlE_hLmzA"
    },
    {
      "confirmationTime": "2018-09-13T20:00:00Z",
      "hash": "N-JQZifsEIzwZDVVrFnLRXKREIVTFhSFMC1pt08WFzI"
    }
  ]
}
```


## Write a Sidetree anchor file hash
Writes a Sidetree anchor file hash to the underlying blockchain.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
POST /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "anchorFileHash": "A Sidetree file hash."
}
```

### Request example
```
POST /v1.0/
```
```json
{
  "anchorFileHash": "exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A"
}
```

### Response body schema
None.


## Get block confirmation time
Gets the block confirmation time in UTC of the block identified by the given block hash.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/confirmation-time/<block-hash>
```

### Request headers
None.

### Request body schema
None.

### Request example
```
Get /v1.0/confirmation-time/9vdoaofs7Cau0tYbOeSmF_8WY7O1i2Wf-alw-yFJRN8
```

### Response body schema
```json
{
  "confirmationTime": "The timestamp in ISO 8601 format 'YYYY-MM-DDThh:mm:ssZ' indicating when the block was
                       confirmed on blockchain."
}
```

### Response body example
```json
{
  "confirmationTime": "2018-09-13T19:20:30Z",
}
```


## Get last block hash
Gets the hash of the last confirmed block.

> TODO: Discuss and consider returning a list of block hash instead.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/block-hash/last
```

### Request headers
None.

### Request body schema
None.

### Request example
```
Get /v1.0/block-hash/last
```

### Response body schema
```json
{
  "blockHash": "The hash of the last confirmed block."
}
```



# CAS REST API Interface
The CAS (content addressable storage) REST API interface aims to abstract the underlying Sidetree storage away from the main protocol logic. This allows the CAS to be updated or even replaced if needed without affecting the core protocol logic. Conversely, the interface also allows the protocol logic to be implemented in an entirely different language while interfacing with the same CAS.

## Response HTTP status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 401              | Unauthenticated or unauthorized request. |
| 400              | Bad client request.                      |
| 500              | Server error.                            |


## Read content
Read the content of a given address and return it in the response body as octet-stream.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/<base64url-sha256-hash>
```

### Request example
```
GET /v1.0/b-7y19k4vQeYAqJXqphGcTlNoq-aQSGm8JPlE_hLmzA
```
### Response headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/octet-stream``` |


## Write content
Write content to CAS.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
POST /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/octet-stream``` |

### Response headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Response body schema
```json
{
  "hash": "Base64URL encoded SHA256 Hash of data written to CAS"
}
```

### Response body example
```json
{
  "hash": "b-7y19k4vQeYAqJXqphGcTlNoq-aQSGm8JPlE_hLmzA"
}
```
