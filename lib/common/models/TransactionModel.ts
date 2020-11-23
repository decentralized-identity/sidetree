/**
 * Defines a Sidetree transaction.
 */
export default interface TransactionModel {
  transactionNumber: number;
  transactionTime: number;
  transactionTimeHash: string;
  anchorString: string;
  transactionFeePaid: number;

  // Normalized fee sohuld always be populated in core layer when core makes call to transactions endpoint.
  // It may not be populated in blockchain service. This allows flexibility for the value to be computed on the spot or stored.
  normalizedTransactionFee?: number;

  writer: string;
}
