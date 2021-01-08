/**
 * Defines a Sidetree transaction.
 */
export default interface TransactionModel {
  transactionNumber: number;
  transactionTime: number;
  transactionTimeHash: string;
  anchorString: string;
  transactionFeePaid: number;

  /**
   * Normalized fee should always be populated in core layer when core makes call to transactions endpoint.
   * It may not be populated in blockchain service. This allows flexibility for the value to be computed on the spot or stored.
   * To remove potentially dangerous behavior. Make a separate model
   * TODO: https://github.com/decentralized-identity/sidetree/issues/937
   */

  normalizedTransactionFee?: number;

  writer: string;
}
