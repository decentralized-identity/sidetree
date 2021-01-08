import Compressor from '../../lib/core/versions/latest/util/Compressor';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import OperationGenerator from '../generators/OperationGenerator';
import ProvisionalIndexFile from '../../lib/core/versions/latest/ProvisionalIndexFile';
import ProvisionalIndexFileModel from '../../lib/core/versions/latest/models/ProvisionalIndexFileModel';
import SidetreeError from '../../lib/common/SidetreeError';

describe('ProvisionalIndexFile', async () => {
  describe('parse()', async () => {
    it('should throw if buffer given is not valid JSON.', async () => {
      const fileBuffer = Buffer.from('NotJsonString');
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ProvisionalIndexFile.parse(fileCompressed),
        ErrorCode.ProvisionalIndexFileNotJson);
    });

    it('should throw if the buffer is not compressed', async () => {
      const provisionalIndexFileModel: ProvisionalIndexFileModel = {
        chunks: [{ chunkFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' }]
      };
      const fileBuffer = Buffer.from(JSON.stringify(provisionalIndexFileModel));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ProvisionalIndexFile.parse(fileBuffer),
        ErrorCode.ProvisionalIndexFileDecompressionFailure);
    });

    it('should throw if has an unknown property.', async () => {
      const provisionalIndexFile = {
        unknownProperty: 'Unknown property',
        chunks: [{ chunkFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' }]
      };
      const fileBuffer = Buffer.from(JSON.stringify(provisionalIndexFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await expectAsync(ProvisionalIndexFile.parse(fileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.ProvisionalIndexFileHasUnknownProperty));
    });

    it('should throw if missing chunk file hash.', async () => {
      const provisionalIndexFile = {
        // chunks: [{ chunkFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' }], // Intentionally kept to show what the expected property should be.
      };
      const fileBuffer = Buffer.from(JSON.stringify(provisionalIndexFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await expectAsync(ProvisionalIndexFile.parse(fileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.ProvisionalIndexFileChunksPropertyMissingOrIncorrectType));
    });

    it('should throw if there is no updates but a provisional proof file URI is given.', async () => {
      const provisionalIndexFile: ProvisionalIndexFileModel = {
        provisionalProofFileUri: 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        chunks: [{ chunkFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' }]
      };
      const fileBuffer = Buffer.from(JSON.stringify(provisionalIndexFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ProvisionalIndexFile.parse(fileCompressed),
        ErrorCode.ProvisionalIndexFileProvisionalProofFileUriNotAllowed
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
        () => (ProvisionalIndexFile as any).validateOperationsProperty(operationsProperty),
        ErrorCode.InputValidatorInputContainsNowAllowedProperty,
        'provisional operation references'
      );
    });

    it('should throw if there is update property is not an array.', async () => {
      const operationsProperty = {
        update: 'not an array'
      };

      await expect(() => (ProvisionalIndexFile as any).validateOperationsProperty(operationsProperty))
        .toThrow(new SidetreeError(ErrorCode.ProvisionalIndexFileUpdateOperationsNotArray));
    });

    it('should throw if there are multiple update operations for the same DID.', async () => {
      const didSuffix = OperationGenerator.generateRandomHash();
      const operationsProperty = {
        update: [
          { didSuffix, revealValue: OperationGenerator.generateRandomHash() },
          { didSuffix, revealValue: OperationGenerator.generateRandomHash() } // Intentionally having another update reference with the same DID.
        ]
      };

      expect(() => (ProvisionalIndexFile as any).validateOperationsProperty(operationsProperty))
        .toThrow(new SidetreeError(ErrorCode.ProvisionalIndexFileMultipleOperationsForTheSameDid));
    });

    it('should throw if a update operation reference has an invalid `didSuffix`.', async () => {
      const operationsProperty = {
        update: [
          { didSuffix: 123, revealValue: 'unused' } // Intentionally having invalid `didSuffix`.
        ]
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (ProvisionalIndexFile as any).validateOperationsProperty(operationsProperty),
        ErrorCode.EncodedMultihashMustBeAString,
        'didSuffix'
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
        () => (ProvisionalIndexFile as any).validateOperationsProperty(operationsProperty),
        ErrorCode.EncodedMultihashMustBeAString,
        'update reference'
      );
    });
  });

  describe('validateChunksProperty()', async () => {
    it('should throw if there is more than one chunk in chunks array.', async () => {
      const chunks = [
        { chunkFileUri: 'anyValue1' },
        { chunkFileUri: 'anyValue2' } // Intentionally adding more than one element.
      ];

      expect(() => (ProvisionalIndexFile as any).validateChunksProperty(chunks))
        .toThrow(new SidetreeError(ErrorCode.ProvisionalIndexFileChunksPropertyDoesNotHaveExactlyOneElement));
    });

    it('should throw if there is more than one property in a chunk element.', async () => {
      const chunks = [
        {
          chunkFileUri: 'anyValue1',
          unexpectedProperty: 'any value'
        }
      ];

      expect(() => (ProvisionalIndexFile as any).validateChunksProperty(chunks))
        .toThrow(new SidetreeError(ErrorCode.ProvisionalIndexFileChunkHasMissingOrUnknownProperty));
    });
  });
});
