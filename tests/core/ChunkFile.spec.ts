import * as crypto from 'crypto';
import ChunkFile from '../../lib/core/versions/latest/ChunkFile';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import OperationGenerator from '../generators/OperationGenerator';

describe('ChunkFile', async () => {
  describe('parse()', async () => {

    it('should throw exception if there is an unknown property.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const chunkFileModel = {
        deltas: [
          createOperation.delta
        ],
        unexpectedProperty: 'any value'
      };

      const rawData = Buffer.from(JSON.stringify(chunkFileModel));
      const compressedRawData = await Compressor.compress(Buffer.from(rawData));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ChunkFile.parse(compressedRawData),
        ErrorCode.ChunkFileUnexpectedProperty
      );
    });
  });

  describe('createBuffer()', async () => {

    it('should create the buffer correctly.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation({
        didUniqueSuffix: 'EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWg',
        recoveryPrivateKey
      });
      const recoverOperation = recoverOperationData.recoverOperation;

      const chunkFileBuffer = await ChunkFile.createBuffer([createOperation], [recoverOperation], []);

      const decompressedChunkFileModel = await ChunkFile.parse(chunkFileBuffer!);

      expect(decompressedChunkFileModel.deltas.length).toEqual(2);
      expect(decompressedChunkFileModel.deltas[0]).toEqual(createOperation.delta!);
      expect(decompressedChunkFileModel.deltas[1]).toEqual(recoverOperation.delta!);

    });
  });

  describe('validateDeltasProperty()', async () => {

    it('should throw is `delta` property is not an array.', async () => {
      const deltas = 'Incorrect type.';

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (ChunkFile as any).validateDeltasProperty(deltas), ErrorCode.ChunkFileDeltasPropertyNotArray
      );
    });

    it('should throw if any `delta` element is not a string.', async () => {
      const deltas = [
        1, 2, 3 // Intentionally incorrect type.
      ];

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (ChunkFile as any).validateDeltasProperty(deltas), ErrorCode.ChunkFileDeltasNotArrayOfObjects
      );
    });

    it('should throw if any `delta` element exceeds max size.', async () => {
      const randomBytes = crypto.randomBytes(2000); // Intentionally larger than maximum.
      const deltas = [
        {
          objectKey: Encoder.encode(randomBytes)
        }
      ];

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (ChunkFile as any).validateDeltasProperty(deltas), ErrorCode.DeltaExceedsMaximumSize
      );
    });
  });
});
