## Protocol Versioning & Default Parameters

The rules and parameters of the Sidetree protocol MAY change in future versions. Each version of the protocol will define a set of protocol rules and parameters with default suggested values. The following are the parameters used by this version of the Sidetree protocol - implementers MAY choose different options than the defaults listed below:

| Protocol Parameter          | Description                                                                   | Suggested Defaults |
|-----------------------------|-------------------------------------------------------------------------------|:-------------------|
| `HASH_ALGORITHM` { #hash-algorithm }       | Algorithm for generating hashes of protocol-related values.    |             SHA256 |
| `KEY_ALGORITHM` { #key-algorithm }         | Asymmetric public key algorithm for signing DID operations. Must be a valid JWK `crv`.    |          secp256k1 |
| `SIGNATURE_ALGORITHM` { #sig-algorithm }   | Asymmetric public key signature algorithm. Must be a valid JWS `alg`.                    |             ES256K |
| `CAS_PROTOCOL` { #cas-protocol }       | The CAS network protocol used within an implementation.            |               IPFS |
| `CID_ALGORITHM` { #cid-algorithm }       | Algorithm for generating CAS Identifiers.                        |           IPFS CID |
| `COMPRESSION_ALGORITHM` { #compression-algorithm } | File compression algorithm                             |                ZIP |
| `COMMITMENT_VALUE` { #commitment-value } | Cryptographically unguessable value to be revealed in the next operation. |      32 bytes |
| `GENESIS_TIME` { #genesis-time }                 | The point in the target ledger's transaction history at which Sidetree implementation is first activated (e.g. block number in a blockchain).    |             630000 |
| `MAX_ANCHOR_FILE_SIZE` { #max-anchor-file-size } | Maximum compressed anchor file size.                     |               1 MB |
| `MAX_MAP_FILE_SIZE` { #max-map-file-size }       | Maximum compressed map file size.                        |               1 MB |
| `MAX_BATCH_FILE_SIZE`  { #max-batch-file-size }  | Maximum compressed batch file size.                      |              10 MB |
| `MAX_ENCODED_HASH_LENGTH`   | Maximum accepted string length of an encoded hash.                            |          100 bytes |
| `MAX_OPERATION_SIZE`        | Maximum uncompressed operation size.                                          |               1 kb |
| `MAX_OPERATION_COUNT`       | Maximum number of operations per batch.                                       |             10,000 |

### Protocol Version Activation

New versions of the protocol, or modifications to parameter values by implementers, MUST be activated at a specified _blockchain time_ so all nodes can remain in sync by enforcing the same ruleset and parameters beginning at the same logical starting point. All transactions that occur after the specified _blockchain time_ will adhere to the associated version's rules and parameters until a newer version of the protocol is defined and implemented at a future _blockchain time_.