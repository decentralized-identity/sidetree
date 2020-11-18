import Compressor from '../../lib/core/versions/latest/util/Compressor';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import MapFile from '../../lib/core/versions/latest/MapFile';
import MapFileModel from '../../lib/core/versions/latest/models/MapFileModel';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import SidetreeError from '../../lib/common/SidetreeError';

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
        chunks: [{ chunkFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' }]
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFileModel));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => MapFile.parse(fileBuffer),
        ErrorCode.MapFileDecompressionFailure);
    });

    it('should throw if has an unknown property.', async () => {
      const mapFile = {
        unknownProperty: 'Unknown property',
        chunks: [{ chunkFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' }]
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await expectAsync(MapFile.parse(fileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.MapFileHasUnknownProperty));
    });

    it('should throw if missing chunk file hash.', async () => {
      const mapFile = {
        // chunks: [{ chunkFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' }], // Intentionally kept to show what the expected property should be.
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await expectAsync(MapFile.parse(fileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.MapFileChunksPropertyMissingOrIncorrectType));
    });

    it('should throw if there is no updates but a provisional proof file URI is given.', async () => {
      const mapFile: MapFileModel = {
        provisionalProofFileUri: 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        chunks: [{ chunkFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' }]
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => MapFile.parse(fileCompressed),
        ErrorCode.MapFileProvisionalProofFileUriNotAllowed
      );
    });
  });

  describe('validateOperationsProperty()', async () => {
    it('should throw if there is more than one (update) property.', async () => {
      const updateOperationData = await OperationGenerator.generateUpdateOperationRequest();
      const updateOperationRequest = updateOperationData.request;

      const operationsProperty = {
        update: [
          updateOperationRequest
        ],
        unexpectedProperty: 'anyValue'
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => (MapFile as any).validateOperationsProperty(operationsProperty),
        ErrorCode.InputValidatorInputContainsNowAllowedProperty,
        'provisional operation references'
      );
    });

    it('should throw if there is update property is not an array.', async () => {
      const operationsProperty = {
        update: 'not an array'
      };

      await expect(() => (MapFile as any).validateOperationsProperty(operationsProperty))
        .toThrow(new SidetreeError(ErrorCode.MapFileUpdateOperationsNotArray));
    });

    it('should throw if there are multiple update operations for the same DID.', async () => {
      const didSuffix = OperationGenerator.generateRandomHash();
      const operationsProperty = {
        update: [
          { didSuffix, revealValue: 'unused1' },
          { didSuffix, revealValue: 'unused2' } // Intentionally having another update reference with the same DID.
        ]
      };

      expect(() => (MapFile as any).validateOperationsProperty(operationsProperty))
        .toThrow(new SidetreeError(ErrorCode.MapFileMultipleOperationsForTheSameDid));
    });

    it('should throw if a update operation reference has an invalid `didSuffix`.', async () => {
      const operationsProperty = {
        update: [
          { didSuffix: 123, revealValue: 'unused' } // Intentionally having invalid `didSuffix`.
        ]
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (MapFile as any).validateOperationsProperty(operationsProperty),
        ErrorCode.UpdateReferenceDidSuffixIsNotAString
      );
    });

    it('should throw if a update operation reference has an invalid `revealValue`.', async () => {
      const didSuffix = OperationGenerator.generateRandomHash();
      const operationsProperty = {
        update: [
          { didSuffix, revealValue: 123 } // Intentionally having invalid `revealValue`.
        ]
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (MapFile as any).validateOperationsProperty(operationsProperty),
        ErrorCode.UpdateReferenceRevealValueIsNotAString
      );
    });
  });

  describe('validateChunksProperty()', async () => {
    it('should throw if there is more than one chunk in chunks array.', async () => {
      const chunks = [
        { chunkFileUri: Encoder.encode(Multihash.hash(Buffer.from('anyValue1'))) },
        { chunkFileUri: Encoder.encode(Multihash.hash(Buffer.from('anyValue2'))) } // Intentionally adding more than one element.
      ];

      expect(() => (MapFile as any).validateChunksProperty(chunks)).toThrow(new SidetreeError(ErrorCode.MapFileChunksPropertyDoesNotHaveExactlyOneElement));
    });

    it('should throw if there is more than one property in a chunk element.', async () => {
      const chunks = [
        {
          chunkFileUri: Encoder.encode(Multihash.hash(Buffer.from('anyValue1'))),
          unexpectedProperty: 'any value'
        }
      ];

      expect(() => (MapFile as any).validateChunksProperty(chunks)).toThrow(new SidetreeError(ErrorCode.MapFileChunkHasMissingOrUnknownProperty));
    });
  });
});
