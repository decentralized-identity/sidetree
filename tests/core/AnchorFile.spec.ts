import * as crypto from 'crypto';
import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import AnchorFileModel from '../../lib/core/versions/latest/models/AnchorFileModel';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import SidetreeError from '../../lib/common/SidetreeError';

describe('AnchorFile', async () => {
  describe('parse()', async () => {
    it('should parse an anchor file model correctly.', async () => {
      const mapFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
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

      const anchorFileBuffer = await AnchorFile.createBuffer(
        undefined, mapFileUri, coreProofFileUri, [createOperation], [recoverOperation], [deactivateOperation]
      );

      const parsedAnchorFile = await AnchorFile.parse(anchorFileBuffer);

      expect(parsedAnchorFile.createDidSuffixes.length).toEqual(1);
      expect(parsedAnchorFile.createDidSuffixes[0]).toEqual(createOperation.didUniqueSuffix);
      expect(parsedAnchorFile.recoverDidSuffixes.length).toEqual(1);
      expect(parsedAnchorFile.recoverDidSuffixes[0]).toEqual(recoverOperation.didUniqueSuffix);
      expect(parsedAnchorFile.deactivateDidSuffixes.length).toEqual(1);
      expect(parsedAnchorFile.deactivateDidSuffixes[0]).toEqual(deactivateOperation.didUniqueSuffix);
      expect(parsedAnchorFile.model.mapFileUri).toEqual(mapFileUri);
    });

    it('should throw error if core proof file is specified but there is no recover and no deactivate operation.', async () => {
      const mapFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileUri = 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'; // Should not be allowed with no recovers and deactivates.

      // Create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const anchorFileBuffer =
        await AnchorFile.createBuffer(undefined, mapFileUri, coreProofFileUri, [createOperation], [], []);

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

    it('should throw if expected `provisionalIndexFileUri` is missing.', async () => {
      const anchorFile = {
        // mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what is missing.
        operations: {
          deactivate: [{
            didSuffix: OperationGenerator.generateRandomHash(),
            revealValue: OperationGenerator.generateRandomHash()
          }]
        }
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => AnchorFile.parse(anchorFileCompressed),
        ErrorCode.AnchorFileProvisionalIndexFileUriMissing
      );
    });

    it('should allow a valid core index file with out any operation references.', async () => {
      const mapFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const anchorFileModel = {
        mapFileUri
        // operations: {}, // Intentionally missing operations.
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      const anchorFile = await AnchorFile.parse(anchorFileCompressed);
      expect(anchorFile.didUniqueSuffixes.length).toEqual(0);
      expect(anchorFile.model.mapFileUri!).toEqual(mapFileUri);
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
      const anchorFileModel = await AnchorFile.createModel('writerLock', 'unusedMockFileHash', coreProofFileHash, [createOperation], [], []);

      (anchorFileModel as any).mapFileUri = 1234; // Intentionally setting the mapFileUri as an incorrect type.

      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => AnchorFile.parse(anchorFileCompressed),
        ErrorCode.InputValidatorCasFileUriNotString,
        'provisional index file'
      );
    });

    it('should throw if map file hash is invalid.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const anchorFileModel = await AnchorFile.createModel('writerLock', 'invalidMapFileHash', coreProofFileHash, [createOperation], [], []);

      try {
        const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
        const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

        await AnchorFile.parse(anchorFileCompressed);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.InputValidatorCasFileUriUnsupported);
      }
    });

    it('should throw if writer lock id is not string.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const anchorFileModel = await AnchorFile.createModel('unusedWriterLockId', 'unusedMockFileHash', coreProofFileHash, [createOperation], [], []);

      (anchorFileModel as any).writerLockId = {}; // intentionally set to invalid value

      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFileModel));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parse(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileWriterLockIdPropertyNotString));
    });

    it('should throw if writer lock ID exceeded max size.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileHash = undefined;
      const anchorFileModel =
        await AnchorFile.createModel('unusedWriterLockId', 'unusedMockFileHash', coreProofFileHash, [createOperation], [], []);

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

      const anchorFile: AnchorFileModel = {
        mapFileUri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        operations: {
          create: [createOperationRequest],
          deactivate: [{
            didSuffix: createOperationData.createOperation.didUniqueSuffix, // Intentionally using the same DID unique suffix.
            revealValue: 'unused'
          }]
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
        undefined, mapFileHash, coreProofFileHash, [createOperation], [recoverOperation], [deactivateOperation]
      );

      expect(anchorFileModel.mapFileUri).toEqual(mapFileHash);
      expect(anchorFileModel.operations!.create![0].suffixData).toEqual({
        deltaHash: createOperation.suffixData.deltaHash, recoveryCommitment: createOperation.suffixData.recoveryCommitment, type: undefined
      });

      // Verify recover operation.
      const recoveryOperationInAnchorFile = anchorFileModel.operations!.recover![0];
      const recoveryRevealValue = Multihash.canonicalizeThenHashThenEncode(recoverOperation.signedData.recoveryKey);
      expect(recoveryOperationInAnchorFile.didSuffix).toEqual(recoverOperation.didUniqueSuffix);
      expect(recoveryOperationInAnchorFile.revealValue).toEqual(recoveryRevealValue);

      // Verify deactivate operation.
      const deactivateOperationInAnchorFile = anchorFileModel.operations!.deactivate![0];
      const deactivateRevealValue = Multihash.canonicalizeThenHashThenEncode(deactivateOperation.signedData.recoveryKey);
      expect(deactivateOperationInAnchorFile.didSuffix).toEqual(deactivateOperation.didUniqueSuffix);
      expect(deactivateOperationInAnchorFile.revealValue).toEqual(deactivateRevealValue);
    });

    it('should not create `operations` property if there is no create, recover, and deactivates.', async () => {
      const writerLockId = undefined;
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const anchorFileModel = await AnchorFile.createModel(writerLockId, mapFileHash, coreProofFileHash, [], [], []);

      expect(anchorFileModel.operations).toBeUndefined();
    });
  });

  describe('createBuffer()', async () => {
    it('should created a compressed buffer correctly.', async () => {
      const mapFileHash = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';
      const coreProofFileHash = undefined;
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const anchorFileBuffer = await AnchorFile.createBuffer(undefined, mapFileHash, coreProofFileHash, [createOperation], [], []);

      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      expect(anchorFile.model.mapFileUri).toEqual(mapFileHash);
      expect(anchorFile.model.operations!.create![0].suffixData).toEqual({
        deltaHash: createOperation.suffixData.deltaHash, recoveryCommitment: createOperation.suffixData.recoveryCommitment
      });
    });
  });
});
