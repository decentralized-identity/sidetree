## Proof of Fee

::: note
This section is non-normative
:::

Sidetree implementers ****MAY**** choose to implement protective mechanisms designed to strengthen a Sidetree network against low-cost spurious operations. These mechanisms are primarily designed for open, permissionless implementations utilizing public blockchains that feature native crypto-economic systems.

### Base Fee Variable

All of the mechanisms described in this section are based on the same underlying numeric value, known as the _Base Fee Variable_, that is calculated by processing a collection of native variables from the target anchoring system with a set of deterministic functions. The _Base Fee Variable_ is used in two primary ways:

1. To set a minimum required native transaction fee that must be paid relative to the number of DID operations a writer seeks to anchor with the transaction
2. To establish a fee basis for any additional economic protections, such as a value locking mechanism wherein a writer must escrow or burn some amount of digital asset to have other nodes view their writes into the network as valid.

To calculate the _Base Fee Variable_, every implementation will define a deterministic algorithm, which may be static or change dynamically via some form of logical calculation that is applied by all nodes in the system at some interval.

### Per-Operation Fee

An implementation may choose to require a per-operation fee, to ensure that the baseline fee paid by a writer on the anchoring system is not able to game unusually low-fee periods to flood the anchoring system with Sidetree-embedded transactions. The following logical process ****SHOULD**** be used to set and evaluate a per-operation fee for each Sidetree-bearing transaction that is observed:

1. Determine the _Base Fee Variable_ for the current block or transaction interval being assessed.
2. Multiply the _Base Fee Variable_ by the [Operation Count](#anchor-string) integer from the [Anchor String](#anchor-string), producing the total batch operation fee.
3. Validate that the transaction anchored in the anchoring system has spent at least the sum of the total batch operation fee, as derived above.
4. If the transaction spent the required fee (or some amount greater), proceed with processing the anchored batch of DID operations. If the transaction failed to spend the required fee (or some amount greater), ignore the transaction as invalid.

### Value Locking

An implementation may choose to institute a value locking scheme wherein digital assets native to the underlying anchoring system are locked under some conditions set by the implementation that afford a locking entity access to greater write operation volumes and related capabilities. The basis principle of value locking is to require a form of escrow to gate consumption of resources in the network. In simple terms, with value locking in place, an implementation can require a writer who wants to write batches at the maximum size to first lock an amount of the native underlying anchoring system asset commensurate with the batch sizes they want to anchor. Implementations can create value locking mechanisms a number of ways, but the following is a general example of a value locking approach:

1. Using the _Base Fee Variable_, assess a required locking amount that follows an implementation-defined cost curve that maps to the size of batches up to the maximum batch size. (If your implementation features recurring evaluation logic, this will be reevaluated for whatever block or transaction interval you define)
2. Using the underlying anchoring system's asset locking capabilities (e.g. a Bitcoin Timelock script), validate that all transactions observed within the current block or transaction interval are linked to a sum of locked value that meets or exceeds the required value locking amount. Each locked sum may only be linked to one batch per block or transaction interval, which means anchoring multiple batches that require locks requires multiple locks, compounding the sum that must be locked by a multi-batch writer. A link from a batch-embedded transaction to a lock is typically determined by proving control of a lock via some form of deterministic proof that ties the lock to the batch-embedded transaction (e.g. signing the batch-embedded transactions with keys that control the lock)
3. If a transaction is linked to a locked sum that has been unused by any other transactions from that lock controller during the block, proceed with ingesting the anchored batch and processing it per the directives in the [file and transaction processing](#transaction-operation-processing) section of this specification.