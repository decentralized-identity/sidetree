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
      const coreIndexFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
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
        undefined, coreIndexFileUri, coreProofFileUri, [createOperation], [recoverOperation], [deactivateOperation]
      );

      const parsedCoreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      expect(parsedCoreIndexFile.createDidSuffixes.length).toEqual(1);
      expect(parsedCoreIndexFile.createDidSuffixes[0]).toEqual(createOperation.didUniqueSuffix);
      expect(parsedCoreIndexFile.recoverDidSuffixes.length).toEqual(1);
      expect(parsedCoreIndexFile.recoverDidSuffixes[0]).toEqual(recoverOperation.didUniqueSuffix);
      expect(parsedCoreIndexFile.deactivateDidSuffixes.length).toEqual(1);
      expect(parsedCoreIndexFile.deactivateDidSuffixes[0]).toEqual(deactivateOperation.didUniqueSuffix);
      expect(parsedCoreIndexFile.model.coreIndexFileUri).toEqual(coreIndexFileUri);
    });

    it('should throw error if core proof file is specified but there is no recover and no deactivate operation.', async () => {
      const coreIndexFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileUri = 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'; // Should not be allowed with no recovers and deactivates.

      // Create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const coreIndexFileBuffer =
        await CoreIndexFile.createBuffer(undefined, coreIndexFileUri, coreProofFileUri, [createOperation], [], []);

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
        coreIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
        coreIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {}
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileHasUnknownProperty));
    });

    it('should throw if `operations` property has an unknown property.', async () => {
      const coreIndexFile = {
        writerLockId: 'writer lock',
        coreIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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

    it('should throw if expected `coreIndexFileUri` is missing.', async () => {
      const coreIndexFile = {
        // coreIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what is missing.
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
        ErrorCode.CoreIndexFilecoreIndexFileUriMissing
      );
    });

    it('should allow a valid core index file with out any operation references.', async () => {
      const coreIndexFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreIndexFileModel = {
        coreIndexFileUri
        // operations: {}, // Intentionally missing operations.
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileCompressed);
      expect(coreIndexFile.didUniqueSuffixes.length).toEqual(0);
      expect(coreIndexFile.model.coreIndexFileUri!).toEqual(coreIndexFileUri);
    });

    it('should throw if any additional property.', async () => {
      const coreIndexFile = {
        invalidProperty: 'some property value',
        coreIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {}
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileHasUnknownProperty));
    });

    it('should throw if core index file hash is not string.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const coreIndexFileModel = await CoreIndexFile.createModel('writerLock', 'unusedMockFileHash', coreProofFileHash, [createOperation], [], []);

      (coreIndexFileModel as any).coreIndexFileUri = 1234; // Intentionally setting the coreIndexFileUri as an incorrect type.

      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileCompressed),
        ErrorCode.InputValidatorCasFileUriNotString,
        'core index file'
      );
    });

    it('should throw if core index file hash is exceeds max length.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      let coreProofFileHash = 'this will be too long';
      for (let i = 1; i < 101; i++) {
        coreProofFileHash += ' ';
      }
      const coreIndexFileModel = await CoreIndexFile.createModel('writerLock', 'unusedMockFileHash', coreProofFileHash, [createOperation], [], []);
      (coreIndexFileModel as any).coreIndexFileUri = coreProofFileHash; // Intentionally setting the coreIndexFileUri too long.

      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileCompressed),
        ErrorCode.InputValidatorCasFileUriExceedsMaxLength,
        'core index file'
      );
    });

    it('should throw if core index file hash is invalid.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const coreIndexFileModel = await CoreIndexFile.createModel('writerLock', 'invalidcoreIndexFileHash', coreProofFileHash, [createOperation], [], []);

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
        coreIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
        coreIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
        coreIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
        coreIndexFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
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
      const coreIndexFileHash = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
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
        undefined, coreIndexFileHash, coreProofFileHash, [createOperation], [recoverOperation], [deactivateOperation]
      );

      expect(coreIndexFileModel.coreIndexFileUri).toEqual(coreIndexFileHash);
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
      const coreIndexFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const coreIndexFileModel = await CoreIndexFile.createModel(writerLockId, coreIndexFileHash, coreProofFileHash, [], [], []);

      expect(coreIndexFileModel.operations).toBeUndefined();
    });
  });

  describe('createBuffer()', async () => {
    it('should created a compressed buffer correctly.', async () => {
      const coreIndexFileHash = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileHash = undefined;
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const coreIndexFileBuffer = await CoreIndexFile.createBuffer(undefined, coreIndexFileHash, coreProofFileHash, [createOperation], [], []);

      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      expect(coreIndexFile.model.coreIndexFileUri).toEqual(coreIndexFileHash);
      expect(coreIndexFile.model.operations!.create![0].suffixData).toEqual({
        deltaHash: createOperation.suffixData.deltaHash, recoveryCommitment: createOperation.suffixData.recoveryCommitment
      });
    });
  });
});
