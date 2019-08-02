import ITransaction from '../../common/ITransaction';

/**
 * Interface that defines a class that can process transactions fetched from blockchain.
 */
export default interface TransactionProcessor {
  /**
   * Processes the given transactions.
   * This includes fetching the files referenced by the given transaction, validation, categorization of operations by DID, and storing the operations in DB.
   * @param transaction Transaction to process.
   * @param allSupportedHashAlgorithms All supported hash algorithms across all versions of Sidetree protocol, for verification such as allowed DID format.
   * @returns true if the transaction is processed successfully (no retry required), false otherwise (retry required).
   */
  processTransaction (
    transaction: ITransaction,
    allSupportedHashAlgorithms: number [],
    getHashAlgorithmInMultihashCode: (blockchainTime: number) => number
  ): Promise<boolean>;
}
