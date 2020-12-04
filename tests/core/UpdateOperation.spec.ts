import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import SidetreeError from '../../lib/common/SidetreeError';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';

describe('UpdateOperation', async () => {
  describe('parse()', async () => {
    it('parse as expected', async () => {
      const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair('key');
      const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
        'unused-DID-unique-suffix',
        signingPublicKey.publicKeyJwk,
        signingPrivateKey,
        OperationGenerator.generateRandomHash(),
        []
      );

      const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
      const result = await UpdateOperation.parse(operationBuffer);
      expect(result).toBeDefined();
    });

    it('should throw if didUniqueSuffix is not string.', async () => {
      const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair('key');
      const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
        'unused-DID-unique-suffix',
        signingPublicKey.publicKeyJwk,
        signingPrivateKey,
        'unusedNextUpdateCommitmentHash',
        'opaque-unused-document-patch'
      );

      (updateOperationRequest.didSuffix as any) = 123;

      const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
      await expectAsync(UpdateOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationMissingDidUniqueSuffix));
    });

    it('should throw if operation type is incorrect', async () => {
      const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair('key');
      const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
        'unused-DID-unique-suffix',
        signingPublicKey.publicKeyJwk,
        signingPrivateKey,
        'unusedNextUpdateCommitmentHash',
        'opaque-unused-document-patch'
      );

      updateOperationRequest.type = OperationType.Deactivate;

      const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
      await expectAsync(UpdateOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationTypeIncorrect));
    });
  });

  describe('parseObject()', async () => {
    it('should throw if operation contains an additional unknown property.', async () => {
      const updateOperation = {
        didSuffix: 'unusedSuffix',
        signedData: 'unusedSignedData',
        extraProperty: 'thisPropertyShouldCauseErrorToBeThrown'
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => UpdateOperation.parseObject(updateOperation, Buffer.from('anyValue')),
        ErrorCode.InputValidatorInputContainsNowAllowedProperty,
        'update request'
      );
    });
  });

  describe('parseSignedDataPayload()', async () => {
    it('should throw if signedData is missing expected properties.', async (done) => {
      const signedData = {};
      const encodedSignedData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((UpdateOperation as any).parseSignedDataPayload(encodedSignedData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationSignedDataHasMissingOrUnknownProperty));
      done();
    });

    it('should throw if signedData contains an additional unknown property.', async (done) => {
      const signedData = {
        deltaHash: 'anyUnusedHash',
        extraProperty: 'An unknown extra property',
        updateKey: {}
      };
      const encodedSignedData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((UpdateOperation as any).parseSignedDataPayload(encodedSignedData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationSignedDataHasMissingOrUnknownProperty));
      done();
    });
  });
});
