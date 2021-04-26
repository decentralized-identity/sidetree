import Compressor from '../../lib/core/versions/latest/util/Compressor';
import CoreProofFile from '../../lib/core/versions/latest/CoreProofFile';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import OperationGenerator from '../generators/OperationGenerator';

describe('CoreProofFile', async () => {
  describe('parse()', async () => {
    it('should parse a valid core proof file successfully.', async () => {
      const [, anyPrivateKey] = await Jwk.generateEs256kKeyPair(); // Used in multiple signed data for testing purposes.

      const didOfDeactivate1 = OperationGenerator.generateRandomHash();
      const didOfDeactivate2 = OperationGenerator.generateRandomHash();

      const recoverOperationData = await OperationGenerator.generateRecoverOperation({ didUniqueSuffix: 'EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWg', recoveryPrivateKey: anyPrivateKey });
      const deactivateOperationData1 = await OperationGenerator.createDeactivateOperation(didOfDeactivate1, anyPrivateKey);
      const deactivateOperationData2 = await OperationGenerator.createDeactivateOperation(didOfDeactivate2, anyPrivateKey);

      const recoverOperation = recoverOperationData.recoverOperation;
      const deactivateOperation1 = deactivateOperationData1.deactivateOperation;
      const deactivateOperation2 = deactivateOperationData2.deactivateOperation;

      const coreProofFileBuffer = await CoreProofFile.createBuffer([recoverOperation], [deactivateOperation1, deactivateOperation2]);

      const parsedCoreFile = await CoreProofFile.parse(coreProofFileBuffer!, [didOfDeactivate1, didOfDeactivate2]);

      expect(parsedCoreFile.recoverProofs.length).toEqual(1);
      expect(parsedCoreFile.deactivateProofs.length).toEqual(2);
      expect(parsedCoreFile.recoverProofs[0].signedDataModel).toEqual(recoverOperation.signedData);
      expect(parsedCoreFile.deactivateProofs[0].signedDataModel).toEqual(deactivateOperation1.signedData);
      expect(parsedCoreFile.deactivateProofs[1].signedDataModel).toEqual(deactivateOperation2.signedData);
    });

    it('should throw if buffer given is not valid JSON.', async () => {
      const fileBuffer = Buffer.from('NotJsonString');
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreProofFile.parse(fileCompressed, ['unused array']),
        ErrorCode.CoreProofFileNotJson
      );
    });

    it('should throw if the buffer is not compressed', async () => {
      const coreProofFileModel = { anything: 'anything' };
      const fileBuffer = Buffer.from(JSON.stringify(coreProofFileModel));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreProofFile.parse(fileBuffer, ['unused array']),
        ErrorCode.CoreProofFileDecompressionFailure
      );
    });

    it('should throw if `operations` property does not exist.', async () => {
      const fileBuffer = Buffer.from(JSON.stringify({ }));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreProofFile.parse(fileCompressed, ['unused array']),
        ErrorCode.CoreProofFileOperationsNotFound
      );
    });

    it('should throw if `operations` has an unknown property.', async () => {
      const coreProofFileModel = {
        operations: {
          unknownProperty: 'unknownProperty'
        }
      };
      const fileBuffer = Buffer.from(JSON.stringify(coreProofFileModel));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreProofFile.parse(fileCompressed, ['unused array']),
        ErrorCode.InputValidatorInputContainsNowAllowedProperty,
        'core proof file'
      );
    });

    it('should throw if `operations.recover` is not an array.', async () => {
      const coreProofFileModel = {
        operations: {
          recover: 'not an array'
        }
      };
      const fileBuffer = Buffer.from(JSON.stringify(coreProofFileModel));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreProofFile.parse(fileCompressed, ['unused array']),
        ErrorCode.CoreProofFileRecoverPropertyNotAnArray
      );
    });

    it('should throw if a proof object in `operations.recover` array has a not-allowed property.', async () => {
      const coreProofFileModel = {
        operations: {
          recover: [{ notAllowedProperty: 'not allowed' }]
        }
      };
      const fileBuffer = Buffer.from(JSON.stringify(coreProofFileModel));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreProofFile.parse(fileCompressed, ['unused array']),
        ErrorCode.InputValidatorInputContainsNowAllowedProperty
      );
    });

    it('should throw if `operations.deactivate` is not an array.', async () => {
      const coreProofFileModel = {
        operations: {
          deactivate: 'not an array'
        }
      };
      const fileBuffer = Buffer.from(JSON.stringify(coreProofFileModel));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreProofFile.parse(fileCompressed, ['unused array']),
        ErrorCode.CoreProofFileDeactivatePropertyNotAnArray
      );
    });

    it('should throw if a proof object in `operations.deactivate` array has a not-allowed property.', async () => {
      const coreProofFileModel = {
        operations: {
          deactivate: [{ notAllowedProperty: 'not allowed' }]
        }
      };
      const fileBuffer = Buffer.from(JSON.stringify(coreProofFileModel));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreProofFile.parse(fileCompressed, ['unused array']),
        ErrorCode.InputValidatorInputContainsNowAllowedProperty
      );
    });

    it('should throw if there is no proof in the core proof file.', async () => {
      const coreProofFileModel = {
        operations: {
          recover: []
        }
      };
      const fileBuffer = Buffer.from(JSON.stringify(coreProofFileModel));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => CoreProofFile.parse(fileCompressed, ['unused array']),
        ErrorCode.CoreProofFileHasNoProofs
      );
    });
  });
});
