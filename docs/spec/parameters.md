## Default Parameters

Each version of the protocol will define a set of protocol rules and parameters with default suggested values. The following are the parameters used by this version of the Sidetree protocol - implementers ****MAY**** choose different options than the defaults listed below:

| Protocol Parameter          | Description                                                                   | Suggested Defaults |
|-----------------------------|-------------------------------------------------------------------------------|:-------------------|
| `HASH_ALGORITHM` { #hash-algorithm }       | Algorithm for generating hashes of protocol-related values.    |             SHA256 |
| `HASH_PROTOCOL` { #hash-protocol }       | Protocol for generating hash representations in Sidetree implementations, using the [`HASH_ALGORITHM`](#hash-algorithm) | [Multihash](#multihash) |
| `DATA_ENCODING_SCHEME` { #data-encoding-scheme } | Encoding selected for various data (JSON, hashes, etc.) used within an implementation, the output of which ****MUST**** be in ASCII format. | Base64URL |
| `JSON_CANONICALIZATION_SCHEME` { #json-canonicalization-scheme } | The scheme selected for canonicalizing JSON structures used throughout the specification. | [JCS](https://tools.ietf.org/html/draft-rundgren-json-canonicalization-scheme-17) |
| `KEY_ALGORITHM` { #key-algorithm }         | Asymmetric public key algorithm for signing DID operations. Must be a valid JWK `crv`.    |          secp256k1 |
| `SIGNATURE_ALGORITHM` { #sig-algorithm }   | Asymmetric public key signature algorithm. Must be a valid JWS `alg`.                    |             ES256K |
| `CAS_PROTOCOL` { #cas-protocol }       | The CAS network protocol used within an implementation.            |               IPFS |
| `CAS_URI_ALGORITHM` { #cas-uri-algorithm }       | Algorithm for generating unique content-bound identifiers for the implementation-selected CAS protocol                      |           IPFS CID |
| `COMPRESSION_ALGORITHM` { #compression-algorithm } | File compression algorithm                             |                ZIP |
| `REVEAL_VALUE` { #reveal-value } | Cryptographically random value to be revealed in the next operation. |  100 bytes |
| `GENESIS_TIME` { #genesis-time }                 | The point in the target ledger's transaction history at which Sidetree implementation is first activated (e.g. block number in a blockchain).    |             630000 |
| `MAX_ANCHOR_FILE_SIZE` { #max-core-index-file-size } | Maximum compressed [Core Index File](#core-index-file) size.                     |               1 MB |
| `MAX_PROVISIONAL_INDEX_FILE_SIZE` { #max-provisional-index-file-size }       | Maximum compressed map file size.                        |               1 MB |
| `MAX_PROOF_FILE_SIZE` { #max-proof-file-size }       | Maximum compressed map file size.                        |               2.5 MB |
| `MAX_CHUNK_FILE_SIZE`  { #max-chunk-file-size }  | Maximum compressed chunk file size.                      |              10 MB |
| `MAX_ENCODED_HASH_LENGTH`   | Maximum accepted string length of an encoded hash.                            |          100 bytes |
| `MAX_OPERATION_SIZE`        | Maximum uncompressed operation size.                                          |               1 kb |
| `MAX_OPERATION_COUNT`       | Maximum number of operations per batch.                                       |             10,000 |