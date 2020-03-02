/**
 * Encapsulates the data about a transaction which is used to store raw-data on the bitcoin. This
 * transaction is yet to be broadcasted.
 */
export default interface BitcoinSidetreeTransactionModel {
  transactionId: string;
  transactionFee: number;
  serializedTransactionObject: string;
}
