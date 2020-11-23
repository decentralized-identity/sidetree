/**
 * Metadata about a block.
 */
export default interface BlockMetadataWithoutNormalizedFee {
    height: number;
    hash: string;
    previousHash: string;
    transactionCount: number;

    /** Total fee paid in satoshis by all transactions included in this block. */
    totalFee: number;
  }
