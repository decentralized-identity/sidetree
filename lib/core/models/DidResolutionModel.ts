import PublicKeyModel from './PublicKeyModel';

/**
 * Represents the DID resolution response model.
 */
export default interface DidResolutionModel {
  didDocument?: any;
  metadata?: {
    recoveryKey?: PublicKeyModel,
    lastOperationTransactionNumber: number;
    nextUpdateOtpHash?: string;
    nextRecoveryOtpHash?: string;
  };
}
