import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import SidetreeError from '../../lib/core/SidetreeError';

describe('RecoverOperation', async () => {
  describe('parse()', async () => {
    it('should throw if operation type is incorrect', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.signing);
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#singingKey', KeyUsage.signing);
      const [newSigningPublicKey] = await Cryptography.generateKeyPairHex('#singingKey', KeyUsage.signing);
      const [, unusedNextRecoveryOtpHash] = OperationGenerator.generateOtp();
      const [, unusedNextUpdateOtpHash] = OperationGenerator.generateOtp();

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        'unused-update-otp',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        unusedNextRecoveryOtpHash,
        unusedNextUpdateOtpHash
      );

      recoverOperationRequest.type = OperationType.Create; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationTypeIncorrect));
      done();
    });

    it('should throw if didUniqueSuffix is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.signing);
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#singingKey', KeyUsage.signing);
      const [newSigningPublicKey] = await Cryptography.generateKeyPairHex('#singingKey', KeyUsage.signing);
      const [, unusedNextRecoveryOtpHash] = OperationGenerator.generateOtp();
      const [, unusedNextUpdateOtpHash] = OperationGenerator.generateOtp();

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-otp',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        unusedNextRecoveryOtpHash,
        unusedNextUpdateOtpHash
      );

      (recoverOperationRequest.didUniqueSuffix as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationMissingOrInvalidDidUniqueSuffix));
      done();
    });

    it('should throw if recoveryOtp is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.signing);
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#singingKey', KeyUsage.signing);
      const [newSigningPublicKey] = await Cryptography.generateKeyPairHex('#singingKey', KeyUsage.signing);
      const [, unusedNextRecoveryOtpHash] = OperationGenerator.generateOtp();
      const [, unusedNextUpdateOtpHash] = OperationGenerator.generateOtp();

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-otp',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        unusedNextRecoveryOtpHash,
        unusedNextUpdateOtpHash
      );

      (recoverOperationRequest.recoveryOtp as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationRecoveryOtpMissingOrInvalidType));
      done();
    });

    it('should throw if recoveryOtp is too long.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.signing);
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#singingKey', KeyUsage.signing);
      const [newSigningPublicKey] = await Cryptography.generateKeyPairHex('#singingKey', KeyUsage.signing);
      const [, unusedNextRecoveryOtpHash] = OperationGenerator.generateOtp();
      const [, unusedNextUpdateOtpHash] = OperationGenerator.generateOtp();

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        'super-long-otp-super-long-otp-super-long-otp-super-long-otp-super-long-otp-super-long-otp-super-long-otp-super-long-otp',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        unusedNextRecoveryOtpHash,
        unusedNextUpdateOtpHash
      );

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationRecoveryOtpTooLong));
      done();
    });
  });

  describe('parseSignedOperationDataPayload()', async () => {
    it('should throw if operation data is not string', async (done) => {
      await expectAsync((RecoverOperation as any).parseOperationData(123))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationDataMissingOrNotString));
      done();
    });

    it('should throw if operation data contains an additional unknown property.', async (done) => {
      const signedOperationData = {
        operationDataHash: 'anyUnusedHash',
        recoveryKey: 'anyUnusedRecoveryKey',
        nextRecoveryOtpHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(signedOperationData));
      await expectAsync((RecoverOperation as any).parseSignedOperationDataPayload(encodedOperationData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationSignedDataMissingOrUnknownProperty));
      done();
    });
  });

  describe('parseOperationData()', async () => {
    it('should throw if operation data is not string', async (done) => {
      await expectAsync((RecoverOperation as any).parseOperationData(123))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationDataMissingOrNotString));
      done();
    });

    it('should throw if operation data contains an additional unknown property.', async (done) => {
      const operationData = {
        document: 'any opaque content',
        nextUpdateOtpHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(operationData));
      await expectAsync((RecoverOperation as any).parseOperationData(encodedOperationData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if operation data is missing document property.', async (done) => {
      const operationData = {
        // document: 'any opaque content', // Intentionally missing.
        nextUpdateOtpHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        unknownProperty: 'An unknown property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(operationData));
      await expectAsync((RecoverOperation as any).parseOperationData(encodedOperationData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationDocumentMissing));
      done();
    });
  });
});
