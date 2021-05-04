import Compressor from '../../lib/core/versions/latest/util/Compressor';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import OperationGenerator from '../generators/OperationGenerator';
import ProvisionalProofFile from '../../lib/core/versions/latest/ProvisionalProofFile';

describe('ProvisionalProofFile', async () => {
  describe('parse()', async () => {
    it('should parse a valid provisional proof file successfully.', async () => {
      const [anyPublicKey, anyPrivateKey] = await Jwk.generateEs256kKeyPair(); // Used in multiple signed data for testing purposes.

      const updateOperationData1 = await OperationGenerator.generateUpdateOperation('EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWg', anyPublicKey, anyPrivateKey);
      const updateOperationData2 = await OperationGenerator.generateUpdateOperation('EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWg', anyPublicKey, anyPrivateKey);

      const updateOperation1 = updateOperationData1.updateOperation;
      const updateOperation2 = updateOperationData2.updateOperation;

      const provisionalProofFileBuffer = await ProvisionalProofFile.createBuffer([updateOperation1, updateOperation2]);

      const parsedProvisionalFile = await ProvisionalProofFile.parse(provisionalProofFileBuffer!);

      expect(parsedProvisionalFile.updateProofs.length).toEqual(2);
      expect(parsedProvisionalFile.updateProofs[0].signedDataModel).toEqual(updateOperation1.signedData);
      expect(parsedProvisionalFile.updateProofs[1].signedDataModel).toEqual(updateOperation2.signedData);
    });

    it('should throw if buffer given is not valid JSON.', async () => {
      const fileBuffer = Buffer.from('NotJsonString');
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ProvisionalProofFile.parse(fileCompressed),
        ErrorCode.ProvisionalProofFileNotJson
      );
    });

    it('should throw if the buffer is not compressed', async () => {
      const provisionalProofFileModel = { anything: 'anything' };
      const fileBuffer = Buffer.from(JSON.stringify(provisionalProofFileModel));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ProvisionalProofFile.parse(fileBuffer),
        ErrorCode.ProvisionalProofFileDecompressionFailure
      );
    });

    it('should throw if `operations` property does not exist.', async () => {
      const fileBuffer = Buffer.from(JSON.stringify({ }));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ProvisionalProofFile.parse(fileCompressed),
        ErrorCode.ProvisionalProofFileOperationsNotFound
      );
    });

    it('should throw if `operations` has an unknown property.', async () => {
      const provisionalProofFileModel = {
        operations: {
          unknownProperty: 'unknownProperty'
        }
      };
      const fileBuffer = Buffer.from(JSON.stringify(provisionalProofFileModel));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ProvisionalProofFile.parse(fileCompressed),
        ErrorCode.InputValidatorInputContainsNowAllowedProperty,
        'provisional proof file'
      );
    });

    it('should throw if `operations.update` is not an array.', async () => {
      const provisionalProofFileModel = {
        operations: {
          update: 'not an array'
        }
      };
      const fileBuffer = Buffer.from(JSON.stringify(provisionalProofFileModel));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ProvisionalProofFile.parse(fileCompressed),
        ErrorCode.ProvisionalProofFileUpdatePropertyNotAnArray
      );
    });

    it('should throw if a proof object in `operations.update` array has a not-allowed property.', async () => {
      const provisionalProofFileModel = {
        operations: {
          update: [{ notAllowedProperty: 'not allowed' }]
        }
      };
      const fileBuffer = Buffer.from(JSON.stringify(provisionalProofFileModel));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ProvisionalProofFile.parse(fileCompressed),
        ErrorCode.InputValidatorInputContainsNowAllowedProperty
      );
    });

    it('should throw if there is no proof in the provisional proof file.', async () => {
      const provisionalProofFileModel = {
        operations: {
          update: []
        }
      };
      const fileBuffer = Buffer.from(JSON.stringify(provisionalProofFileModel));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => ProvisionalProofFile.parse(fileCompressed),
        ErrorCode.ProvisionalProofFileHasNoProofs
      );
    });
  });
});
