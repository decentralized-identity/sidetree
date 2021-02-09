import OperationReferenceModel from './OperationReferenceModel';

/**
 * Defines the external Map File structure.
 */
export default interface ProvisionalIndexFileModel {
  provisionalProofFileUri?: string;
  operations?: {
    update: OperationReferenceModel[]
  };
  chunks: {
    chunkFileUri: string
  }[];
}
