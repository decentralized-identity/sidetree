import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import SidetreeError from '../../lib/common/SidetreeError';

describe('RecoverOperation', async () => {
  describe('parse()', async () => {
    it('should throw if operation type is incorrect', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('singingKey');
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
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('singingKey');
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

      (recoverOperationRequest.did_suffix as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationMissingOrInvalidDidUniqueSuffix));
      done();
    });

    it('should throw if recoveryRevealValue is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('singingKey');
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

      (recoverOperationRequest.recovery_reveal_value as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer))
              .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationRecoveryRevealValueMissingOrInvalidType));
      done();
    });

    it('should throw if recoveryRevealValue is too long.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('singingKey');
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

  describe('parseOperationFromAnchorFile()', async () => {
    it('should parse the operation included in an anchor file without the `delta` property.', async (done) => {
      const didUniqueSuffix = 'anyDidSuffix';
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [recoveryRevealValue] = OperationGenerator.generateCommitRevealPair();

      const recoverOperationData = await OperationGenerator.generateRecoverOperation({ didUniqueSuffix, recoveryPrivateKey, recoveryRevealValue });
      const recoverOperationRequest = JSON.parse(recoverOperationData.operationBuffer.toString());

      // Intentionally remove properties that wouldn't exist in an anchor file.
      delete recoverOperationRequest.type;
      delete recoverOperationRequest.delta;

      const recoverOperation = await RecoverOperation.parseOperationFromAnchorFile(recoverOperationRequest);

      expect(recoverOperation).toBeDefined();
      expect(recoverOperation.delta).toBeUndefined();
      expect(recoverOperation.didUniqueSuffix).toEqual(didUniqueSuffix);

      done();
    });
  });

  describe('parseObject()', async () => {
    it('should throw if operation contains an additional unknown property.', async (done) => {
      const recoverOperation = {
        did_suffix: 'unusedSuffix',
        recovery_reveal_value: 'unusedReveal',
        signed_data: 'unusedSignedData',
        extraProperty: 'thisPropertyShouldCauseErrorToBeThrown'
      };

      const anchorFileMode = true;
      await expectAsync((RecoverOperation as any).parseObject(recoverOperation, Buffer.from('anyValue'), anchorFileMode))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationMissingOrUnknownProperty));
      done();
    });
  });

  describe('parseSignedDataPayload()', async () => {
    it('should throw if signedData contains an additional unknown property.', async (done) => {
      const signedData = {
        delta_hash: 'anyUnusedHash',
        recoveryKey: 'anyUnusedRecoveryKey',
        nextRecoveryCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property'
      };
      const encodedSignedData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync((RecoverOperation as any).parseSignedDataPayload(encodedSignedData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationSignedDataMissingOrUnknownProperty));
      done();
    });
  });
});
