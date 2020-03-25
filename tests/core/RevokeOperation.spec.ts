import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import RevokeOperation from '../../lib/core/versions/latest/RevokeOperation';
import SidetreeError from '../../lib/common/SidetreeError';

describe('RevokeOperation', async () => {
  describe('parse()', async () => {
    it('should throw if operation type is incorrect', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey');

      const revokeOperationRequest = await OperationGenerator.generateRevokeOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-reveal-value',
        recoveryPrivateKey
      );

      revokeOperationRequest.type = OperationType.Create; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(revokeOperationRequest));
      await expectAsync(RevokeOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationTypeIncorrect));
      done();
    });

    it('should throw if didUniqueSuffix is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey');

      const revokeOperationRequest = await OperationGenerator.generateRevokeOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-reveal-value',
        recoveryPrivateKey
      );

      (revokeOperationRequest.didUniqueSuffix as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(revokeOperationRequest));
      await expectAsync(RevokeOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationMissingOrInvalidDidUniqueSuffix));
      done();
    });

    it('should throw if recoveryRevealValue is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey');

      const revokeOperationRequest = await OperationGenerator.generateRevokeOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-reveal-value',
        recoveryPrivateKey
      );

      (revokeOperationRequest.recoveryRevealValue as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(revokeOperationRequest));
      await expectAsync(RevokeOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationRecoveryRevealValueMissingOrInvalidType));
      done();
    });

    it('should throw if recoveryRevealValue is too long.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey');

      const revokeOperationRequest = await OperationGenerator.generateRevokeOperationRequest(
        'unused-DID-unique-suffix',
        'super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal',
        recoveryPrivateKey
      );

      const operationBuffer = Buffer.from(JSON.stringify(revokeOperationRequest));
      await expectAsync(RevokeOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationRecoveryRevealValueTooLong));
      done();
    });
  });

  describe('parseSignedOperationDataPayload()', async () => {
    it('should throw if signed operation data contains an additional unknown property.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedOperationData = {
        didUniqueSuffix,
        recoveryRevealValue,
        extraProperty: 'An unknown extra property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(signedOperationData));
      await expectAsync((RevokeOperation as any).parseSignedOperationDataPayload(encodedOperationData, didUniqueSuffix, recoveryRevealValue))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationSignedDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if signed `didUniqueSuffix` is mismatching.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedOperationData = {
        didUniqueSuffix,
        recoveryRevealValue
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(signedOperationData));
      await expectAsync((RevokeOperation as any).parseSignedOperationDataPayload(encodedOperationData, 'mismatchingDidUniqueSuffix', recoveryRevealValue))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationSignedDidUniqueSuffixMismatch));
      done();
    });

    it('should throw if signed `recoveryRevealValue` is mismatching.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedOperationData = {
        didUniqueSuffix,
        recoveryRevealValue
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(signedOperationData));
      await expectAsync((RevokeOperation as any).parseSignedOperationDataPayload(encodedOperationData, didUniqueSuffix, 'mismatchingRecoveryRevealValue'))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationSignedRecoveryRevealValueMismatch));
      done();
    });
  });
});
