import * as crypto from 'crypto';
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
      const coreProofFileUri = 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
      const provisionalProofFileUri = undefined;

      // Create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      // Recover operation.
      const [, anyRecoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation(
        { didUniqueSuffix: 'anyDid1', recoveryPrivateKey: anyRecoveryPrivateKey });
      const recoverOperation = recoverOperationData.recoverOperation;

      // Deactivate operation.
      const deactivateOperationData = await OperationGenerator.createDeactivateOperation('anyDid2', anyRecoveryPrivateKey);
      const deactivateOperation = deactivateOperationData.deactivateOperation;

      const anchorFileBuffer = await AnchorFile.createBuffer(
        undefined, mapFileUri, coreProofFileUri, provisionalProofFileUri, [createOperation], [recoverOperation], [deactivateOperation]
      );

      const parsedAnchorFile = await AnchorFile.parse(anchorFileBuffer);

      expect(parsedAnchorFile.createOperations.length).toEqual(1);
      expect(parsedAnchorFile.createOperations[0].encodedSuffixData).toEqual(createOperation.encodedSuffixData);
      expect(parsedAnchorFile.recoverOperations.length).toEqual(1);
      expect(parsedAnchorFile.recoverOperations[0].signedDataJws.toCompactJws()).toEqual(recoverOperation.signedDataJws.toCompactJws());
      expect(parsedAnchorFile.deactivateOperations.length).toEqual(1);
      expect(parsedAnchorFile.deactivateOperations[0].signedDataJws.toCompactJws()).toEqual(deactivateOperation.signedDataJws.toCompactJws());
      expect(parsedAnchorFile.model.mapFileUri).toEqual(mapFileUri);
    });

    it('should parse an anchor file model correctly.', async () => {
      const mapFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileUri = 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'; // Should not be allowed with no recovers and deactivates.
      const provisionalProofFileUri = undefined;

      // Create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const anchorFileBuffer =
        await AnchorFile.createBuffer(undefined, mapFileUri, coreProofFileUri, provisionalProofFileUri, [createOperation], [], []);

      // const parsedAnchorFile = await AnchorFile.parse(anchorFileBuffer);

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => AnchorFile.parse(anchorFileBuffer),
        ErrorCode.AnchorFileCoreProofFileUriNotAllowed
      );
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
        mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
        writerLockId: 'writer lock',
        mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {}
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty));
    });

    it('should throw if `operations` property has an unknown property.', async () => {
      const anchorFile = {
        writerLockId: 'writer lock',
        mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
        // mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what is missing.
        operations: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMapFileUriMissing));
    });

    it('should throw if missing operations property.', async () => {
      const anchorFile = {
        mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
        // operations: {}, // Intentionally missing operations.
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMissingOperationsProperty));
    });

    it('should throw if any additional property.', async () => {
      const anchorFile = {
        invalidProperty: 'some property value',
        mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {}
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty));
    });

    it('should throw if map file hash is not string.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const provisionalProofFileHash = undefined;
      const anchorFileModel = await AnchorFile.createModel('writerLock', 'unusedMockFileHash', coreProofFileHash, provisionalProofFileHash, [createOperation], [], []);

      (anchorFileModel as any).mapFileUri = 1234; // Intentionally setting the mapFileUri as an incorrect type.

      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileCasFileUriNotString));
    });

    it('should throw if map file hash is invalid.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const provisionalProofFileHash = undefined;
      const anchorFileModel = await AnchorFile.createModel('writerLock', 'invalidMapFileHash', coreProofFileHash, provisionalProofFileHash, [createOperation], [], []);

      try {
        const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
        const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

        await AnchorFile.parse(anchorFileCompressed);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.AnchorFileCasFileUriUnsupported);
      }
    });

    it('should throw if writer lock id is not string.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const provisionalProofFileHash = undefined;
      const anchorFileModel = await AnchorFile.createModel('unusedWriterLockId', 'unusedMockFileHash', coreProofFileHash, provisionalProofFileHash, [createOperation], [], []);

      (anchorFileModel as any).writerLockId = {}; // intentionally set to invalid value

      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileWriterLockIdPropertyNotString));
    });

    it('should throw if writer lock ID exceeded max size.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const provisionalProofFileHash = undefined;
      const anchorFileModel =
        await AnchorFile.createModel('unusedWriterLockId', 'unusedMockFileHash', coreProofFileHash, provisionalProofFileHash, [createOperation], [], []);

      (anchorFileModel as any).writerLockId = crypto.randomBytes(2000).toString('hex'); // Intentionally larger than maximum.

      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => AnchorFile.parse(anchorFileCompressed),
        ErrorCode.AnchorFileWriterLockIdExceededMaxSize);
    });

    it('should throw if `create` property is not an array.', async () => {
      const anchorFile = {
        mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
        mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
        mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
        createOperationData.recoveryPrivateKey
      );

      // Strip away properties not allowed in the deactivateOperations array elements.
      delete deactivateOperationRequest.type;
      const anchorFile = {
        mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
      const mapFileHash = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileHash = 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
      const provisionalProofFileHash = undefined;

      // Create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      // Recover operation.
      const [, anyRecoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation(
        { didUniqueSuffix: 'anyDid1', recoveryPrivateKey: anyRecoveryPrivateKey });
      const recoverOperation = recoverOperationData.recoverOperation;

      // Deactivate operation.
      const deactivateOperationData = await OperationGenerator.createDeactivateOperation('anyDid2', anyRecoveryPrivateKey);
      const deactivateOperation = deactivateOperationData.deactivateOperation;

      const anchorFileModel = await AnchorFile.createModel(
        undefined, mapFileHash, coreProofFileHash, provisionalProofFileHash, [createOperation], [recoverOperation], [deactivateOperation]
      );

      expect(anchorFileModel.mapFileUri).toEqual(mapFileHash);
      expect(anchorFileModel.operations.create![0].suffixData).toEqual({
        deltaHash: createOperation.suffixData.deltaHash, recoveryCommitment: createOperation.suffixData.recoveryCommitment, type: undefined
      });

      // Verify recover operation.
      const recoveryOperationInAnchorFile = anchorFileModel.operations.recover![0];
      expect(recoveryOperationInAnchorFile.didSuffix).toEqual(recoverOperation.didUniqueSuffix);
      expect(recoveryOperationInAnchorFile.signedData).toEqual(recoverOperation.signedDataJws.toCompactJws());

      // Verify deactivate operation.
      const deactivateOperationInAnchorFile = anchorFileModel.operations.deactivate![0];
      expect(deactivateOperationInAnchorFile.didSuffix).toEqual(deactivateOperation.didUniqueSuffix);
      expect(deactivateOperationInAnchorFile.signedData).toEqual(deactivateOperation.signedDataJws.toCompactJws());
    });
  });

  describe('createBuffer()', async () => {
    it('should created a compressed buffer correctly.', async () => {
      const mapFileHash = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileHash = undefined;
      const provisionalProofFileHash = undefined;
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const anchorFileBuffer = await AnchorFile.createBuffer(undefined, mapFileHash, coreProofFileHash, provisionalProofFileHash, [createOperation], [], []);

      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      expect(anchorFile.model.mapFileUri).toEqual(mapFileHash);
      expect(anchorFile.model.operations.create![0].suffixData).toEqual({
        deltaHash: createOperation.suffixData.deltaHash, recoveryCommitment: createOperation.suffixData.recoveryCommitment
      });
    });
  });
});
