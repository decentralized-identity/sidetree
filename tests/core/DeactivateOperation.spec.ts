import DeactivateOperation from '../../lib/core/versions/latest/DeactivateOperation';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import SidetreeError from '../../lib/common/SidetreeError';

describe('DeactivateOperation', async () => {
  describe('parse()', async () => {
    it('should parse as expected', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey
      );

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      const result = await DeactivateOperation.parse(operationBuffer);
      expect(result).toBeDefined();
      done();
    });

    it('should throw if operation contains unknown property', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey
      );

      (deactivateOperationRequest as any).unknownProperty = 'unknown property value'; // Intentionally creating an unknown property.

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      await expectAsync(DeactivateOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationMissingOrUnknownProperty));
      done();
    });

    it('should throw if operation type is incorrect.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey
      );

      deactivateOperationRequest.type = OperationType.Create; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      await expectAsync(DeactivateOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationTypeIncorrect));
      done();
    });

    it('should throw if didUniqueSuffix is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey
      );

      (deactivateOperationRequest.didSuffix as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      await expectAsync(DeactivateOperation
        .parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationMissingOrInvalidDidUniqueSuffix));
      done();
    });
  });

  describe('parseSignedDataPayload()', async () => {
    it('should throw if signedData contains an additional unknown property.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedData = {
        didSuffix: didUniqueSuffix,
        revealValue: recoveryRevealValue,
        extraProperty: 'An unknown extra property'
      };
      const signedDataEncodedString = Encoder.encode(JSON.stringify(signedData));
      await expectAsync(DeactivateOperation.parseSignedDataPayload(signedDataEncodedString, didUniqueSuffix))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if signedData is missing expected properties.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const signedData = {};
      const signedDataEncodedString = Encoder.encode(JSON.stringify(signedData));
      await expectAsync(DeactivateOperation.parseSignedDataPayload(signedDataEncodedString, didUniqueSuffix))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if signed `didUniqueSuffix` is mismatching.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedData = {
        didSuffix: didUniqueSuffix,
        revealValue: recoveryRevealValue
      };
      const encodedSignedData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync(DeactivateOperation.parseSignedDataPayload(encodedSignedData, 'mismatchingDidUniqueSuffix'))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDidUniqueSuffixMismatch));
      done();
    });
  });
});
