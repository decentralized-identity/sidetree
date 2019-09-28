import BatchFile from '../../lib/core/versions/latest/BatchFile';
import Encoder from '../../lib/core/versions/latest/Encoder';

describe('BatchFile', async () => {
  describe('fromOperationBuffer()', async () => {

    it('should create the buffer correctly.', async () => {
      const dummyOperation = { prop1: 'value1', prop2: 'value2' };
      const dummyOperationArray = [dummyOperation, dummyOperation];
      const dummyOperationBuffers = dummyOperationArray.map((operation) => {
        return Buffer.from(JSON.stringify(operation));
      });

      const batchFileBuffer = await BatchFile.fromOperationBuffers(dummyOperationBuffers);
      const batchFileBufferEncoded = Encoder.encode(batchFileBuffer);

      // Calculated this manually to verify the output
      const expectedEncodedBuffer = 'H4sIAAAAAAAACqtWyi9ILUosyczPK1ayilZKrfQqT861LPcN9jTzzIvKSPIIywGyiz3znCqTjB0rPbPyM1Ny3YpTwkMrPfMMlHRI1hFbCwBsTXYidAAAAA';

      expect(batchFileBufferEncoded).toEqual(expectedEncodedBuffer);
    });
  });
});
