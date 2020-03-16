/**
 * Defines Anchor File structure.
 */
export default interface AnchorFileModel {
  writerLock: string | undefined;
  mapFileHash: string;
  didUniqueSuffixes: string[];
}
