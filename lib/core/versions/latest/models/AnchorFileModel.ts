/**
 * Defines Anchor File structure.
 */
export default interface AnchorFileModel {
  batchFileHash: string;
  merkleRoot: string;
  didUniqueSuffixes: string[];
}
