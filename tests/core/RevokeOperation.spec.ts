import DeactivateOperation from '../../lib/core/versions/latest/DeactivateOperation';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import SidetreeError from '../../lib/common/SidetreeError';

describe('DeactivateOperation', async () => {
  describe('parse()', async () => {
    it('should throw if operation type is incorrect', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.generateDeactivateOperationRequest(
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

      const deactivateOperationRequest = await OperationGenerator.generateDeactivateOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-reveal-value',
        recoveryPrivateKey
      );

      (deactivateOperationRequest.didUniqueSuffix as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      await expectAsync(DeactivateOperation
        .parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationMissingOrInvalidDidUniqueSuffix));
      done();
    });

    it('should throw if recoveryRevealValue is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.generateDeactivateOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-reveal-value',
        recoveryPrivateKey
      );

      (deactivateOperationRequest.recoveryRevealValue as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      await expectAsync(DeactivateOperation.parse(operationBuffer))
              .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationRecoveryRevealValueMissingOrInvalidType));
      done();
    });

    it('should throw if recoveryRevealValue is too long.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.generateDeactivateOperationRequest(
        'unused-DID-unique-suffix',
        'super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal',
        recoveryPrivateKey
      );

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      await expectAsync(DeactivateOperation.parse(operationBuffer))
      .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationRecoveryRevealValueTooLong));
      done();
    });
  });

  describe('parseSignedDataPayload()', async () => {
    it('should throw if signedData contains an additional unknown property.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedData = {
        didUniqueSuffix,
        recoveryRevealValue,
        extraProperty: 'An unknown extra property'
      };
      const encodedPatchData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((DeactivateOperation as any).parseSignedDataPayload(encodedPatchData, didUniqueSuffix, recoveryRevealValue))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if signed `didUniqueSuffix` is mismatching.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedData = {
        didUniqueSuffix,
        recoveryRevealValue
      };
      const encodedSignedData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((DeactivateOperation as any).parseSignedDataPayload(encodedSignedData, 'mismatchingDidUniqueSuffix', recoveryRevealValue))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDidUniqueSuffixMismatch));
      done();
    });

    it('should throw if signed `recoveryRevealValue` is mismatching.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedData = {
        didUniqueSuffix,
        recoveryRevealValue
      };
      const encodedSignedData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((DeactivateOperation as any).parseSignedDataPayload(encodedSignedData, didUniqueSuffix, 'mismatchingRecoveryRevealValue'))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedRecoveryRevealValueMismatch));
      done();
    });
  });
});
