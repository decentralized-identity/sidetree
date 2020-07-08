import NormalizedFeeCalculator from '../../../lib/bitcoin/versions/latest/NormalizedFeeCalculator';

describe('NormalizedFeeCalculaor', () => {
  let normalizedFeeCalculator: NormalizedFeeCalculator;

  beforeEach(() => {
    normalizedFeeCalculator = new NormalizedFeeCalculator();
  });

  describe('initialize', () => {
    it('should initialize members correctly', async (done) => {

      await normalizedFeeCalculator.initialize();
      done();
    });
  });

  describe('getNormalizedFee', () => {
    it('should return the correct normalized fee.', async (done) => {

      const actual = normalizedFeeCalculator.getNormalizedFee(1234);
      expect(actual).toEqual(10);
      done();
    });
  });
});
