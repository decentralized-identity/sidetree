/**
 * Defines the external Anchor File structure.
 */
export default interface AnchorFileModel {
  writer_lock_id: string | undefined;
  map_file_uri: string;
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
      signed_data: string;
    }[],
    deactivate?: {
      didSuffix: string;
      signed_data: string;
    }[]
  };
}
