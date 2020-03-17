/**
 * Defines Anchor File structure.
 */
export default interface AnchorFileModel {
  writerLock: string | undefined;
  mapFileHash: string;
  operations: {
    createOperations?: any[],
    recoverOperations?: any[],
    revokeOperations?: any[]
  };
}
