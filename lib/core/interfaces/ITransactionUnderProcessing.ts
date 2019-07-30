import ITransaction from '../../common/ITransaction';

/**
 * The state of a transaction that is being processed.
 */
export enum TransactionProcessingStatus {
  Pending = 'pending',
  Processsed = 'processed'
}

/**
 * Data structure for holding a transaction that is being processed and its state.
 */
export default interface ITransactionUnderProcessing {
  transaction: ITransaction;
  processingStatus: TransactionProcessingStatus;
}
