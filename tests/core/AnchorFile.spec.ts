import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import OperationGenerator from '../generators/OperationGenerator';
import SidetreeError from '../../lib/common/SidetreeError';

describe('AnchorFile', async () => {
  describe('parse()', async () => {
    it('should parse an anchor file model correctly.', async () => {
      const mapFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';

      // Create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      // Recover operation.
      const [, anyRecoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation(
        { didUniqueSuffix: 'anyDid1', recoveryRevealValue: 'anyValue', recoveryPrivateKey: anyRecoveryPrivateKey });
      const recoverOperation = recoverOperationData.recoverOperation;

      // Deactivate operation.
      const deactivateOperationData = await OperationGenerator.createDeactivateOperation('anyDid2', 'anyValue', anyRecoveryPrivateKey);
      const deactivateOperation = deactivateOperationData.deactivateOperation;

      const anchorFileBuffer = await AnchorFile.createBuffer(undefined, mapFileUri, [createOperation], [recoverOperation], [deactivateOperation]);

      const parsedAnchorFile = await AnchorFile.parse(anchorFileBuffer);

      expect(parsedAnchorFile.createOperations.length).toEqual(1);
      expect(parsedAnchorFile.createOperations[0].encodedSuffixData).toEqual(createOperation.encodedSuffixData);
      expect(parsedAnchorFile.recoverOperations.length).toEqual(1);
      expect(parsedAnchorFile.recoverOperations[0].signedDataJws.toCompactJws()).toEqual(recoverOperation.signedDataJws.toCompactJws());
      expect(parsedAnchorFile.deactivateOperations.length).toEqual(1);
      expect(parsedAnchorFile.deactivateOperations[0].signedDataJws.toCompactJws()).toEqual(deactivateOperation.signedDataJws.toCompactJws());
      expect(parsedAnchorFile.model.map_file_uri).toEqual(mapFileUri);
    });

    it('should throw if buffer given is not valid JSON.', async () => {
      const anchorFileBuffer = Buffer.from('NotJsonString');
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => AnchorFile.parse(anchorFileCompressed),
        ErrorCode.AnchorFileNotJson);
    });

    it('should throw if the buffer is not compressed', async () => {
      const anchorFile = {
        map_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
        writer_lock_id: 'writer lock',
        map_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {}
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty));
    });

    it('should throw if `operations` property has an unknown property.', async () => {
      const anchorFile = {
        writer_lock_id: 'writer lock',
        map_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          unexpectedProperty: 'any value'
        }
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => AnchorFile.parse(anchorFileCompressed),
        ErrorCode.AnchorFileUnexpectedPropertyInOperations
      );
    });

    it('should throw if missing map file hash.', async () => {
      const anchorFile = {
        // map_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what is missing.
        operations: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMapFileHashMissing));
    });

    it('should throw if missing operations property.', async () => {
      const anchorFile = {
        map_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
        // operations: {}, // Intentionally missing operations.
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMissingOperationsProperty));
    });

    it('should throw if any additional property.', async () => {
      const anchorFile = {
        invalidProperty: 'some property value',
        map_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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

      (anchorFileModel as any).map_file_uri = 1234; // Intentionally setting the map_file_uri as an incorrect type.

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

      (anchorFileModel as any).writer_lock_id = {}; // intentionally set to invalid value

      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileWriterLockIPropertyNotString));
    });

    it('should throw if `create` property is not an array.', async () => {
      const anchorFile = {
        map_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          create: 'IncorrectType'
        }
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileCreatePropertyNotArray));
    });

    it('should throw if `recover` property is not an array.', async () => {
      const anchorFile = {
        map_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          recover: 'IncorrectType'
        }
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileRecoverPropertyNotArray));
    });

    it('should throw if `deactivate` property is not an array.', async () => {
      const anchorFile = {
        map_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          deactivate: 'IncorrectType'
        }
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileDeactivatePropertyNotArray));
    });

    it('should throw if there are multiple operations for the same DID.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperationRequest = createOperationData.operationRequest;

      // Strip away properties not allowed in the createOperations array elements.
      delete createOperationRequest.type;
      delete createOperationRequest.delta;

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        createOperationData.createOperation.didUniqueSuffix, // Intentionally using the same DID unique suffix.
        'anyRecoveryRevealValue',
        createOperationData.recoveryPrivateKey
      );

      // Strip away properties not allowed in the deactivateOperations array elements.
      delete deactivateOperationRequest.type;
      const anchorFile = {
        map_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          create: [createOperationRequest],
          deactivate: [deactivateOperationRequest]
        }
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMultipleOperationsForTheSameDid));
    });
  });

  describe('createModel()', async () => {
    it('should created an anchor file model correctly.', async () => {
      const mapFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';

      // Create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      // Recover operation.
      const [, anyRecoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation(
        { didUniqueSuffix: 'anyDid1', recoveryRevealValue: 'anyValue', recoveryPrivateKey: anyRecoveryPrivateKey });
      const recoverOperation = recoverOperationData.recoverOperation;

      // Deactivate operation.
      const deactivateOperationData = await OperationGenerator.createDeactivateOperation('anyDid2', 'anyValue', anyRecoveryPrivateKey);
      const deactivateOperation = deactivateOperationData.deactivateOperation;

      const anchoreFileModel = await AnchorFile.createModel(undefined, mapFileUri, [createOperation], [recoverOperation], [deactivateOperation]);

      expect(anchoreFileModel.map_file_uri).toEqual(mapFileUri);
      expect(anchoreFileModel.operations.create![0].suffix_data).toEqual(createOperation.encodedSuffixData);

      // Verify recover operation.
      const recoveryOperationInAnchorFile = anchoreFileModel.operations.recover![0];
      expect(recoveryOperationInAnchorFile.did_suffix).toEqual(recoverOperation.didUniqueSuffix);
      expect(recoveryOperationInAnchorFile.recovery_reveal_value).toEqual(recoverOperation.recoveryRevealValue);
      expect(recoveryOperationInAnchorFile.signed_data).toEqual(recoverOperation.signedDataJws.toCompactJws());

      // Verify deactivate operation.
      const deactivateOperationInAnchorFile = anchoreFileModel.operations.deactivate![0];
      expect(deactivateOperationInAnchorFile.did_suffix).toEqual(deactivateOperation.didUniqueSuffix);
      expect(deactivateOperationInAnchorFile.recovery_reveal_value).toEqual(deactivateOperation.recoveryRevealValue);
      expect(deactivateOperationInAnchorFile.signed_data).toEqual(deactivateOperation.signedDataJws.toCompactJws());
    });
  });

  describe('createBuffer()', async () => {
    it('should created a compressed buffer correctly.', async () => {
      const mapFileHash = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const anchoreFileBuffer = await AnchorFile.createBuffer(undefined, mapFileHash, [createOperation], [], []);

      const anchorFile = await AnchorFile.parse(anchoreFileBuffer);

      expect(anchorFile.model.map_file_uri).toEqual(mapFileHash);
      expect(anchorFile.model.operations.create![0].suffix_data).toEqual(createOperation.encodedSuffixData);
    });
  });
});
