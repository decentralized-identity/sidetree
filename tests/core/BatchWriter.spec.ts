import BatchWriter from '../../lib/core/versions/latest/BatchWriter';
import MockBlockchain from '../mocks/MockBlockchain';
import MockCas from '../mocks/MockCas';
import MockOperationQueue from '../mocks/MockOperationQueue';
import ProtocolParameters from '../../lib/core/versions/latest/ProtocolParameters';
import ValueTimeLockVerifier from '../../lib/core/versions/latest/ValueTimeLockVerifier';

describe('BatchWriter', () => {
  let batchWriter: BatchWriter;

  beforeAll(() => {
    const mockVersionMetadataFetcher: any = {};
    batchWriter = new BatchWriter(new MockOperationQueue(), new MockBlockchain(), new MockCas(), mockVersionMetadataFetcher);
  });

  describe('getNumberOfOperationsToWrite', () => {

    it('should return the value from the lock verifier', () => {
      const mockOpsByLock = ProtocolParameters.maxOperationsPerBatch - 1;
      spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOperationsAllowed').and.returnValue(mockOpsByLock);

      const actual = batchWriter['getNumberOfOperationsToWrite'](undefined);
      expect(actual).toEqual(mockOpsByLock);
    });

    it('should not return a value more than the max allowed batch size.', () => {
      const mockOpsByLock = ProtocolParameters.maxOperationsPerBatch + 123;
      spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOperationsAllowed').and.returnValue(mockOpsByLock);

      const actual = batchWriter['getNumberOfOperationsToWrite'](undefined);
      expect(actual).toEqual(ProtocolParameters.maxOperationsPerBatch);
    });

  });
});
