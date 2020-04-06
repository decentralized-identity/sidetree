import PublicKeyModel from './PublicKeyModel';

/**
 * Defines the internal generic DID state after an operation is applied.
 * This model is created so that it is agnostic to any particular external schema.
 */
export default interface DidState {
  document: any;
  recoveryKey: PublicKeyModel | undefined ;
  nextRecoveryCommitmentHash: string | undefined; // NOTE: Can be undefined after a revoke operation is applied.
  nextUpdateCommitmentHash: string | undefined; // NOTE: Can be undefined after a revoke operation is applied.
  lastOperationTransactionNumber: number;
}
