/**
 * Encapsulates data for the inputs for a bitcoin transaction.
 */
export default interface BitcoinInputModel {
  previousTransactionId: string;
  outputIndexInPreviousTransaction: number;
  scriptAsmAsString: string;
}
