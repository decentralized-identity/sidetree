## Terminology

| Term                  | Description                                                                    |
|-----------------------|--------------------------------------------------------------------------------|
| [Anchor File](#anchor-file)           | JSON Document containing proving and index data for Create, Recovery, and Deactivate operations, and a CAS URI for the associated Map File. This file is anchored to the target ledger. |
| Map File              | JSON Document containing Update operation proving and index data, as well as CAS URI for Chunk File chunks.                   |
| Chunk File            | JSON Document containing all verbose operation data for the corresponding set of DIDs specified in the related Map File.                   |
| CAS                   | Content-addressable storage protocol/network (e.g. IPFS)                       |
| DID Document          | JSON Document containing public key references, service endpoints, and other PKI metadata that corresponds to a given DID (as defined in the [W3C DID Specification](https://w3c.github.io/did-core/)). |
| DID Suffix { #did-suffix }  | The unique identifier string within a DID URI. e.g. The unique suffix of `did:sidetree:123` would be `123`. |
| DID Suffix Data       | Data required to deterministically generate a DID.                             |
| DID Operation         | Set of delta-based modifications that change the state of a DID Document when applied.                                               |
| Operation Request     | JWS formatted request sent to a _Sidetree Node_ to include a _DID Operation_ in a batch of operations.     |
| Recovery Key          | Public/private key pair used to perform a Recovery or Deactivate operation. Must be encoded as JWK or Hex.          |
| Sidetree Node         | Executable code that implements all the required components, functionality, and rules specified in the Sidetree protocol specification.                            |
| Transaction           | Ledger transaction that anchors a set of Sidetree operations, via a CAS URI for an associated Anchor File.          |
| Ledger Time { #ledger-time }          | The deterministic logical clock variable manifested in the underlying ledger system that can be used as a deterministic chronological reference (e.g. Bitcoin block numbers).         |
| Transaction Number  { #transaction-number }        | A monotonically increasing number deterministically ordered and assigned to every transaction relative to its position in [Ledger Time](#ledger-time).          |
