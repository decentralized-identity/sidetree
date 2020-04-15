import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import SidetreeError from '../../lib/common/SidetreeError';
import OperationGenerator from '../generators/OperationGenerator';

describe('AnchorFile', async () => {
  describe('parse()', async () => {
    it('should throw if buffer given is not valid JSON.', async () => {
      const anchorFileBuffer = Buffer.from('NotJsonString');
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => AnchorFile.parse(anchorFileCompressed),
        ErrorCode.AnchorFileNotJson);
    });

    it('should throw if the buffer is not compressed', async () => {
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => AnchorFile.parse(anchorFileBuffer),
        ErrorCode.AnchorFileDecompressionFailure);
    });

    it('should throw if has an unknown property.', async () => {
      const anchorFile = {
        unknownProperty: 'Unknown property',
        writerlockId: 'writer lock',
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: []
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty));
    });

    it('should throw if missing map file hash.', async () => {
      const anchorFile = {
        // mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what is missing.
        operations: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMapFileHashMissing));
    });

    it('should throw if missing operations property.', async () => {
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
        // operations: {}, // Intentionally missing operations.
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMissingOperationsProperty));
    });

    it('should throw if any additional property.', async () => {
      const anchorFile = {
        invalidProperty: 'some property value',
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {}
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty));
    });

    it('should throw if map file hash is not string.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const anchorFileModel = await AnchorFile.createModel('writerlock', 'unusedMockFileHash', [createOperation], [], []);

      (anchorFileModel as any).mapFileHash = 1234; // Intentionally setting the mapFileHash as an incorrect type.

      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMapFileHashNotString));
    });

    it('should throw if map file hash is invalid.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const anchorFileModel = await AnchorFile.createModel('writerlock', 'invalidMapFileHash', [createOperation], [], []);

      try {
        const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
        const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

        await AnchorFile.parse(anchorFileCompressed);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.AnchorFileMapFileHashUnsupported);
      }
    });

    it('should throw if writer lock id is not string.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const anchorFileModel = await AnchorFile.createModel('writerlock', 'unusedMockFileHash', [createOperation], [], []);

      (anchorFileModel as any).writerLockId = {}; // intentionally set to invalid value

      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileWriterLockIPropertyNotString));
    });

    it('should throw if `createOperations` is not an array.', async () => {
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          createOperations: 'IncorrectType'
        }
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileCreateOperationsNotArray));
    });

    it('should throw if there are multiple operations for the same DID.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperationRequest = createOperationData.operationRequest;

      // Strip away properties not allowed in the createOperations array elements.
      delete createOperationRequest.type;
      delete createOperationRequest.delta;

      const deactivateOperationRequest = await OperationGenerator.generateDeactivateOperationRequest(
        createOperationData.createOperation.didUniqueSuffix, // Intentionally using the same DID unique suffix.
        'anyRecoveryRevealValue',
        createOperationData.recoveryPrivateKey
      );

      // Strip away properties not allowed in the deactivateOperations array elements.
      delete deactivateOperationRequest.type;
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          createOperations: [createOperationRequest],
          deactivateOperations: [deactivateOperationRequest]
        }
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMultipleOperationsForTheSameDid));
    });
  });

  describe('createBuffer', async () => {
    it('should created a compressed buffer correctly.', async () => {
      const mapFileHash = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const anchoreFileBuffer = await AnchorFile.createBuffer(undefined, mapFileHash, [createOperation], [], []);

      const anchorFile = await AnchorFile.parse(anchoreFileBuffer);

      expect(anchorFile.model.mapFileHash).toEqual(mapFileHash);
      expect(anchorFile.model.operations.createOperations![0].suffix_data).toEqual(createOperation.encodedSuffixData);
    });
  });
});
