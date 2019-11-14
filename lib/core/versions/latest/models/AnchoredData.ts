/**
 * Defines model for the data which is to be anchored to the blockchain.
 */
export default interface AnchoredData {
  anchorFileHash: string;
  numberOfOperations: number;
}
