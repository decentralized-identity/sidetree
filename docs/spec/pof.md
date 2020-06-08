## Proof of Fee

Sidetree implementers ****MAY**** choose to implement this section of protective mechanisms, which are designed to strengthen a Sidetree network against low-cost spurious operations. These mechanisms are primarily designed for open, permissionless implementations utilizing public blockchains that feature native crypto-economic systems.

### Base Fee Variable

All of the mechanisms described in this section are based on the same underlying numeric value, known as the _Base Fee Variable_, that is calculated by processing a collection of native variables from the target ledger with a set of deterministic functions. The _Base Fee Variable_ is used in two primary ways: 1) to set a minimum required native transaction fee that must be paid relative to the number of DID operations a writer seeks to anchor with the transaction, and 2) the fee basis that is used to deterministically set a economic locking amount based on the size of operational batches a writer wants to access.

To calculate the _Base Fee Variable_, every node ****MUST**** run the following pseudorandom transaction selection routine across the transaction history of the target ledger, which will produce the same selected set of transactions across all nodes:

### Per-Operation Fee

...

### Value Locking

...