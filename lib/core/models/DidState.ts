/**
 * Defines the internal generic DID state after an operation is applied.
 * This model is created so that it is agnostic to any particular external schema.
 */
export default interface DidState {
  document: any;
  nextRecoveryCommitmentHash?: string; // NOTE: Can be undefined after a deactivate operation is applied.
  nextUpdateCommitmentHash?: string; // NOTE: Can be undefined after a deactivate operation is applied.
  lastOperationTransactionNumber: number;
}
