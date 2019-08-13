import TransactionModel from '../../common/models/TransactionModel';

/**
 * Interface that defines a class that can process transactions fetched from blockchain.
 */
export default interface ITransactionProcessor {
  /**
   * Processes the given transactions.
   * This includes fetching the files referenced by the given transaction, validation, categorization of operations by DID, and storing the operations in DB.
   * @param transaction Transaction to process.
   * @returns true if the transaction is processed successfully (no retry required), false otherwise (retry required).
   */
  processTransaction (transaction: TransactionModel): Promise<boolean>;
}
