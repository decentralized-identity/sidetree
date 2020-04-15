import BatchFile from '../../lib/core/versions/latest/BatchFile';
import OperationGenerator from '../generators/OperationGenerator';

describe('BatchFile', async () => {
  describe('createBuffer()', async () => {

    it('should create the buffer correctly.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const batchFileBuffer = await BatchFile.createBuffer([createOperation], [], []);

      const decompressedBatchFileModel = await BatchFile.parse(batchFileBuffer);

      expect(decompressedBatchFileModel.patchSet.length).toEqual(1);
      expect(decompressedBatchFileModel.patchSet[0]).toEqual(createOperation.encodedDelta!);
    });
  });
});
