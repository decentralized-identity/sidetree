import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import SidetreeError from '../../lib/common/SidetreeError';

describe('RecoverOperation', async () => {
  describe('parse()', async () => {
    it('should throw if operation type is incorrect', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey');
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#singingKey');
      const [newSigningPublicKey] = await Cryptography.generateKeyPairHex('#singingKey');
      const [, unusedNextRecoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const [, unusedNextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-reveal-value',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        unusedNextRecoveryCommitmentHash,
        unusedNextUpdateCommitmentHash
      );

      recoverOperationRequest.type = OperationType.Create; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationTypeIncorrect));
      done();
    });

    it('should throw if didUniqueSuffix is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey');
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#singingKey');
      const [newSigningPublicKey] = await Cryptography.generateKeyPairHex('#singingKey');
      const [, unusedNextRecoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const [, unusedNextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-reveal-value',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        unusedNextRecoveryCommitmentHash,
        unusedNextUpdateCommitmentHash
      );

      (recoverOperationRequest.didUniqueSuffix as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationMissingOrInvalidDidUniqueSuffix));
      done();
    });

    it('should throw if recoveryRevealValue is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey');
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#singingKey');
      const [newSigningPublicKey] = await Cryptography.generateKeyPairHex('#singingKey');
      const [, unusedNextRecoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const [, unusedNextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        'unused-recovery-reveal-value',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        unusedNextRecoveryCommitmentHash,
        unusedNextUpdateCommitmentHash
      );

      (recoverOperationRequest.recoveryRevealValue as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationRecoveryRevealValueMissingOrInvalidType));
      done();
    });

    it('should throw if recoveryRevealValue is too long.', async (done) => {
      const [, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey');
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#singingKey');
      const [newSigningPublicKey] = await Cryptography.generateKeyPairHex('#singingKey');
      const [, unusedNextRecoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const [, unusedNextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        'super-long-reveal-value-super-long-reveal-value-super-long-reveal-value-super-long-reveal-value-super-long-reveal-value-super-long-reveal-valueeeee',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        unusedNextRecoveryCommitmentHash,
        unusedNextUpdateCommitmentHash
      );

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationRecoveryRevealValueTooLong));
      done();
    });
  });

  describe('parseSignedOperationDataPayload()', async () => {
    it('should throw if signed operation data contains an additional unknown property.', async (done) => {
      const signedOperationData = {
        operationDataHash: 'anyUnusedHash',
        recoveryKey: 'anyUnusedRecoveryKey',
        nextRecoveryCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
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
        nextUpdateCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
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
        nextUpdateCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        unknownProperty: 'An unknown property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(operationData));
      await expectAsync((RecoverOperation as any).parseOperationData(encodedOperationData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationDataMissingOrUnknownProperty));
      done();
    });
  });
});
