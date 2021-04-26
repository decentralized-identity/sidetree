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
      const provisionalIndexFileUri = 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i';
      const coreProofFileUri = 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34baaaaaaaa';

      // Create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      // Recover operation.
      const didSuffixForRecoverOperation = OperationGenerator.generateRandomHash();
      const [, anyRecoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation(
        { didUniqueSuffix: didSuffixForRecoverOperation, recoveryPrivateKey: anyRecoveryPrivateKey });
      const recoverOperation = recoverOperationData.recoverOperation;

      // Deactivate operation.
      const didOfDeactivateRequest = OperationGenerator.generateRandomHash();
      const deactivateOperationData = await OperationGenerator.createDeactivateOperation(didOfDeactivateRequest, anyRecoveryPrivateKey);
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
      const provisionalIndexFileUri = 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i';
      const coreProofFileUri = 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34baaaaaaaa'; // Should not be allowed with no recovers and deactivates.

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
        provisionalIndexFileUri: 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i',
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
        provisionalIndexFileUri: 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i',
        operations: {}
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileHasUnknownProperty));
    });

    it('should throw if `operations` property has an unknown property.', async () => {
      const coreIndexFile = {
        writerLockId: 'writer lock',
        provisionalIndexFileUri: 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i',
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

    it('should allow `provisionalIndexFileUri` to be missing if there are only deactivates.', async () => {
      const coreIndexFile: CoreIndexFileModel = {
        // provisionalIndexFileUri: 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i', // Intentionally kept to show what is missing.
        coreProofFileUri: 'unused',
        operations: {
          deactivate: [{
            didSuffix: OperationGenerator.generateRandomHash(),
            revealValue: OperationGenerator.generateRandomHash()
          }]
        }
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      const coreIndexFileParsed = await CoreIndexFile.parse(coreIndexFileCompressed);
      expect(coreIndexFileParsed.model.provisionalIndexFileUri).toBeUndefined();
      expect(coreIndexFileParsed.didUniqueSuffixes.length).toEqual(1);
    });

    it('should throw if `provisionalIndexFileUri` is missing but there is a create/recover operation.', async () => {
      const coreIndexFile: CoreIndexFileModel = {
        // provisionalIndexFileUri: 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i', // Intentionally kept to show what is missing.
        coreProofFileUri: 'unused',
        operations: {
          recover: [{
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
      const provisionalIndexFileUri = 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i';
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
        provisionalIndexFileUri: 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i',
        operations: {}
      };
      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFile));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileHasUnknownProperty));
    });

    it('should throw if provisional index file hash is not string.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileUri = undefined;
      const coreIndexFileModel = await CoreIndexFile.createModel('writerLock', 'unusedMockFileUri', coreProofFileUri, [createOperation], [], []);

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
      let coreProofFileUri = 'this will be too long';
      for (let i = 1; i < 101; i++) {
        coreProofFileUri += ' ';
      }
      const coreIndexFileModel = await CoreIndexFile.createModel('writerLock', 'unusedMockFileHash', coreProofFileUri, [createOperation], [], []);
      (coreIndexFileModel as any).provisionalIndexFileUri = coreProofFileUri; // Intentionally setting the provisionalIndexFileUri too long.

      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileCompressed),
        ErrorCode.InputValidatorCasFileUriExceedsMaxLength,
        'provisional index file'
      );
    });

    it('should throw if writer lock id is not string.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileUri = undefined;
      const coreIndexFileModel = await CoreIndexFile.createModel('unusedWriterLockId', 'unusedMockFileUri', coreProofFileUri, [createOperation], [], []);

      (coreIndexFileModel as any).writerLockId = {}; // intentionally set to invalid value

      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await expectAsync(CoreIndexFile.parse(coreIndexFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.CoreIndexFileWriterLockIdPropertyNotString));
    });

    it('should throw if writer lock ID exceeded max size.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const coreProofFileUri = undefined;
      const coreIndexFileModel =
        await CoreIndexFile.createModel('unusedWriterLockId', 'unusedMockFileUri', coreProofFileUri, [createOperation], [], []);

      (coreIndexFileModel as any).writerLockId = crypto.randomBytes(2000).toString('hex'); // Intentionally larger than maximum.

      const coreIndexFileBuffer = Buffer.from(JSON.stringify(coreIndexFileModel));
      const coreIndexFileCompressed = await Compressor.compress(coreIndexFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreIndexFile.parse(coreIndexFileCompressed),
        ErrorCode.CoreIndexFileWriterLockIdExceededMaxSize);
    });

    it('should throw if `create` property is not an array.', async () => {
      const coreIndexFile = {
        provisionalIndexFileUri: 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i',
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
        provisionalIndexFileUri: 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i',
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
        provisionalIndexFileUri: 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i',
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
        provisionalIndexFileUri: 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i',
        operations: {
          create: [createOperationRequest],
          deactivate: [{
            didSuffix: createOperationData.createOperation.didUniqueSuffix, // Intentionally using the same DID unique suffix.
            revealValue: OperationGenerator.generateRandomHash()
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
    it('should create a core index file model correctly.', async () => {
      const provisionalIndexFileUri = 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i';
      const coreProofFileUri = 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557aaaa';

      // Create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      // Recover operation.
      const [, anyRecoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation(
        { didUniqueSuffix: 'EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWg', recoveryPrivateKey: anyRecoveryPrivateKey });
      const recoverOperation = recoverOperationData.recoverOperation;

      // Deactivate operation.
      const deactivateOperationData = await OperationGenerator.createDeactivateOperation('EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWf', anyRecoveryPrivateKey);
      const deactivateOperation = deactivateOperationData.deactivateOperation;

      const coreIndexFileModel = await CoreIndexFile.createModel(
        undefined, provisionalIndexFileUri, coreProofFileUri, [createOperation], [recoverOperation], [deactivateOperation]
      );

      expect(coreIndexFileModel.provisionalIndexFileUri).toEqual(provisionalIndexFileUri);
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
      const provisionalIndexFileUri = OperationGenerator.generateRandomHash();
      const coreProofFileUri = undefined;
      const coreIndexFileModel = await CoreIndexFile.createModel(writerLockId, provisionalIndexFileUri, coreProofFileUri, [], [], []);

      expect(coreIndexFileModel.operations).toBeUndefined();
    });
  });

  describe('createBuffer()', async () => {
    it('should created a compressed buffer correctly.', async () => {
      const provisionalIndexFileUri = 'bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i';
      const coreProofFileUri = undefined;
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const coreIndexFileBuffer = await CoreIndexFile.createBuffer(undefined, provisionalIndexFileUri, coreProofFileUri, [createOperation], [], []);

      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      expect(coreIndexFile.model.provisionalIndexFileUri).toEqual(provisionalIndexFileUri);
      expect(coreIndexFile.model.operations!.create![0].suffixData).toEqual({
        deltaHash: createOperation.suffixData.deltaHash, recoveryCommitment: createOperation.suffixData.recoveryCommitment
      });
    });
  });
});
