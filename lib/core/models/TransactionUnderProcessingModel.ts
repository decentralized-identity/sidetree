import TransactionModel from '../../common/models/TransactionModel';

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
export default interface TransactionUnderProcessingModel {
  transaction: TransactionModel;
  processingStatus: TransactionProcessingStatus;
}
