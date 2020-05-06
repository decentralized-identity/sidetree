/**
 * Defines the external Map File structure.
 */
export default interface MapFileModel {
  chunks: {
    chunk_file_uri: string
  }[];

  operations?: {
    update: {
      did_suffix: string,
      update_reveal_value: string,
      signed_data: string
    }[]
  };
}
