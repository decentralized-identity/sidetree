/**
 * Defines the external Map File structure.
 */
export default interface MapFileModel {
  provisionalProofFileUri?: string;
  operations?: {
    update: {
      didSuffix: string,
      signedData: string
    }[]
  };
  chunks: {
    chunkFileUri: string
  }[];
}
