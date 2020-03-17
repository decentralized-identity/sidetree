/**
 * Defines Anchor File structure.
 */
export default interface AnchorFileModel {
  mapFileHash: string;
  operations: {
    createOperations?: any[],
    recoverOperations?: any[],
    revokeOperations?: any[]
  };
}
