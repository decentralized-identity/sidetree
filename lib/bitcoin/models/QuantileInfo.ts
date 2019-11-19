/**
 * Quantile information stored in the quantile store
 * for each group.
 */
export default interface QuantileInfo {
  groupId: number;
  quantile: number;
  groupFreqVector: number[];
}
