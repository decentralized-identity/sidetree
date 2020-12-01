/**
 * Internal data structure of the delta for each operation.
 */
export default interface SuffixDataModel {
  deltaHash: string;
  recoveryCommitment: string;
  type?: string;
}
