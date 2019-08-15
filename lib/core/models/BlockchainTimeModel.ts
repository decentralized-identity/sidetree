/**
 * Represents an instance in time in a blockchain.
 */
export default interface BlockchainTimeModel {
  /** A number that represents the time in the blockchain. */
  time: number;
  /** The globally unique hash that is associated with the time. */
  hash: string;
}
