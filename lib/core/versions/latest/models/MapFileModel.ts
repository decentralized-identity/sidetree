import OperationReferenceModel from './OperationReferenceModel';

/**
 * Defines the external Map File structure.
 */
export default interface MapFileModel {
  provisionalProofFileUri?: string;
  operations?: {
    update: OperationReferenceModel[]
  };
  chunks: {
    chunkFileUri: string
  }[];
}
