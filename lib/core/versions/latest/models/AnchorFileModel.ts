/**
 * Defines the external Anchor File structure.
 */
export default interface AnchorFileModel {
  writerLockId: string | undefined;
  mapFileUri: string;
  coreProofFileUri?: string;
  provisionalProofFileUri?: string;
  operations: {
    create?: {
      suffixData: {
        deltaHash: string;
        recoveryCommitment: string;
        type?: string;
      };
    }[],
    recover?: {
      didSuffix: string;
      signedData: string;
    }[],
    deactivate?: {
      didSuffix: string;
      signedData: string;
    }[]
  };
}
