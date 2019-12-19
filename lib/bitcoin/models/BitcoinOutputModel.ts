/**
 * Encapsulates data for the outputs for a transaction.
 */
export default interface BitcoinOutputModel {
  satoshis: number;
  scriptAsmAsString: string;
}
