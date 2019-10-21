
export interface ISlidingWindowQuantileConfig {
  windowSizeInBlocks: number;
  windowSlideInBlocks: number;
  transactionFeeApproximation: number;
  sampleSize: number;
}

export interface IProofOfFeeConfig {
  slidingWindowQuantileConfig: ISlidingWindowQuantileConfig;
  quantile: number;
  quantileScale: number;
}
