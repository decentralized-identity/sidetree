import Compressor from '../../lib/core/versions/latest/util/Compressor';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import MapFile from '../../lib/core/versions/latest/MapFile';
import MapFileModel from '../../lib/core/versions/latest/models/MapFileModel';
import Multihash from '../../lib/core/versions/latest/Multihash';
import SidetreeError from '../../lib/common/SidetreeError';
import OperationGenerator from '../generators/OperationGenerator';

describe('MapFile', async () => {
  describe('parse()', async () => {
    it('should throw if buffer given is not valid JSON.', async () => {
      const fileBuffer = Buffer.from('NotJsonString');
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => MapFile.parse(fileCompressed),
        ErrorCode.MapFileNotJson);
    });

    it('should throw if the buffer is not compressed', async () => {
      const mapFileModel: MapFileModel = {
        chunks: [ { chunk_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' } ]
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFileModel));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => MapFile.parse(fileBuffer),
        ErrorCode.MapFileDecompressionFailure);
    });

    it('should throw if has an unknown property.', async () => {
      const mapFile = {
        unknownProperty: 'Unknown property',
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await expectAsync(MapFile.parse(fileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.MapFileHasUnknownProperty));
    });

    it('should throw if missing batch file hash.', async () => {
      const mapFile = {
        // batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what the expected property should be.
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await expectAsync(MapFile.parse(fileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.MapFileChunksPropertyMissingOrIncorrectType));
    });
  });

  describe('parseOperationsProperty()', async () => {
    it('should throw if there is more than one (update) property.', async () => {
      const updateOperationData = await OperationGenerator.generateUpdateOperationRequest();
      const updateOperationRequest = updateOperationData.request;

      const operationsProperty = {
        update: [
          updateOperationRequest
        ],
        unexpectedProperty: 'anyValue'
      };

      await expectAsync((MapFile as any).parseOperationsProperty(operationsProperty))
        .toBeRejectedWith(new SidetreeError(ErrorCode.MapFileOperationsPropertyHasMissingOrUnknownProperty));
    });

    it('should throw if there is update property is not an array.', async () => {
      const operationsProperty = {
        update: 'not an array'
      };

      await expectAsync((MapFile as any).parseOperationsProperty(operationsProperty))
        .toBeRejectedWith(new SidetreeError(ErrorCode.MapFileUpdateOperationsNotArray));
    });

    it('should throw if there are multiple update operations for the same DID.', async () => {
      const updateOperationData = await OperationGenerator.generateUpdateOperationRequest();
      const updateOperationRequest = updateOperationData.request;

      // Operation does not have `type` and `delta` property in map file.
      delete updateOperationRequest.type;
      delete updateOperationRequest.delta;

      const operationsProperty = {
        update: [
          updateOperationRequest, updateOperationRequest // Intentionally having another update with the same DID.
        ]
      };

      await expectAsync((MapFile as any).parseOperationsProperty(operationsProperty))
        .toBeRejectedWith(new SidetreeError(ErrorCode.MapFileMultipleOperationsForTheSameDid));
    });
  });

  describe('validateChunksProperty()', async () => {
    it('should throw if there is more than one chunk in chunks array.', async () => {
      const chunks = [
        { chunk_file_uri: Encoder.encode(Multihash.hash(Buffer.from('anyValue1'))) },
        { chunk_file_uri: Encoder.encode(Multihash.hash(Buffer.from('anyValue2'))) } // Intentionally adding more than one element.
      ];

      expect(() => (MapFile as any).validateChunksProperty(chunks)).toThrow(new SidetreeError(ErrorCode.MapFileChunksPropertyDoesNotHaveExactlyOneElement));
    });

    it('should throw if there is more than one property in a chunk element.', async () => {
      const chunks = [
        {
          chunk_file_uri: Encoder.encode(Multihash.hash(Buffer.from('anyValue1'))),
          unexpectedProperty: 'any value'
        }
      ];

      expect(() => (MapFile as any).validateChunksProperty(chunks)).toThrow(new SidetreeError(ErrorCode.MapFileChunkHasMissingOrUnknownProperty));
    });
  });
});
