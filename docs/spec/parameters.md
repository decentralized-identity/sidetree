## Default Parameters

Each version of the protocol will define a set of protocol rules and parameters with default suggested values. The following are the parameters used by this version of the Sidetree protocol - implementers ****MAY**** choose different values than the defaults listed below:

| Protocol Parameter          | Description                                                                   | Suggested Defaults |
|-----------------------------|-------------------------------------------------------------------------------|:-------------------|
| `HASH_ALGORITHM` { #hash-algorithm }       | Algorithm for generating hashes of protocol-related values.    |             SHA256 |
| `HASH_PROTOCOL` { #hash-protocol }       | Protocol for generating hash representations in Sidetree implementations, using the [`HASH_ALGORITHM`](#hash-algorithm) | [Multihash](https://multiformats.io/multihash/) |
| `DATA_ENCODING_SCHEME` { #data-encoding-scheme } | Encoding selected for various data (JSON, hashes, etc.) used within an implementation, the output of which ****MUST**** be in ASCII format. | Base64URL |
| `JSON_CANONICALIZATION_SCHEME` { #json-canonicalization-scheme } | The scheme selected for canonicalizing JSON structures used throughout the specification. | [JCS](https://tools.ietf.org/html/draft-rundgren-json-canonicalization-scheme-17) |
| `KEY_ALGORITHM` { #key-algorithm }         | Asymmetric public key algorithm for signing DID operations. Must be a valid JWK `crv`. | secp256k1 |
| `SIGNATURE_ALGORITHM` { #sig-algorithm }   | Asymmetric public key signature algorithm. Must be a valid JWS `alg`. |              ES256K |
| `CAS_PROTOCOL` { #cas-protocol }       | The CAS network protocol used within an implementation. | [IPFS](https://github.com/ipfs/specs) |
| `CAS_URI_ALGORITHM` { #cas-uri-algorithm }       | Algorithm for generating unique content-bound identifiers for the implementation-selected CAS protocol.                      |           IPFS CID |
| `COMPRESSION_ALGORITHM` { #compression-algorithm } | File compression algorithm.                             |                       [GZIP](https://tools.ietf.org/html/rfc1952) |
| `REVEAL_VALUE` { #reveal-value } | Cryptographic hash of the commitment value. |                                 SHA256 Multihash (0x12) |
| `GENESIS_TIME` { #genesis-time }                 | The point in the target anchoring system's transaction history at which Sidetree implementation is first activated (e.g. block number in a blockchain).    |             630000 |
| `MAX_CORE_INDEX_FILE_SIZE` { #max-core-index-file-size } | Maximum compressed [Core Index File](#core-index-file) size. |  1 MB (zipped) |
| `MAX_PROVISIONAL_INDEX_FILE_SIZE` { #max-provisional-index-file-size } | Maximum compressed Provisional Index File size.|  1 MB (zipped) |
| `MAX_PROOF_FILE_SIZE` { #max-proof-file-size }   | Maximum compressed Proof File size.                      |           2.5 MB  (zipped) |
| `MAX_CHUNK_FILE_SIZE`  { #max-chunk-file-size }  | Maximum compressed chunk file size.                      |                      10 MB |
| `MAX_MEMORY_DECOMPRESSION_FACTOR` { #max-memory-decompression-factor } | Maximum size after decompression.  |               3x file size |
| `MAX_CAS_URI_LENGTH` { #max-cas-uri-length }     | Maximum length of CAS URIs.                              |                  100 bytes |
| `MAX_DELTA_SIZE` { #max-delta-size }             | Maximum canonicalized operation delta buffer size.       |                1,000 bytes |
| `MAX_OPERATION_COUNT`       | Maximum number of operations per batch.                                       |                 10,000 ops |
| `MAX_OPERATION_HASH_LENGTH` { #max-operation-hash-length } | Maximum length of all hashes in CAS URI files. |    100 bytes |
| `NONCE_SIZE` {#nonce-size}                       | The number of bytes (octets) in nonce values.            |                   16 bytes |
