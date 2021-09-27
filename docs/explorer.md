# Sidetree Explorer API

This document describes the API used for exploring, monitoring, reporting a sidetree network based off of the reference implementation.

## Core Explorer REST API

### REST API HTTP Response status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 400              | Bad client request.                      |
| 401              | Unauthenticated or unauthorized request. |
| 404              | Resource not found.                      |
| 500              | Server error.                            |

### Get DIDs created given a `since` blockchain time and an optional DID `type` parameter.

Returns DIDs in chronological create order.

> Note: The call may not to return all DIDs in one batch, in which case the caller can use the blockchain time of the last DID metadata in the returned batch to fetch subsequent DIDs.

#### Request path
```
GET /explorer/dids?since=<blockchain-time>&did-type=<did-type>
```

#### Request query parameters
- `since`

  Optional. A blockchain time. When not given, DIDs starting from genesis will be returned.
  When given, only DIDs after the specified blockchain time will be returned.

- `did-type`

  Optional, when given, only DID created with the specified type will be returned. Type string will be matched case-sensitively.

#### Request example
```
GET /transactions?since=667000&did-type=abc
```

#### Response body schema
The DID metadata array must always return ALL metadata of a block/blockchain time.
```json
{
  "more": "`true` if there are more DID(s) beyond the returned batch. `false` otherwise.",
  "dids": [
    {
      "suffix": "The DID that got created.",
      "type": "The type of the DID declared, undefined if not specified",
      "blockchainTime": "The time the DID got created".
    },
    ...
  ]
}
```

#### Response example
```http
HTTP/1.1 200 OK

{
  "more": true,
  "dids": [
    {
      "suffix": "EiCI1Djge7aSf1r9tDTP0CR8eTO4a-PWS3D4BP3IM-TrCg",
      "type": "abc",
      "blockchainTime": 701873
    },
    {
      "suffix": "EiA_9TDmSJn0C30eigz6UKELg11orDjMEV9t_5y48xr24Q",
      "type": "abc",
      "blockchainTime": 701873
    }
  ]
}
```
