import * as crypto from 'crypto';
import BatchFile from '../../lib/core/versions/latest/BatchFile';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import OperationGenerator from '../generators/OperationGenerator';

describe('BatchFile', async () => {
  describe('parse()', async () => {

    it('should throw exception if there is an unknown property.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const batchFileModel = {
        deltas: [
          createOperation.encodedDelta
        ],
        unexpectedProperty: 'any value'
      };

      const rawData = Buffer.from(JSON.stringify(batchFileModel));
      const compressedRawData = await Compressor.compress(Buffer.from(rawData));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => BatchFile.parse(compressedRawData),
        ErrorCode.BatchFileUnexpectedProperty
      );
    });
  });

  describe('createBuffer()', async () => {

    it('should create the buffer correctly.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation({
        didUniqueSuffix: 'didOfRecovery',
        recoveryRevealValue: 'anyRevealValue',
        recoveryPrivateKey
      });
      const recoverOperation = recoverOperationData.recoverOperation;

      const batchFileBuffer = await BatchFile.createBuffer([createOperation], [recoverOperation], []);

      const decompressedBatchFileModel = await BatchFile.parse(batchFileBuffer);

      expect(decompressedBatchFileModel.deltas.length).toEqual(2);
      expect(decompressedBatchFileModel.deltas[0]).toEqual(createOperation.encodedDelta!);
      expect(decompressedBatchFileModel.deltas[1]).toEqual(recoverOperation.encodedDelta!);

    });
  });

  describe('validateDeltasProperty()', async () => {

    it('should throw is `delta` property is not an array.', async () => {
      const deltas = 'Incorrect type.';

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (BatchFile as any).validateDeltasProperty(deltas), ErrorCode.BatchFileDeltasPropertyNotArray
      );
    });

    it('should throw if any `delta` element is not a string.', async () => {
      const deltas = [
        1, 2, 3 // Intentionally incorrect type.
      ];

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (BatchFile as any).validateDeltasProperty(deltas), ErrorCode.BatchFileDeltasNotArrayOfStrings
      );
    });

    it('should throw if any `delta` element is not a string.', async () => {
      const randomBytes = crypto.randomBytes(2000); // Intentionally larger than maximum.
      const deltas = [
        Encoder.encode(randomBytes)
      ];

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (BatchFile as any).validateDeltasProperty(deltas), ErrorCode.BatchFileDeltaSizeExceedsLimit
      );
    });
  });
});
