/**
 * Represents the DID resolution response model.
 */
export default interface DidResolutionModel {
  didDocument?: any;
  metadata?: {
    lastOperationTransactionNumber: number;
    nextUpdateOtpHash: string;
    nextRecoveryOtpHash: string;
  };
}
