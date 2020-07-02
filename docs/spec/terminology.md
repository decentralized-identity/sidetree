## Terminology

| Term                  | Description                                                                    |
|-----------------------|--------------------------------------------------------------------------------|
| Ledger { #ledger }  | A decentralized linear sequencing oracle (e.g. Bitcoin) that can be used to anchor the PKI state transformations of Decentralized Identifiers (DIDs) in a shared record that can be deterministically replayed by observers to derive the current PKI state of DIDs. |
| Anchor File  | JSON Document containing proving and index data for Create, Recovery, and Deactivate operations, and a CAS URI for the associated Map File. This file is anchored to the target ledger. |
| Map File  | JSON Document containing Update operation proving and index data, as well as CAS URI for Chunk File chunks.                   |
| Chunk File  | JSON Document containing all verbose operation data for the corresponding set of DIDs specified in the related Map File.                   |
| CAS { #cas }    | Content-addressable storage protocol/network (e.g. IPFS)                       |
| CAS URI { #cas-uri }               | The unique content-bound identifier used to locate a resource via the [CAS](#cas) protocol/network (e.g. IPFS)                       |
| Commit Value { #commit-value }         | A chosen value that is used with a [commitment scheme](#commitment-scheme)                                 |
| Commitment { #commitment }           | The output of a [commitment scheme](#commitment-scheme)                                              |
| Commitment Scheme { #commitment-scheme }     | A cryptographic primative that allows one to commit to a chosen value, known as the [commit value](#commit-value) resulting in the generation of a [commitment](#commitment). A [commitment](#commitment) can then be shared without revealing the [commit value](#commit-value) forming a `proof of commitment` where the possessor of the [commit value](#commit-value) can then later reveal the [commit value](#commit-value) proving the original commitment.
| DID Document          | JSON Document containing public key references, service endpoints, and other PKI metadata that corresponds to a given DID (as defined in the [W3C DID Specification](https://w3c.github.io/did-core/)). |
| DID Suffix { #did-suffix }  | The unique identifier string within a DID URI. e.g. The unique suffix of `did:sidetree:123` would be `123`. |
| DID Suffix Data       | Data required to deterministically generate a DID.                             |
| Multihash  { #multihash }            | Protocol for differentiating outputs from common cryptographic hash functions, addressing size + encoding considerations: https://multiformats.io/multihash/ |
| DID Operation         | Set of delta-based modifications that change the state of a DID Document when applied.                                               |
| Operation Request     | JWS formatted request sent to a _Sidetree Node_ to include a _DID Operation_ in a batch of operations.     |
| Operation Key Pair {#operation-key-pair}| A cryptographic key used to produce an _Operation Request_ JWS. Public key representation MAY be present in the DID Document. Public key representation MUST be used to produce _Operation Request_ commitment.     |
| Recovery Key Pair {#recovery-key-pair}        | A cryptographic key used to produce an _Operation Request_ of type Recover or Deactivate. Public key representation MAY be present in the DID Document. Public key representation MUST be used to produce _Operation Request_ commitment.         |
| Public Key Commitment { #public-key-commitment } | The resulting [commitment](#commitment) obtained by applying the defined [commitment scheme](#operation-commitment-scheme) to a public key |
| Recovery Commitment { #recovery-commitment }   | The resulting [commitment](#commitment) obtained by applying the defined [commitment scheme](#recovery-commitment-scheme) to the public key of a [recovery key pair](#recovery-key-pair)          |
| Sidetree Node         | Executable code that implements all the required components, functionality, and rules specified in the Sidetree protocol specification.                            |
| Transaction           | Ledger transaction that anchors a set of Sidetree operations, via a CAS URI for an associated Anchor File.          |
| Anchor String  | The string anchored to the ledger, composed of the CAS URI to the [Anchor File](#anchor-file), prefixed with the declared operation count .                                               |
| Ledger Time { #ledger-time }          | The deterministic logical clock variable manifested in the underlying ledger system that can be used as a deterministic chronological reference (e.g. Bitcoin block numbers).         |
| Transaction Number  { #transaction-number }        | A monotonically increasing number deterministically ordered and assigned to every transaction relative to its position in [Ledger Time](#ledger-time).          |
| Light Node  { #light-node }        | A node that downloads and processes only [Anchor Files](#anchor-file) and [Map Files](#map-file) on a proactive basis, waiting until resolution time to download and process the [Chunk File](#chunk-files) related to a given DID. This type of configuration enables a node to operate trustlessly while consuming approximately one order of magnitude less storage.  |
