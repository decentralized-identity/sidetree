/**
 * Defines the external Map File structure.
 */
export default interface MapFileModel {
  chunks: {
    chunkFileUri: string
  }[];

  operations?: {
    update: {
      didSuffix: string,
      signedData: string
    }[]
  };
}
