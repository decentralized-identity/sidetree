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
        'unused-recovery-reveal-value',
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
        'unused-recovery-reveal-value',
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
        'unused-recovery-reveal-value',
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
        'unused-recovery-reveal-value',
        recoveryPrivateKey
      );

      (deactivateOperationRequest.did_suffix as any) = 123; // Intentionally incorrect type.

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
        did_suffix: didUniqueSuffix,
        recovery_reveal_value: recoveryRevealValue,
        extraProperty: 'An unknown extra property'
      };
      const encodedDelta = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((DeactivateOperation as any).parseSignedDataPayload(encodedDelta, didUniqueSuffix))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if signedData is missing expected properties.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const signedData = {};
      const encodedDelta = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((DeactivateOperation as any).parseSignedDataPayload(encodedDelta, didUniqueSuffix))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if recoveryRevealValue is too long.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      // tslint:disable-next-line
      const recoveryRevealValue = 'super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal';
      const signedData = {
        did_suffix: didUniqueSuffix,
        recovery_reveal_value: recoveryRevealValue
      };
      const encodedDelta = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((DeactivateOperation as any).parseSignedDataPayload(encodedDelta, didUniqueSuffix))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationRecoveryRevealValueTooLong));
      done();
    });

    it('should throw if recoveryRevealValue is not a string.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = ['this is an array not a string'];
      const signedData = {
        did_suffix: didUniqueSuffix,
        recovery_reveal_value: recoveryRevealValue
      };
      const encodedDelta = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((DeactivateOperation as any).parseSignedDataPayload(encodedDelta, didUniqueSuffix, recoveryRevealValue))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationRecoveryRevealValueMissingOrInvalidType));
      done();
    });

    it('should throw if signed `didUniqueSuffix` is mismatching.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedData = {
        did_suffix: didUniqueSuffix,
        recovery_reveal_value: recoveryRevealValue
      };
      const encodedSignedData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((DeactivateOperation as any).parseSignedDataPayload(encodedSignedData, 'mismatchingDidUniqueSuffix', recoveryRevealValue))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDidUniqueSuffixMismatch));
      done();
    });
  });
});
