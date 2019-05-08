/**
 * Defines Anchor File structure.
 */
export interface IAnchorFile {
  batchFileHash: string;
  merkleRoot: string;
  didUniqueSuffixes: string[];
}

/**
 * Class containing Anchor File related operations.
 */
export default class AnchorFile {
  /**
   * Parses and validates the given anchor file buffer.
   * @throws Error if failed parsing or validation.
   */
  public static parseAndValidate (anchorFileBuffer: Buffer): IAnchorFile {
    // TODO: Issue https://github.com/decentralized-identity/sidetree-core/issues/129 - Perform schema validation.
    const anchorFile: IAnchorFile = JSON.parse(anchorFileBuffer.toString());
    return anchorFile;
  }
}
