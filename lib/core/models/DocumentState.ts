import PublicKeyModel from './PublicKeyModel';

/**
 * Defines the internal generic document state after an operation is applied.
 * This model is created so that it is agnostic to any particular external schema.
 */
export default interface DocumentState {
  didUniqueSuffix: string;
  document: any;
  recoveryKey: PublicKeyModel | undefined ;
  nextRecoveryCommitmentHash: string | undefined; // NOTE: Can be undefined after a deactivate operation is applied.
  nextUpdateCommitmentHash: string | undefined; // NOTE: Can be undefined after a deactivate operation is applied.
  lastOperationTransactionNumber: number;
}
