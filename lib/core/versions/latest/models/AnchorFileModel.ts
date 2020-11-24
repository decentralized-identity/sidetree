import OperationReferenceModel from './OperationReferenceModel';

/**
 * Defines the external Anchor File structure.
 */
export default interface AnchorFileModel {
  writerLockId?: string;
  mapFileUri?: string;
  coreProofFileUri?: string;
  operations?: {
    create?: {
      suffixData: {
        deltaHash: string;
        recoveryCommitment: string;
        type?: string;
      };
    }[],
    recover?: OperationReferenceModel[],
    deactivate?: OperationReferenceModel[]
  };
}
