## Terminology

| Term                  | Description                                                                    |
|-----------------------|--------------------------------------------------------------------------------|
| Anchoring System { #anchoring-system }  | A decentralized sequencing oracle (e.g. Bitcoin, Ethereum, distributed ledgers, witness-based approaches) that can be used to determine the order of PKI state transformations for Decentralized Identifiers (DIDs), which can be deterministically verified to derive the current PKI state of DIDs. |
| Witness System  { #witness-system }  | Synonym for [Anchoring System](#anchoring-system), see above.  |
| Core Index File  | JSON Document containing proving and index data for Create, Recovery, and Deactivate operations, and a CAS URI for the associated Provisional Index File. This file is anchored to the target anchoring system. |
| Provisional Index File  | JSON Document containing Update operation proving and index data, as well as CAS URI for Chunk File chunks.                   |
| Core Proof File  | JSON Document containing the cryptographic proofs for Recovery and Deactivate operations, which form the persistent backbone of DID PKI lineages. |
| Provisional Proof File  | JSON Document containing the cryptographic proofs for Update operations, which can be pruned via decentralized checkpointing mechanisms (this mechanism will arrive in future versions of the Sidetree protocol). |
| Chunk File  | JSON Document containing all verbose operation data for the corresponding set of DIDs specified in the related Provisional Index File.                   |
| CAS { #cas }    | Content-addressable storage protocol/network (e.g. IPFS)                       |
| CAS URI { #cas-uri }               | The unique content-bound identifier used to locate a resource via the [CAS](#cas) protocol/network (e.g. IPFS)                       |
| Commit Value { #commit-value }         | A chosen value that is used with a [commitment scheme](#commitment-scheme)                                 |
| Commitment { #commitment }           | The output of a [commitment scheme](#commitment-scheme)                                              |
| Commitment Scheme { #commitment-scheme }     | A cryptographic primative that allows one to commit to a chosen value, known as the [commit value](#commit-value) resulting in the generation of a [commitment](#commitment). A [commitment](#commitment) can then be shared without revealing the [commit value](#commit-value) forming a `proof of commitment` where the possessor of the [commit value](#commit-value) can then later reveal the [commit value](#commit-value) proving the original commitment.
| DID Document          | JSON Document containing public key references, service endpoints, and other PKI metadata that corresponds to a given DID (as defined in the [W3C DID Specification](https://w3c.github.io/did-core/)). This is the most common form of DID state used in Sidetree implementations. |
| DID Suffix { #did-suffix }  | The unique identifier string within a DID URI. e.g. The unique suffix of `did:sidetree:123` would be `123`. |
| DID Suffix Data       | Data required to deterministically generate a DID.                             |
| Multihash  { #multihash }            | Protocol for differentiating outputs from common cryptographic hash functions, addressing size and encoding considerations: https://multiformats.io/multihash/ |
| DID Operation         | Set of delta-based CRDT patches that modify a DID's state data when applied.                                               |
| Operation Request     | JWS formatted request sent to a _Sidetree Node_ to include a _DID Operation_ in a batch of operations.     |
| Update Key Pair {#update-key-pair}| A cryptographic key used to produce an _Update Request_ JWS. Public key representation MUST be used to produce _Update Request_ commitment.     |
| Recovery Key Pair {#recovery-key-pair}        | A cryptographic key used to produce an _Operation Request_ of type Recover or Deactivate. Public key representation MUST be used to produce _Operation Request_ commitment.         |
| Public Key Commitment { #public-key-commitment } | The resulting [commitment](#commitment) obtained by applying the defined [commitment scheme](#operation-commitment-scheme) to a public key |
| Recovery Commitment { #recovery-commitment }   | The resulting [commitment](#commitment) obtained by applying the defined [commitment scheme](#recovery-commitment-scheme) to the public key of a [recovery key pair](#recovery-key-pair)          |
| Sidetree Node         | Executable code that implements all the required components, functionality, and rules specified in the Sidetree protocol specification.                            |
| Transaction           | Anchoring System transaction that anchors a set of Sidetree operations, via a CAS URI for an associated Core Index File.          |
| Anchor String  | The string anchored to the anchoring system, composed of the CAS URI to the [Core Index File](#core-index-file), prefixed with the declared operation count.                                               |
| Anchor Time { #anchor-time }          | The logical order of operations, as determined by the underlying anchoring system (e.g. Bitcoin block and transaction order). Anchoring systems may widely vary in how they determine the logical order of operations, but the only requirement of an anchoring system is that it can provide a means to deterministically order each operation within a DID's operational lineage.       |
| Transaction Number  { #transaction-number }        | A monotonically increasing number deterministically ordered and assigned to every transaction relative to its position in [Anchor Time](#anchor-time).          |
| Light Node  { #light-node }        | A node that downloads and processes only [Core Index Files](#core-index-file) and [Provisional Index Files](#provisional-index-file) on a proactive basis, waiting until resolution time to download and process the [Chunk File](#chunk-files) related to a given DID. This type of configuration enables a node to operate trustlessly while consuming approximately one order of magnitude less storage.  |
