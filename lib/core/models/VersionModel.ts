/**
 * Defines an implementation version and its starting blockchain time.
 */
export default interface VersionModel {
  /** The inclusive starting logical blockchain time that this version applies to. */
  startingBlockchainTime: number;
  version: string;
}
