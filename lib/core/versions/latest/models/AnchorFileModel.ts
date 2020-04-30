/**
 * Defines Anchor File structure.
 */
export default interface AnchorFileModel {
  writer_lock_id: string | undefined;
  map_file_uri: string;
  operations: {
    create?: any[],
    recoverOperations?: any[],
    deactivateOperations?: any[]
  };
}
