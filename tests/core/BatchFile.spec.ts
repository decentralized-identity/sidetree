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

      // Calculated this manually to verify the output
      const expectedEncodedBuffer = 'H4sIAAAAAAAACqtWyi9ILUosyczPK1ayilZKrfQqT861LPcN9jTzzIvKSPIIywGyiz3znCqTjB0rPbPyM1Ny3YpTwkMrPfMMlHRI1hFbCwBsTXYidAAAAA';
      const expectedBuffer = Encoder.decodeAsBuffer(expectedEncodedBuffer);

      // Removing the first 10 bytes of the buffer as those are the header bytes in gzip are
      // the header bytes which are effected by the current operating system. So if the tests
      // run on a different OS, those bytes change even though they don't effect the actual
      // decompression/compression.
      expect(batchFileBuffer.slice(10)).toEqual(expectedBuffer.slice(10));
    });
  });
});
