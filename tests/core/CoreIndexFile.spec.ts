import * as crypto from 'crypto';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import CoreIndexFile from '../../lib/core/versions/latest/CoreIndexFile';
import CoreIndexFileModel from '../../lib/core/versions/latest/models/CoreIndexFileModel';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import SidetreeError from '../../lib/common/SidetreeError';

describe('CoreIndexFile', async () => {
  describe('parse()', async () => {
    it('should parse an core index file model correctly.', async () => {
      const provisionalIndexFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileUri = 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

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

      const coreIndexFileBuffer = await CoreIndexFile.createBuffer(
        undefined, provisionalIndexFileUri, coreProofFileUri, [createOperation], [recoverOperation], [deactivateOperation]
      );

      const parsedCoreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      expect(parsedCoreIndexFile.createDidSuffixes.length).toEqual(1);
      expect(parsedCoreIndexFile.createDidSuffixes[0]).toEqual(createOperation.didUniqueSuffix);
      expect(parsedCoreIndexFile.recoverDidSuffixes.length).toEqual(1);
      expect(parsedCoreIndexFile.recoverDidSuffixes[0]).toEqual(recoverOperation.didUniqueSuffix);
      expect(parsedCoreIndexFile.deactivateDidSuffixes.length).toEqual(1);
      expect(parsedCoreIndexFile.deactivateDidSuffixes[0]).toEqual(deactivateOperation.didUniqueSuffix);
      expect(parsedCoreIndexFile.model.provisionalIndexFileUri).toEqual(provisionalIndexFileUri);
    });

    it('should throw error if core proof file is specified but there is no recover and no deactivate operation.', async () => {
      const provisionalIndexFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileUri = 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'; // Should not be allowed with no recovers and deactivates.

      // Create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const coreIndexFileBuffer =
        await CoreIndexFile.createBuffer(undefined, provisionalIndexFileUri, coreProofFileUri, [createOperation], [], []);

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileBuffer),
        ErrorCode.CoreIndexFileCoreProofFileUriNotAllowed
      );
    });

    it('should throw if buffer given is not valid JSON.', async () => {
      const coreIndexFileBuffer = Buffer.from('NotJsonString');
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileCompressed),
        ErrorCode.CoreIndexFileNotJson);
    });

    it('should throw if the buffer is not compressed', async () => {
      const coreIndexFile = {
        provisionalIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileBuffer),
        ErrorCode.CoreIndexFileDecompressionFailure);
    });

    it('should throw if has an unknown property.', async () => {
      const coreIndexFile = {
        unknownProperty: 'Unknown property',
        writerLockId: 'writer lock',
        provisionalIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {}
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileHasUnknownProperty));
    });

    it('should throw if `operations` property has an unknown property.', async () => {
      const coreIndexFile = {
        writerLockId: 'writer lock',
        provisionalIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          unexpectedProperty: 'any value'
        }
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileCompressed),
        ErrorCode.CoreIndexFileUnexpectedPropertyInOperations
      );
    });

    it('should throw if expected `provisionalIndexFileUri` is missing.', async () => {
      const coreIndexFile = {
        // provisionalIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what is missing.
        operations: {
          deactivate: [{
            didSuffix: OperationGenerator.generateRandomHash(),
            revealValue: OperationGenerator.generateRandomHash()
          }]
        }
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileCompressed),
        ErrorCode.CoreIndexFileProvisionalIndexFileUriMissing
      );
    });

    it('should allow a valid core index file with out any operation references.', async () => {
      const provisionalIndexFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreIndexFileModel = {
        provisionalIndexFileUri
        // operations: {}, // Intentionally missing operations.
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileCompressed);
      expect(coreIndexFile.didUniqueSuffixes.length).toEqual(0);
      expect(coreIndexFile.model.provisionalIndexFileUri!).toEqual(provisionalIndexFileUri);
    });

    it('should throw if any additional property.', async () => {
      const coreIndexFile = {
        invalidProperty: 'some property value',
        provisionalIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {}
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileHasUnknownProperty));
    });

    it('should throw if provisional index file hash is not string.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const coreIndexFileModel = await CoreIndexFile.createModel('writerLock', 'unusedMockFileHash', coreProofFileHash, [createOperation], [], []);

      (coreIndexFileModel as any).provisionalIndexFileUri = 1234; // Intentionally setting the provisionalIndexFileUri as an incorrect type.

      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileCompressed),
        ErrorCode.InputValidatorCasFileUriNotString,
        'provisional index file'
      );
    });

    it('should throw if provisional index file hash is exceeds max length.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      let coreProofFileHash = 'this will be too long';
      for (let i = 1; i < 101; i++) {
        coreProofFileHash += ' ';
      }
      const coreIndexFileModel = await CoreIndexFile.createModel('writerLock', 'unusedMockFileHash', coreProofFileHash, [createOperation], [], []);
      (coreIndexFileModel as any).provisionalIndexFileUri = coreProofFileHash; // Intentionally setting the provisionalIndexFileUri too long.

      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileCompressed),
        ErrorCode.InputValidatorCasFileUriExceedsMaxLength,
        'provisional index file'
      );
    });

    it('should throw if provisional index file hash is invalid.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const coreIndexFileModel = await CoreIndexFile.createModel('writerLock', 'invalidProvisionalIndexFileHash', coreProofFileHash, [createOperation], [], []);

      try {
        const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
        const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

        await CoreIndexFile.parse(coreIndexFileCompressed);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.InputValidatorCasFileUriUnsupported);
      }
    });

    it('should throw if writer lock id is not string.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const coreIndexFileModel = await CoreIndexFile.createModel('unusedWriterLockId', 'unusedMockFileHash', coreProofFileHash, [createOperation], [], []);

      (coreIndexFileModel as any).writerLockId = {}; // intentionally set to invalid value

      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileWriterLockIdPropertyNotString));
    });

    it('should throw if writer lock ID exceeded max size.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const coreIndexFileModel =
        await CoreIndexFile.createModel('unusedWriterLockId', 'unusedMockFileHash', coreProofFileHash, [createOperation], [], []);

      (coreIndexFileModel as any).writerLockId = crypto.randomBytes(2000).toString('hex'); // Intentionally larger than maximum.

      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileCompressed),
        ErrorCode.CoreIndexFileWriterLockIdExceededMaxSize);
    });

    it('should throw if `create` property is not an array.', async () => {
      const coreIndexFile = {
        provisionalIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          create: 'IncorrectType'
        }
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileCreatePropertyNotArray));
    });

    it('should throw if `recover` property is not an array.', async () => {
      const coreIndexFile = {
        provisionalIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          recover: 'IncorrectType'
        }
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileRecoverPropertyNotArray));
    });

    it('should throw if `deactivate` property is not an array.', async () => {
      const coreIndexFile = {
        provisionalIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          deactivate: 'IncorrectType'
        }
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileDeactivatePropertyNotArray));
    });

    it('should throw if there are multiple operations for the same DID.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperationRequest = createOperationData.operationRequest;

      // Strip away properties not allowed in the createOperations array elements.
      delete createOperationRequest.type;
      delete createOperationRequest.delta;

      const coreIndexFile: CoreIndexFileModel = {
        provisionalIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          create: [createOperationRequest],
          deactivate: [{
            didSuffix: createOperationData.createOperation.didUniqueSuffix, // Intentionally using the same DID unique suffix.
            revealValue: 'unused'
          }]
        }
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileMultipleOperationsForTheSameDid));
    });
  });

  describe('createModel()', async () => {
    it('should created an core index file model correctly.', async () => {
      const provisionalIndexFileHash = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileHash = 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

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

      const coreIndexFileModel = await CoreIndexFile.createModel(
        undefined, provisionalIndexFileHash, coreProofFileHash, [createOperation], [recoverOperation], [deactivateOperation]
      );

      expect(coreIndexFileModel.provisionalIndexFileUri).toEqual(provisionalIndexFileHash);
      expect(coreIndexFileModel.operations!.create![0].suffixData).toEqual({
        deltaHash: createOperation.suffixData.deltaHash, recoveryCommitment: createOperation.suffixData.recoveryCommitment, type: undefined
      });

      // Verify recover operation.
      const recoveryOperationInCoreIndexFile = coreIndexFileModel.operations!.recover![0];
      const recoveryRevealValue = Multihash.canonicalizeThenHashThenEncode(recoverOperation.signedData.recoveryKey);
      expect(recoveryOperationInCoreIndexFile.didSuffix).toEqual(recoverOperation.didUniqueSuffix);
      expect(recoveryOperationInCoreIndexFile.revealValue).toEqual(recoveryRevealValue);

      // Verify deactivate operation.
      const deactivateOperationInCoreIndexFile = coreIndexFileModel.operations!.deactivate![0];
      const deactivateRevealValue = Multihash.canonicalizeThenHashThenEncode(deactivateOperation.signedData.recoveryKey);
      expect(deactivateOperationInCoreIndexFile.didSuffix).toEqual(deactivateOperation.didUniqueSuffix);
      expect(deactivateOperationInCoreIndexFile.revealValue).toEqual(deactivateRevealValue);
    });

    it('should not create `operations` property if there is no create, recover, and deactivates.', async () => {
      const writerLockId = undefined;
      const provisionalIndexFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const coreIndexFileModel = await CoreIndexFile.createModel(writerLockId, provisionalIndexFileHash, coreProofFileHash, [], [], []);

      expect(coreIndexFileModel.operations).toBeUndefined();
    });
  });

  describe('createBuffer()', async () => {
    it('should created a compressed buffer correctly.', async () => {
      const provisionalIndexFileHash = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileHash = undefined;
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const coreIndexFileBuffer = await CoreIndexFile.createBuffer(undefined, provisionalIndexFileHash, coreProofFileHash, [createOperation], [], []);

      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      expect(coreIndexFile.model.provisionalIndexFileUri).toEqual(provisionalIndexFileHash);
      expect(coreIndexFile.model.operations!.create![0].suffixData).toEqual({
        deltaHash: createOperation.suffixData.deltaHash, recoveryCommitment: createOperation.suffixData.recoveryCommitment
      });
    });
  });
});
