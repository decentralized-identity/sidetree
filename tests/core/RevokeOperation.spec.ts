import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import RevokeOperation from '../../lib/core/versions/latest/RevokeOperation';
import SidetreeError from '../../lib/common/SidetreeError';

describe('RevokeOperation', async () => {
  describe('parse()', async () => {
    it('should throw if operation type is incorrect', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.signing);

      const revokeOperationRequest = await OperationGenerator.generateRevokeOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-otp',
        recoveryPrivateKey
      );

      revokeOperationRequest.type = OperationType.Create; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(revokeOperationRequest));
      await expectAsync(RevokeOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationTypeIncorrect));
      done();
    });

    it('should throw if didUniqueSuffix is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.signing);

      const revokeOperationRequest = await OperationGenerator.generateRevokeOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-otp',
        recoveryPrivateKey
      );

      (revokeOperationRequest.didUniqueSuffix as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(revokeOperationRequest));
      await expectAsync(RevokeOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationMissingOrInvalidDidUniqueSuffix));
      done();
    });

    it('should throw if recoveryOtp is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.signing);

      const revokeOperationRequest = await OperationGenerator.generateRevokeOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-otp',
        recoveryPrivateKey
      );

      (revokeOperationRequest.recoveryOtp as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(revokeOperationRequest));
      await expectAsync(RevokeOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationRecoveryOtpMissingOrInvalidType));
      done();
    });

    it('should throw if recoveryOtp is too long.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.signing);

      const revokeOperationRequest = await OperationGenerator.generateRevokeOperationRequest(
        'unused-DID-unique-suffix',
        'super-long-otp-super-long-otp-super-long-otp-super-long-otp-super-long-otp-super-long-otp-super-long-otp-super-long-otp',
        recoveryPrivateKey
      );

      const operationBuffer = Buffer.from(JSON.stringify(revokeOperationRequest));
      await expectAsync(RevokeOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationRecoveryOtpTooLong));
      done();
    });
  });

  describe('parseSignedOperationDataPayload()', async () => {
    it('should throw if signed operation data contains an additional unknown property.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryOtp = 'anyUnusedRecoveryOtp';
      const signedOperationData = {
        didUniqueSuffix,
        recoveryOtp,
        extraProperty: 'An unknown extra property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(signedOperationData));
      await expectAsync((RevokeOperation as any).parseSignedOperationDataPayload(encodedOperationData, didUniqueSuffix, recoveryOtp))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationSignedDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if signed `didUniqueSuffix` is mismatching.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryOtp = 'anyUnusedRecoveryOtp';
      const signedOperationData = {
        didUniqueSuffix,
        recoveryOtp
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(signedOperationData));
      await expectAsync((RevokeOperation as any).parseSignedOperationDataPayload(encodedOperationData, 'mismatchingDidUniqueSuffix', recoveryOtp))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationSignedDidUniqueSuffixMismatch));
      done();
    });

    it('should throw if signed `recoveryOtp` is mismatching.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryOtp = 'anyUnusedRecoveryOtp';
      const signedOperationData = {
        didUniqueSuffix,
        recoveryOtp
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(signedOperationData));
      await expectAsync((RevokeOperation as any).parseSignedOperationDataPayload(encodedOperationData, didUniqueSuffix, 'mismatchingRecoveryOtp'))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RevokeOperationSignedRecoveryOtpMismatch));
      done();
    });
  });
});
