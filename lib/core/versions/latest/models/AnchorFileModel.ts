/**
 * Defines Anchor File structure.
 */
export default interface AnchorFileModel {
  writerLockId: string | undefined;
  mapFileHash: string;
  operations: {
    createOperations?: any[],
    recoverOperations?: any[],
    deactivateOperations?: any[]
  };
}
