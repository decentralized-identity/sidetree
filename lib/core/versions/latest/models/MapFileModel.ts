/**
 * Defines the external Map File structure.
 */
export default interface MapFileModel {
  chunks: {
    chunk_file_uri: string
  }[];

  operations?: {
    update: {
      didSuffix: string,
      signedData: string
    }[]
  };
}
