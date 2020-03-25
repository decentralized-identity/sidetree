## Proof of Fee

Sidetree implementations MAY choose to impose a per-op fee that is used to gate the transaction on the target chain is required to include a deterministic, protocol-specified fee, based on the number of DID operations they seek to include via the on-chain transaction. The deterministic protocol rules for the default configuration are still under discussion, but the following are roughly represent the direction under discussion:

1. Simple inclusion of a transaction in a block will enable the transaction writer to include a baseline of N operations
2. Any number of operations that exceed N will be subject to proof that a fee was paid that meets or exceeds a required amount, determined as follows:
  1. Let the block range R include the last block the node believes to be the latest confirmed and the 9 blocks that precede it.
  2. Compute an array of median fees M, wherein the result of each computation is the median of all transactions fees in each block, less any Sidetree-bearing transactions.
  3. Let the target fee F be the average of all the values contained in M.
  4. Let the per operation cost C be F divided by the baseline amount N.
3. To test the batch for adherence to the Proof of Fee requirement, divide the number of operations in the batch by the fee paid in the host transaction, and ensure that the resulting per operation amount exceeds the required per operation cost C.

### Value Locking